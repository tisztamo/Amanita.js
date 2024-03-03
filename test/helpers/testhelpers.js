import A from "../../src/a.js"
import {BareBonesAmanita} from "../../src/stdlib.js"

export class TestFailure extends Error {
  constructor(reason) {
    super(reason)
    this.name = "TestFailure"
    this.reason = reason
  }
}

export class TestSuite extends BareBonesAmanita {
  async onConnect() {
    super.onConnect()
    await this.setup()
    try {
      await this.execute()
      this.innerHTML = `<div style="color: green">${this.tagName} - OK</div>`
    } catch (e) {
      console.error(e)
      this.innerHTML = `<div style="color: red">${this.tagName} - </div>`
    }
    await this.teardown()
  }

  async execute() {
    const proto = Object.getPrototypeOf(this)
    const names = Object.getOwnPropertyNames(proto)
    const promises = []
    for (const name of names) {
      if (name.startsWith("test") && typeof this[name] === 'function') {
        const testResult = this[name](test)
        if (testResult instanceof Promise) {
          promises.push(testResult)
        }
      }
    }
    return await Promise.all(promises)
  }

  async setup() {}
  async teardown() {}
}

let totalTestCount = 0

function test(predicate, reason = null) {
  totalTestCount++
  if (!predicate) {
    throw new TestFailure(reason)
  }
  return predicate
}

export function testCount() {
  return totalTestCount
}

export async function fetchHtml(url) {
  return (await fetch(url)).text()
}

export function createEl(tagName, attributes) {
  const tag = document.createElement(tagName)
  for (const attr in attributes) {
    tag.setAttribute(attr, attributes[attr])
  }
  return tag
}

// structural equivalence chacked using JSON.stringify
export function eq(val1, val2) {
  const s1 = JSON.stringify(val1)
  const s2 = JSON.stringify(val2)
  if (s1 === s2) return true
  console.error("Not equivalent", val1, val2)
  return false
}

export class TestArea extends BareBonesAmanita {
  async unsecureLoadTests() {
    const folder = this.attr("srcs") || "./test/"
    const filter = this.attr("filter") || 'a[href$=".js"]'
    const attrName = this.attr("attr") || "href"
    const container = document.createElement("div")
    container.innerHTML = await fetchHtml(folder)
    const selectedEls = container.querySelectorAll(filter)
    const scriptSrcs = []
    for (const el of selectedEls) {
      const scriptSrc = el.getAttribute(attrName)
      if (!scriptSrc.endsWith("lib/Amanita.js")) {
        scriptSrcs.push(scriptSrc)
      }
    }
    const scriptEls = scriptSrcs.map(src => createEl("script", {src, type: "module"}))
    for (const script of scriptEls) {
      this.appendChild(script)
    }
  }
}
A.define("test-area", TestArea)
