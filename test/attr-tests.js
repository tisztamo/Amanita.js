import {TestSuite} from "./helpers/testhelpers.js"

class AttrTests extends TestSuite {
  testAttrGet(t) {
    t(this.attr("testattr") === "ta42", "id attribute is ta42")
    t(this.querySelector('[name="testname"]').attr("name") === "testname")
  }

  testAttrSet(t) {
    t(this.attr("testattr") === "ta42", "id attribute is ta42")
    t(this.setAttr("testattr", "ta43") === this, "setAttr return value")
    t(this.attr("testattr") === "ta43", "setAttr side-effect")
  }
}

customElements.define("attr-tests", AttrTests)
