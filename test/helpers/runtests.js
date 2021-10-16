import "../../src/stdlib.js"
import "./testhelpers.js"

for (const testArea of document.getElementsByTagName("test-area")) {
  testArea.unsecureLoadTests()
}
