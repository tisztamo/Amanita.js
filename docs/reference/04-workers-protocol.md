# Reference: Worker & server protocol

The mechanics behind [the workers guide](../guide/06-workers-and-server.md). A
*workered* feature is a `Workered(...)` **component** on the main thread paired with an
`AmanitaWorker` **worker module**; a **scheduler** (a Web Worker, or a server) hosts
the worker instances and routes messages.

```js
import Workered from "amanita/workered"        // component side
import { AmanitaWorker } from "amanita/worker"  // worker side
```

---

## Component side — `Workered(realDOM)`

`Workered(HTMLElement)` (or `Workered(Tonic)`, etc.) is the main-thread half. It is
itself an Amanita component (`Workered(x)` builds on `A(x)`), so it has all the
[pub/sub API](01-api.md) too.

| Member | Description |
|--------|-------------|
| `workerSrc` | a (same-origin) URL to the worker module. Set it as a field. |
| `spawnType()` | `"worker"`, `"server"`, or anything else (= share an ancestor's scheduler). Defaults to the `spawn` attribute. |
| `this.pwrk` | a Proxy: `this.pwrk.method(arg)` invokes `method(arg)` on the worker instance (**single argument**). |
| `work(type, body, flags = 0)` | low-level send of a message (`type` becomes the worker method name). |
| `transfer(type, body)` | like `work`, but `body` is sent as a *transferable* (e.g. an `OffscreenCanvas`). Implies priority. |
| `onWorkerConnect()` | hook: the worker has registered and is live. Kick off work here. |
| `onWorkerDisconnect()` | hook: the worker went away. |
| `workerConnected` | boolean flag. |

The worker calls *back* into the component by method name (see `callComponent`), so any
method on your component is a potential RPC target.

### How spawning is chosen

On connect, `Workered` looks at `spawnType()`:

- `"worker"` → spawns a Web Worker running the worker scheduler
  (`new Worker(new URL("./worker-scheduler.js", import.meta.url), {type:"module"})`).
  If Web Workers / `OffscreenCanvas` aren't available, it falls back to a **fake
  scheduler** that runs the worker code inline on the main thread.
- `"server"` → opens a WebSocket to the backend (dev: `ws://<host>:2626`; prod:
  `wss://<host>`).
- anything else → walks up the DOM to the nearest element that already spawned a
  scheduler (an `<a-scheduler>`) and **shares** it.

`<a-scheduler>` (from `amanita/stdlib`) sets `spawnType()` to `"worker"`/`"server"`, so
its children — which don't set `spawn` — share its one scheduler.

---

## Worker side — `AmanitaWorker`

The default export of your worker module extends `AmanitaWorker`. The scheduler does
`new YourWorker()` per workered component and calls `componentConnected()` (which runs
`onConnect()` and auto-subscription).

| Member | Description |
|--------|-------------|
| `onConnect()` / `onDisconnect()` | lifecycle hooks (overridable). |
| `pub(name, value)` | publish a topic. Forwarded to the main-thread component **only if** something is subscribed (reference-counted). |
| `sub(ref, cb)` | subscribe to a topic on the main thread (or another worker). Round-trips through the component to resolve the ref. |
| `callComponent(method, ...params)` | call a method on the main-thread component (**spreads** params). |
| `queryComponent(method, ...params)` | like `callComponent`, but `await`s a return value. |
| `onOn(propName)` / `onOff(propName)` | hooks: first listener subscribed / last listener left — start/stop producing lazily. |
| `uid(prefix)` | a worker-unique id. |

Auto-subscription works in the worker too: a field named `"@click"` or `"/store/items"`
is wired on connect (the DOM event / topic is delivered across the boundary).

### The two RPC channels (asymmetry to remember)

```js
// component → worker: ONE argument
this.pwrk.analyze(datasetUrl)

// worker → component: SPREAD arguments
this.callComponent("showResult", mean, max)
```

`pwrk.x(arg)` passes a single argument (send an object for more); `callComponent` and
`queryComponent` spread their arguments onto the target method.

---

## Cross-boundary pub/sub

1. A main-thread component subscribes to a workered component's topic (`sub("/w/data",
   cb)`). `Workered.on` records the local listener **and** tells the worker (a
   `_notifyComponentOn` message), bumping a reference count.
2. The worker `pub`s that topic. Because the count is > 0, the value is sent back and
   re-published on the main-thread component, reaching the subscriber.
3. When the last listener unsubscribes, `onOff` fires in the worker.

A worker subscribing to a main-thread topic (`this.sub(ref, cb)`) is resolved by asking
the component to bind the ref (`_subFromWorker`); if the ref points at *another* worker,
the two workers are connected directly through the shared scheduler.

**DOM events across the boundary are trimmed.** Event objects can't be cloned, so when a
worker subscribes to an `@event` ref only a whitelist of fields is forwarded — currently
`type`, `offsetX`, `offsetY`. Don't expect the full event in a worker handler.

---

## The wire: flags, batching, signals

Defined in `workerutils.js`:

| Constant | Value | Meaning |
|----------|-------|---------|
| `MSG_PRIORITY` | 2 | send immediately, bypassing the batch queue |
| `MSG_TRANSFER` | 4 | send `body` as a transferable; implies priority |
| `NORMAL_LATENCY` | 15 (ms) | batching window for ordinary messages |

**Batching.** Ordinary (non-priority) messages sent within `NORMAL_LATENCY` of each
other are buffered and flushed together as a single `A.bat` batch — this keeps a burst
of pubs from flooding `postMessage`. Priority/transfer messages skip the queue. Mark
latency-sensitive events `priority` (in the ref: `"@pointermove priority"`).

**Control signals** (internal `msgType`s, all prefixed `A.`): `A.wrks` (scheduler
started), `A.regw` / `A.unrw` (register / unregister a worker), `A.wrkr` / `A.wrkd`
(worker connected / disconnected — drive `onWorkerConnect`/`Disconnect`), `A.call`
(RPC), `A.bat` (batch), `A.sigt` (shutdown). You don't send these yourself; they're the
plumbing.

---

## The server backend

`server="true"` connects to a backend that runs the **same scheduler and the same
worker modules**. The reference backend (`src/server/a-server.js`) is a **Deno**
program:

- Listens for WebSocket connections (default **port 2626**).
- On `A.regw`, it imports the worker module (validated to be same-origin, then mapped to
  a local `file://` path) and runs it exactly as a Web Worker would.
- Uses the identical `deliver` routing from `scheduler.js`.

Differences from a Web Worker:

- Messages are **JSON over the socket** (`_sendRawMsg` serializes for WebSockets).
- **`transfer()` is unsupported** over a WebSocket (no zero-copy) — `OffscreenCanvas`
  is worker-only.

Run it with Deno (the repo's `test.sh` starts a static server plus this backend
together for the worker/server tests).

---

## Security

Worker source URLs are validated before loading. The handler (`setWorkerSrcHandler`,
applied in both the worker scheduler and the server) **rejects any URL not under the
page's origin** — you cannot load worker code from an external host/CDN. Keep worker
modules same-origin.

---

Next: [Gotchas & sharp edges →](05-gotchas.md)
