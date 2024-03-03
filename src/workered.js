import A from "./a.js"
import {parseRef, PropRef, resolveRef} from "./ref.js"
import { deliver } from "./scheduler.js"
import {clearWorker, MSG_PRIORITY, MSG_TRANSFER, queuedSendMsg, extractEventData, _sendRawMsg} from "./workerutils.js"

function checkWorkersUsable() {
  return !!(
    window.Worker &&
    document.createElement("canvas").transferControlToOffscreen
   )
}

export const CANIUSE_WORKERS = checkWorkersUsable()

export default function Workered(realDOM) {
  return class WorkeredComponent extends A(realDOM) {
    constructor() {
      super()
      this.schedulerStarted = false
      this.workerConnected = false
      this.scheduler = null
      this.schedulerComponent = null
      this.schedulerSharers = null // Map(workerid, component) for routing messages back from spawner to sharers
    }

    spawnType() {
      return this.attr("spawn")
    }

    // TODO queue + MSG_PRIORITY and/or allow multiple args
    work(workTypeId, msgBody, flags = 0) {
      const id = this._a.workerid
      const msgType = workTypeId
      const payload = { msgType, msgBody, id }
      if (flags & MSG_TRANSFER) {
        _sendRawMsg(this.scheduler, payload, [msgBody])
      } else {
        queuedSendMsg(this.scheduler, payload, flags)
      }
    }

    transfer(workTypeId, msgBody) {
      this.work(workTypeId, msgBody, MSG_TRANSFER)
    }

    workerConnectedCallback() {
      this.workerConnected = true
      this.onWorkerConnect()
    }
    onWorkerConnect() {} // For user overload

    workerDisconnectedCallback() {
      this.onWorkerDisconnect()
      this.workerConnected = false
    }
    onWorkerDisconnect() {}

    connectedCallback() {
      super.connectedCallback()
      this._a.workerid = A.uid("wrk")
      if (this.spawnType() === "worker") {
        this.scheduler = CANIUSE_WORKERS ? this._spawnWorker() : this._spawnFake()
      } else if (this.spawnType() === "server") {
        this.scheduler = this._spawnServer()
      } else {
        this.schedulerComponent = this._findWorkerComponent()
        this.schedulerComponent._shareWorker(this)
        this.scheduler = this.schedulerComponent.scheduler
      }
      // TODO rename pwrk
      this.pwrk = new Proxy(this, {
        get: function (target, property, receiver) {
          return (args) => {
            const work = Reflect.get(target, "work")
            work.call(target, property, args)
          }
        }
      })
      this._connectWorker()
    }

    disconnectedCallback() {
      this._disconnectWorker()
      super.disconnectedCallback()
    }

    _dispatchMessage(payload) {
      const {srcId, msgType} = payload
      const component = this.schedulerSharers && this.schedulerSharers.get(srcId)
      const callbackTarget = srcId === this._a.workerid ? this : component
      if (msgType === "A.wrkr") { // worker registered
        callbackTarget && callbackTarget.workerConnectedCallback()
      } else if (msgType === "A.wrkd") { // worker disconnected
        callbackTarget && callbackTarget.workerDisconnectedCallback()
        this.schedulerSharers && this.schedulerSharers.delete(srcId) // unshare worker TODO Not clear why workerSharers can be null at this point, but it happens when switching to details page. Check it.
      } else if (msgType === "A.call") { // RPC
        if (!component) {
          console.debug("Component not found", srcId, payload)
          return
        }
        console.assert(typeof component[payload.msgBody.methodName] === "function", "Method not found in component", component, payload.msgBody)
        component[payload.msgBody.methodName](...payload.msgBody.params)
      } else if (msgType === "A.bat") { // Batch send
        const batch = payload.msgBody
        for (let i = 0; i < batch.length; i++) {
          this._dispatchMessage(batch[i])
        }
      }
    }

    _workerMessage = msg => {
      if (!this.schedulerStarted) { // The first message is dummy
        this.schedulerStarted = true
        return
      }
      this._dispatchMessage(msg.data)
    }

    _serverMessage = msg => {
      if (!this.schedulerStarted) { // TODO: reconcile naming
        this.schedulerStarted = true
        return
      }
      this._dispatchMessage(JSON.parse(msg.data))
    }

    async _workerQuery(queryMethodName, queryId, ...params) {
      const result = await this[queryMethodName](...params)
      this.pwrk._queryReturned({id: queryId, result})
    }

    async _subFromWorker(ref) {
      const parsedRef = parseRef(ref)
      const targetEl = await resolveRef(parsedRef, this, 5)
      if (parsedRef instanceof PropRef && targetEl.onWorkerConnect) { // TODO better check if its a worker
        return {
          ok: false,
          workerid: this.workeridOf(ref)
        }
      }
      const sub = this.sub(ref, value => {
        const sentValue = value instanceof Event ? extractEventData(value) : value
        this.work("_dispatchComponentSub", {ref, value: JSON.stringify(sentValue)}, parsedRef.priority ? MSG_PRIORITY : undefined)
      })
      if (!sub) return {
        ok: false,
        msg: "notfound",
      }
      return {
        ok: true,
      }
    }

    on(propName, cb) {
      const retval = super.on(propName, cb)
      if (this.scheduler) this.work("_notifyComponentOn", propName, MSG_PRIORITY)
      return retval
    }

    off(descriptor) {
      const retval = super.off(descriptor)
      if (this.scheduler) this.work("_notifyComponentOff", descriptor.propName, MSG_PRIORITY)
      return retval
    }

    workeridOf(ref) {
      const el = this.el(ref)
      console.assert(el, "No workered component found with", ref)
      return el._a.workerid
    }

    _spawnWorker() {
      const worker = new Worker(new URL("./worker-scheduler.js", import.meta.url), {type: "module"})
      worker.onmessage = this._workerMessage
      this.spawnedWorker = worker
      return worker
    }

    _spawnServer() {
      const ws_url = new URL(location.href)
      console.log(ws_url)
      if (ws_url.protocol === "http:" && (ws_url.hostname === "localhost" || ws_url.hostname.startsWith("192.168."))) {
        ws_url.port = 2626 // connect directly to the backend during dev
        ws_url.protocol = "ws"
      } else {
        ws_url.protocol = "wss" 
      }
      ws_url.hash = ""
      const server = new WebSocket(ws_url)
      server.onmessage = this._serverMessage
      this.spawnedWorker = server
      return server
    }

    _spawnFake() {
      const fakeComponent = this
      const backConnection = {
        postMessage: (msg, transfer) => {
          fakeComponent._workerMessage({data:msg})            
        }
      }
      this.spawnedWorker = {
        postMessage: (msg, transfer) => {
          deliver(msg, backConnection)
        }
      }
      return this.spawnedWorker
    }

    _findWorkerComponent() {
      let el = this
      while (el && !el.spawnedWorker) {
        el = el.parentElement
      }
      if (!el) {
        console.error("No upstream worker found and no worker attribute is set on:", this)
        return null
      }
      return el
    }

    _connectWorker() {
      if (!this.workerSrc) return
      this.work("A.regw", {
        workerSrc: this.workerSrc.toString(),
        id: this._a.workerid
      }, MSG_PRIORITY)
    }

    _disconnectWorker() {
      if (this.workerSrc) {
        this.work("A.unrw", {
          id: this._a.workerid
        })
      }
      if (this.spawnedWorker) {
        setTimeout(() => {
          this.work("A.sigt", {}, MSG_PRIORITY)
          setTimeout(() => {
            this.spawnedWorker.terminate && this.spawnedWorker.terminate()
            this.spawnedWorker.close && this.spawnedWorker.close()
            clearWorker(this)
            this.spawnedWorker.onmessage = null
            this.spawnedWorker = null
            this.schedulerSharers = null
            this.scheduler = null
            this.pwrk = null
          }, 200)
        }, 500)
      } else {
        clearWorker(this)
        this.schedulerComponent._unshareWorker(this)
        this.schedulerComponent = null
        this.scheduler = null
        this.pwrk = null
      }
    }

    _shareWorker(component) {
      if (!this.schedulerSharers) this.schedulerSharers = new Map()
      this.schedulerSharers.set(component._a.workerid, component)
    }

    _unshareWorker(component) {
      console.assert(this.schedulerSharers, "Missing workerSharers while unsharing ", component, " from ", this)
      this.schedulerSharers.delete(component._a.workerid)
    }
  }
}
