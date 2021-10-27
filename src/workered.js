import {default as A, a} from "./a.js"
import workerMain from "./workermain.js"
import {AmanitaWorker} from "./worker.js"

export default function Workered(realDOM) {
  return class WorkeredComponent extends A(realDOM) {
    constructor() {
      super()
      this.workerStarted = false
      this.worker = null
    }

    connectedCallback() {
      super.connectedCallback()
      if (this.getAttribute("worker") !== null) {
        this.worker = this._createWorker()
      } else {
        this.worker = this._findWorker()
      }
      this._connectWorker()
    }

    disconnectedCallback() {
        console.log("sdfs")
      this._disconnectWorker()
      super.disconnectedCallback()
    }

    work(workTypeId, data, isTransfer = false) {
      const id = this[a].workerid
      const type = workTypeId 
      const payload = { type, data, id }
      if (isTransfer) {
        this.worker.postMessage(payload, [data])
      } else {
        this.worker.postMessage(payload)
      }
    }

    _workerMessage(msg) {
      if (!this.workerStarted) {
        this.workerStarted = true
      }
    }

    _createWorker() {
      const workerBaseSrc = AmanitaWorker.toString()
      const workerMainSrc = _extractBody(workerMain.toString())
      const blob = new Blob([workerBaseSrc + workerMainSrc], { type: "text/javascript" })
      const worker = new Worker(URL.createObjectURL(blob))
      worker.onmessage = this._workerMessage.bind(this)
      return worker
    }

    _findWorker() {
      let el = this
      while (el && !el.worker) {
        el = el.parentElement
      }
      if (!el) {
        console.error("No upstream worker found and no worker attribute is set on:", this)
        return null
      }
      return el.worker
    }

    _connectWorker() {
      if (this[a].workerid) return
      this[a].workerid = A.uid(this.id)
      this.work("A.regw", {
        workerClassStr: this.workerClass.toString(),
        id: this[a].workerid
      })
    }

    _disconnectWorker() {
      console.warn("TODO: unregister worker")
    }

  }
}

function _extractBody(functionStr) {
  const begin = functionStr.indexOf("{")
  const end = functionStr.lastIndexOf("}")
  return functionStr.substring(begin + 1, end - 1)
}