import {_on, _off, _pub, _autoSub} from "./utils/pubsubutils.js"
import {getWorker, _sendMsg} from "./workerutils.js"
import {parseRef, EventRef, PropRef} from "./ref.js"

let lastuid = 0 // WARN: local to "physical" worker

export class AmanitaWorker {
  _a = {
    connection: null, // To access the component
    workerid: -1,
    queriesInProgress: null,
    subscribers: null,
    /** @type {Map<EventRef | PropRef, Function>} */
    compSubCbs: null, // Map(ref, cb) subs delegated to the component
    compPubs: null // Map(propName, Int) pubs forwarded to the compoent
  }

  componentConnected() {
    this.onConnect()
    _autoSub(this)
  }

  componentDisconnected() {
    this.onDisconnect()
  }

  onConnect() {}
  onDisconnect() {}

  on(propName, cb) {
    const retval = _on(this, propName, cb)
    this.onOn(propName, cb)
    return retval
  }
  onOn(propName, cb) {}

  off(descriptor) {
    const retval = _off(this, descriptor)
    this.onOff(descriptor)
    return retval
  }
  onOff(descriptor) {}


  pub(propNameOrValue, newValue) {
    const propName = newValue === undefined ? "value" : propNameOrValue
    const value = newValue === undefined ? propNameOrValue : newValue
    if (this._a.compPubs && this._a.compPubs.get(propName) > 0) {
      this.callComponent("pub", propName, value)
    }
    return _pub(this, propName, value)
  }

  async sub(ref, cb) {
    if (!this._a.compSubCbs) this._a.compSubCbs = new Map()
    const parsedRef = parseRef(ref)
    console.assert(!this._a.compSubCbs[ref], "Multiple subs are not implemented")
    this._a.compSubCbs[ref] = cb
    const sub = await this.queryComponent("_subFromWorker", ref)
    if (sub.ok) return sub
    if (sub.workerid) {
      const worker = getWorker(sub.workerid)
      if (worker) {
        worker.on(parsedRef.propName, cb)
      } else {
        console.debug(`Cannot sub: Worker '${sub.workerid}' not found, maybe lives in other scheduler (web worker/server), or disconnected.`, ref)
      }
    }
  }

  _dispatchComponentSub({ref, value}) {
    const cb = this._a.compSubCbs[ref]
    cb(JSON.parse(value))
  }

  // Pubs to the given prop needs to be forwarded to the component, someone listens
  _notifyComponentOn(propName) {
    if (!this._a.compPubs) this._a.compPubs = new Map()
    const refCnt = this._a.compPubs.get(propName) || 0
    this._a.compPubs.set(propName, refCnt + 1)
    this.onOn(propName)
  }

  // A listener offed the propname, do not forward if it was the only one
  _notifyComponentOff(propName) {
    const refCnt = this._a.compPubs.get(propName) 
    console.assert(refCnt > 0, "sub reference count underflow")
    this._a.compPubs.set(propName, refCnt - 1)
    this.onOff(propName)
  }

  // Calls a method on the component, handling return value. async, of course
  async queryComponent(queryMethodName, ...params) {
    const queryId = this.uid()
    if (!this._a.queriesInProgress) this._a.queriesInProgress = []
    const queriesInProgress = this._a.queriesInProgress
    const callReturned = new Promise((resolve) => {
      queriesInProgress.push({id: queryId, resolve})
    })
    this.callComponent("_workerQuery", queryMethodName, queryId, ...params)
    const retval = await callReturned
    return retval
  }

  _queryReturned({id, result}) {
    const idx = this._a.queriesInProgress.findIndex(q => q.id === id)
    this._a.queriesInProgress[idx].resolve(result)
    this._a.queriesInProgress.splice(idx, 1)
    //if (this._a.queriesInProgress.length === 0) this._a.queriesInProgress = null // TODO really a good idea?
  }

  callComponent(methodName, ...params) {
    _sendMsg(this._a.connection, this._a.workerid, "A.call", {
      methodName,
      params
    }) // TODO allow setting flags
  }

  _dispatchWork(work) {
    try {
      this[work.msgType](work.msgBody, work.id)
    } catch (e) {
      console.error(`Unable to do work '${work.msgType}:'`, e, work)
    } 
  }

  uid(prefix = "") {
    console.assert(this._a.workerid !== -1, "WARN: Generated uids are not globally unique before componentConnected()")
    lastuid += 1
    return prefix ? `w${this._a.workerid}_${prefix}_${lastuid}` : String(lastuid)
  }
}
