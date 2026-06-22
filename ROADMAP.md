# Amanita — improvement proposals & design notes

> **Status: proposals, not commitments.** This is a prioritized list of candidate
> improvements with rationale, tradeoffs, and open questions — a thinking document,
> not a plan of record. Each item is grounded in the source, in the two reference
> apps that use Amanita in anger (the Stereotic front-end and Meditator's server-side
> minds + Studio), and in the `// TODO`s already in the codebase.

## Guiding constraints

Amanita's value is that it is **~700 lines of wiring with zero dependencies** — a
pub/sub nervous system that drops onto plain `HTMLElement` *or* a templating base, in
the browser, a worker, or a server. Every proposal below is filtered through three
rules:

1. **Stay the nervous system, not the muscle.** No templating, no reactive-on-assign
   rendering, no central store. Those compete with Lit/Solid/React and forfeit the
   "drops onto anything, tiny" pitch.
2. **Keep the wiring visible at the read site.** The reader of a component should be
   able to tell *from the code in front of them* how a connection behaves.
3. **Fix root causes, not symptoms.** Prefer changes that delete workarounds from real
   apps over changes that add surface.

## Priority overview

| # | Proposal | Type | Effort | Risk | Priority |
|---|----------|------|--------|------|----------|
| ~~1~~ | ~~Codify topic-vs-event; close the event-path ergonomics gap~~ | ~~docs + small API~~ | ~~S–M~~ | ~~low~~ | ~~**high**~~ |
| 2 | Make ref-resolution failure loud; tunable auto-sub retries | API + DX | S | low | **high** |
| 3 | Warn on the silent auto-sub *method* footgun | DX (dev-only) | XS | low | **high** |
| 4 | `resub` should cover event refs | bugfix | S | med | medium |
| 5 | Smoother unsubscribe (`AbortSignal` / handle) | API | S | low | medium |
| 6 | Disambiguate constant vs ref attributes | convention/API | S | low | medium |
| 7 | Harden `_autoSub`'s `i = 1` assumption | bugfix | XS | low | medium |
| 8 | Ship `.d.ts` types | DX | M | low | medium |
| 9 | An Amanita inspector / devtools overlay | tooling | L | low | low–med |
| 10 | Worker-boundary polish (variadic `pwrk`, event payloads, config) | API | M | med | low–med |
| 11 | Prototype the declarative `<a-wire from to>` connector | feature | M | med | low |
| — | Decide `hub`: commit or remove | direction | — | — | medium |

---

## Tier 1 — highest leverage, fits the grain

### ~~1. Codify topic-vs-event; close the event-path ergonomics gap~~

