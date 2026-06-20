# Reference: Component API

Everything `A(HTMLElement)` adds to a custom element. `A` is the default export of
`amanita`:

```js
import A from "amanita"
class MyComp extends A(HTMLElement) { /* … */ }
A.define("my-comp", MyComp)
```

`A(realDOM)` is a **mixin factory**: pass any `HTMLElement`-like base (plain
`HTMLElement`, or a templating framework's element class such as `Tonic`) and it
returns a subclass with the methods below.

Throughout, a **ref** is a path string (see [Ref grammar](02-ref-grammar.md)); a
**topic** is a property name a value is published under.

---

## Pub/sub

### `pub(name, value)` · `pub(value)`

Publish `value` under topic `name`, notifying subscribers and storing it on the
element as `this[name]`. With one argument, the topic defaults to `"value"`.

- Subscribers are called with `(newValue, oldValue)`.
- **`undefined` values are ignored** (no-op). Use `null` for "explicitly empty."
- If a [hub](#sethubref) is set, the publication is also forwarded to it.

```js
this.pub("temperature", 21)   // topic "temperature"
this.pub(21)                  // topic "value"
```

### `sub(ref, callback, trycount = 5)` → `Promise<subscription | null>`

Subscribe `callback` to the topic (or DOM event) named by `ref`. Returns a
*subscription descriptor* (awaitable) for later `unsub`, or `null` if the ref never
resolved.

- **Async & self-healing.** If the ref doesn't resolve yet — element absent, or not
  upgraded into an Amanita component — it retries with exponential backoff up to
  `trycount` times. Raise `trycount` (commonly to `12`) when timing is uncertain.
- For a **topic** ref, `callback(newValue, oldValue)` fires on each publish, and — if a
  value already exists — once immediately with the current value (behavior-value
  replay).
- For an **event** ref (`@…`), `callback(event)` fires on each DOM event.

```js
const sub = await this.sub("/store/items", items => this.render(items), 12)
```

### `unsub(subscription)` → `Promise<this>`

Cancel a subscription returned by `sub`. Safe to call with `null`. You rarely need
this — disconnecting a component auto-unsubscribes everything it subscribed to.

### `on(propName, callback)` → attention descriptor

Lower-level: listen directly to a topic on **an element you already hold** (no ref
resolution). Returns an *attention descriptor* for `off`. Replays the current value on
subscribe, like `sub`.

```js
const attn = targetEl.on("value", v => { /* … */ })
```

### `off(attention)`

Stop a listener created with `on`, passing the attention descriptor it returned.

> `sub`/`unsub` work **by ref** (find the element, then listen). `on`/`off` work on an
> **element reference** you already have. `sub` is built on `on`.

### `onOn(propName, callback)` *(overridable hook)*

Called whenever something subscribes to one of *your* topics. Override it to start
work lazily (only when there's a listener). No-op by default. Most useful in
[workers](04-workers-protocol.md) (with the `onOff` counterpart there).

---

## Resolving refs without subscribing

### `el(ref)` → Element | null

Resolve a ref to its **target element** (the topic/event part of the ref is ignored).

```js
this.el("/store/")        // the element named "store"
this.el("../sibling/x")   // resolves the element; "x" ignored
```

### `val(ref)` → current value

Resolve a ref and return the **current value** of its topic, synchronously. Also
supports a `propenv(propName)` form that walks up `parentElement` until it finds an
element defining `propName` (an inheritance-style read).

```js
this.val("/store/items")        // current value of the items topic
this.val("/x/propenv(theme)")   // nearest ancestor (from x) that defines `theme`
```

### `attr(name)` → string | null

`this.getAttribute(name)`. The standard way to read configuration off your own element.

### `setAttr(name, value)` → this

`this.setAttribute(name, value)`, chainable.

### `env(attrName, startEl = null)` → string | null

Search **ancestors** for the first element carrying `attrName` and return its value
(via `closest('[attrName]')`). This is attribute *inheritance*, not pub/sub — a
one-shot read. Returns `null` if no ancestor has it.

```js
// child falls back to an inherited config set on an ancestor:
const model = this.attr("model") || this.env("model")
```

---

## Lifecycle

### `onConnect()` · `onDisconnect()` *(override these)*

Your setup/teardown hooks. **Overridable without calling `super`** — prefer them over
`connectedCallback`/`disconnectedCallback`. `onConnect` runs after the element is in
the DOM (and rendered, if mixed over a templating base) and **before**
auto-subscription.

```js
onConnect()    { this.timer = setInterval(() => this.pub("now", Date.now()), 1000) }
onDisconnect() { clearInterval(this.timer) }
```

### `connectedCallback()` / `disconnectedCallback()`

Amanita implements these to run, in order: `super` → `setHub(this.attr("hub"))` →
`onConnect()` → auto-subscribe (on connect); and `onDisconnect()` → unsubscribe-all →
clear hub → `super` (on disconnect). Only override directly if you must — and then call
`super`.

### Auto-subscription

After `onConnect`, Amanita subscribes every **own instance field whose name is a ref**
— i.e. starts with `@` (a DOM event) or contains `/` (a path). The field's value is the
callback.

```js
"@click"        = e => this.pub("open", true)   // DOM event on self
"/store/items"  = items => this.render(items)    // topic on another element
```

⚠️ Must be **arrow-function fields, not methods** — `"@click" = e => {}` is wired,
`"@click"(e) {}` is not. Auto-sub always uses the default `trycount` (5); use explicit
`sub(…, n)` when you need more retries. See [Gotchas](05-gotchas.md).

---

## Re-rendering (templating bases)

### `reRender(p)`

For bases like Tonic that replace children on re-render. Amanita's override re-runs the
base render, then re-subscribes (`resub`) any listeners that pointed at the destroyed
children, against the fresh DOM. **Note:** this path handles topic subscriptions, not
event refs.

### `resub(subscription)` → `Promise<subscription>`

Unsubscribe and immediately re-subscribe with the same ref/callback. Called
automatically by `reRender`; rarely called by hand.

---

## Hub (advanced / experimental)

### `setHub(ref)`

Set this component's **hub** to the element named by `ref` (or clear it with a falsy
value). Once set, **every** `pub` on this component is *also* forwarded to the hub.
Settable declaratively via a `hub="ref"` attribute (read on connect). Lightly used; see
the [decoupling note](../concepts/03-decoupling.md#a-note-on-hub-advanced--experimental).

---

## Statics & utilities

| Member | Description |
|--------|-------------|
| `A.define(tag, Class)` | Register a component (wraps `customElements.define`). |
| `A.isA(el)` | `true` if `el` is an Amanita component (has the internal `_a`). |
| `A.uid(prefix = "")` | A process-unique id, optionally prefixed (`A.uid("wrk")` → `"wrk_7"`). |

### `whtml(htmlString)` *(unstable)*

A helper that parses an HTML string into an element, auto-wrapping multi-node content
in an `<a-wrap>`. Marked for removal in the source — **don't rely on it.**

---

Next: [Ref grammar →](02-ref-grammar.md)
