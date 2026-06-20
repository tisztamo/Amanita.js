# 🍄 Amanita.js: The Magical Web Components Framework

Ever wished your web components could talk to each other like mushrooms in a forest's underground network? Meet Amanita.js, the framework that turns your components into a thriving ecosystem of interconnected elements!

## What's the Magic? 🪄

Amanita.js is a tiny (~700 lines), zero-dependency **mycelium network for your web components** — it lets them communicate effortlessly through a pub/sub system. Just like mushrooms share nutrients underground, your components share data through named **topics**, addressed by simple, intuitive **refs**.

Components never hold references to each other; they only publish topics about themselves and subscribe to topics by ref. That decoupling is the whole idea — and it's what lets a component **teleport its logic to a Web Worker or even to a server** without changing a single line of the components that talk to it. Just wrap it in a scheduler and add `server="true"`, and *poof* — your worker component is now running on the server, still speaking the same topics.

> Amanita is the **wiring**, not the view layer: no templating, no virtual DOM. You render with plain DOM (or pair it with a templating library); Amanita connects everything together. That's why it drops cleanly onto whatever you're already using.

## Features That'll Get You Hooked 🎣

- 🔌 Plug-and-play pub/sub system, where every topic is a **retained behavior-value** (late subscribers get the current value automatically)
- 🎯 Simple, structural **ref**-based targeting (`/store/items`, `../route`, `..my-app/feed/chunk`, `@click`)
- 🌐 Seamless, decoupled component communication — state flows down as topics, intent flows up as bubbling events
- 🚀 Easy **Web Worker** offloading (for heavy compute or `OffscreenCanvas` drawing)
- ⚡ **Server-side execution** with one attribute (`server="true"`)
- 🧠 Run whole component trees **server-side via jsdom** — a declarative actor system, UI or not
- 🧙 Transparent worker/server execution — the same code, three places

Don't let your components live in isolation — let them join the fungal... err, functional revolution with Amanita.js!

*Warning: Unlike its namesake, this framework won't make you hallucinate. But it might make you see web components in a whole new light!* 🍄✨

## Install

```sh
npm install amanita
```

```js
import A from "amanita"        // the A(HTMLElement) mixin + A.define
import "amanita/stdlib"        // optional: a-var, a-switch, a-url, a-match, … (declarative helpers)
```

No build step is required — Amanita is plain ES modules and works in the browser via an [import map](docs/guide/01-installation.md#in-the-browser-no-build-step) too.

## Quick Start 🚀

Let's build a temperature converter: one component publishes the temperature, and others subscribe to convert and display it.

```html
<temp-input name="source">
  <input type="range" min="0" max="100" value="20">
</temp-input>

<!-- Two subscribers, same topic, different units -->
<temp-display src="/source/celsius" unit="°F"></temp-display>
<temp-display src="/source/celsius" unit="K"></temp-display>
```

```javascript
import A from "amanita"

// Publisher
class TempInput extends A(HTMLElement) {
  onConnect() {
    this.input = this.querySelector("input")
    this.pub("celsius", Number(this.input.value)) // publish the starting value
  }

  // A class FIELD whose name is a ref is auto-subscribed on connect.
  // Here: the `input` DOM event of our child <input>.
  // ⚠️ It MUST be an arrow-function field — `"...": e => {}` works, a method `"..."(e){}` does NOT.
  "input/@input" = e => this.pub("celsius", Number(e.target.value))
}
A.define("temp-input", TempInput)

// Subscriber
class TempDisplay extends A(HTMLElement) {
  onConnect() {
    this.sub(this.attr("src"), this.show) // subscribe to the ref in our `src` attribute
  }

  show = celsius => {
    const unit = this.attr("unit")
    this.textContent = `${this.convert(celsius, unit).toFixed(1)} ${unit}`
  }

  convert(celsius, unit) {
    if (unit === "°F") return celsius * 9 / 5 + 32
    if (unit === "K") return celsius + 273.15
    return celsius
  }
}
A.define("temp-display", TempDisplay)
```

Move the slider and both displays update. Neither display knows the input exists — they only know the topic `/source/celsius`. Because topics are **retained**, a display that mounts after the input already published still gets the current value, and `sub()` retries until the ref resolves, so declaration order doesn't matter.

> For the `<input>` to be found by the ref `input/@input`, give it a `name`
> (`<input name="input">`) — a bare ref step matches the `name` attribute. The
> [Quickstart guide](docs/guide/02-quickstart.md) walks through every line and the
> alternatives.

*Now that's what we call a magic mushroom network!* 🍄

## Documentation 📚

Full docs live in [**`docs/`**](docs/README.md), in three layers:

- **[Guide](docs/README.md#guide--learn-by-building)** — install → [quickstart](docs/guide/02-quickstart.md) → [refs](docs/guide/03-refs.md) → [pub/sub](docs/guide/04-pub-sub.md) → [lifecycle & auto-sub](docs/guide/05-lifecycle-and-autosub.md) → [workers & server](docs/guide/06-workers-and-server.md)
- **[Concepts](docs/README.md#concepts--understand-why-and-when-it-shines)** — the [mental model](docs/concepts/01-mental-model.md), the [three runtimes](docs/concepts/02-three-runtimes.md), [decoupling](docs/concepts/03-decoupling.md), [worker/server transparency](docs/concepts/04-worker-server-transparency.md), [case studies](docs/concepts/05-case-studies.md), and [when to use it](docs/concepts/06-when-to-use.md)
- **[Reference](docs/README.md#reference--look-things-up)** — [component API](docs/reference/01-api.md), [ref grammar](docs/reference/02-ref-grammar.md), [stdlib](docs/reference/03-stdlib.md), [worker/server protocol](docs/reference/04-workers-protocol.md), and [gotchas](docs/reference/05-gotchas.md)

## License

MIT
