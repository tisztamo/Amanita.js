/* eslint eqeqeq: 0 */

import "../src/stdlib.js"
import {TestSuite} from "./helpers/testhelpers.js"
import A from "../src/a.js"
import { delay } from "../src/utils/delay.js"

class EventResubTests extends TestSuite {
  async testEventAttentionTracking(t) {
    // Verify that EventRef.bind() creates an attention descriptor and registers
    // it on the target's _a.subscribers map, just like PropRef.bind() does.
    const target = document.createElement("a-wrap")
    const consumer = document.createElement("a-wrap")
    target.setAttribute("name", "event-target")
    target.appendChild(consumer)
    this.appendChild(target)
    await delay(1)

    const heard = []
    const sub = await consumer.sub("..[name='event-target']/@ping", e => heard.push(e.detail))

    // The subscription should have an attention descriptor
    t(sub.attention !== undefined, "Event subscription has an attention descriptor")
    t(sub.attention.srcEl === consumer, "Attention tracks the source element")

    // The target should be decorated with _a and have the event in subscribers
    t(target._a !== undefined, "Plain DOM target is decorated with _a")
    t(target._a.subscribers !== undefined, "Target has a subscribers map")
    t(target._a.subscribers.has("ping"), "Event is registered in target subscribers map")

    // Verify the event actually fires
    target.fire("ping", "hello")
    await delay(1)
    t(heard.length === 1 && heard[0] === "hello", "Event fires normally")

    // Cleanup
    await consumer.unsub(sub)
    target.remove()
  }

  async testEventResubWorks(t) {
    // Core regression test: resub() on an event subscription should re-bind
    // the listener so events continue to fire after the resub.
    const target = document.createElement("a-wrap")
    const consumer = document.createElement("a-wrap")
    target.setAttribute("name", "resub-target")
    target.appendChild(consumer)
    this.appendChild(target)
    await delay(1)

    const heard = []
    const sub = await consumer.sub("..[name='resub-target']/@ping", e => heard.push(e.detail))

    // Fire before resub
    target.fire("ping", "before")
    await delay(1)
    t(heard.length === 1 && heard[0] === "before", "Event fires before resub")

    // Resub: unsub then re-sub using the attention descriptor
    await consumer.resub(sub)
    await delay(1)

    // Fire after resub
    target.fire("ping", "after")
    await delay(1)
    t(heard.length === 2 && heard[1] === "after", "Event fires after resub (re-bound successfully)")

    // Cleanup
    await consumer.unsub(sub)
    target.remove()
  }

  async testEventUnsubCleansTargetSubscribers(t) {
    // Regression test: unsub() on an event subscription should remove the attention
    // from the target's subscribers map, preventing stale entries.
    const target = document.createElement("a-wrap")
    const consumer = document.createElement("a-wrap")
    target.setAttribute("name", "clean-target")
    target.appendChild(consumer)
    this.appendChild(target)
    await delay(1)

    const heard = []
    const sub = await consumer.sub("..[name='clean-target']/@ping", e => heard.push(1))

    // Verify attention is registered on target
    t(target._a.subscribers.has("ping"), "Event is in target subscribers map before unsub")
    t(target._a.subscribers.get("ping").length === 1, "One attention in ping subscribers")

    // Unsubscribe
    await consumer.unsub(sub)

    // Verify attention is removed from target
    t(!target._a.subscribers.has("ping") || target._a.subscribers.get("ping").length === 0,
      "Event attention is removed from target subscribers map after unsub")

    // Verify the event no longer fires
    target.fire("ping", "test")
    await delay(1)
    t(heard.length === 0, "Event does not fire after unsub")

    target.remove()
  }
}
A.define("event-resub-tests", EventResubTests)
