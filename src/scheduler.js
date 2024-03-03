import {_workerRegistry, getWorker, _sendMsg} from "./workerutils.js"

let workerSrcHandler = workerSrc => {
  if (!workerSrc) return false
  const allowedPrefix = new URL(location.href)
  allowedPrefix.pathname = ""
  allowedPrefix.hash = ""
  if (!workerSrc.startsWith(allowedPrefix.href)) {
    console.error(`External imports are not supported. Origin: ${allowedPrefix.href}, worker src: ${workerSrc}`)
    return false
  }
  return workerSrc
}

// Set a callback that will receive the worker url before loading
// The handler MUST validate the url, and it may transform it:
// The worker source will be loaded from the url returned by the handler
// Return falsy to prevent loading
export function setWorkerSrcHandler(h) {
  workerSrcHandler = h
}

let workerRegistrationHandler = (worker, conn) => null

export function setWorkerRegistrationHandler(h) {
  workerRegistrationHandler = h
}

async function registerWorker(descriptor, conn) {
  let {id, workerSrc} = descriptor
  if (!workerSrc) return
  const transformedSrc = workerSrcHandler(workerSrc)
  if (!transformedSrc) return
  try {
    const module = await import(transformedSrc)
    // eslint-disable-next-line new-cap
    const worker = new module.default()
    _workerRegistry.set(id, worker)
    worker._a.workerid = id
    worker._a.connection = conn
    worker.componentConnected()
    workerRegistrationHandler(worker, conn)
    _sendMsg(conn, id, "A.wrkr")
  } catch (e) {
    console.warn("Cannot load worker", e)
  }
}

function unregisterWorker({id}, connection) {
  const worker = _workerRegistry.get(id)
  if (!worker) {
    console.error("Worker not found for unregister", id)
    return
  }
  _workerRegistry.delete(id)
  worker.componentDisconnected()
  _sendMsg(worker._a.connection, id, "A.wrkd")
}

function deliverBulk(msgs, connection) {
  msgs.forEach(msg => deliver(msg, connection))
}

export function deliver(work, connection=self) {
  if (work.msgType.startsWith("A.")) {
    serviceRoutes[work.msgType](work.msgBody, connection)
  } else {
    const worker = getWorker(work.id)
    if (!worker) {
      noWorkerWarn(work)
      return
    }
    worker._dispatchWork(work)
  }
}

export function cleanUp(connection) {

}

function onSigTerm() {
  if (_workerRegistry.size) {
    console.error("Terminating scheduler with remaining workers", _workerRegistry)
  }
  try {
    onmessage = () => null
  } catch {}
  // Seems like there is no way to exit here, waiting to be killed from the outside
}

const serviceRoutes = {
  "A.regw": registerWorker,
  "A.unrw": unregisterWorker,
  "A.bat": deliverBulk,
  "A.sigt": onSigTerm,
}

export function _handleMsg(e) {
  const msg = e.data
  deliver(msg)
}

// Debug functions
// TODO import dynamically only when needed

const NOWORKER_WARN_LIMIT = 5

let nwWarnCount = 0
function noWorkerWarn({id, msgType}) {
  if (msgType === "_queryReturned") return // Ok to get a response after unregisterWorker
  if (nwWarnCount < NOWORKER_WARN_LIMIT) {
    console.warn(`Unknown workered component id: ${id}. Disconnected? (Work: ${msgType})`)
  } else if (nwWarnCount === NOWORKER_WARN_LIMIT) {
    console.warn("Too many 'Unknown workered component id' warnings, disabling...")
  }
  nwWarnCount++
}
