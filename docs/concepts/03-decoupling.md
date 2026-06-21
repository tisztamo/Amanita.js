# Decoupling: state down, intent up

The [mental model's one rule](01-mental-model.md#the-one-rule) — *a component never
reaches into another to call its methods* — turns into a concrete, repeatable pattern
once a system grows past a handful of components. Both reference apps converged on the
same shape, and it's worth adopting deliberately:

> **State flows *down* as topics. Intent flows *up* as bubbling events.**

This page explains the pattern, why it scales, and where to *not* apply it.

## The two directions

### Down: state as topics

A producer publishes a topic *about itself* and stays ignorant of who consumes it. A
consumer subscribes through a ref:

```js
// producer
this.pub("roster", minds)            // "here is my current roster"

// consumer (anywhere below/around it)
this.sub("/conn/roster", r => this.render(r), 12)
```

Because topics are [retained](../guide/04-pub-sub.md#topics-are-retained-behavior-values),
a consumer that mounts late still gets the current value — no snapshot request, no
"are you ready yet" handshake. One producer can have any number of consumers (a view,
a header, a logger), and the producer never changes when you add one.

### Up: intent as bubbling events

When a child needs an ancestor to *do* something, it doesn't call the ancestor — it
dispatches a **bubbling DOM `CustomEvent`**, and the ancestor listens once:

```js
// child states intent — fire() dispatches a bubbling CustomEvent
this.fire("studio-command", { cmd: "speak", text })

// the hub listens once and routes
onConnect() { this.addEventListener("studio-command", e => this.run(e.detail)) }
```

Intent up is fan-*in*: many children, one (or more) listeners. The command surface
stays **declared** (you can grep for `"studio-command"`), and a second listener — a
logger, a confirmation gate — can interpose without touching the children.

> Meditator's "minds" use the same shape for their attention system: any faculty
> raises a bubbling `interrupt-request` event; an arbiter listens on its parent,
> decides by salience, and re-emits. No faculty holds a reference to the arbiter.

## Why this scales

Consider the alternative — a pane calling `this.el("/conn/").speak(text)` or
`closest("app").querySelector("store").reload()`. That coupling is:

- **invisible** — nothing in the markup says these two are wired;
- **rigid** — you can't swap the target for a different implementation;
- **singular** — `querySelector` returns exactly one, so you can't run two, or
  interpose a third.

Replace it with *topic down* + *event up* and all three reverse:

- the wiring is a ref in the markup or a field name — **visible and greppable**;
- any element publishing the same topics (or listening for the same command) is a
  drop-in replacement — **swappable and mockable**;
- fan-out/fan-in is native, so a second consumer or an interposing listener is
  **free**.

This is precisely what lets Meditator's memory faculty be swapped for a different
implementation (anything that subscribes to the same inputs and publishes
`compressed` + `tail` works), and what makes the Studio's panes **unit-testable
against a fake hub** — the test pumps topics in and asserts on rendered DOM, or
dispatches commands and asserts on what the fake hub "sent," with no real WebSocket.

## The overridable-ref pattern

For a producer→consumer link that should be configurable per-instance, read the ref
from an attribute with a structural default and an `"off"` switch:

```js
// explicit override  ||  auto-discovered default  ||  disabled
const src = this.attr("spokenSrc") || discover() || null
if (src && src !== "off") this.sub(src, this.onSpoken, 12)
```

Now the wire lives **in the markup** (`spokenSrc="/voice/spoken"`), defaults sensibly,
and can be turned off (`spokenSrc="off"`) — without either component naming the other
in code. This is the single most useful idiom for assembling a large mesh.

## Deliberately *not* decoupled

The rule has principled exceptions. Some direct calls are **transport or orchestrator
contracts**, not coupling smells:

- **The transport boundary.** The thing that actually owns the WebSocket/socket write
  *is* the edge of the system; its `send()` is called by its own event listener, not
  across components. Don't turn the literal I/O into a topic for purity's sake.
- **"Await completion" lifecycle steps.** Pub/sub is fire-and-forget; it can't express
  "the flush finished, now exit." A sleep/shutdown ritual that must *await* a
  persist-and-commit is a legitimate direct, awaited method call.
- **Pull-at-the-right-moment queries.** Draining an attention queue exactly at a frame
  boundary is pull-shaped by design.

The test: if the interaction is *state* or *fire-and-forget intent*, decouple it. If
it's *I/O*, *"await this"*, or *"give me the value at this exact instant"*, a direct
call is honest. When in doubt, decouple — you can always keep a thin transport object
as the one sanctioned exception.

## A note on `hub` (advanced / experimental)

Amanita has a `hub` primitive (`setHub`, or a `hub="ref"` attribute) that forwards
*all* of a component's publications to another element — a built-in "fold my output
upward" channel. It's intriguing for aggregation (e.g. rolling many child streams into
a parent), but it's **lightly used and the author has flagged doubts about it as a
primitive**. Treat it as experimental; the topic-down / event-up pattern above covers
essentially every case. See the [API reference](../reference/01-api.md#sethubref).

---

Next: [Worker & server transparency →](04-worker-server-transparency.md)