**✅ Done — [`c5a1f4d`](https://github.com/sovereign/Amanita.js/commit/c5a1f4d).**

The core insight was that adding a non-retained `emit()` alongside `pub` is redundant
(Amanita already has transient `CustomEvent` + `@event` refs) and harmful (hides the
retention decision from the subscriber). Instead, the distinction stays visible at the
subscription site: `"topic"` (retained, replayed) vs `"@event"` (transient, never
replayed).

What shipped:

- **`fire(name, detail, {bubbles, cancelable, composed})`** in `src/a.js` — producer-side
  sugar for `dispatchEvent(new CustomEvent(...))`, with `bubbles: true` by default
  ("intent up"). Returns the `CustomEvent` so `cancelable` gates can check
  `.defaultPrevented`. Covered by `testFire` in `test/pubsub-tests.js`.
- **Docs codified across 5 files:** full API entry (`reference/01-api.md`), state/event
  comparison table (`guide/04-pub-sub.md`), dedupe gotcha now points at `fire()`
  (`reference/05-gotchas.md`), and both concept docs (`concepts/01-mental-model.md`,
  `concepts/03-decoupling.md`) teach `fire()` instead of raw `dispatchEvent`.
- **Decision logged:** handler asymmetry (event handlers receive `Event`, topic handlers
  receive `(value, old)`) is intentional — events should look different from state.
- **Worker-boundary `detail` forwarding** deferred to #10.

Downstream migration: ~12 `dispatchEvent` → `fire()` sites in Meditator (mechanical
boilerplate removal) and ~5 proven `pub`→event conversions that delete replay guards.
These are discretionary app-level cleanups, not blocked on the framework change.

### 2. Make ref-resolution failure loud; make auto-sub retries tunable

**Problem.** A ref that never resolves just `console.error`s after exhausting retries
and the handler **silently never fires** — there is no thrown error to catch. And
auto-sub is hardwired to `trycount = 5` with no way to raise it. This is *why* both
apps are littered with explicit `sub(…, 12)` and hand-rolled readiness loops
(`m-mind._whenAlive`, `m-ws._whenReady`, `m-speech._bindMindEvents`, and the Studio's
uniform `sub(…, 12)`).

**Proposal.**
- Let `sub`'s returned promise **reject** (or invoke an `onUnresolved` callback) when
  resolution is exhausted, so failures are catchable rather than only logged.
- Add a class-level default — `static subTries = 12` — so **auto-sub fields** can be
  patient without rewriting them as explicit `sub` calls. (Today auto-sub can't tune
  the count at all.)
- **Stretch:** resolve refs *reactively* — bind when the target upgrades (e.g. via a
  one-shot `customElements.whenDefined` + a mutation/upgrade hook) instead of polling
  with exponential backoff. The custom-element **upgrade-order race is the root cause**
  behind most of the timing hacks found in both apps; killing it would let a lot of
  `trycount` tuning and `_whenReady` loops disappear.

**Tradeoff.** Reactive binding is more machinery than the current backoff. Start with
the cheap wins (reject + `static subTries`) and measure whether the race still hurts.

### 3. Warn on the silent auto-sub *method* footgun

**Problem.** `"@click" = e => {}` is auto-subscribed; `"@click"(e) {}` silently does
nothing, because auto-sub scans `Object.keys(this)` (own fields), and methods live on
the prototype. It's the single most common beginner mistake — the old README itself
fell into it.

**Proposal.** In a dev build (or unconditionally — it's cheap), when wiring a
component also scan the **prototype** for ref-shaped method names and `console.warn`:
*"`@click` looks like an auto-sub handler but it's a method; write it as an
arrow-function field."* One extra loop at connect, large confusion saved. (Going
further and *supporting* methods is possible but muddies the "fields are wiring" model;
a warning is the better cost/benefit.)

---

## Tier 2 — ergonomics & correctness (mostly existing TODOs)

### 4. `resub` should cover event refs

`reRender`'s re-subscription path explicitly does **not** handle `@event` refs
(`// TODO does not work for event refs` in `a.js`). In an Amanita-over-templating app
(Stereotic), event bindings on re-rendered children are lost on re-render. Track the
ref on the attention descriptor for events too (it's already stored for topic subs) and
re-bind them in `resubAllSubscribers`.

### 5. Smoother unsubscribe

`// TODO should be easier to off` is right: today you must hold the opaque descriptor
returned by `sub`/`on`. Let `sub` accept an `AbortSignal` (`this.sub(ref, cb, { signal
})`) and/or return a handle with `.off()`. In practice most components rely on
auto-unsubscribe at disconnect; this is for the cases that manage a subscription
mid-life.

**Related correctness fix (done).** `unsub` matched a subscription by `(propName,
target)` while ignoring the callback (the `// TODO unclear why callbacks are not always
equal` note). When a component subscribed to the same `(target, topic)` more than once
— e.g. an explicit `sub` plus an auto-sub field pointing at the same place — disconnect
mis-paired the bookkeeping, double-offed one attention and **leaked** the other, so the
target kept notifying the dead component. Now matched by attention identity (and
`(event, cb)` for event subs). Regression test: `testUnsubDuplicate`.

### 6. Disambiguate constant vs ref attributes

`chart.js`'s `// TODO constant refs or naming convention to distinguish constant and
ref attributes` names a real ambiguity: `chartid="abc"` could be a literal or a ref,
and only convention tells them apart. Options: a small marker on ref-valued attributes,
or an explicit `this.subAttr("input")` helper that *means* "treat this attribute's
value as a ref." Pick one and document it.

### 7. Harden `_autoSub`'s `i = 1` assumption

`_autoSub` loops from index 1 to skip the internal `_a` field. Over plain `HTMLElement`
that's fine; over a base like `Tonic` whose own field can land at index 0, the *first*
declared field is skipped. Filter by the `_a` **key** explicitly instead of by
position — removes a latent, hard-to-debug footgun.

**✅ Fixed.** `_autoSub` now iterates *all* own keys (the `_a` field is never ref-shaped,
so `_isAutoSubbed` filters it out — no positional skip needed). Regression test:
`testAutoSubLeadingField` in `test/pubsub-tests.js`, which wires a ref-shaped auto-sub
field declared on a base class.

---

## Tier 3 — reach & DX (without bloating the runtime)

### 8. Ship `.d.ts` types

Amanita is untyped, which hurts adoption more than its size helps it. Types are a
separate file — **zero runtime cost** — and would make the component API, refs, and
topics far more discoverable in editors. Highest-ROI DX item.

### 9. An Amanita inspector / devtools overlay

The decoupling that lets Amanita scale also makes the wiring **invisible** — you can't
see the topic graph. It's telling that Meditator had to broadcast a `structure` message
and build an entire Studio just to watch one mesh. A generic, reusable overlay — "show
producers, consumers, live topic values, and unresolved refs" — would be
disproportionately valuable for a pub/sub framework, and would generalize what
Meditator hand-built. (Unresolved-ref surfacing here also complements #2.)

### 10. Worker-boundary polish

Three concrete papercuts from the apps:
- **Asymmetry:** `pwrk.method(arg)` takes a *single* argument while `callComponent`
  spreads. Make `pwrk` variadic.
- **Event payloads:** the cross-boundary DOM-event field whitelist is hardcoded to
  `type`/`offsetX`/`offsetY`. Let a component declare which fields (or forward
  `CustomEvent.detail`) — this is also the clean answer to #1's cross-worker open
  question.
- **Config:** main-thread globals/config don't reach the worker (a documented
  `// TODO`). Add a "send this config at registration" hook so a worker can be
  parameterized without re-importing and re-deriving state.

### 11. Prototype the declarative `<a-wire from to>` connector

Deferred in Meditator's design notes, and the most *interesting* idea in the backlog: a
pure-markup connector where **neither** side names the other, so every route is legible
in one place — the logical endpoint of "wiring lives in the markup." Worth a prototype
even just as an adapter/rename between mismatched producer/consumer vocabularies. Risk:
it can encourage spooky-action-at-a-distance if overused; scope it to the adapter case
first.

---

## A direction decision: `hub`

`hub`/`setHub` forwards *all* of a component's publications to another element. It is
implemented, read on every connect (`setHub(this.attr("hub"))`), **unused in both
reference apps**, and the author has flagged doubts about it as a primitive
(`// TODO is the notion of hub really a good "primitive"?`). Ambivalent API surface is
worse than none. Two honest paths:

- **Commit:** it is the natural conduit for Meditator's deferred "fold a transient
  submind's output up into its parent" idea (`deep-structure.md` §3). If subminds get
  built, `hub` earns its place — make it first-class and document it.
- **Remove:** if subminds stay hypothetical, delete it and reclaim the surface; the
  topic-down / event-up pattern covers every current case.

Either is better than leaving it half-present.

---

## Explicitly *not* doing

- **No view layer.** No templating, no virtual DOM, no reactive-on-assign rendering.
  The "Amanita is the nervous system, not the muscle" framing is the whole pitch; pair
  it with a renderer where you need fine-grained views.
- **No central store / global state container.** State lives on the components that own
  it, published as topics. That's the model; a store would fight it.
- **No batteries-included router/forms/data layer.** The stdlib stays thin primitives
  you compose.
