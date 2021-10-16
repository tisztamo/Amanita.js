import A from "../../src/Amanita.js"

export class TestFailure extends Error {
  constructor(reason) {
    super(reason)
    this.name = "TestFailure"
    this.reason = reason
  }
}

export class TestSuite extends A() {
  connectedCallback() {
    this.setup()
    try {
      this.execute()
      this.innerHTML = `<div style="color: green">${this.tagName} - OK</div>`
    } catch (e) {
      console.error(e)
      this.innerHTML = `<div style="color: red">${this.tagName} - </div>`
    }
    this.teardown()
  }

  execute() {
    const proto = Object.getPrototypeOf(this)
    const names = Object.getOwnPropertyNames(proto)
    for (const name of names) {
      if (name.startsWith("test") &&
        typeof this[name] === 'function') {
        this[name](test)
      }
    }
  }

  setup() {}
  teardown() {}
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

export class TestArea extends A() {
  async unsecureLoadTests() {
    const folder = this.attr("srcs") || "./test/"
    const filter = this.attr("filter") || 'a[href$=".js"]'
    const attrName = this.attr("attr") || "href"
    const container = document.createElement("div")
    container.innerHTML = await fetchHtml(folder)
    const selectedEls = container.querySelectorAll(filter)
    const scriptSrcs = []
    for (const el of selectedEls) {
      scriptSrcs.push(el.getAttribute(attrName))
    }
    const scriptEls = scriptSrcs.map(src => createEl("script", {src, type: "module"}))
    for (const script of scriptEls) {
      this.appendChild(script)
    }
  }
}
A.define("test-area", TestArea)
