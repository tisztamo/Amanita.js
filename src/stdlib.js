import A from "./Amanita.js"

export const BareBonesAmanita = A()
A.define("a-wrap", BareBonesAmanita)

class Attr2Val extends A() {
  constructor() {
    super()
    for (const attrName of this.getAttributeNames()) {
      this[attrName] = this.getAttribute(attrName)
    }
  }
}

A.define("a-const", Attr2Val)
