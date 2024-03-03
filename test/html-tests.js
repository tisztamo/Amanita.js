import A from "../src/a.js"
import {TestSuite} from "./helpers/testhelpers.js"

class HtmlTests extends TestSuite {
  testWrap(t) {
    const t42 = this.whtml("<div>t42</div>")
    t(A.isA(t42), "AutoWrap html content")
    t(t42.textContent === "t42", "Div text content")
    t(t42.children[0].tagname = "div", "Single child")
  }

  testNoWrap(t) {
    const a42 = this.whtml("<a-wrap>a42</a-wrap>")
    t(A.isA(a42), "html of a component is a component")
    t(a42.textContent === "a42", "Component text content")
    t(a42.childElementCount === 0, "No extra wrap")
  }
}

customElements.define("html-tests", HtmlTests)
