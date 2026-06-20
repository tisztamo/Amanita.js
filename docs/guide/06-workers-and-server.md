# Workers & the server

This is Amanita's headline trick: a component can run its logic in a **Web Worker**
or on a **server** instead of the main thread — and the *rest of your components
don't change*. They keep publishing and subscribing to the same topics; Amanita
bridges the boundary.

Use it for heavy compute (parsing, number-crunching), off-thread **canvas** drawing
via `OffscreenCanvas`, or pushing work to a backend.

> The worker classes are imported from `amanita/workered` (the component side) and
> `amanita/worker` (the worker side). The standard-library `<a-scheduler>` element
> (`import "amanita/stdlib"`) is the usual container.

## The shape of it

A workered feature has **two files**:

1. A **component** (main thread) that extends `Workered(HTMLElement)` and points at a
   worker module via `workerSrc`.
2. A **worker module** whose default export extends `AmanitaWorker`.

They talk through three channels:

| Direction | Call | Receives as |
|-----------|------|-------------|
| component → worker | `this.pwrk.method(arg)` | a method on the worker, `method(arg)` |
| worker → component | `this.callComponent("method", a, b)` | a method on the component, `method(a, b)` |
| either way | `this.pub(topic, value)` / `this.sub(ref, cb)` | normal pub/sub, bridged transparently |

## A worked example: off-thread compute

**Markup** — wrap workered components in an `<a-scheduler>`:

```html
<a-scheduler>
  <stats-box dataset="/data/big.json"></stats-box>
</a-scheduler>
```

**Component** (`stats-box.js`, runs on the main thread):

```js
import A from "amanita"
import Workered from "amanita/workered"

class StatsBox extends Workered(HTMLElement) {
  // Where the worker code lives. Must be same-origin (see "Security" below).
  workerSrc = new URL("./stats.worker.js", import.meta.url)

  // Called once the worker has registered and is live.
  onWorkerConnect() {
    this.pwrk.analyze(this.attr("dataset"))   // → worker.analyze(datasetUrl)
  }

  // Called BY the worker via callComponent("showResult", result).
  showResult(result) {
    this.textContent = `mean ${result.mean}, max ${result.max}`
  }
}
A.define("stats-box", StatsBox)
```

**Worker** (`stats.worker.js`, runs off the main thread):

```js
import { AmanitaWorker } from "amanita/worker"

export default class StatsWorker extends AmanitaWorker {
  async analyze(datasetUrl) {
    const data = await (await fetch(datasetUrl)).json()
    const result = crunch(data)              // heavy work, off the main thread
    this.callComponent("showResult", result) // → component.showResult(result)
  }
}
```

`this.pwrk` is a Proxy: `this.pwrk.analyze(x)` posts a message that invokes
`analyze(x)` on the worker instance. **Only a single argument** is passed this way —
send an object if you need more. The reverse, `callComponent("method", ...args)`,
spreads its arguments onto the component method.

## Cross-boundary pub/sub

Workers participate in the **same pub/sub mesh**. A worker can publish a topic that
main-thread components subscribe to by ref — exactly as if the worker were a normal
element:

```js
// worker
export default class FeedWorker extends AmanitaWorker {
  start(count) {
    for (let i = 0; i < count; i++) this.pub("value", i)
  }
}
```

```html
<a-scheduler>
  <w-feed name="src"></w-feed>
  <w-display sub="/src/value"></w-display>  <!-- subscribes across the worker boundary -->
</a-scheduler>
```

A worker can also **subscribe** to main-thread (or other workers') topics:

```js
// worker
export default class W extends AmanitaWorker {
  onConnect() { this.sub("/clock/now", this.onTick) }   // round-trips through the component
  onTick = now => { /* … */ }
}
```

Worker classes get the same `onConnect`/`_autoSub` treatment as components, so
auto-subscribed fields work in a worker too (`"@click" = …`, `"/store/items" = …`).

### Lazy producers with `onOn` / `onOff`

A worker only forwards a published topic across the boundary **when something is
actually listening** (subscriptions are reference-counted). You can use `onOn` /
`onOff` to start and stop producing on demand — don't compute what nobody reads:

```js
export default class FeedWorker extends AmanitaWorker {
  onOn(propName) {                      // someone subscribed to `propName`
    if (this._timers[propName]) return
    this._timers[propName] = setInterval(() => this.pub(propName, next()), 1000)
  }
  onOff(propName) {                     // last listener went away
    clearInterval(this._timers[propName]); delete this._timers[propName]
  }
}
```

## Off-thread canvas with `OffscreenCanvas`

Transfer a canvas to the worker and draw off the main thread. `this.transfer(type,
obj)` sends `obj` as a *transferable* (zero-copy ownership handoff):

```js
// component
onWorkerConnect() {
  const canvas = this.querySelector("canvas")
  const offscreen = canvas.transferControlToOffscreen()
  this.transfer("setCanvas", offscreen)   // hands the canvas to the worker
}
```

```js
// worker
export default class Painter extends AmanitaWorker {
  setCanvas(canvas) {
    this.ctx = canvas.getContext("2d")
    this.draw()
  }
}
```

Amanita degrades gracefully: when `Worker` or `transferControlToOffscreen` aren't
available, the "worker" runs **inline on the main thread** (a fake scheduler), with
the real canvas — same code path, no crash.

## Sharing one worker across many components

Every workered component **inside the same `<a-scheduler>`** shares one physical
worker, routed by an internal id. This is ideal for lists — a hundred chart cells can
share a single worker:

```html
<a-scheduler>
  <chart-cell ...></chart-cell>   <!-- all of these -->
  <chart-cell ...></chart-cell>   <!-- share ONE -->
  <chart-cell ...></chart-cell>   <!-- Web Worker -->
</a-scheduler>
```

`<a-scheduler>` (from `amanita/stdlib`) spawns the worker; its children with a
`workerSrc` register into it. A component can also spawn its own worker directly with
`spawn="worker"` if it isn't inside a scheduler.

## Running on a server instead of a worker

Flip one attribute and the **same worker code** runs on a backend over a WebSocket
instead of in a Web Worker:

```html
<a-scheduler server="true">
  <market-feed name="quotes"></market-feed>
</a-scheduler>
```

In development, the component connects to a local backend on **port 2626**
(`ws://localhost:2626`); in production it uses `wss://` on the page's host. The
backend is a small Deno program (`src/server/a-server.js`) that loads the *same*
worker modules and runs the *same* scheduler. Your component and worker code are
identical whether they run in a Web Worker or on the server — only the transport
differs.

Two differences to know:

- **Values are JSON over the wire** (workers also serialize, so keep payloads
  JSON-friendly).
- **`transfer()` is not supported over a WebSocket** — `OffscreenCanvas` is a
  worker-only optimization.

See [Worker & server transparency](../concepts/04-worker-server-transparency.md) for
the why, and the [Worker & server protocol reference](../reference/04-workers-protocol.md)
for the wire details, message batching, and the Deno backend.

## Security

A worker's `workerSrc` is validated before loading: it **must be same-origin**.
External/remote worker URLs are rejected (`setWorkerSrcHandler` enforces this on both
the worker scheduler and the server). Don't try to load worker code from a CDN.

---

That's the Guide. Continue to the [Concepts](../concepts/01-mental-model.md) to
understand *why* this design works and when it shines.
