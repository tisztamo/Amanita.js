import A from "../src/a.js"
import {TestSuite} from "./helpers/testhelpers.js"

class ValTests extends TestSuite {
  testValGet(t) {
    t(this.val("varx/x") === "x42", "val of a-const")
  }

  testAttrSet(t) {
  }
}

A.define("val-tests", ValTests)
