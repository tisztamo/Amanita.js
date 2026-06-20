# Reference: Gotchas & sharp edges

The honest list of things that will trip you up. Most are consequences of two design
choices — *topics are retained behavior-values* and *refs resolve lazily against a DOM
that upgrades asynchronously* — plus a few rough edges the author has flagged in the
source.

## Auto-sub only sees fields, not methods

Auto-subscription scans `Object.keys(this)` — **own enumerable instance fields only**.
Class methods live on the prototype and are invisible to it.

```js
"@click" = e => { … }   // ✅ a FIELD — auto-subscribed
"@click"(e) { … }       // ❌ a METHOD — silently never wired
```

If an auto-sub handler "does nothing," this is almost always the cause. Always write
auto-sub handlers as `name = arrow`.

> Corollary: the same applies to a `Workered`/`AmanitaWorker` subclass's auto-sub
> fields.

## Auto-sub can't raise the retry count

Auto-subscribed fields always use the default `trycount` of **5**. When wiring across an
uncertain upgrade order (a consumer that may connect before its producer), subscribe
**explicitly** so you can pass more retries:

```js
onConnect() { this.sub("/conn/roster", r => this.render(r), 12) }
```

Use auto-sub for fixed, same-tree, structural wiring; use explicit `sub(…, n)` when
timing is uncertain or the ref comes from an attribute.

## Retained replay re-fires "event" topics

Subscribing replays the topic's current value (behavior-value semantics). For a topic
that represents a discrete **event**, a new or re-subscriber will receive the last value
again — and a side-effecting handler will double it. This bites especially after a
re-render (which re-subscribes).

Make event payloads self-identifying and dedupe:

```js
this.pub("spoken", { text, at: Date.now() })          // stamp it
onSpoken = s => { if (!s || s.at === this._last) return; this._last = s.at; … }  // dedupe
```

Or, if the interaction is really a command, use a bubbling DOM event instead of a topic.

## Re-render re-subscription doesn't cover event refs

When a templating base re-renders and replaces children, Amanita re-subscribes **topic**
listeners against the new DOM — but **not event (`@…`) refs**. If you rely on a child
`@event` auto-sub and the parent re-renders that child away, the event binding is lost.
Bind such events on a stable element, or re-bind manually after render.

## Custom-element upgrade order is not guaranteed

A component can run `onConnect` before a sibling it refers to has been upgraded into an
Amanita component — especially if it `await`s before wiring. Mitigations:

- pass a larger `trycount` to `sub` (the retry/backoff waits out the race);
- define components in document order with no `await` between `customElements.define`
  calls (server-side);
- for structural listeners that *can't* tolerate the race, bind with a plain
  `addEventListener` on a `closest(...)` ancestor instead of a `../@event` ref.

A ref that never resolves fails **quietly** — it logs an error after exhausting retries
and the handler simply never fires. There's no thrown exception. Budget your `trycount`
accordingly.

## `sub` is async; you can't read the value synchronously after subscribing

`sub` returns a Promise and the initial replay is delivered on a microtask. You can't
`sub(...)` and then read the value on the next line. In tests, `await` a tick (e.g.
`await delay(10)`) before asserting. In app code, do your work in the callback.

## A topic name is also an element property

`pub("roster", x)` stores `this.roster = x`. So topic names share the namespace with
your instance fields — don't name a topic the same as an unrelated property you keep on
the element, or they'll alias. (This aliasing is sometimes *useful*: it's how `val()`
and behavior-value replay read "the current value.")

## `pub(undefined)` is a no-op

Publishing `undefined` does nothing. If you mean "cleared," publish `null`.

## Refs: the trailing-slash and absolute-ref traps

- **Trailing slash changes meaning.** `../neighbor` = the topic `neighbor` on the
  parent; `../neighbor/` = the `value` topic on the sibling named `neighbor`. When the
  last step is an element name, keep the slash.
- **Absolute refs bind to the first global match.** `/stream/chunk` is the *first*
  `[name="stream"]` in the document. Prefer relative refs (`..tag/topic`, `name/topic`)
  so nesting and multiple instances don't silently cross-wire. See
  [the ref grammar](02-ref-grammar.md).
- **A bare name step matches `[name=…]`, not a tag or id.** `store` ≠ `<store>` ≠
  `#store`; use a CSS step for those.

## Worker boundary specifics

- **`pwrk.method(arg)` takes one argument**; `callComponent(m, ...args)` spreads. Don't
  expect symmetry.
- **Payloads are serialized** (JSON over a socket for `server="true"`; structured
  cloning into a Web Worker). Keep them plain data.
- **DOM events are trimmed** across the boundary to `type`, `offsetX`, `offsetY`.
- **`transfer()` doesn't work over a WebSocket** (`server="true"`) — `OffscreenCanvas`
  is worker-only.
- **Main-thread globals/config don't reach the worker.** The worker re-imports modules
  fresh; a `setConfig(...)` you called on the main thread won't be visible there. Pass
  configuration in as message arguments.

## Server-side (jsdom) specifics

- **Import order is load-bearing.** Populate the jsdom globals (`HTMLElement`,
  `customElements`, `document`, `CustomEvent`, `Node`, …) **before** importing
  `amanita`/`amanita/stdlib`, which evaluate `A(HTMLElement)` at module load.
- **Logging a jsdom element can explode** your console (nodes transitively reference the
  whole window). Install a `util.inspect.custom` hook to print nodes compactly, and be
  wary that Amanita's own "not an Amanita component" warnings include the element.
- **No `requestAnimationFrame`/layout.** Keep the server path on `setTimeout` + pub/sub.
- **Definition triggers `connectedCallback` synchronously** in jsdom; an exception
  thrown in `onConnect` during `customElements.define` is reported as a window error,
  not raised to the caller — wrap `define` with an error listener if you need failures
  to surface.

## Minor rough edges flagged in the source

- **`_autoSub` skips the first own field** (it loops from index 1 to skip the internal
  `_a`). Over plain `HTMLElement` this is harmless; over a templating base whose own
  field lands at index 0, the *first* declared field is skipped by auto-sub — so don't
  make your very first instance field a ref-named auto-sub handler when mixing over such
  a base. (Declaring a plain field first sidesteps it.)
- **No syntactic distinction between "constant" and "ref" attributes.** Whether an
  attribute value is a literal or a ref is a convention you impose.
- **`off()`/`unsub()` are a little awkward** — you must hold the descriptor returned by
  `on`/`sub`. In practice, rely on auto-unsubscribe on disconnect.
- **`hub`/`setHub` is experimental** and lightly used; prefer topic-down / event-up
  wiring. See [decoupling](../concepts/03-decoupling.md#a-note-on-hub-advanced--experimental).
- **`whtml()` is marked for removal** — don't depend on it.

---

That's the Reference. Back to the [docs index](../README.md).
