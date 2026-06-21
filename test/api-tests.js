/* eslint eqeqeq: 0 */

import A from "../src/a.js"
import {TestSuite} from "./helpers/testhelpers.js"
import {delay} from "../src/utils/delay.js"

// Coverage for the component API surface that the pub/sub chain test doesn't reach:
// env() inheritance, val()/propenv(), pub() edge cases, the hub forwarding primitive,
// and attr/setAttr. Each test builds its own subtree with unique names.
class ApiTests extends TestSuite {
  tree(html) {
    const root = document.createElement("div")
    root.innerHTML = html
    this.appendChild(root)
    return root
  }

  testEnv(t) {
    const root = this.tree(`
      <a-wrap data-cfg="dark">
        <a-wrap class="api-mid">
          <a-wrap class="api-leaf"></a-wrap>
        </a-wrap>
      </a-wrap>`)
    const themed = root.querySelector("[data-cfg]")
    const leaf = root.querySelector(".api-leaf")
    t(leaf.env("data-cfg") === "dark", "env() returns the nearest ancestor's attribute value")
    t(themed.env("data-cfg") === "dark", "env() includes the element itself (closest)")
    t(leaf.env("data-missing") === null, "env() returns null when no ancestor carries the attribute")
  }

  async testVal(t) {
    const node = document.createElement("a-wrap")
    node.setAttribute("name", "api-valnode")
    this.appendChild(node)
    node.pub("score", 42)
    t(this.val("api-valnode/score") === 42, "val() reads the current value of a topic by ref")
    t(node.score === 42, "pub() stores the topic value as an element property")
    t(this.el("api-nope/") === null, "el() returns null for an unresolvable ref")
    node.remove()
  }

  testPropenv(t) {
    const root = this.tree(`<a-wrap class="api-themed"><a-wrap class="api-pleaf"></a-wrap></a-wrap>`)
    const themed = root.querySelector(".api-themed")
    const leaf = root.querySelector(".api-pleaf")
    themed.theme = "midnight" // a plain JS property on an ancestor
    t(leaf.val("propenv(theme)") === "midnight", "val(propenv(x)) walks up to the nearest element defining x")
    t(leaf.val("propenv(nope)") === null, "propenv returns null when no ancestor defines the property")
  }

  async testPubEdges(t) {
    const el = document.createElement("a-wrap")
    this.appendChild(el)

    const got = []
    el.on("value", v => got.push(v))
    el.pub(7) // single-arg shorthand -> topic "value"
    await delay(1)
    t(got[got.length - 1] === 7, "pub(value) defaults the topic to 'value'")

    const before = got.length
    el.pub(undefined) // documented no-op
    await delay(1)
    t(got.length === before, "pub(undefined) is a no-op")

    const z = []
    el.on("z", v => z.push(v))
    el.pub("z", 0)
    await delay(1)
    t(z.length === 1 && z[0] === 0, "pub publishes defined-but-falsy values like 0")

    el.pub("late", "hello") // published before anyone listens
    const late = []
    el.on("late", v => late.push(v))
    await delay(1)
    t(late.length === 1 && late[0] === "hello", "a late subscriber receives the retained value (replay)")

    el.pub("cleared", null) // stored, but null is intentionally not replayed by _on
    const c = []
    el.on("cleared", v => c.push(v))
    await delay(1)
    t(c.length === 0, "a null value is stored but not replayed to a late subscriber")
    el.remove()
  }

  async testHub(t) {
    const root = this.tree(`<a-wrap name="api-hub"><a-wrap name="api-src"></a-wrap></a-wrap>`)
    const hub = root.querySelector('[name="api-hub"]')
    const src = root.querySelector('[name="api-src"]')
    await src.setHub("..[name='api-hub']/")
    const got = []
    hub.on("relayed", v => got.push(v))
    src.pub("relayed", "via-hub")
    await delay(1)
    t(got.length === 1 && got[0] === "via-hub", "a pub() on a hubbed element is forwarded to the hub")
    t(hub.relayed === "via-hub", "the hub stores the forwarded topic value")
  }

  testAttr(t) {
    const el = document.createElement("a-wrap")
    t(el.setAttr("data-k", "v1") === el, "setAttr returns this (chainable)")
    t(el.attr("data-k") === "v1", "attr reads back the set attribute")
    t(el.attr("data-missing") === null, "attr returns null for a missing attribute")
  }
}

A.define("api-tests", ApiTests)
