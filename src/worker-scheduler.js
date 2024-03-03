import {_sendMsg} from "./workerutils.js"
import {_handleMsg} from "./scheduler.js"

onmessage = _handleMsg

_sendMsg(self, -1, "A.wrks") // Signal start
