# Refs

A **ref** is a short string that addresses *a topic or DOM event on some element*.
Refs are how components find each other. They look like little routes:

```
/source/celsius          the `celsius` topic of [name="source"], from the document root
../temperature           the `temperature` topic of my parent Amanita component
..m-mind/stream/chunk     the `chunk` topic of [name="stream"] inside my closest <m-mind>
@click                   the `click` DOM event on MYSELF
/#filter/@keydown        the `keydown` DOM event of element #filter
```

This page is the practical tour; the [Ref grammar reference](../reference/02-ref-grammar.md)
is the exhaustive spec.

## Anatomy

A ref is a `/`-separated path. The **last segment** is the **topic** (a property
name) or, if it starts with `@`, a **DOM event**. Everything before it is a
**selector path** that walks the DOM to find the target element.

```
        selector path          topic
   ┌───────────┴───────────┐   ┌─┴──┐
   /  source  /  readings   /  celsius
```

If the last segment is empty (the ref ends in `/`), the topic defaults to
**`value`**. So `../neighbor/` means "the `value` topic of the sibling named
`neighbor`" — **don't forget the trailing slash**, or `neighbor` would be read as
the topic name instead of an element name.

## The selector steps

Each step between slashes is resolved in order, starting from the component that
owns the ref (`this`):

| Step | Meaning | Resolves with |
|------|---------|---------------|
| *(empty, leading `/`)* | start at the document root | `document` |
| `name` (starts with a letter or `_`) | a child/descendant with that **`name` attribute** | `querySelector('[name="name"]')` |
| `..` | go **up** to the nearest ancestor Amanita component | walk `parentElement` until one has `.on` |
| `..tag` | the nearest ancestor matching a selector | `closest("tag")` |
| `..[attr="x"]` | same, with any CSS selector | `closest('[attr="x"]')` |
| `#id`, `.cls`, `[a="1"]`, … | a raw CSS selector | `querySelector(step)` |

So:

- `/source/celsius` → from `document`, `[name="source"]`, then its `celsius` topic.
- `slider/@input` → from `this`, `[name="slider"]`, then its `input` DOM event.
- `../route` → up to my parent Amanita component, its `route` topic.
- `..m-mind/stream/chunk` → `closest("m-mind")`, then `[name="stream"]` inside it,
  then `chunk`.
- `/#filter/@keydown` → from `document`, `#filter`, then `keydown` event.

## Events: `@`

A final segment starting with `@` subscribes to a **DOM event** instead of a topic.

```js
"@click"            = e => { /* click on THIS element */ }
"button/@click"     = e => { /* click on my child [name="button"] */ }
"/#search/@keydown" = e => { /* keydown on #search anywhere in the document */ }
```

Two modifiers can follow the event name, space-separated:

```js
"@touchmove passive" = e => { /* registered with { passive: true } */ }
"@mousemove priority" = e => { /* delivered ahead of the message queue in workers */ }
```

`passive` adds `{ passive: true }` to the listener. `priority` matters for
[workers](06-workers-and-server.md): priority events skip the batching queue.

## Absolute vs. relative — the one rule that matters

> **Prefer relative refs (`..`, `..tag/topic`, `name/topic`) over absolute ones
> (`/name/topic`).**

An **absolute** ref like `/stream/chunk` resolves to the **first** `[name="stream"]`
in the *entire document*. That's fine when there's exactly one — but the moment you
nest components, render a list, or run two instances, every subscriber silently
binds to the *first* one.

A **relative** ref like `..m-mind/stream/chunk` binds to the stream inside *this*
component's enclosing `<m-mind>`. The same component works whether it's alone, inside
a region, or inside one of many minds on the page. Relative refs **nest for free**;
absolute refs hardcode a single global instance.

This is the difference between a pub/sub mesh that composes and one that turns into a
pile of global variables. The Meditator project migrated its observers from
`/stream/chunk` to `..m-mind/stream/chunk` precisely so a mind could contain
sub-regions and nested minds. See [Decoupling](../concepts/03-decoupling.md).

## Building refs from attributes

The most reusable pattern: read the ref from an attribute so the *wiring lives in
the markup*, with a sensible structural default and an `"off"` escape hatch.

```js
onConnect() {
  // explicit override  ||  auto-discovered default  ||  disabled
  const src = this.attr("src") || "..m-mind/stream/chunk"
  if (src !== "off") this.sub(src, this.onChunk, 12)
}
```

A common refinement is to *discover a name* with `querySelector` and then build a
relative ref to it (this reads a name to construct a ref — it never calls a method
across components):

```js
const mem = this.querySelector("m-memory[name]")
const tailSrc = this.attr("tailSrc") || (mem ? `..m-mind/${mem.getAttribute("name")}/tail` : null)
if (tailSrc && tailSrc !== "off") this.sub(tailSrc, t => { this.tail = t }, 12)
```

## Resolving without subscribing

Sometimes you want the element or its current value, not a subscription:

```js
this.el("/source/")          // the element named "source" (topic part ignored)
this.val("/source/celsius")  // the current value of that topic, right now
this.env("model")            // nearest ancestor's `model` ATTRIBUTE (inheritance)
```

`env()` searches *ancestors for an attribute* (via `closest('[model]')`), which is
how Meditator inherits `model` / `utilityModel` down a mind tree. It is not pub/sub —
it's a one-shot read.

---

Next: [Pub/sub →](04-pub-sub.md)
