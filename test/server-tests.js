import {TestSuite, eq} from "./helpers/testhelpers.js"
import A from "../src/a.js"
import "../src/stdlib.js"
import { delay } from "../src/utils/delay.js"
import "./worker-tests.js"

class ServerTests extends TestSuite {
    async testServerPubSub(t) {
      await delay(900)
      const sPubSubber = this.el("#server_wres/")
      t(eq(sPubSubber.got, [0, 1, 2, 3, 4]), "Server Pubsub basics")

      sPubSubber.got = []
      sPubSubber.click()
      await delay(100)
      t(eq(sPubSubber.got, ["click"]), "Server Event forwarding")
    }
  }

  A.define("server-tests", ServerTests)
