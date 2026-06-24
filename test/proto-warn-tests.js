/* eslint eqeqeq: 0 */

// Tests for the async prototype-method footgun warning (roadmap #3).
// Each test defines a uniquely-named component class so results don't collide
// when tests run in parallel (the framework launches all test* methods at once).

import "../src/stdlib.js"
import {TestSuite} from "./helpers/testhelpers.js"
import A from "../src/a.js"
import {delay} from "../src/utils/delay.js"

class ProtoWarnTests extends TestSuite {
  setup() {
    // Spy on console.warn. The runner already wraps it (capturing to its own array),
    // so we become the innermost handler and also forward to the original.
    this._origWarn = console.warn
    this.spy = []
    console.warn = (...args) => {
      this.spy.push(args.join(" "))
      this._origWarn(...args)
    }
  }

  teardown() {
    console.warn = this._origWarn
  }

  /** Register a class, mount an instance, wait for the 1s flush, remove. */
  async mountAndFlush(ClassDef, tagName) {
    A.define(tagName, ClassDef)
    const el = document.createElement(tagName)
    this.appendChild(el)
    await delay(1200)
    el.remove()
  }

  /** Return warnings that mention a given class name. */
  _warningsFor(className) {
    return this.spy.filter(w => w.includes(className))
  }

  // ── Positive: prototype methods with ref-shaped names SHOULD warn ──

  async testPrototypeMethodWarns(t) {
    class T1Bad extends A(HTMLElement) {
      "@click"(e) { /* prototype method — should warn */ }
    }
    await this.mountAndFlush(T1Bad, "t1-bad-comp")
    t(this._warningsFor("T1Bad").length > 0, "warns about ref-shaped prototype method")
  }

  async testSlashTopicMethodWarns(t) {
    class T2Slash extends A(HTMLElement) {
      "/data/update"(v) { /* ref-shaped via "/" — should warn */ }
    }
    await this.mountAndFlush(T2Slash, "t2-slash-comp")
    t(this._warningsFor("T2Slash").length > 0, "warns about ref-shaped prototype method containing /")
  }

  async testInheritedPrototypeMethodWarns(t) {
    class T3Parent extends HTMLElement {
      "@inherited"(e) { /* on parent prototype — should warn */ }
    }
    class T3Child extends A(T3Parent) {}
    await this.mountAndFlush(T3Child, "t3-child-comp")
    t(this._warningsFor("T3Child").length > 0, "warns about ref-shaped prototype method on parent class")
  }

  // ── Negative: correct usage should NOT warn ──

  async testArrowFieldDoesNotWarn(t) {
    class T4Good extends A(HTMLElement) {
      "@click" = (e) => { /* arrow-field — should NOT warn */ }
    }
    await this.mountAndFlush(T4Good, "t4-good-comp")
    t(this._warningsFor("T4Good").length === 0, "does not warn for correct arrow-field handler")
  }

  async testOrdinaryMethodDoesNotWarn(t) {
    class T5Normal extends A(HTMLElement) {
      handleClick(e) { /* normal method — should NOT warn */ }
    }
    await this.mountAndFlush(T5Normal, "t5-normal-comp")
    t(this._warningsFor("T5Normal").length === 0, "does not warn for ordinary prototype methods")
  }

  // ── Message content ──

  async testWarnContainsActionableHint(t) {
    class T6Hint extends A(HTMLElement) {
      "@hover"(e) {}
    }
    await this.mountAndFlush(T6Hint, "t6-hint-comp")
    const msgs = this._warningsFor("T6Hint")
    t(msgs.length > 0, "warning was emitted")
    const msg = msgs[0]
    t(msg.includes("[Amanita]"), "warning is tagged with [Amanita]")
    t(msg.includes("arrow-field"), "warning mentions arrow-field as the fix")
  }
}

A.define("proto-warn-tests", ProtoWarnTests)
