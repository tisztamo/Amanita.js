import {AmanitaWorker} from "../src/worker.js"
import { delay} from "../src/utils/delay.js"

export default class WPubSubberWorker extends AmanitaWorker {
  subTo(ref) {
    this.sub(ref, this.onData)
  }

  onData = (value) => {
    this.callComponent("workerGot", value)
  }

  async startPub(count) {
    await delay(100)
    for (let i = 0; i < count; i++) {
      this.pub("value", i)
      await delay(5)
    }
  }

  "@click" = e => {
    this.callComponent("workerGot", e.type)
  }
}
