# Installation

Amanita has **no dependencies** and ships as plain ES modules. There is no build
step required — you can use it through a bundler, straight in the browser via an
import map, or on a server.

## With a bundler (npm)

```sh
npm install amanita
```

```js
import A from "amanita"            // the core mixin + helpers
import "amanita/stdlib"            // optional: a-var, a-switch, a-url, … (see Reference)
```

The package exposes two entry points (see `package.json` `exports`):

| Import | What you get |
|--------|--------------|
| `amanita` | `A` (default export): the `A(HTMLElement)` mixin and `A.define` / `A.isA` / `A.uid` |
| `amanita/stdlib` | Registers the [standard-library components](../reference/03-stdlib.md) as a side effect, and exports `BareBonesAmanita` |

`import "amanita/stdlib"` has side effects (it calls `customElements.define` for
`a-wrap`, `a-var`, `a-switch`, `a-scheduler`, …). Import it once, near startup.

## In the browser, no build step

Amanita is just ES modules, so an **import map** lets you `import A from "amanita"`
with no bundler:

```html
<script type="importmap">
{
  "imports": {
    "amanita": "/node_modules/amanita/src/a.js",
    "amanita/stdlib": "/node_modules/amanita/src/stdlib.js"
  }
}
</script>

<script type="module">
  import A from "amanita"
  // … define and use components …
</script>
```

Serve `node_modules/amanita/src/` (or vendor the `src/` folder anywhere) and point
the import map at it. The Meditator Studio does exactly this — it static-serves the
package's `src/` at `/amanita` and uses an import map, so the whole UI runs in the
browser with no compile step.

> **Workers note.** Amanita spawns its worker scheduler with
> `new Worker(new URL("./worker-scheduler.js", import.meta.url), {type:"module"})`.
> For [workers](06-workers-and-server.md) to work without a bundler, the package's
> `src/` files must be reachable at their real relative paths. Most bundlers handle
> the `new URL(..., import.meta.url)` pattern automatically.

## On a server (Node / Bun / Deno)

Amanita calls browser APIs — `HTMLElement`, `customElements`, `document`,
`CustomEvent`, `Node`. To run components server-side, provide those globals with
[jsdom](https://github.com/jsdom/jsdom) **before** importing Amanita:

```js
// jsdom-setup.js — import this first
import { JSDOM } from "jsdom"
const { window } = new JSDOM("<!doctype html><html><body></body></html>")
globalThis.window = window
globalThis.document = window.document
globalThis.navigator = window.navigator
globalThis.HTMLElement = window.HTMLElement
globalThis.Event = window.Event
globalThis.CustomEvent = window.CustomEvent
globalThis.Document = window.Document
globalThis.Node = window.Node
globalThis.customElements = window.customElements
```

```js
// app.js
import "./jsdom-setup.js"   // MUST come before anything that touches HTMLElement
import "amanita/stdlib"     // evaluates A(HTMLElement) at module load — globals must exist
import A from "amanita"
// … define components, then set document.body.innerHTML to mount a tree …
```

Import order matters: `amanita/stdlib` evaluates `A(HTMLElement)` and
`customElements.define(...)` at module-evaluation time, so the jsdom globals must
already be in place. See [The three runtimes](../concepts/02-three-runtimes.md#3-server-side-via-jsdom)
for the full server-side story (mounting, the run loop, and the gotchas).

> The Amanita-on-the-server backend for `server="true"` workers
> ([`src/server/a-server.js`](../reference/04-workers-protocol.md#the-server-backend))
> targets **Deno** and uses its standard-library WebSocket server.

## Verifying it works

Open `runtests.html` from the repo through a static server (`npm run serve` starts
one on port 3000) and you'll see the test suite run in the browser. The worker and
server tests additionally need the Deno backend — `./test.sh` starts both the
static server and the backend together.

---

Next: [Quickstart →](02-quickstart.md)
