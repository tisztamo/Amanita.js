# When to use Amanita

Amanita is opinionated about one thing — wiring — and deliberately silent about
everything else. Knowing the boundary tells you when it'll feel effortless and when
you'd be fighting it.

## Amanita shines when…

- **You want wiring to live in the markup.** Routing, conditional rendering, list
  selection, per-item state — expressed as refs and stdlib elements with near-zero
  glue code. The structure is legible because it's declarative.
- **You're assembling many independent parts.** A producer with several consumers, a
  mesh of small components, an architecture you'd like to *reshape by editing markup*.
  The decoupling pays compounding dividends as the part count grows.
- **State should reach late-mounters automatically.** Retained behavior-values mean a
  view that appears later is instantly correct, with no snapshot plumbing.
- **Some logic belongs off the main thread or on a server.** The transparent
  worker/server bridge turns "move this off-thread" into a one-attribute change.
- **You want to drop pub/sub onto an existing setup.** Zero dependencies, ~700 lines,
  mixes over plain `HTMLElement` *or* a templating base. It coexists; it doesn't take
  over.
- **You need a declarative actor system, UI or not.** As Meditator shows, the model
  works for non-UI software (agents, pipelines) running server-side.

## Amanita is the wrong tool when…

- **You need fine-grained reactive views.** Amanita has no templating and no
  reactive-on-assignment rendering. If your core problem is "efficiently re-render a
  complex view when state changes," use a view library (React, Solid, Lit, Tonic, …)
  for that part — optionally *with* Amanita for the wiring between such views.
- **You want a batteries-included framework.** No router/forms/store/data-layer out of
  the box. The stdlib is intentionally thin. You assemble the rest.
- **Your team wants strong types and a large ecosystem.** Amanita is small, untyped,
  and niche. That's a feature for some projects and a dealbreaker for others.
- **The work is trivial.** Two components that talk once don't need a mesh; a direct
  call or a single event is fine.

## The honest tension: wiring vs. rendering

The one place Amanita reliably *fights the grain* is the seam between wiring and
rendering. Because topic replay re-fires on re-subscription, **event-shaped topics
must be deduped**, and the re-render→re-subscribe path doesn't cover event refs. Real
apps respond in two ways, both fine:

1. **Keep subscriptions on the stable component**, and update the DOM **surgically**
   (`textContent`, `style`, targeted `innerHTML`) instead of re-rendering whole
   subtrees. This is what the Studio and much of Stereotic do.
2. **Let a real view layer own rendering** and use Amanita only to feed it (call
   `reRender()` from a subscription handler, then let the renderer diff).

Pick per component. The mistake is expecting Amanita to be your reactive renderer —
it isn't, and it doesn't try to be.

## A decision sketch

| If you're building… | Use… |
|---------------------|------|
| A widget mesh / dashboard with modest views | Amanita + manual DOM |
| A data-heavy app with complex views | A view library for views + Amanita for wiring & workers |
| Client-side routing over components | `a-url` + `a-match` + `a-switch` |
| Off-thread compute or canvas | `Workered` + `<a-scheduler>` |
| Backend logic with a live frontend feed | `<a-scheduler server="true">` |
| A server-side declarative actor system | Amanita + jsdom (see Meditator) |
| A simple two-component handoff | Plain pub/sub or a DOM event — don't overthink it |

---

That's the Concepts. For exact signatures and behavior, continue to the
[Reference](../reference/01-api.md).
