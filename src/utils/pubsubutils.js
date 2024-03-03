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
  const props = Object.keys(obj)
  for (let i = 1; i < props.length; i++) {
    const propName = props[i]
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
