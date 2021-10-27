import A from "./a.js"

export const BareBonesAmanita = A(HTMLElement)
A.define("a-wrap", BareBonesAmanita)

class Attr2Val extends BareBonesAmanita {
  constructor() {
    super()
    for (const attrName of this.getAttributeNames()) {
      this[attrName] = this.getAttribute(attrName)
    }
  }
}

A.define("a-const", Attr2Val)
