# The mental model

Amanita is small enough to hold in your head. There are **five primitives** and
**one rule**. Everything else — the stdlib, workers, the server — is built from
these.

## Five primitives

### 1. A component is an element with a pub/sub mesh

`A(HTMLElement)` returns a class that is a normal custom element plus the ability to
publish and subscribe. You define and register it like any web component:

```js
class Thing extends A(HTMLElement) { /* … */ }
A.define("a-thing", Thing)
```

Because it's a real element, it lives in the real DOM tree, it has attributes,
children, and `connectedCallback`. Amanita adds a nervous system on top of that body.

### 2. Topics are retained behavior-values

`this.pub("temperature", 21)` sets a **topic** and notifies subscribers. The key word
is *retained*: the value is stored on the element, and any **later** subscriber gets
the current value replayed immediately. A topic is a *standing value with a current
state* (like a spreadsheet cell), not just a momentary event.

This is the property that makes everything else relaxed: components can connect in any
order, a late-mounted view is instantly correct, and re-subscription after a re-render
"just works." (The cost: topics used as discrete *events* need a dedupe key, because
replay re-fires them — see [Pub/sub](../guide/04-pub-sub.md).)

### 3. Refs address topics structurally

A **ref** is a path string naming *a topic (or event) on some element*:
`/store/items`, `../route`, `..m-mind/stream/chunk`, `@click`. Refs resolve through
the DOM relative to the component that holds them. The wiring is therefore *visible*
(it's text in markup or a field name) and *structural* (it follows the element tree).

### 4. Subscription is async and self-healing

`sub(ref, cb)` doesn't fail if the target isn't there yet — it retries with backoff.
Combined with retained values, this means **declaration order doesn't matter**. You
describe *what* connects to *what*; Amanita figures out *when*.

### 5. The lifecycle is the standard element lifecycle

`onConnect()` / `onDisconnect()` wrap `connectedCallback` / `disconnectedCallback`.
Auto-subscription runs on connect; auto-*un*subscription runs on disconnect. You rarely manage subscription lifetimes
by hand.

## The one rule

> **A component never reaches into another component to call its methods. It only
> (a) publishes topics about itself, (b) subscribes to topics/events by ref, and (c)
> raises bubbling DOM events for "do this now" intent.**

Concretely, this means *not* writing:

```js
this.closest("app-root").querySelector("data-store").reload()   // ✗ reach-in
```

and instead writing:

```js
this.fire("reload")                              // ✓ intent up (a bubbling DOM event)
// or subscribing to a topic the store publishes // ✓ state down
```

Why this is more than aesthetics: a `querySelector(...).method()` reach-in has three
fatal properties — it is **not declared** (invisible in the markup), **not
overridable**, and it returns **exactly one** match. That last point is the whole
game: it's *why* you can't swap the implementation, and *why* you can't run two of
them side by side. Pub/sub is natively **fan-out** (one producer, N consumers) and
**fan-in** (N producers, one consumer), so swappability and multiplicity fall out for
free.

This single rule is what lets Amanita systems scale from a three-component toy to
Meditator's dozens-of-faculties "minds" without turning into a web of hidden
dependencies. The next pages develop its two halves:
[the three runtimes](02-three-runtimes.md) (where components can live) and
[decoupling](03-decoupling.md) (state-down / intent-up as the backbone of a large
mesh).

## What Amanita is *not*

- **Not a view layer.** No templating, no virtual DOM, no reactive re-render on
  assignment. You render with plain DOM or a templating library. Amanita is the
  wiring between rendered things.
- **Not a state container.** There's no central store, no reducers, no time-travel.
  State lives *on the components that own it*, published as topics.
- **Not a router, table, or form library.** The [stdlib](../reference/03-stdlib.md)
  gives small declarative pieces (`a-url`, `a-match`, `a-switch`) you compose into
  those, but they're thin.

Keeping Amanita to "just the nervous system" is deliberate — it's why it's ~700 lines
with zero dependencies, and why it drops cleanly on top of whatever else you're using.

---

Next: [The three runtimes →](02-three-runtimes.md)
