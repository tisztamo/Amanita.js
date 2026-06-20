# Lifecycle & auto-subscription

Amanita hooks into the standard custom-element lifecycle and adds two conveniences:
overridable `onConnect`/`onDisconnect` hooks, and **auto-subscription** — wiring a
component by naming its handler fields after refs.

## The connect sequence

When an Amanita component is connected to the DOM, this runs (in order):

```js
connectedCallback() {
  super.connectedCallback && super.connectedCallback() // e.g. Tonic renders here
  this.setHub(this.attr("hub"))                        // optional hub wiring (advanced)
  this.onConnect()                                     // YOUR setup
  _autoSub(this)                                       // auto-subscribe ref-named fields
}
```

So inside `onConnect`, the element is in the DOM and (if you mixed Amanita over a
templating base like Tonic) already rendered. Auto-subscription happens *after*
`onConnect`.

On disconnect:

```js
disconnectedCallback() {
  this.onDisconnect()      // YOUR teardown
  _unsubAll(this)          // auto-unsubscribe everything this component subscribed to
  this._a.hub = null
  super.disconnectedCallback && super.disconnectedCallback()
}
```

### Use `onConnect` / `onDisconnect`, not the raw callbacks

`onConnect()` and `onDisconnect()` are **overridable without calling `super`** —
that's their whole point. If you override `connectedCallback` directly you must
remember to call `super.connectedCallback()`, or you'll silently lose hub wiring and
auto-subscription. Prefer the hooks:

```js
class Clock extends A(HTMLElement) {
  onConnect() {
    this._timer = setInterval(() => this.pub("now", Date.now()), 1000)
  }
  onDisconnect() {
    clearInterval(this._timer)
  }
}
A.define("a-clock", Clock)
```

> There is also `onOn(propName, cb)` — a hook called whenever something subscribes to
> *one of your* topics. It's how a producer can start work lazily (only when someone
> is listening). It's most useful in [workers](06-workers-and-server.md); see
> `onOn`/`onOff` there.

## Auto-subscription

A class **field whose name is a ref** is automatically subscribed when the component
connects. Amanita scans the instance's own fields; any whose name **starts with `@`**
(a DOM event) or **contains `/`** (a ref path) is wired to the field's value as its
callback.

```js
class Panel extends A(HTMLElement) {
  // DOM event on myself:
  "@click" = e => this.pub("open", true)

  // DOM event on a child:
  "close-btn/@click" = e => this.pub("open", false)

  // A topic on another element:
  "/store/items" = items => this.render(items)

  // A parent-relative topic:
  "../route" = route => this.show(route)
}
A.define("a-panel", Panel)
```

This is equivalent to subscribing to each ref in `onConnect`, but the wiring is
visible right at the handler — the field name *is* the connection.

### The rule that trips everyone up: fields, not methods

Auto-subscription only sees **own enumerable instance fields** — i.e. arrow
functions assigned as class fields. It does **not** see prototype **methods**.

```js
"@click" = e => { … }    // ✅ auto-subscribed (a field)
"@click"(e) { … }        // ❌ NOT auto-subscribed (a method on the prototype)
```

If a handler "never fires," this is almost always why. Always write auto-sub handlers
as `name = arrow`. (Internally Amanita uses `Object.keys(this)`, which returns only
own enumerable properties — class fields qualify, methods don't.)

### Auto-sub uses the default retry count

Auto-subscribed fields are subscribed with the **default `trycount` of 5** and there
is no way to raise it. If you're wiring across an uncertain upgrade order (e.g. a pane
that may connect before its hub), subscribe **explicitly** in `onConnect` so you can
pass a larger count:

```js
onConnect() {
  this.sub("/conn/roster", r => this.render(r), 12)  // 12 retries, not 5
}
```

The Meditator Studio uses explicit `sub(…, 12)` everywhere for exactly this reason.
Use auto-sub for fixed, structural, same-tree wiring; use explicit `sub` when timing
is uncertain or the ref comes from an attribute.

## Re-rendering and re-subscription

If you mix Amanita over a templating framework that replaces a component's children
on re-render (Tonic's `reRender`), the *old* child elements — and any subscriptions
pointing at them — are destroyed. Amanita's `reRender` override re-subscribes those
listeners against the freshly rendered DOM automatically (`resubAllSubscribers`),
replaying the current value so the new DOM is correct immediately.

Two caveats:

- This re-subscription path **does not currently handle event refs** (`@…`), only
  topic subscriptions.
- Because re-subscription replays the current value, **event-shaped topics re-fire**
  on re-render — dedupe them (see [Pub/sub](04-pub-sub.md#the-flip-side-dedupe-event-shaped-topics)).

In practice, components that need fine-grained DOM updates often patch the DOM
directly (`textContent`, `style`, surgical `innerHTML`) rather than re-rendering the
whole subtree. See [When to use Amanita](../concepts/06-when-to-use.md).

---

Next: [Workers & the server →](06-workers-and-server.md)
