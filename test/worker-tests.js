/* eslint eqeqeq: 0 */

import {TestSuite, eq} from "./helpers/testhelpers.js"
import A from "../src/a.js"
import "../src/stdlib.js"
import { delay } from "../src/utils/delay.js"
import "./wpubsubber.js"

class WorkerTests extends TestSuite {
  async testWorkerPubSub(t) {
    await delay(700)
    const wPubSubber = this.el("#wres/")
    t(eq(wPubSubber.got, [0, 1, 2, 3, 4]), "Worker Pubsub basics")

    wPubSubber.got = []
    wPubSubber.click()
    await delay(100)
    t(eq(wPubSubber.got, ["click"]), "Worker Event forwarding")
  }
}

A.define("worker-tests", WorkerTests)
