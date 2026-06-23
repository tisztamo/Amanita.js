# Reference: Ref grammar

A **ref** is a `/`-separated string that addresses *a topic or DOM event on an
element*. Refs are parsed by splitting on `/`: the **last segment** is the topic
(or, if it starts with `@`, a DOM event); the segments before it form a **selector
path** resolved against the element that owns the ref (`this`).

```
   selector path     topic-or-event
  ┌──────┴──────┐    ┌────┴────┐
  /  store / list  /  items
```

## Cheat sheet

```
/store/list/items     # "items" topic of [name=list] inside [name=store], from document
..m-mind/stream/chunk # "chunk" topic of [name=stream] inside closest <m-mind>
../neighbor/          # "value" topic of sibling [name=neighbor]  (note trailing /)
..[name="src"]/       # "value" topic of closest ancestor matching the selector
.x/[a="1"]/@change    # a "change" DOM event, using ordinary CSS selector steps
/#filter/@keydown     # "keydown" DOM event on #filter (from document)
@mouseover            # "mouseover" DOM event on MYSELF
@touchmove passive    # a passive event listener
@mousemove priority   # a priority event (skips the worker message queue)
```

## The topic (last segment)

| Form | Meaning |
|------|---------|
| `name` | the topic (property) called `name` |
| *(empty — ref ends in `/`)* | the default topic **`value`** |
| `@event` | a **DOM event** named `event` instead of a topic |

> **Trailing slash matters.** `../neighbor` means *the topic `neighbor` on my parent*.
> `../neighbor/` means *the `value` topic on the sibling named `neighbor`*. When the
> last meaningful step is an element name, write the trailing `/`.

### Event modifiers

After a `@event`, one or more space-separated modifiers may follow:

| Modifier | Effect |
|----------|--------|
| `passive` | adds `{ passive: true }` to the DOM listener |
| `priority` | the event bypasses the [worker batching queue](04-workers-protocol.md) for low latency |

```js
"@wheel passive"        = e => { /* never calls preventDefault */ }
"@pointermove priority" = e => { /* delivered ahead of queued messages */ }
```

## The selector path (everything before the topic)

Each step is resolved in order, starting from `this` (or from `document` if the ref
begins with `/`):

| Step pattern | Resolution | Example |
|--------------|------------|---------|
| *(empty first step)* — leading `/` | start from `document` | `/store/items` |
| starts with a letter or `_` | `current.querySelector('[name="step"]')` | `store`, `list` |
| `..` | walk **up** `parentElement` to the nearest **Amanita** component | `../route` |
| `..` + selector | `current.closest(selector)` | `..m-mind`, `..[name="x"]` |
| anything else (`#id`, `.cls`, `[a="1"]`, `tag.cls`, …) | `current.querySelector(step)` as raw CSS | `#filter`, `.row` |

Notes:

- A **bare word** step is matched by **`name` attribute**, *not* by tag or id. This is
  the most common point of confusion: `store` means `[name="store"]`, not `<store>` or
  `#store`. For a tag or id, use a CSS step (`my-tag`, `#store`).
- `..` (bare) stops at the nearest ancestor that *is an Amanita component* (detected by
  having an `on` method) — not merely the parent element. So intervening plain `<div>`s
  are skipped.
- `..selector` uses `closest`, so it can climb to any ancestor by tag, class, or
  attribute. `..m-mind` and `..[role="grid"]` are both valid.
- Raw CSS steps let you mix in ids and complex selectors:
  `/#chart/[data-series="1"]/@click`.

## Resolution timing

Refs are resolved **lazily, when used** — when you `sub`, `el`, or `val`. `sub` retries
resolution with backoff, so a ref can name an element that doesn't exist yet and bind
once it appears. `el`/`val` resolve once, immediately (no retry).

## Worked examples

| Ref (held by element `C`) | Walks to | Then |
|---------------------------|----------|------|
| `/store/items` | `document` → `[name="store"]` | `items` topic |
| `items` | `C` → `[name="items"]` | `value` topic |
| `../` | up to `C`'s Amanita parent | `value` topic |
| `../selected` | up to `C`'s Amanita parent | `selected` topic |
| `..m-mind/stream/chunk` | `C.closest("m-mind")` → `[name="stream"]` | `chunk` topic |
| `@click` | `C` itself | `click` DOM event |
| `panel/@close` | `C` → `[name="panel"]` | `close` DOM event |
| `/#grid/@keydown` | `document` → `#grid` | `keydown` DOM event |

---

Next: [Standard library →](03-stdlib.md)
