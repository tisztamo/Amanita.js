import {_on, _off, _pub, _isAutoSubbed, _autoSub, _unsubAll} from "./utils/pubsubutils.js"
import {parseRef, PropRef, resolveRef} from "./ref.js"

export default function A(realDOM) {
  // TODO is caching needed?
  return class AmanitaComponent extends realDOM {
    _a = {
      subscribers: null, // Map(propName, [handlerCBs...])
      subscriptions: [], // [SubscriptionDescriptors...]
      hub: null
    }

    // Get the value of attribute "attrName" of this
    attr(attrName) {
      return this.getAttribute(attrName)
    }

    setAttr(attrName, value) {
      this.setAttribute(attrName, value)
      return this
    }

    // TODO: (re)move
    whtml(htmlString) {
      const wrapper = this._a.wrapper || document.createElement("a-wrap")
      wrapper.innerHTML = htmlString
      if (wrapper.childElementCount === 1) {
        const child = wrapper.children[0]
        if (A.isA(child)) {
          wrapper.textContent = ""
          this._a.wrapper = wrapper
          return child
        }
      }
      return wrapper
    }

    // Find the DOM element referenced by ref (ignoring property or event descriptor in ref)
    el(ref) {
      const parsedRef = parseRef(ref)
      return parsedRef.selector.query(this)
    }

    // Find the _attribute_ upwards in the tree, starting from startEl or this and return the first found value
    env(attrName, startEl = null) {
      const el = (startEl || this).closest(`[${attrName}]`)
      if (!el) return null
      return el.getAttribute(attrName)
    }

    // Get the current value of the property referenced by ref
    // Also allows propenv(propName) style references
    val(ref) {
      const parsedRef = parseRef(ref)
      const target = this.el(ref) // TODO avoid double-parse
      const propOrEnv = parsedRef.propName
      if (propOrEnv.startsWith("propenv(")) {
        console.assert(propOrEnv.endsWith(")"), "Missing ')' at the end", ref)
        const searchProp = propOrEnv.substr(8, propOrEnv.length - 9)
        let currEl = target
        while (currEl && currEl[searchProp] === undefined) {
          currEl = currEl.parentElement
        }
        return currEl ? currEl[searchProp] : null
      }
      return target[propOrEnv]
    }

    // Listen to published changes of a property.
    // Returns an "attention descriptor" that can be used to unlisten
    on(propName, cb) {
      const retval = _on(this, propName, cb)
      this.onOn(propName, cb)
      return retval
    }

    // Lifecycle callback
    // TODO onSub instead
    onOn(propName, cb) {}

    // Unlisten. Call with the "attention descriptor" returned by on()
    off(descriptor) {
      return _off(this, descriptor)
    }

    // Change a property and publish the new value
    // Also publish the value to my hub, if set
    // Do nothing if value is undefined
    // default propName is "value"
    pub(propNameOrValue, newValue) {
      const propName = newValue === undefined ? "value" : propNameOrValue
      const value = newValue === undefined ? propNameOrValue : newValue
      if (value === undefined) return
      _pub(this, propName, value)
      if (this._a.hub) {
        this._a.hub.pub(propName, value)
      }
    }

    // Subscribe to a remote stream (ref)
    // - changes of the referenced property
    // - or the referenced DOM event
    // of the referenced element.
    // Returns a "subscription descriptor" that can be passed to unsub
    // Example:
    //    this.sub(".datasource/raw", value => alert(value))
    //    Will look for the first .datasource found starting from this
    // WARN: async! returns null or a subscription desriptor to be passed to unsub
    // Will try 'trycount' times with exponential delay when
    // no element is selected by the ref
    // TODO Check if pooling together the delayed subs leads to better performance
    async sub(ref, cb, trycount=5) {
      console.assert(typeof cb === "function", "Not a valid sub callback", cb)
      const parsedRef = parseRef(ref)
      const subscription = await parsedRef.bind(this, cb, trycount)
      if (!subscription) return null
      if (subscription.attention) {
        subscription.attention.ref = ref // TODO  attach this in bind, make resub work for events and canonicalize attention/event
      }
      this._a.subscriptions.push(subscription)
      return subscription
    }

    async unsub(subDescriptor) {
      if (!subDescriptor) return this
      const subDesc = await subDescriptor
      console.assert(!subDesc.attention || subDesc.attention.srcEl === this, "unsub called on different element than sub", subDesc)
      const subIdx = this._a.subscriptions.findIndex( // TODO unclear why callbacks are not always equal during _unsubAll. Ignoring cb for now.
        sub => (sub.attention && subDesc.attention && sub.attention.propName === subDesc.attention.propName ||
          sub.event && sub.event === subDesc.event) &&
           sub.target === subDesc.target
      )
      if (subIdx === -1) {
        console.error("Subscription not found for unsub", subDesc)
      } else {
        this._a.subscriptions.splice(subIdx, 1)
      }
      if (subDesc.event) {
        subDesc.target.removeEventListener(subDesc.event, subDesc.cb)
        return this
      } else {
        subDesc.target.off(subDesc.attention)
        return this
      }
    }

    // Unsub the given descriptor and schedule a re-subscription using the same parameters
    // Called automatically when the target element of a subscription is destroyed by a reRender()
    // TODO does not work for event refs (the target may not be an a-component, needs to be decorated with _a)
    async resub(subDesc) {
      await this.unsub(subDesc)
      return this.sub(subDesc.attention.ref, subDesc.attention.cb)
    }

    // The hub is another element. If set, all pub() calls on this one will be forwarded to the hub (in addition to the default behavior).
    // Call with falsy to clear the hub
    // The "hub" attribute sets this automatically
    async setHub(ref) {
      if (!ref) {
        this._a.hub = null
        return
      }
      this._a.hub = this.el(ref)
      console.assert(this._a.hub, `No hub found for $ref`, this, "Note: Hubs must be present at connectedCallback")
    }

    connectedCallback() {
      super.connectedCallback && super.connectedCallback()
      this.setHub(this.attr("hub"))
      this.onConnect()
      _autoSub(this)
    }

    disconnectedCallback() {
      this.onDisconnect()
      _unsubAll(this)
      this._a.hub = null
      super.disconnectedCallback && super.disconnectedCallback()
    }

    onConnect() {} // Unlike connectedCalback, these are overridable without calling super
    onDisconnect() {}

    // Overriding from "realDOM", assuming Tonic Framework-like environment
    // TODO move out? Remove?
    reRender(p) {
      const children = Array.from(this.children)
      super.reRender && super.reRender(p)
      setTimeout(() => resubAllSubscribers(children), 0)
    }
  }
}

function resubAllSubscribers(nodelist) {
  for (let i = 0; i < nodelist.length; i++) {
    const node = nodelist[i]
    if (A.isA(node)) {
      const subscribersMap = node._a.subscribers
      if (subscribersMap) {
        subscribersMap.forEach(subscribers => {
          subscribers.forEach(attention => {
            if (attention.srcEl) {
              attention.srcEl.resub({target: node, attention})
              // TODO attention.srcEl = null // {node, old: attention.srcEl}
            } else {
              console.warn("Cannot resub", attention, node)
            }
          })
        })
        node._a.subscribers = null
      }
    }
    resubAllSubscribers(node.children)
  }
}

A.define = function (tagName, componentClass) {
  customElements.define(tagName, componentClass)
}

A.isA = function (el) {
  return !!el._a
}

A.lastuid = 0
A.uid = function uid(prefix = "") {
  A.lastuid += 1
  return prefix ? `${prefix}_${A.lastuid}` : String(A.lastuid)
}

