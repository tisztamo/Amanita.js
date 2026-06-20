# Reference: Standard library

The stdlib is a small set of ready-made components for common declarative wiring —
state atoms, conditionals, text projection, and client-side routing. Register them all
with one side-effecting import:

```js
import "amanita/stdlib"
```

It also exports `BareBonesAmanita` (= `A(HTMLElement)`), the base used by these
components and handy as a generic Amanita container.

> The stdlib is intentionally thin — these are primitives you compose, not a
> batteries-included UI kit.

---

## State

### `<a-var>` — a reactive variable

Holds a value as a topic. Every attribute becomes a property; the `value` attribute is
parsed according to a `type` attribute.

| Attribute | Meaning |
|-----------|---------|
| `value` | the initial value |
| `type` | `number` → `Number(value)`; `object` → `JSON.parse(value)`; otherwise a string |
| *(any other)* | set as a property of the same name |

Subscribers to its `value` topic receive the current value on subscribe (behavior-value
replay), so an `<a-var>` is a convenient app-state atom. Has a `toggle(name = "value")`
method that negates and publishes (number → negate, boolean → `!`, string →
`"true"`/`"false"`).

```html
<a-var name="selectedTab" value="overview"></a-var>
<a-var name="count" value="0" type="number"></a-var>
<a-var name="config" value='{"dark":true}' type="object"></a-var>
```

```js
this.el("/selectedTab/").pub("details")   // change it imperatively
this.el("/count/").toggle()               // 0 → -0; mostly for booleans
```

---

## Conditionals & projection

These extend an internal **`Projector`** base: they subscribe to an `input` ref,
optionally pass the value through a `transform`, and project the result. The
`transform` attribute resolves via `propenv(fn)` — a function found on an ancestor.

### `<a-switch>` — show one child by case

Subscribes to `input`; matches the value (as a string) against each child's `case`
attribute and reveals the matching child. The **last child without a `case`** is the
default.

| Attribute | Meaning |
|-----------|---------|
| `input` | ref to the controlling value |
| `transform` | optional `propenv(fn)` mapping the value to a case string |
| `hide` | how non-selected children are hidden: `visibility` (default), `display`, `remove`, `none` |
| `async` | with `hide="remove"`, defer inflation by a frame (`"true"`) |

With `hide="remove"`, inactive children are replaced by `<template>` standins and
re-inflated from cached markup when selected (so heavy subtrees aren't live when
hidden). `a-switch` also **re-publishes the selected child's `value`** upward, so it
composes as a value selector.

```html
<a-switch input="/scenario/" hide="remove">
  <list-view  case="list"></list-view>
  <detail-view case="details"></detail-view>
  <not-found></not-found>          <!-- default: no case, last child -->
</a-switch>
```

### `<a-if>` — show/hide on truthiness

Reveals itself when `input` is truthy (and not the string `"false"`).

| Attribute | Meaning |
|-----------|---------|
| `input` | ref to a boolean-ish value |
| `hide` | `visibility` (default) or `display` |

```html
<a-if input="/cart/hasItems" hide="display"> <checkout-button></checkout-button> </a-if>
```

### `<a-text>` — project a value as text

Sets its `textContent` to the (optionally transformed) `input` value.

```html
<a-text input="/cart/total" transform="propenv(money)"></a-text>
```

---

## Input

### `<a-radio>` — a selection group

Children carry a `value` attribute; clicking one selects it and publishes its value.
Active/inactive children get CSS classes you specify.

| Attribute | Meaning |
|-----------|---------|
| `active` | space-separated classes applied to the selected child |
| `passive` | classes applied to the non-selected children |

Mark an initially-selected child with a `selected` attribute. Publishes the selected
child's `value` on the group's `value` topic.

```html
<a-radio name="tabs" active="is-active" passive="is-muted">
  <div value="overview" selected>Overview</div>
  <div value="details">Details</div>
</a-radio>
<a-switch input="/tabs/"> … </a-switch>
```

### `<a-input>` — a wrapped `<input>`

Creates an inner `<input>` (copying its own attributes onto it) and publishes the
value on `change` and `input`. Often it's simpler to use a plain `<input>` and
subscribe to its `@input` event by ref — but this is handy when you want the value as a
topic with no glue.

### `<a-keyboard>` — keyboard shortcuts

Listens for `keydown` on the document. Any descendant with a `togglekey` attribute is
`.toggle()`d when its key (or `code`) is pressed. Also publishes the pressed `code`.

```html
<a-keyboard>
  <a-var name="showGrid" value="false" togglekey="g"></a-var>
</a-keyboard>
```

---

## Routing

`<a-url>` + `<a-match>` build hash-based client routing entirely in markup.

### `<a-url>` — the hash as a topic

Publishes `route` = `location.hash` (without the `#`) on connect and on every
`hashchange`. It also forwards any `value` published by its Amanita children back up as
its own value, so nested matches chain.

### `<a-match>` — strip and capture a segment

A projector over a regexp. Its `input` defaults to `../route`. On each value it tries
to match:

| Attribute | Meaning |
|-----------|---------|
| `regexp` | the pattern; capture group 1 becomes this match's published `value` |
| `flags` | optional RegExp flags |
| `input` | ref to the route string (default `../route`) |

On a match it publishes the **remainder** (input with the match removed) on its own
`route` topic — so nested `<a-match>` elements peel the path apart — and publishes
**capture group 1** as its `value`. On no match it publishes an empty route and
`false`.

```html
<a-url name="scenario">
  <a-match name="list" regexp="^(list)/"></a-match>
  <a-match name="details" regexp="^(details)/">
    <a-match name="id" regexp="^(.*)$">
  </a-match>
</a-url>

<!-- consume the parsed route -->
<a-switch input="/scenario/" hide="remove">
  <list-view   case="list"></list-view>
  <detail-view case="details" id="/scenario/details/id/"></detail-view>
</a-switch>
```

---

## Infrastructure

### `<a-wrap>` — a bare Amanita element

`A(HTMLElement)` with nothing added. A generic container/leaf when you just need an
addressable, pub/sub-capable element.

### `<a-scheduler>` — the worker/server container

Spawns and shares a Web Worker (or a server WebSocket with `server="true"`) for the
[workered components](04-workers-protocol.md) inside it.

| Attribute | Meaning |
|-----------|---------|
| `server` | `"true"` runs the workers on a backend over WebSocket instead of a Web Worker |

```html
<a-scheduler>            <!-- one shared Web Worker for all children -->
  <chart-cell></chart-cell>
  <chart-cell></chart-cell>
</a-scheduler>

<a-scheduler server="true">   <!-- the same components, run on the server -->
  <market-feed name="quotes"></market-feed>
</a-scheduler>
```

---

Next: [Worker & server protocol →](04-workers-protocol.md)
