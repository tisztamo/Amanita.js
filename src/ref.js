// Ref cheatsheet
// /alma-source/my-alma/ids    // ids is topic name, alma-source and my-alma are name attributes!
// ..tagname/topic             // But when searching upwards, we are looking for tag name instead
// ../neighbor/                // .. goes up to the parent Amanita component
// ..[name="alma-source"]/     // "value" is the default topic WARN: Do not forget to write out the last "/" in this case
// .x/[a="1"]/@change          // Normal css selectors
// /#filter/@change            // topics starting with @ are DOM events
// @mouseover                  // my own event
// @touchmove passive          // a passive event handler

import {delay} from "./utils/delay.js"

function isAlpha(ch) {
  return ch >= "a" && ch <= "z" ||
    ch >= "A" && ch <= "Z" ||
    ch === "_"
}

export class Selector {
  static create(strOrSelector) {
    if (strOrSelector instanceof Selector) return strOrSelector
    return Selector(strOrSelector.split('/'))
  }

  constructor(parts) {
    this.parts = parts
  }

  query(fromEl) {
    let current = fromEl
    const parts = this.parts
    for (let i = 0; i < parts.length; i++) {
      const step = parts[i]
      if (step === "") {
        if (i === 0) current = document // Handle / at the beginning, skip otherwise
      } else {
        console.assert(current, `Ref ${this} reached out of document before '${step}'', while querying from `, fromEl)
        if (step === "..") {
          current = current.parentElement
          while (current && !current.on && !(current instanceof Document)) {
            current = current.parentElement
          }
        } else if (step.startsWith("..")) {
          current = current.closest(step.substr(2))
        } else if (isAlpha(step[0])) {
          current = current.querySelector(`[name="${step}"]`)
        } else {
          current = current.querySelector(step)
        }
      }
    }
    return current
  }

  toString() {
    return this.parts.join("/") + "/"
  }
}

export class PropRef {
  constructor(selectorParts, propName) {
    this.selector = new Selector(selectorParts)
    this.propName = propName || "value"
  }

  async bind(sourceEl, cb, trycount=5) {
    const target = await resolveRef(this, sourceEl, trycount)
    if (!target) return null
    const attention = target.on(this.propName, cb)
    attention.srcEl = sourceEl
    return {
      target,
      attention,
    }
  }

  toString() {
    return `${this.selector.toString()}${this.propName}`
  }
}

export class EventRef {
  constructor(selectorParts, event) {
    this.selector = new Selector(selectorParts)
    const eventparts = event.split(" ")
    this.event = eventparts[0]
    this.passive = false
    this.priority = false
    let i = 1
    while (i < eventparts.length) {
      const part = eventparts[i]
      switch (part) {
        case "passive":
          this.passive = true
          break
        case "priority":
          this.priority = true
          break
        default:
          console.error(`Invalid or unsupported event modifier: ${part}}`, this)
      }
      i += 1
    }
  }

  async bind(sourceEl, cb, trycount=5) {
    const target = await resolveRef(this, sourceEl, trycount)
    if (!target) return null
    target.addEventListener(this.event, cb, {passive: this.passive})
    return {
      target,
      event: this.event,
      cb,
    }
  }

  toString() {
    return `${this.selector.toString()}@${this.event}`
  }
}

// Reference descriptor -> PropRef | EventRef
// TODO error reporting and/or better defaults in _el, eg. "#got"
export function parseRef(ref) {
  const parts = ref.split('/')
  const lastPart = parts.pop()
  if (lastPart.startsWith("@")) {
    return new EventRef(parts, lastPart.substr(1))
  } else {
    return new PropRef(parts, lastPart)
  }
}

function _nextWait(currentWait) {
  return 1 + 2 * currentWait
}

// Return the target element of the ref, waiting for it to appear if not found (see sub())
export async function resolveRef(parsedRef, fromEl, trycount, _wait=0) {
  const target = parsedRef.selector.query(fromEl)
  if (!target) {
    if (trycount > 0) {
      return await delay(_wait, () => resolveRef(parsedRef, fromEl, trycount - 1, _nextWait(_wait)))
    }
    console.error(`No element selected by ref "${parsedRef.toString()}"`)
    return null
  }
  if (parsedRef instanceof PropRef) {
    if (!target.on) {
      if (trycount > 0) {
        return await delay(_wait, () => resolveRef(parsedRef, fromEl, trycount - 1, _nextWait(_wait)))
      }
      console.error(`Ref "${parsedRef}" selects an element that is not an Amanita component:`, target)
      return null
    }
  }
  return target
}
