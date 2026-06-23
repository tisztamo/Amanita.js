# Quickstart

Let's build a temperature converter where one component publishes a temperature and
others subscribe to convert and display it. It shows the three things you'll use
constantly: **defining a component**, **publishing a topic**, and **subscribing to
a ref**.

## The markup

```html
<temp-input name="source">
  <input type="range" min="0" max="100" value="20">
</temp-input>

<temp-display src="/source/celsius" unit="°F"></temp-display>
<temp-display src="/source/celsius" unit="K"></temp-display>
```

- `name="source"` gives the input element an address. Refs locate elements by their
  `name` attribute, not by `id` or tag.
- `src="/source/celsius"` is a **ref**: "the `celsius` topic of the element named
  `source`, searching from the document root." The two displays subscribe to the
  same topic but render it differently.

## The components

```js
import A from "amanita"

// ---- Publisher ----
class TempInput extends A(HTMLElement) {
  onConnect() {
    this.input = this.querySelector("input")
    // Publish the starting value so displays that mount later still get it.
    this.pub("celsius", Number(this.input.value))
  }

  // A class FIELD whose name is a ref is AUTO-SUBSCRIBED when the component connects.
  // "input/@input" = the `input` DOM event of our child <input> ([name?] no — the
  // tag is matched because the step is a plain name; see note below).
  "input/@input" = e => this.pub("celsius", Number(e.target.value))
}
A.define("temp-input", TempInput)

// ---- Subscriber ----
class TempDisplay extends A(HTMLElement) {
  onConnect() {
    // Subscribe to whatever ref our `src` attribute names.
    this.sub(this.attr("src"), this.show)
  }

  show = celsius => {
    const unit = this.attr("unit")
    this.textContent = `${this.convert(celsius, unit).toFixed(1)} ${unit}`
  }

  convert(c, unit) {
    if (unit === "°F") return c * 9 / 5 + 32
    if (unit === "K") return c + 273.15
    return c
  }
}
A.define("temp-display", TempDisplay)
```

Move the slider; both displays update. Done.

> ⚠️ **About that auto-subscribed field.** The ref step `input` resolves by
> `querySelector('[name="input"]')`. In the markup above the `<input>` has no
> `name`, so to make the auto-sub example exact you'd write
> `<input name="slider">` and use `"slider/@input"`. To keep the markup minimal,
> the publisher could instead subscribe explicitly in `onConnect`:
> `this.sub("input/@input", e => …)` after giving the input a name — or just
> listen with a plain `this.input.addEventListener("input", …)`. The
> [refs guide](03-refs.md) covers exactly how each step resolves.

## What just happened

Three ideas did all the work:

1. **`A(HTMLElement)`** mixes Amanita's pub/sub powers into a normal custom element.
   `A.define(tag, Class)` registers it (a thin wrapper over `customElements.define`).

2. **`this.pub("celsius", value)`** sets the `celsius` *topic* on the publisher and
   notifies every subscriber. Topics are **retained** — Amanita stores the last
   value on the element, so a display that connects *after* the publisher already
   published still receives the current value immediately. That's why publishing the
   starting value in `onConnect` makes both late-mounted displays show `20` right
   away.

3. **`this.sub(ref, cb)`** subscribes to a topic by ref. It is **async and
   self-healing**: if the target element isn't in the DOM yet (or hasn't been
   upgraded into an Amanita component), `sub()` retries with backoff. So you don't
   have to worry about declaration order — a subscriber that connects before its
   publisher simply binds a moment later.

The publisher knows *nothing* about the displays, and the displays know nothing about
the input — only the shared topic name `/source/celsius` couples them. Add a third
display, a logger, or move the publisher into a Web Worker, and nothing else changes.

## Two ways to subscribe

You'll see both throughout real code:

```js
// (a) Explicit — subscribe in onConnect. Best when the ref comes from an attribute
//     or is dynamic:
onConnect() { this.sub(this.attr("src"), this.show) }

// (b) Auto-sub — a class FIELD named after a ref binds automatically on connect.
//     Best when the ref is fixed and structural:
"/source/celsius" = celsius => this.show(celsius)
"@click"          = e => this.pub("open", true)   // a DOM event on THIS element
```

Auto-sub fields **must be arrow-function fields, not methods** — `"@click" = e => {}`
works, `"@click"(e) {}` does **not** (Amanita only inspects own instance fields, not
prototype methods). This is the single most common beginner mistake; see
[Gotchas](../reference/05-gotchas.md#auto-sub-only-sees-fields-not-methods).

---

Next: [Refs →](03-refs.md)
