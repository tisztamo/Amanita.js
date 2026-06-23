# The three runtimes

The same Amanita component model runs in three places, and the pub/sub mesh spans all
of them. This is unusual and it's where Amanita earns its keep: you write components
once and decide *later* (or per-deployment) where they execute.

1. **The browser main thread** — the obvious one.
2. **A Web Worker or a server** — for compute, canvas, or backend logic (the topics
   are bridged across the boundary).
3. **A server-side DOM via jsdom** — run *whole component trees* under Node/Bun/Deno,
   no browser at all.

## 1. Browser main thread

Define components, mount a tree, and they wire themselves up through refs. Two flavors
appear in the wild:

- **Pure Amanita + manual DOM** — components build their own DOM (`innerHTML`,
  `createElement`, surgical `textContent`/`style` updates) and use Amanita only for
  wiring. This is the Meditator **Studio**.
- **Amanita over a templating base** — mix Amanita into a framework's element class so
  one layer renders and the other wires: `class Component extends A(Tonic)`. Tonic
  owns `render()` / `this.html\`\``; Amanita owns `pub`/`sub`. This is **Stereotic**.

Both are covered as [case studies](05-case-studies.md). The point: Amanita doesn't
fight your renderer — it sits beside it.

## 2. Off-thread: Web Worker or server

A component extending `Workered(HTMLElement)` runs its logic in a Web Worker (or, with
`server="true"`, on a backend) while presenting the *same pub/sub surface* to the rest
of the page. Subscribers don't know or care that the producer is on another thread.
This is detailed in the [workers guide](../guide/06-workers-and-server.md) and
[next concept page](04-worker-server-transparency.md).

## 3. Server-side via jsdom

Because an Amanita component is "just" a custom element using `HTMLElement`,
`customElements`, `document`, and `CustomEvent`, you can give it those globals from
[jsdom](https://github.com/jsdom/jsdom) and run **entire component trees on a server**
— with no browser and no client at all. The component model becomes a general
**declarative actor system**.

Meditator does exactly this: an AI "mind" is a `.archml` file — a tree of custom
elements — that runs under Bun. For example:

```html
<m-mind name="seedling" model="voice" pace="10s">
  You are a mind, and thinking is what you do…

  <m-stream name="stream" burstTokens="300"></m-stream>
  <m-memory name="memory" tailLength="1500"></m-memory>
  <m-interrupts name="attention" threshold="0.35"></m-interrupts>
  <m-timeout name="watchdog" reset="..m-mind/stream/chunk" urgent="true"></m-timeout>
  <m-economy name="economy" budget="0.50"></m-economy>
</m-mind>
```

Each `<m-*>` is an Amanita component (`m-stream` produces an LLM token stream and
publishes `chunk`/`boundary`; `m-memory` subscribes and compresses; `m-economy`
publishes `energy`; …). The *architecture of the program is the markup*. That's a
remarkable thing to get from a 700-line web-component library.

### How server-side mounting works

The recipe (full version in [Installation](../guide/01-installation.md#on-a-server-node--bun--deno)):

1. **Polyfill the globals.** Build one jsdom `window` and copy `HTMLElement`,
   `customElements`, `document`, `CustomEvent`, `Node`, … onto `globalThis`.
2. **Import Amanita after the globals exist.** `import "amanita/stdlib"` evaluates
   `A(HTMLElement)` at module load — the globals must already be there.
3. **Register your component classes** with `customElements.define`.
4. **Mount by setting innerHTML.** `document.body.innerHTML = archmlString`. jsdom
   parses it into a real DOM tree of (initially unupgraded) custom elements.
5. **Definition triggers life.** When a tag is `define`d, jsdom **synchronously
   upgrades** every matching element already in the document — running
   `connectedCallback` → `onConnect` → auto-subscription. So defining the components
   *is* what brings the parsed tree alive.

### The run loop is just pub/sub

There's no game loop. Once mounted, the system runs itself on topics and timers. In
Meditator: `m-mind` publishes a `prompt` topic → `m-stream`'s auto-subscribed
`"../prompt"` handler runs an LLM burst → it publishes `boundary` → `m-mind`'s
`"stream/boundary"` handler schedules the next burst with `setTimeout`. A bare
`setInterval` keeps the Node event loop from draining between ticks. The whole "mind"
is a pub/sub cycle clocked by timers.

### Things to know server-side

- **Import order is load-bearing** — jsdom globals first, Amanita second.
- **Upgrade order races exist.** A component that `await`s before wiring can run
  `onConnect` before a sibling exists; the cure is readiness polling. Define
  components in document order with no `await` between defines so forward refs
  resolve cleanly.
- **Logging an element can explode.** jsdom nodes transitively reference the whole
  window; a stray `console.log(el)` (or a framework warning that includes an element)
  can dump thousands of lines. Meditator installs a `util.inspect.custom` hook to
  print nodes compactly — worth copying.
- **No `requestAnimationFrame`/layout.** Keep the server path on `setTimeout` and
  pub/sub; don't rely on rAF or measurement.

See the [Gotchas reference](../reference/05-gotchas.md) for the full list.

---

Next: [Decoupling →](03-decoupling.md)
