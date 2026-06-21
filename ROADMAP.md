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
| 1 | Codify topic-vs-event; close the event-path ergonomics gap | docs + small API | S–M | low | **high** |
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

### 1. Codify topic-vs-event; close the event-path ergonomics gap

**Problem.** Retained behavior-values are Amanita's best feature *and* its biggest
footgun. Replay-on-subscribe is exactly right for **state** (roster, route,
temperature), but people also reach for `pub` for **discrete events** (`spoken`,
`filed`, "clicked at"), and then replay re-fires the event on every late subscribe
and every `reRender` resub. The evidence is everywhere:

- Meditator dedupes on a timestamp or object identity in essentially *every*
  `m-memory` handler, with comments tying the dedupe directly to retained-value
  replay.
- Stereotic hit a real "retrigger on reRender" bug and worked around it with
  `this.trigger = null // TODO ... triggering should be handled specially`.

That is a whole class of boilerplate and bugs caused by using a *state* primitive for
*events*.

**Rejected first idea — a new `emit()` (non-retained `pub`).** The obvious move is to
add `emit(name, value)` that notifies subscribers without storing/replaying. It does
*not* survive scrutiny, for two reasons:

- **It's redundant.** Amanita already has a transient mechanism: a `CustomEvent` + an
  `@event` ref. DOM events aren't retained (no replay → no reRender-retrigger, no
  dedupe), already work in auto-sub (`"@spoken" = …`), and already cross the worker
  boundary (see the payload caveat below).
- **It hides the decision where the reader needs it.** With `emit`/`pub`, the
  *subscription site is identical* — `"/voice/spoken" = s => …` — yet retention is
  precisely what the subscriber must know (does it replay on mount? must it dedupe?).
  `emit` would push that decision onto the producer, invisible to the subscriber.

**The actual fix.** Keep two mechanisms, and keep the distinction **visible at the
subscription site**, which the existing syntax already does:

| Kind | Producer | Subscriber sees | Behavior |
|------|----------|-----------------|----------|
| **State** | `this.pub("spoken", v)` | `"/voice/spoken"` | retained, replayed on subscribe |
| **Event** | `dispatchEvent(new CustomEvent("spoken", {detail}))` | `"/voice/@spoken"` | transient, never replayed |

The `@` is the tell: `spoken` vs `@spoken` is the difference between "current value"
and "something happened," right where the reader is looking. So the work is *not* a
new primitive — it's:

