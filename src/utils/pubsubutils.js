// Out-of class implementation of "on" to share between worker and main
export function _on(me, propName, cb) {
  if (!me._a.subscribers) me._a.subscribers = new Map()
  let subs = me._a.subscribers.get(propName)
  if (!subs) {
    subs = []
    me._a.subscribers.set(propName, subs)
  }
  const attention = {
    propName,
    cb,
    ref: null, // Will be filled in later by sub()
    srcEl: null
  } // TODO allow ref format "./propName" or "propName" and make off() and unsub() the same
  subs.push(attention)
  if (me[propName] !== undefined && me[propName] !== null) {
    queueMicrotask(() => cb(me[propName]))
  }
  return attention
}

export function _off(me, {propName, cb}) {
  if (!me._a.subscribers) return false
  const subs = me._a.subscribers.get(propName)
  if (!subs) return false   // nothing registered under this name (e.g. an @event attention already cleared on teardown)
  const idx = subs.findIndex(sub => sub.cb == cb)
  if (idx === -1) {
    console.error("Cannot find listener callback for offing", cb)
    return false
  }
  subs.splice(idx, 1)
  return me
}

export function _pub(me, propName, newValue) {
  if (!me._a.subscribers) me._a.subscribers = new Map()
  const subs = me._a.subscribers.get(propName)
  if (subs) {
    const old = me[propName]
    subs.forEach(sub => {
      sub.cb(newValue, old)
    })
  }
  me[propName] = newValue
  return me
}

export function _isAutoSubbed(propName) {
  return propName.startsWith("@") || propName.indexOf("/") !== -1
}

export function _autoSub(obj) {
  // Subscribe every own field whose name is a ref (@event or contains "/"). We scan all
  // keys rather than skipping index 0: the internal "_a" field is never ref-shaped, so
  // _isAutoSubbed filters it out anyway, and skipping by position would drop a real
  // auto-sub field that happens to sit first (e.g. one declared on a base class).
  for (const propName of Object.keys(obj)) {
    if (_isAutoSubbed(propName)) {
      obj.sub(propName, obj[propName])
    }
  }
}

export async function _unsubAll(obj) {
  let l = obj._a.subscriptions.length - 1
  while (l >= 0) {
    await obj.unsub(obj._a.subscriptions[l])
    l = l - 1
  }
}

// --- Async prototype-method footgun warning (roadmap #3) ---
// Components enqueue their constructor at connect time. The first enqueue arms a 1s
// timer; later enqueues just push. When the timer fires we drain the batch, deduplicate
// by constructor, walk each prototype chain and warn about ref-shaped method names.
// NOTE: class methods are non-enumerable, so we use Object.getOwnPropertyNames().
const _protoWarnQueue = []
let _protoWarnTimer = null
const _protoWarned = new WeakSet()

export function _enqueueProtoWarn(Constructor) {
  if (_protoWarned.has(Constructor)) return
  _protoWarnQueue.push(Constructor)
  if (!_protoWarnTimer) {
    _protoWarnTimer = setTimeout(_flushProtoWarnQueue, 1000)
  }
}

function _flushProtoWarnQueue() {
  _protoWarnTimer = null
  const batch = _protoWarnQueue.splice(0)
  for (const Constructor of batch) {
    if (_protoWarned.has(Constructor)) continue
    _protoWarned.add(Constructor)

    let proto = Constructor.prototype
    while (proto && proto !== Object.prototype) {
      for (const propName of Object.getOwnPropertyNames(proto)) {
        if (_isAutoSubbed(propName)) {
          console.warn(
            `[Amanita] \`${propName}\` on ${Constructor.name} is a prototype method; ` +
            `auto-sub only subscribes own instance fields. ` +
            `Write it as \`"${propName}" = e => {}\` (arrow-field) to subscribe automatically.`
          )
        }
      }
      proto = Object.getPrototypeOf(proto)
    }
  }
}
