export const a = Symbol('Amanita')

export default function A(realDOM) {
  // TODO is caching needed?
  return class AmanitaComponent extends realDOM {
    constructor() {
      super()
      this[a] = {}
    }

    attr(attrName) {
      return this.getAttribute(attrName)
    }

    setAttr(attrName, value) {
      this.setAttribute(attrName, value)
      return this
    }

    html(htmlString) {
      const wrapper = this[a].wrapper || document.createElement("a-wrap")
      wrapper.innerHTML = htmlString
      if (wrapper.childElementCount === 1) {
        const child = wrapper.children[0]
        if (A.isA(child)) {
          wrapper.textContent = ""
          this[a].wrapper = wrapper
          return child
        }
      }
      return wrapper
    }

    el(selector) {
      return this.querySelector(selector)
    }

    val2(selector, propName) {
      const target = this.el(selector)
      return target[propName]
    }

    setVal2(selector, propName, value) {
      const target = this.el(selector)
      target[propName] = value
      return this
    }

    val(localRef) {
      return this.val2(...parseRef(localRef))
    }

    connectedCallback() {} // Allow super calls
    disconnectedCallback() {}
  }
}

A.define = function(tagName, componentClass) {
  customElements.define(tagName, componentClass)
}

A.isA = function(el) {
  return !!el[a]
}

A.lastuid = 0
A.uid = function uid(prefix = "") {
  A.lastuid += 1
  return prefix ? `${prefix}_${A.lastuid}` : String(A.lastuid)
}

// Reference descriptor -> [selector, propertyName]
export function parseRef(ref) {
  return ref.split('/')
}
