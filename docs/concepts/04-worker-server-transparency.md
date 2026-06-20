# Worker & server transparency

The decoupling from the [previous page](03-decoupling.md) has a powerful corollary:
**if components only ever talk through topics and events, it doesn't matter where a
component runs.** A producer in a Web Worker and a producer on the main thread look
identical to their subscribers. That's what makes "move this off-thread" a
one-attribute change instead of a rewrite.

## The same code, three places

A `Workered` component's logic lives in a worker module (a class extending
`AmanitaWorker`). That exact module runs:

- in a **Web Worker** (`spawn="worker"`, or inside `<a-scheduler>`),
- on a **server** (`<a-scheduler server="true">`) over a WebSocket, talking to a Deno
  backend that loads the same module and runs the same scheduler,
- or **inline on the main thread** (a "fake" scheduler) when workers aren't available
  — automatic graceful degradation.

You don't fork your code for these. The only differences are at the transport edge:
the server path JSON-serializes over a socket and can't use zero-copy `transfer()`.

## Why it's transparent

Three mechanisms cooperate:

1. **Topics, not references.** Subscribers name a *topic by ref*, never the producing
   object. The producer can be replaced by a proxy to another thread without the
   subscriber noticing.

2. **A bridged mesh.** Amanita carries pub/sub across the boundary. When a main-thread
   component subscribes to a workered component's topic, the worker is told (over the
   wire) that someone is listening; when the worker publishes that topic, the value is
   forwarded back and delivered to the main-thread subscriber. Worker-to-worker
   subscriptions work too.

3. **Reference-counted forwarding.** A worker only sends a topic across the boundary
   when something is actually subscribed (tracked via `onOn`/`onOff`). So the bridge is
   cheap: nothing crosses the wire unless it's wanted.

The RPC channels (`pwrk.method(arg)` into the worker, `callComponent("m", …)` back)
are the imperative complement for request/response and commands. Pub/sub handles the
*streams*; RPC handles the *calls*.

## What it's good for

- **Heavy compute** — parsing big payloads, number crunching, layout math — off the
  main thread, keeping the UI responsive. The result comes back as a topic or a
  `callComponent`.
- **Off-thread canvas.** Transfer an `OffscreenCanvas` to the worker and draw there.
  Stereotic renders financial charts entirely in a worker; a list of a hundred charts
  shares **one** worker via a single `<a-scheduler>`, with hover/crosshair state
  flowing as topics.
- **Backend logic with a frontend API.** `server="true"` lets a component's logic live
  on a server while the page subscribes to its topics like any other component — a
  live feed, a model running server-side, a shared computation.

## The performance model

Messages between threads are **batched**: non-priority messages within a short window
(~15ms) are coalesced into one postMessage to avoid chattiness. For latency-sensitive
signals (pointer moves driving a crosshair), mark the event `priority` (or use
`transfer`, which implies priority) to skip the queue. This gives you smooth
interaction without hand-rolling a message protocol. The details are in the
[protocol reference](../reference/04-workers-protocol.md).

## When *not* to reach for it

Workers add real cost: serialization, message latency, a separate module, and the
fact that **global/config state on the main thread does not propagate into the
worker** (the worker re-imports modules fresh). Don't offload trivial work, and don't
expect a worker to see your main-thread singletons. Reach for a worker when the work
is genuinely heavy or genuinely belongs on a canvas/server — not by default.

---

Next: [Case studies →](05-case-studies.md)
