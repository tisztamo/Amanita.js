/* eslint eqeqeq: 0 */

import "../src/stdlib.js"
import {TestSuite, eq} from "./helpers/testhelpers.js"
import A from "../src/a.js"
import { delay } from "../src/utils/delay.js"

class PubSubber extends A(HTMLElement) {
  constructor() {
    super()
    this.got = []
    this.gotViaAuto = []
    if (this.attr("sub")) {
      this.subscription = this.sub(this.attr("sub"), this.handleSub)
    }
    const transform = this.attr("transform")
    // eslint-disable-next-line no-eval
    this.transform = transform ? eval(transform) : (x) => x
  }

  onConnect() {
    super.onConnect()
    const pubName = this.attr("pubname")
    const pubCount = this.attr("pubcount")
    if (pubName) {
      this.pubStream(pubName, Number(pubCount))
    }
  }

  handleSub = (value) => {
    this.got.push(value)
    const forward = this.attr("forward")
    if (forward) {
      this.pub(forward, this.transform(value))
    }
  }

  pubStream = (name, count) => {
    if (count <= 0) return
    delay(1, () => {
      this.pub(name, count)
      this.pubStream(name, count - 1)
    })
  }

  "/#x2/doubled" = (value) => {
    this.gotViaAuto.push(value)
  }
}
A.define("pub-subber", PubSubber)

// A ref-shaped auto-sub field declared on a BASE class. Field-init order puts it at
// index 0 (before the mixin's internal `_a`), which the old `_autoSub` skipped.
export const autoSubLeadingFired = []
class LeadingFieldBase extends HTMLElement {
  "@boom" = () => autoSubLeadingFired.push("boom")
}
class LeadingFieldComp extends A(LeadingFieldBase) {}
A.define("leading-field-comp", LeadingFieldComp)

class PubSubTests extends TestSuite {
  async testOnOffPub(t) {
    const feedName = "feed"
    const src = document.createElement("a-wrap")
    let curVal = -41
    let prevVal = -41
    const subscription = src.on(feedName, (data, prev) => {
      curVal = data
      prevVal = prev
    })
    await delay(1)
    t(curVal == -41, "No fire when no data")
    for (let i = 0; i < 5; i++) {
      src.pub(feedName, i)
      await delay(i)
      t(curVal == i, "Subscriber gets the new value asap")
      t(i == 0 || prevVal == i - 1, "Previous value also gets delivered")
    }
    src.off(subscription)
    src.pub(5)
    await delay(1)
    t(curVal == 4, "No value is delivered after off()")
  }

  async testAutoSubLeadingField(t) {
    // Regression: _autoSub used to loop from index 1 (assuming `_a` is first), which
    // silently dropped a ref-shaped auto-sub field sitting at index 0 -- e.g. one
    // declared on a base class the component extends.
    const el = document.createElement("leading-field-comp")
    this.appendChild(el)
    await delay(1)
    autoSubLeadingFired.length = 0
    el.dispatchEvent(new CustomEvent("boom"))
    await delay(1)
    t(autoSubLeadingFired.length === 1, "an auto-sub field at index 0 (declared on a base class) is wired")
    el.remove()
  }

  async testOnOffMultiple(t) {
    const el = document.createElement("a-wrap")
    const a = []
    const b = []
    const subA = el.on("v", x => a.push(x))
    el.on("v", x => b.push(x))
    el.pub("v", 1)
    await delay(1)
    t(a.length === 1 && b.length === 1, "both listeners on the same topic fire")
    el.off(subA)
    el.pub("v", 2)
    await delay(1)
    t(a.length === 1, "an offed listener stops receiving")
    t(b.length === 2, "a sibling listener keeps firing after the other is offed")
  }

