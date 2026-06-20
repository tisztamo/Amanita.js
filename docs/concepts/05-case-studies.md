# Case studies

Two real systems built on Amanita, each exercising it differently. They're the best
evidence of what the framework is for — and where it's been pushed to its edges.

---

## Stereotic — a browser app (Amanita + Tonic)

A crypto-screener front-end. Amanita is the wiring; [Tonic](https://tonicframework.dev/)
is the renderer. The base class is the whole integration:

```js
export default class Component extends A(Tonic) {}
Component.define = (cls, tag) => Tonic.add(cls, tag)

export class WorkeredComponent extends Workered(Tonic) {}
```

Tonic owns `render()` / `this.html\`\``; Amanita owns `pub`/`sub`/`el`/`val`. Amanita's
`connectedCallback` calls `super.connectedCallback()` first (Tonic renders), then
`onConnect` + auto-sub. They occupy orthogonal layers.

**MVC as a component tree.** The app root renders three siblings:

```js
render() { return this.html`
  <screener-router></screener-router>   <!-- URL → topics -->
  <screener-model></screener-model>     <!-- data + worker schedulers -->
  <screener-view></screener-view>` }    <!-- DOM subscribing to model topics -->
```

**Routing is pure markup** — no router code:

```html
<a-url name="scenario">
  <a-match name="list" regexp="^(list)/"></a-match>
  <a-match name="details" regexp="^(details)/">
    <a-match name="token" regexp="^(.*)$">
  </a-match>
</a-url>
```

`a-url` publishes the hash as a `route` topic; each `a-match` strips its segment and
republishes the remainder, so nested matches peel the path apart. The view consumes it
with `a-switch`:

```html
<a-switch input="/scenario/" hide="remove">
  <list-scenario case="list"></list-scenario>
  <details-scenario case="details" token="/scenario/details/token/"></details-scenario>
</a-switch>
```

**A model layer of invisible elements.** Under a hidden `<a-scheduler>`, components
like `m-all-tokens` fetch and `pub("value", tokens)`; `m-filtered-tokens` /
`m-ordered-tokens` subscribe, transform, and republish; views subscribe to the final
topic. Per-token state (pins, favorites) is a topic per token, so the star/pin UI is
driven declaratively (`<a-switch input="/favorites/${tokenId}">`).

**Workers for canvas.** The chart components are `WorkeredComponent`s that
`transfer()` an `OffscreenCanvas` to a worker and receive data as a topic. A list of
charts shares one worker via one `<a-scheduler>`; a server-side news feed uses
`<a-scheduler server="true">` — the same worker class, on a Deno backend.

**Where it pushes the edges (honest notes).** This app is full of the author's own
TODOs, and they're instructive: fine-grained updates often **bypass Tonic's
re-render** for surgical `innerHTML`/`textContent`/`style` patching; there are
`setTimeout`/`queueMicrotask` waits for DOM/worker readiness; an event-shaped topic
re-fired on re-render and had to be guarded; "sibling" wiring fell back to manual
`previousSibling`/`nextSibling` walking because refs don't express siblinghood. The
lesson isn't "Amanita is broken" — it's that **Amanita is wiring, and fine-grained
view reactivity is the renderer's job**; where the two meet, you sometimes patch DOM
directly.

---

## Meditator — server-side "minds"

Meditator runs Amanita component trees **on a server** (Bun + jsdom) to build
autonomous AI agents. There is no browser in sight for the minds themselves.

**A mind is a markup file.** An `.archml` document is a `<m-mind>` containing
faculties — `m-stream` (the thinking voice, an LLM token stream), `m-memory` (tiered
compression + persistence), `m-interrupts` (an attention arbiter), `m-economy` (a
budget that slows thinking as money runs low), senses (`m-daylight`, `m-weather`,
`m-feed`), hands (`m-act`, `m-look`, `m-note`), a voice (`m-speech`). The *program's
architecture is the markup* — you reshape the agent by editing HTML.

**Pure decoupling, at scale.** This is the strongest demonstration of the
[decoupling pattern](03-decoupling.md). Faculties never call each other:

- `m-stream` publishes `chunk` / `boundary`; memory, observers, economy, and the
  WebSocket all subscribe. (A broadcast bus.)
- Any faculty raises a bubbling `interrupt-request`; the arbiter listens on its
  parent, decides, and re-emits `interrupt`. (A bubbling attention spine.)
- Cross-faculty links use the [overridable-ref pattern](03-decoupling.md#the-overridable-ref-pattern):
  `m-memory` reads the voice's utterances via `spokenSrc`, the scribe's filings via
  `filedSrc`, etc., each defaulting to a discovered structural ref and disableable with
  `"off"`.

The payoff is real: memory is **swappable** (anything publishing `compressed`+`tail`
works), faculties are **multi-instantiable**, and the entire agent is **auditable by
reading one file**. The team even wired the relative-ref discipline
(`..m-mind/stream/chunk` instead of `/stream/chunk`) so a mind can contain
sub-regions and nested minds.

**Retained values as standing signals.** `m-economy` publishes `arousal` (0..1) as a
retained topic any faculty can read on subscribe; `m-memory` re-publishes `tail` on
every change so the mind's prompt frame *mirrors* it rather than pulling it. This leans
directly on behavior-value replay.

**The Studio.** Meditator's browser UI is a *separate* Amanita app — a pure mesh (no
templating framework). One hub component (`studio-conn`) owns the WebSocket to the
running minds and fans each message into a fine-grained topic; panes subscribe to only
what they draw, and issue commands *up* as bubbling `studio-command` events. The panes
are unit-tested against a **fake hub** with no socket — pump a topic, assert the
render; dispatch a command, assert what was "sent." That testability is a direct
dividend of never reaching into the hub's fields.

**What Meditator teaches about Amanita.** That a 700-line web-component library can
serve as a **declarative actor runtime** for non-UI software is genuinely surprising,
and it's the clearest signal of where Amanita shines: *systems whose structure you
want to express as a tree of independent, message-passing parts.*

---

Next: [When to use Amanita →](06-when-to-use.md)
