import A from "../src/a.js"
import Workered from "../src/workered.js"

class WPubSubber extends Workered(HTMLElement) {
  workerSrc = new URL("test/wpubsubber.worker.js", document.location)

  constructor() {
    super()
    this.got = []
  }

  async onWorkerConnect() {
    super.onWorkerConnect()
    if (this.attr("sub")) {
      this.pwrk.subTo(this.attr("sub"))
    }
    if (this.attr("pubcount")) {
      this.pwrk.startPub(Number(this.attr("pubcount")))
    }
  }

  workerGot(value) {
    this.got.push(value)
  }
}

A.define("w-pub-subber", WPubSubber)