  async testUnsubDuplicate(t) {
    // Regression: subscribing twice to the SAME (target, topic) used to leak all but one
    // subscription on disconnect -- unsub matched by (propName, target) and ignored the
    // callback, so it double-offed one attention and never offed the other. The target
    // then kept notifying the dead component. (This is exactly the explicit-sub +
    // auto-sub-field overlap that the main fixture's last pub-subber has.)
    const src = document.createElement("a-wrap")
    const consumer = document.createElement("a-wrap")
    src.setAttribute("name", "leaksrc")
    src.appendChild(consumer)
    this.appendChild(src)
    await delay(1)

    const hitsA = []
    const hitsB = []
    await consumer.sub("..[name='leaksrc']/topic", v => hitsA.push(v))
    await consumer.sub("..[name='leaksrc']/topic", v => hitsB.push(v))
    t(src._a.subscribers.get("topic").length === 2, "both subscriptions are registered on the target")

    src.pub("topic", 1)
    await delay(1)
    t(hitsA.length === 1 && hitsB.length === 1, "both callbacks receive a publish while connected")

    consumer.remove() // -> disconnectedCallback -> _unsubAll
    await delay(5)
    const remaining = src._a.subscribers.get("topic")
    t((remaining ? remaining.length : 0) === 0, "disconnect removes BOTH subscriptions (no leak)")

    src.pub("topic", 2)
    await delay(1)
    t(hitsA.length === 1 && hitsB.length === 1, "the removed consumer's callbacks no longer fire (no ghost)")

    src.remove()
  }

  async testUnsubEvent(t) {
    const target = document.createElement("a-wrap")
    const consumer = document.createElement("a-wrap")
    target.setAttribute("name", "evtsrc")
    target.appendChild(consumer)
    this.appendChild(target)
    await delay(1)

    const heard = []
    const sub = await consumer.sub("..[name='evtsrc']/@ping", e => heard.push(e.detail))
    target.fire("ping", "a")
    await delay(1)
    t(heard.length === 1 && heard[0] === "a", "an @event sub receives a fired event")

    await consumer.unsub(sub)
    target.fire("ping", "b")
    await delay(1)
    t(heard.length === 1, "after unsub the @event listener is removed")

    target.remove()
  }

  async testFire(t) {
    // container > emitter, both Amanita components in the live DOM under `this`
    const container = document.createElement("a-wrap")
    const emitter = document.createElement("a-wrap")
    container.appendChild(emitter)
    this.appendChild(container)
    await delay(1)

    // Consumer listens on the ancestor: intent flows up via the bubbling event
    const heard = []
    await container.sub("@spoken", e => heard.push(e.detail))

    const ev = emitter.fire("spoken", {text: "hello"})
    await delay(1)
    t(ev instanceof CustomEvent && ev.type === "spoken", "fire() returns the dispatched CustomEvent")
    t(ev.bubbles === true, "fire() bubbles by default (intent up)")
    t(heard.length === 1 && heard[0].text === "hello", "ancestor receives the fired event's detail via bubbling")

    // The defining difference from pub(): events are transient, never retained/replayed.
    const late = []
    await container.sub("@spoken", e => late.push(e.detail))
    await delay(1)
    t(late.length === 0, "no replay: a subscriber added after the fire is NOT re-fired (unlike a retained pub topic)")

    emitter.fire("spoken", {text: "again"})
    await delay(1)
    t(heard.length === 2 && late.length === 1, "a fresh fire reaches every current subscriber")

    // cancelable events can be vetoed; defaultPrevented surfaces it
    container.addEventListener("save", e => e.preventDefault())
    const saveEv = emitter.fire("save", {id: 7}, {cancelable: true})
    t(saveEv.defaultPrevented === true, "cancelable fired event reflects a listener's preventDefault()")

    // detail defaults to null; bubbles can be turned off to keep the event local
    const localEv = emitter.fire("local", undefined, {bubbles: false})
    t(localEv.detail === null && localEv.bubbles === false, "detail defaults to null; bubbles:false keeps it local")

    container.remove()
  }

