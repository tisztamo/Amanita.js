import {TestSuite, eq} from "./helpers/testhelpers.js"
import A from "../src/a.js"
import { delay } from "../src/utils/delay.js"
import "./worker-tests.js"
import "./wpubsubber.js"

import Tonic from "https://cdn.skypack.dev/@optoolco/tonic@v13"

export default class Component extends A(Tonic) {
  // TODO find the need or remove
}
Component.isTonicComponent = true
Component.define = (compClass, tagName) => Tonic.add(compClass, tagName)


const DATA_COUNT = 1000000
const REBUILD_COUNT = 20

function fillArray(arr, count) {
  for (var i=0; i<count;i++) {
    arr.push(i)
  }  
}

class DummyAllocator extends Component {
  data = []
  onConnect() {
    this.sub(this.attr("input"), this.onDatacount)
  }

  "@click" = (e) => {
    alert(e.data.length)
  }

  onDatacount = inp => {
    fillArray(this.data, Number(inp))
  }
}
Component.define(DummyAllocator)

class AllocWrapper extends Component {
  render() {
    return this.html`
<a-scheduler>
  <a-var name="hub"></a-var>
  <w-pub-subber name="wsrc" pubcount="5"></w-pub-subber>
  <w-pub-subber name="wres" sub="../wsrc/"></w-pub-subber>  

  <a-switch input="..memory-leak-tests/source/" hide="remove">
    <dummy-allocator case="1" input="..memory-leak-tests/datacount/" hub="../../hub/">Dummy Allocator. Check memory consumption after the run manually</dummy-allocator>
    <dummy-allocator case="2" input="..memory-leak-tests/datacount/" hub="../../hub/">Dummy Allocator. Check memory consumption after the run manually</dummy-allocator>
  </a-scwitch>
</a-scheduler>
`
  }
}
Component.define(AllocWrapper)


class MemoryLeakTests extends TestSuite {
  rebuild() {
    this.innerHTML = `
  <a-var name="source" value="2"></a-var>
  <a-var name="datacount" value="${DATA_COUNT.toString()}"></a-var>
  <alloc-wrapper></alloc-wrapper>
`
  }

  async testRebuild(t) {
    await delay(300)
    this.rebuild()
    const heapSize1 = performance.memory.usedJSHeapSize
    for (let i=0; i<REBUILD_COUNT; i++) {
      this.rebuild()
      await delay(300)
    }

    const heapSize2 = performance.memory.usedJSHeapSize
    console.log(heapSize1, heapSize2, heapSize1 / heapSize2)
    // TODO force gc

    console.warn("Check memory consuption manually, it should be only a few MB after gc.")
    //t(heapSize1 + DATA_COUNT * REBUILD_COUNT > heapSize2, "No memory leak when rebuilding simple structure") // Assuming that a memory leak causes least 4x that much (32 bit numbers)
    //t(heapSize1 / heapSize2 > 0.3, "No memory leak when rebuilding simple structure") // May this work without forced gc?
  }
}

A.define("memory-leak-tests", MemoryLeakTests)
