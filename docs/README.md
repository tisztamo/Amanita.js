# 🍄 Amanita.js documentation

Amanita.js is a tiny, zero-dependency framework that turns native **Web Components**
into a **pub/sub mesh**. Components publish named *topics* about themselves and
subscribe to each other's topics — or DOM events — through compact path-like
**refs**. The same component model runs unchanged in the **main thread**, a **Web
Worker**, or on a **server**, and Amanita bridges the topics across that boundary
for you.

> Think of it as a mycelium network for your components: they don't hold
> references to one another, they share nutrients through named channels in the
> soil.

Amanita is the **wiring**, not the view layer — it has no templating and no
virtual DOM. You render with plain DOM (or pair it with a templating library like
[Tonic](https://tonicframework.dev/)); Amanita connects everything together.

---

## Read in this order

### Guide — learn by building
1. [Installation](guide/01-installation.md) — get Amanita into a project (bundler, browser, server)
2. [Quickstart](guide/02-quickstart.md) — a working temperature converter in ~40 lines
3. [Refs](guide/03-refs.md) — the addressing grammar that connects components
4. [Pub/sub](guide/04-pub-sub.md) — topics, behavior-values, and how data flows
5. [Lifecycle & auto-subscription](guide/05-lifecycle-and-autosub.md) — connect/disconnect and field-name wiring
6. [Workers & the server](guide/06-workers-and-server.md) — move a component off-thread, or onto a backend

### Concepts — understand why and when it shines
1. [The mental model](concepts/01-mental-model.md) — five primitives and the one rule
2. [The three runtimes](concepts/02-three-runtimes.md) — one component model, three places to run it
3. [Decoupling](concepts/03-decoupling.md) — state down as topics, intent up as events
4. [Worker & server transparency](concepts/04-worker-server-transparency.md) — the same code, teleported
5. [Case studies](concepts/05-case-studies.md) — Stereotic (browser app) and Meditator (server-side minds)
6. [When to use Amanita](concepts/06-when-to-use.md) — where it fits and where it doesn't

### Reference — look things up
1. [Component API](reference/01-api.md) — every method on `A(HTMLElement)`
2. [Ref grammar](reference/02-ref-grammar.md) — exhaustive segment-by-segment spec
3. [Standard library](reference/03-stdlib.md) — `a-var`, `a-switch`, `a-url`, `a-match`, …
4. [Worker & server protocol](reference/04-workers-protocol.md) — `Workered`, `AmanitaWorker`, the message wire
5. [Gotchas & sharp edges](reference/05-gotchas.md) — the things that will bite you

---

## The 30-second taste

```html
<temp-input name="source">
  <input type="range" min="0" max="100" value="20">
</temp-input>

<temp-display src="/source/celsius" unit="°F"></temp-display>
<temp-display src="/source/celsius" unit="K"></temp-display>
```

```js
import A from "amanita"

class TempInput extends A(HTMLElement) {
  onConnect() {
    this.input = this.querySelector("input")
    this.pub("celsius", Number(this.input.value)) // publish the starting value
  }
  // A class FIELD whose name is a ref is auto-subscribed on connect.
  // Here: the `input` DOM event of our child <input>.
  "input/@input" = e => this.pub("celsius", Number(e.target.value))
}
A.define("temp-input", TempInput)

class TempDisplay extends A(HTMLElement) {
  onConnect() {
    this.sub(this.attr("src"), this.show) // subscribe to the ref in our `src` attribute
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

Move the slider and both displays update. Neither display knows the input exists;
they only know the **topic** `/source/celsius`. That decoupling — and the fact
that the publisher could live in a Web Worker without changing a line of the
subscribers — is the whole idea.

> The [Quickstart](guide/02-quickstart.md) explains every line.