  async testPubSubChain(t) {
    await delay(80)
    t(eq(this.val("#xres/got"), [10, 8, 6, 4, 2]), "Chain of pub-subs")

    const srcEl = this.el("/#xsrc/")
    srcEl.pub("x", 6)
    t(eq(this.val("#xres/got"), [10, 8, 6, 4, 2, 12]), "Chain of pub-subs 2")

    const resEl = this.el("#xres/")
    t((await resEl.unsub(resEl.subscription)) === resEl, "Unsub returns this")

    srcEl.pub("x", 7)
    t(eq(this.val("#xres/got"), [10, 8, 6, 4, 2, 12]), "Chain breaks after unsub()")

    // resub
    srcEl.pub("x", 8)
    await resEl.sub(resEl.attr("sub"), resEl.handleSub)
    await delay(10)
    t(eq(this.val("#xres/got"), [10, 8, 6, 4, 2, 12, 16]), "Re-subscription after unsub: current value is delivered on sub")

    srcEl.pub("x", 9)
    t(eq(this.val("#xres/got"), [10, 8, 6, 4, 2, 12, 16, 18]), "Re-subscription works")

    t(eq(this.val("#xsrc/gotViaAuto"), [10, 8, 6, 4, 2, 12, 14, 16, 18]), "Auto-subscription")

    // unsub on detach
    resEl.remove()
    await delay(10)
    srcEl.pub("x", 10)
    await delay(10)
    t(eq(resEl.got, [10, 8, 6, 4, 2, 12, 16, 18]), "Auto-unsub on detach")
  }

  async testSubRejectsOnUnresolvedRef(t) {
    // When a ref cannot be resolved, sub() should reject instead of returning null.
    const el = document.createElement("a-wrap")
    this.appendChild(el)
    await delay(1)

    let rejected = false
    try {
      await el.sub("/.nonexistent-element-xyz/value", () => {}, 1)
    } catch (e) {
      rejected = true
      t(e.name === "RefResolutionError", "throws RefResolutionError")
      t(String(e).includes("nonexistent-element-xyz"), "error message contains the ref string")
    }
    t(rejected, "sub() rejects when ref cannot be resolved")

    el.remove()
  }

  async testSubOnUnresolvedCallback(t) {
    // The onUnresolved hook is invoked before the rejection, giving callers a chance
    // to log or swallow the error.
    const el = document.createElement("a-wrap")
    this.appendChild(el)
    await delay(1)

    const hookCalled = []
    let rejected = false
    try {
      await el.sub("/.nope-42/value", () => {}, {
        trycount: 1,
        onUnresolved: (err) => hookCalled.push(err)
      })
    } catch {
      rejected = true
    }

    t(rejected, "still rejects after invoking onUnresolved")
    t(hookCalled.length === 1, "onUnresolved callback was invoked")
    t(hookCalled[0].name === "RefResolutionError", "onUnresolved receives the RefResolutionError")

    el.remove()
  }

  async testStaticSubTries(t) {
    // A subclass can override static subTries to make auto-sub fields more patient
    // without rewriting them as explicit sub() calls.
    class PatientComp extends A(HTMLElement) {
      static subTries = 20
    }
    A.define("patient-comp", PatientComp)

    const el = document.createElement("patient-comp")
    this.appendChild(el)
    await delay(1)

    // Verify the static is inherited
    t(el.constructor.subTries === 20, "subclass overrides static subTries")
    t(PatientComp.subTries === 20, "static subTries is accessible on the class")

    // The default for bare BBA is still 5
    const defaultEl = document.createElement("a-wrap")
    this.appendChild(defaultEl)
    await delay(1)
    t(defaultEl.constructor.subTries === 5, "default subTries is 5")

    el.remove()
    defaultEl.remove()
  }

  async testLegacyNumericTrycount(t) {
    // Passing a bare number as the third arg still works (backward compat).
    const el = document.createElement("a-wrap")
    this.appendChild(el)
    await delay(1)

    let rejected = false
    try {
      await el.sub("/.ghost-99/value", () => {}, 1)
    } catch {
      rejected = true
    }
    t(rejected, "legacy numeric trycount=1 still works and rejects on failure")

    el.remove()
  }
}

A.define("pub-sub-tests", PubSubTests)