- **Guidance (docs/lint):** event-shaped things are `@` DOM events, not `pub`bed
  topics. (Partly written already in the docs' pub/sub page.)
- **Producer-side sugar (optional, safe):** a `this.fire(name, detail, {bubbles})`
  helper that is *just* `dispatchEvent(new CustomEvent(...))`. This makes *producing*
  an event as ergonomic as `pub` — and it's safe **because the subscriber still writes
  `@name`**, so rule (2), visibility-at-the-read-site, holds. This is the salvageable
  core of the `emit` idea: sugar for the producer, not a new subscription semantic.
  **✅ Implemented** in `src/a.js` as
  `fire(name, detail = null, {bubbles = true, cancelable = false, composed = false})`
  (returns the dispatched `CustomEvent`); covered by `testFire` in
  `test/pubsub-tests.js`; documented in the API reference, pub/sub guide, gotchas, and
  the two concept docs that teach "intent up."
- **Handler ergonomics (consider):** an `@event` handler receives the `Event` and must
  reach into `e.detail`, whereas a topic handler gets `(value, old)` directly. Decide
  whether a small convenience (e.g. delivering `detail` directly for `fire`d events) is
  worth it, or whether the asymmetry is *good* (events should look different). Lean
  toward leaving it honest unless it bites.

**Open question — cross-worker transient payloads.** `@event` subscriptions do cross
the worker boundary, but the event is reduced to the `extractEventData` whitelist
(`type`, `offsetX`, `offsetY`) — a `CustomEvent`'s `detail` is dropped. If transient
*payloads* need to cross into/out of a worker, the right fix is to **forward
`detail`** (and let a component declare which fields), *not* to add `emit`. See #10.

**Payoff.** Deletes dedupe code from real apps, removes the reRender-retrigger class of
bugs, and clarifies a pattern the docs already call "state down as topics, intent up as
events" — without adding a redundant channel.

#### Appendix — what this would touch in Meditator

A concrete survey of the reference app (mind components in `src/mindComponents/` +
Studio in `src/studio/ui/`), to size the change. Two separable kinds of site:

**(a) `fire()` sugar — 12 dispatch sites, mechanical.** Every
`dispatchEvent(new CustomEvent(name, { bubbles: true, detail }))` becomes
`this.fire(name, detail)`. These are already DOM events done *right* (the
`interrupt`/`interrupt-request` spine and `studio-command` are the "transient intent
up" pattern) — pure boilerplate removal, no semantic change.

| Where | Site | Event |
|-------|------|-------|
| mind | `mObserver.js:66` | `interrupt-request` *(shared `raise()` — covers loop-guard, associate, speech, image, act)* |
| mind | `mInterrupts.js:114` | `interrupt-request` (region promotion) |
| mind | `mInterrupts.js:124` | `interrupt` (urgent re-dispatch) |
| mind | `mSense.js:111` | `interrupt-request` *(shared `feel()` — daylight/weather/feed)* |
| mind | `mTimeout.js:75` | `interrupt-request` |
| mind | `mMind.js:182` | `interrupt-request` (origin seed) |
| mind | `mMemory.js:470` | `interrupt-request` (waking) |
| mind | `mAct.js:350` | `interrupt-request` (consequence) |
| mind | `mConsole.js:42` | `interrupt-request` |
| mind | `mTerminal.js:243` | `interrupt-request` |
| mind | `mWs.js:248` | `interrupt-request` |
| studio | `helpers.js:37` | `studio-command` *(shared `command()` — used by every pane)* |

11 mind + 1 studio. Three already sit behind helpers (`raise`, `feel`, `command`), so
`fire()` lands in ~9 distinct expressions but cleans all 12.

**(b) `pub` → DOM-event conversion — the substantive one.** Event-shaped topics
published with `pub`, where retained replay is wrong and a consumer already had to
**dedupe or ignore the replay**. Converting them deletes that workaround.

*Proven (a replay-guard exists today — unambiguously event-shaped): 5 topics → 5 guard
deletions.*

| Topic | Producer | Consumer guard removed |
|-------|----------|------------------------|
| `spoken` | `mSpeech.js:259` | `mMemory._lastSpokenAt` (`mMemory.js:243`) |
| `filed` | `mKb.js:129` | `mMemory._lastFiled` identity dedupe (`:254`) |
| `acted` | `mAct.js:319` | `mMemory._lastActed` identity dedupe (`:266`) |
| `attended` | `mMind.js:368` | `mMemory._lastAttended` identity dedupe (`:280`) |
| `boundary` | `mStream.js:168` | `mMind.onceBoundary` replay-ignore (`mMind.js:55`) |

The comment at `mMemory.js:239-241` names the cause outright: the dedupe exists
*because* Amanita "replays a topic's last value to a late/re-subscriber."

*Candidate (semantically transient, no guard yet — judgment calls): ~9 mind + ~7
studio.* mind: `impulse` (`mSpeech:205`, `mImage:104`), `intent` (`mAct:213`),
`decision` (`mInterrupts:131`), `generated`/`error` (`mImage:142/145`),
`speech`/`speech-boundary` (`mSpeech:243/253`), `chunk` (`mStream:176`, a stream), and
arguably `prompt` (`mMind:348`, a "think now" command). studio: `event` (`:179`),
`streamFragment` (`:176/177`), `log` (`:140`), `lifecycle` (`:136`), `youSaid`
(`:220`), `error` (`:141`, already throttled via `studioToast._lastErrAt`), `focusReset`
(`:237`). These work today mostly because minds never `reRender` (replay only bites on
first subscribe) and the Studio tolerates one stale value.

**Sizing.** `fire()` = 12 sites, pure cleanup. `pub`→event proven = 5 topics / 5
guard-deletions, low risk and concrete payoff. Candidates = ~16 more, worth it for
clarity but discretionary. The high-value, low-risk slice is **the proven 5**.

> Line numbers are a snapshot and will drift; treat them as a starting map, not a
> contract.

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
