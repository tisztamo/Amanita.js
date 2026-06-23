#!/usr/bin/env node
// Headless runner for Amanita's pure-DOM test suites under jsdom.
//
// Why this exists: the suites in this directory are written for a browser
// (runtests.html loads them via <test-area>). But the same DOM + custom-element +
// pub/sub machinery that Meditator drives server-side under jsdom also runs *these*
// tests under jsdom -- no browser needed. This script wires up jsdom, reproduces the
// relevant slice of runtests.html's fixture, imports the suites, and verifies the run.
//
//   node test/run-jsdom.mjs            # run, print a report, exit 0/1
//   npm run test:jsdom
//
// Suites that need browser-only infrastructure are listed under SKIPPED below and are
// reported (not silently dropped): worker tests need real Web Workers, server tests
// need the Deno WebSocket backend (./test.sh), and the memory-leak suite needs Chrome's
// performance.memory plus a CDN Tonic import.

import { JSDOM } from "jsdom"

// The src/ files are ES modules but package.json has no "type" field (kept that way so
// the CommonJS .eslintrc.js still loads). Node warns once per dynamic import about the
// reparse; it's harmless, so filter just that code and let every other warning through.
process.removeAllListeners("warning")
process.on("warning", w => { if (w.code !== "MODULE_TYPELESS_PACKAGE_JSON") console.warn(w.stack || w.message) })

// --- The fixture: the same element tree runtests.html builds for these suites. ---
// Elements are inserted while still *undefined*; importing the modules below defines
// them, which upgrades the existing elements (attributes present in the constructor) and
// fires connectedCallback -- exactly the browser's order, and what Amanita's auto-sub and
// AVar's attribute-reading constructor depend on.
const FIXTURE = `
<attr-tests testattr="ta42">
  <a-wrap name="testname"></a-wrap>
</attr-tests>

<html-tests></html-tests>

<ref-tests></ref-tests>

<api-tests></api-tests>

<val-tests>
  <a-var name="varx" x="x42"></a-var>
</val-tests>

<pub-sub-tests>
  <pub-subber id="xres" sub='/[forward="same"]/same'></pub-subber>
  <pub-subber id="x2" sub="#xsrc/x" forward="doubled" transform="(x) => 2 * x">
    <pub-subber id="xsrc" pubname="x" pubcount="5"></pub-subber>
  </pub-subber>
  <pub-subber sub="/#x2/doubled" forward="same"></pub-subber>
</pub-sub-tests>

<event-resub-tests></event-resub-tests>
`

// Imported in dependency order: stdlib (a-wrap/a-var) before the suites that nest them,
// and within pubsub-tests.js pub-subber is defined before pub-sub-tests (file order).
const MODULES = [
  "../src/stdlib.js",
  "./attr-tests.js",
  "./val-tests.js",
  "./html-tests.js",
  "./ref-tests.js",
  "./api-tests.js",
  "./pubsub-tests.js",
  "./event-resub-tests.js",
]

// Suite tag -> shown in the report. Order matches the fixture.
const SUITE_TAGS = ["attr-tests", "html-tests", "ref-tests", "api-tests", "val-tests", "pub-sub-tests", "event-resub-tests"]

const SKIPPED = [
  ["worker-tests", "needs real Web Workers (jsdom provides none)"],
  ["server-tests", "needs the Deno WebSocket backend -- run ./test.sh"],
  ["memory-leak-tests", "needs Chrome performance.memory + a CDN Tonic import"],
]

// --- jsdom realm + globals (must exist before importing Amanita: stdlib.js evaluates
// A(HTMLElement) at load, and workered.js probes window/document at load). ---
const dom = new JSDOM(`<!doctype html><html><body></body></html>`, {
  url: "http://localhost:3000/",
  pretendToBeVisual: true,
})
const { window } = dom

const DOM_GLOBALS = [
  "window", "document", "navigator", "location",
  "HTMLElement", "HTMLUnknownElement", "Element", "Node", "Document", "DocumentFragment",
  "customElements", "CustomEvent", "Event", "EventTarget",
  "NodeList", "NodeFilter", "MutationObserver", "getComputedStyle",
]
for (const key of DOM_GLOBALS) {
  if (window[key] !== undefined) globalThis[key] = window[key]
}
globalThis.self = globalThis

// --- Capture Amanita's own console output so a failure's reason is visible. By default
// we stay quiet on a green run (the framework logs some known teardown noise); set
// VERBOSE=1 to pass everything through live. On failure we always dump what we caught. ---
const VERBOSE = !!process.env.VERBOSE
const captured = []
for (const level of ["error", "warn"]) {
  const orig = console[level].bind(console)
  console[level] = (...args) => {
    captured.push({ level, args })
    if (VERBOSE) orig(...args)
  }
}

// --- Run ---
document.body.innerHTML = FIXTURE

for (const spec of MODULES) {
  try {
    await import(spec)
  } catch (e) {
    console.error(`\nFailed to import ${spec}:`, e)
    process.exit(2)
  }
}

function suiteStatus(tag) {
  const el = document.querySelector(tag)
  if (!el) return "missing"
  const div = el.querySelector("div")
  if (!div) return "pending"
  const style = div.getAttribute("style") || ""
  if (style.includes("green")) return "pass"
  if (style.includes("red")) return "fail"
  return "pending"
}

async function waitForCompletion(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const states = SUITE_TAGS.map(suiteStatus)
    if (states.every(s => s === "pass" || s === "fail")) return
    if (Date.now() > deadline) return
    await new Promise(r => setTimeout(r, 50))
  }
}

await waitForCompletion()

// --- Report ---
const { testCount } = await import("./helpers/testhelpers.js")

console.log("\n================ Amanita test suite (jsdom) ================\n")
let failures = 0
let pending = 0
for (const tag of SUITE_TAGS) {
  const status = suiteStatus(tag)
  const mark = status === "pass" ? "PASS" : status === "fail" ? "FAIL" : "TIMEOUT/PENDING"
  console.log(`  [${mark}] ${tag}`)
  if (status === "fail") failures++
  if (status !== "pass" && status !== "fail") { pending++; failures++ }
}

console.log("\n  skipped (browser-only infrastructure):")
for (const [tag, why] of SKIPPED) console.log(`  [SKIP] ${tag} -- ${why}`)

console.log(`\n  assertions executed: ${testCount()}`)

if (!failures && captured.length && !VERBOSE) {
  console.log(`  (${captured.length} internal framework log line(s) suppressed; re-run with VERBOSE=1 to show)`)
}

if (failures) {
  console.log("\n  --- captured error/warn output ---")
  for (const { level, args } of captured) {
    const msg = args
      .map(a => (a && a.reason) ? a.reason : (a && a.message) ? a.message : String(a))
      .join(" ")
    console.log(`  [${level}] ${msg}`)
  }
}

console.log("\n===========================================================")
if (failures === 0) {
  console.log(`\nOK -- ${SUITE_TAGS.length} suites passed, ${testCount()} assertions.\n`)
  process.exit(0)
} else {
  console.log(`\nFAILED -- ${failures} suite(s) did not pass${pending ? ` (${pending} timed out)` : ""}.\n`)
  process.exit(1)
}
