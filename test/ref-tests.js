/* eslint eqeqeq: 0 */

import A from "../src/a.js"
import {TestSuite} from "./helpers/testhelpers.js"
import {parseRef, PropRef, EventRef} from "../src/ref.js"

// Coverage for the ref grammar -- Amanita's richest, most user-facing surface and,
// before this, almost untested. Two layers: parseRef() in isolation, and end-to-end
// resolution via el() against a real DOM tree. Each test builds its own subtree with
// unique ids/names so the concurrently-run methods don't collide.
class RefTests extends TestSuite {
  tree(html) {
    const root = document.createElement("div")
    root.innerHTML = html
    this.appendChild(root)
    return root
  }

  testParse(t) {
    const p = parseRef("store/list/items")
    t(p instanceof PropRef, "a non-@ ref parses to a PropRef")
    t(p.propName === "items", "the last segment is the topic")

    t(parseRef("neighbor/").propName === "value", "a trailing slash means the default 'value' topic")
    t(parseRef("bare").propName === "bare", "a single segment is the topic on the current element")

    const e = parseRef("panel/@close")
    t(e instanceof EventRef, "an @ last segment parses to an EventRef")
    t(e.event === "close", "the event name drops the @")
    t(parseRef("@mouseover").event === "mouseover", "an @event with no selector targets the element itself")

    const passive = parseRef("@wheel passive")
    t(passive.event === "wheel" && passive.passive === true && passive.priority === false, "the 'passive' modifier is parsed")
    const priority = parseRef("@pointermove priority")
    t(priority.priority === true && priority.passive === false, "the 'priority' modifier is parsed")
  }

  testSelectorResolution(t) {
    const root = this.tree(`
      <a-wrap name="store">
        <a-wrap name="list" id="rg-list" class="rg-lst"></a-wrap>
      </a-wrap>`)
    const store = root.querySelector('[name="store"]')
    const list = root.querySelector('[name="list"]')

    t(store.el("list/") === list, "a bare-word step resolves by [name] attribute")
    t(list.el("../") === store, ".. resolves up to the nearest Amanita ancestor")
    t(list.el("..[name='store']/") === store, "..[selector] climbs via closest()")
    t(store.el("#rg-list/") === list, "a raw css step resolves an #id")
    t(store.el(".rg-lst/") === list, "a raw css step resolves a .class")
    t(this.el("/#rg-list/") === list, "a leading slash resolves from the document")
    t(store.el("rg-missing/") === null, "an unresolvable ref returns null (no throw)")
  }

  testUpwardSkipsPlainElements(t) {
    const root = this.tree(`
      <a-wrap name="rg-outer">
        <div class="rg-plain">
          <section><a-wrap name="rg-inner"></a-wrap></section>
        </div>
      </a-wrap>`)
    const outer = root.querySelector('[name="rg-outer"]')
    const inner = root.querySelector('[name="rg-inner"]')
    t(inner.el("../") === outer, ".. walks past non-Amanita ancestors (div, section) to the Amanita one")
  }

  testTrailingSlashTrap(t) {
    // ../neighbor  == the topic "neighbor" on this element
    // ../neighbor/ == the "value" topic on the sibling named "neighbor"
    const root = this.tree(`<a-wrap name="rg-host"><a-wrap name="child"></a-wrap></a-wrap>`)
    const host = root.querySelector('[name="rg-host"]')
    const child = root.querySelector('[name="child"]')
    t(host.el("child") === host, "no trailing slash: the last step is the topic, element stays self")
    t(host.el("child/") === child, "trailing slash: the last step is an element name")
  }
}

A.define("ref-tests", RefTests)
