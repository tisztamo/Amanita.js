export const MSG_PRIORITY = 2
export const MSG_TRANSFER = 4 // Transfer also indicates priority (currently)

export const NORMAL_LATENCY = 15 // Max time (ms) for normal (non-priority, non-transfer) msgs in queue when no congestion. Note: The first one in a burst is delivered immediately

// -------- Worker-only utils -------
// TODO separate
export const _workerRegistry = new Map()

export function getWorker(id) {
  const worker = _workerRegistry.get(id)
  return worker
}

export function _sendMsg(connection, myId, msgType, msgBody, flags = 0) {
  const payload = {srcId: myId, msgType, msgBody}
  queuedSendMsg(connection, payload, flags)
}

// -------- End of worker-only utils -------

const outQueues = new Map() // "Phisical Worker" -> [payload..]
let lastSendTs = 0
let timeout = 0

function getQueue(remote) {
  const q = outQueues.get(remote)
  if (!q) {
    const newq = []
    outQueues.set(remote, newq)
    return newq
  }
  return q
}

export function clearWorker(remote) {
  outQueues.delete(remote)
}

export function _sendRawMsg(connection, payload, transfer) {
  if (connection.send) { //  instanceof WebSocket
    console.assert(transfer === undefined, "Transfer is not supported on websocket")
    if (connection.readyState === 0) {
      queuedSendMsg(connection, payload)
      return
    }
    try {
      connection.send(JSON.stringify(payload))
    } catch (e) {
      console.debug("Unable to send to ws", e.name, e.message)
    }
  } else {
    connection.postMessage(payload, transfer)
  }
}

// TODO expose flags in public (usable) APIs like callComponent()
export function queuedSendMsg(connection, payload, flags = 0) {
  if (flags & MSG_PRIORITY) {  // TODO MSG_TRANSFER
    _sendRawMsg(connection, payload)
  } else {
    const ts = Date.now()
    const q = getQueue(connection)
    if (ts - lastSendTs < NORMAL_LATENCY) { // Burst send: buffer it
      getQueue(connection).push(payload)
      if (!timeout) {
        timeout = setTimeout(flushQueues, NORMAL_LATENCY)
      }
    } else { // First msg after a while
      if (q.length > 0) { // or congestion
        q.push(payload)
      } else {
        lastSendTs = Date.now()
        _sendRawMsg(connection, payload)
      }
    }
  }
}

function _isConnectionReady(conn) {
  return conn.readyState !== 0 // undefined for local worker connections
}

function flushQueues() {
  timeout = 0
  lastSendTs = Date.now()
  outQueues.forEach((q, connection) => {
    if (!q.length) return
    if (_isConnectionReady(connection)) {
       _sendRawMsg(connection, {
        srcId: -1,
        msgType: "A.bat",
        msgBody: q
      })
      q.length = 0
    }
  })
}

// TODO: include what is needed and eventually allow clients to specify what to extract
const EVENT_PROPERTIES = [
  "type",

  // Mouse:
  "offsetX", "offsetY"
]

// Simple JSON.strigify does not work on events, extract the needed fields to a new object
export function extractEventData(event) {
  return EVENT_PROPERTIES
  .reduce(function (obj2, key) {
    if (key in event)
      obj2[key] = event[key]
    return obj2
  }, {})
}