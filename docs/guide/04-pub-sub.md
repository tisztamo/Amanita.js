# Pub/sub

Amanita's core is a publish/subscribe system where every component is both a
potential **producer** (it publishes topics about itself) and a potential
**consumer** (it subscribes to others' topics). This page covers how data actually
flows — and the one property that makes Amanita's pub/sub different from most:
**topics are retained behavior-values**.

## Publishing

```js
this.pub("celsius", 21.5)   // set the "celsius" topic to 21.5, notify subscribers
this.pub(21.5)              // shorthand: topic name defaults to "value"
```

`pub(name, value)` does two things:

1. Notifies every current subscriber of that topic, calling their callback with
   `(newValue, oldValue)`.
2. Stores the value on the element itself, as `this[name]`. So after
   `this.pub("celsius", 21.5)`, `this.celsius === 21.5`.

`pub` **ignores `undefined`** — `this.pub("x", undefined)` is a no-op. Publish `null`
if you mean "explicitly empty."

You can publish anything structured-clonable-ish: numbers, strings, arrays, plain
objects. (Across a [worker boundary](06-workers-and-server.md) values are
JSON-serialized, so keep them JSON-friendly there.)

## Subscribing

```js
// Explicit, in a lifecycle hook:
onConnect() {
  this.sub("/source/celsius", this.onTemp)
}
onTemp = (value, previous) => { /* … */ }

// Or auto-subscribed via a field name (see the next page):
"/source/celsius" = value => this.show(value)
```

`sub(ref, callback, options?)` returns a *subscription descriptor* (a Promise)
you can later pass to `unsub()`. It is **async** and **self-healing**: if the ref
doesn't resolve yet — the element isn't in the DOM, or hasn't upgraded into an
Amanita component — it retries with exponential backoff. The retry count defaults
to `this.constructor.subTries` (12 on the base mixin).

Catch resolution failure:

```js
try {
  await this.sub("/maybe-absent/topic", cb)
} catch (e) {
  console.warn("Ref never resolved:", e.ref)
}
```

Callbacks receive **`(newValue, oldValue)`**:

```js
this.sub("/economy/energy", (now, before) => {
  if (before > 0.5 && now <= 0.5) this.warnLowEnergy()
})
```

## Topics are retained behavior-values

This is the defining feature. When you `pub`, Amanita stores the value on the
element. When someone *subscribes*, if a value has already been published, Amanita
**replays the current value to the new subscriber immediately** (on a microtask):

```js
src.pub("roster", ["alice", "bob"])   // (1) published before anyone listens

// … later, a different component mounts and subscribes …
this.sub("/src/roster", r => this.render(r))  // (2) fires right away with ["alice","bob"]
```

A topic is therefore not just an event — it's a **standing value** with a current
state, like a cell in a spreadsheet. This buys you a lot:

- **No snapshot plumbing.** A late-mounting view gets the current roster, the current
  route, the current selection — automatically, just by subscribing.
- **Order independence.** Producers and consumers can connect in any order.
- **Re-subscription is cheap.** After a re-render, a fresh subscription replays the
  current value, so the new DOM is immediately correct.

### The flip side: dedupe "event-shaped" topics

Because subscribing replays the last value, a topic used to signal a *discrete event*
(`"spoken"`, `"filed"`, `"clicked-at"`) will **re-deliver its last value** to any new
or re-subscriber. If your handler has side effects ("append this utterance to the
log"), a replay can double it.

The fix is to make event payloads **self-identifying** and dedupe on the consumer:

```js
// Producer stamps each event so consumers can tell a replay from a new one:
this.pub("spoken", { text, at: Date.now() })

// Consumer ignores a payload it has already handled:
onSpoken = s => {
  if (!s || s.at === this._lastAt) return  // replay of the same event — skip
  this._lastAt = s.at
  this.appendToLog(s.text)
}
```

Object **identity** works too — a genuinely new event is a fresh object, so
`if (s === this._last) return` rejects only the replay. Meditator's memory component
dedupes utterances on a timestamp and filings on object identity for exactly this
reason.

> Rule of thumb: **state topics** (a roster, a route, a temperature) *want* replay.
> **Event topics** (something happened) need a dedupe key. If a topic is really a
> command — "do this now" — consider a bubbling DOM event instead (next section).

## Commands and "now": use DOM events, not topics

Pub/sub is fire-and-forget and value-shaped. It does **not** model "do this
immediately" or "await completion." For *intent flowing upward* — a child telling an
ancestor to do something — both reference apps use plain **bubbling `CustomEvent`s**.
`fire(name, detail)` is the producer-side sugar for exactly that:

```js
// child dispatches intent — fire() bubbles by default
this.fire("studio-command", { cmd: "speak", text })

// an ancestor listens once and routes
onConnect() {
  this.addEventListener("studio-command", e => this.run(e.detail))
}
```

`fire` is just `dispatchEvent(new CustomEvent(name, { bubbles: true, detail }))`. The
important half is the **subscriber side**: a consumer binds with an `@event` ref
(`"../@studio-command"`) or a plain `addEventListener`, and the `@` is the tell — it
says *"something happened,"* not *"here is the current value."* That distinction is the
reason to reach for `fire` over `pub` for events:

| Kind | Producer | Subscriber sees | Behavior |
|------|----------|-----------------|----------|
| **State** | `this.pub("roster", v)` | `"../roster"` | retained, **replayed** on subscribe |
| **Event** | `this.fire("spoken", d)` | `"../@spoken"` | transient, **never replayed** |

Because a fired event is never retained, it sidesteps the dedupe dance above entirely:
a late subscriber, or a re-subscriber after `reRender`, simply doesn't see events that
already happened. Reach for `pub` when a *new* subscriber should learn the current
state; reach for `fire` when only those *listening at the time* should react.

This pairs naturally with pub/sub: **state flows down as topics, intent flows up as
events.** It keeps the command surface declared (greppable) and lets a second
listener — a logger, a confirm gate — interpose for free. (For a gate, `fire(name,
detail, { cancelable: true })` and check the returned event's `.defaultPrevented`.) See
[Decoupling](../concepts/03-decoupling.md) for why this two-direction split is the
backbone of larger Amanita systems.

## Unsubscribing

You usually don't need to. When a component disconnects, Amanita automatically
unsubscribes everything it subscribed to (`disconnectedCallback` → `_unsubAll`). For
manual control:

```js
const sub = await this.sub("/src/topic", cb)
// …
await this.unsub(sub)
```

`on()` / `off()` are the lower-level pair when you already hold the *target* element
and want to listen directly without a ref:

```js
const attn = target.on("value", cb)  // listen directly to an element's topic
target.off(attn)                      // stop
```

`sub`/`unsub` work by **ref** (find the element, then listen); `on`/`off` work on an
**element you already have**.

---

Next: [Lifecycle & auto-subscription →](05-lifecycle-and-autosub.md)
