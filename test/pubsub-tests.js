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
}

A.define("pub-sub-tests", PubSubTests)
