/**
 * Hurry Up! - MAIN-world injector regression tests
 *
 * Dependency-free: runs src/injected.js inside a tiny window/DOM sandbox (no jsdom /
 * puppeteer required) and asserts the guarantees that fix "the extension breaks
 * ordinary sites" (e.g. video search results rendering blank):
 *
 *   1. Before a gate is confirmed, every patched primitive is a pass-through
 *      (no timer rewriting, no clock skew, no rAF warping).
 *   2. A non-gate page stays native after the content script syncs `enabled: false`.
 *   3. A confirmed gate page shortens long timers but never to 0ms.
 *   4. The virtual clock only grows while armed, and is capped.
 *   5. requestAnimationFrame is never warped (the old 10s-per-frame bug).
 *   6. Stat reporting is throttled so storage writes cannot storm.
 *
 * Usage:  node test/injected-guards.test.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const INJECTED_PATH =
  process.env.HURRY_UP_INJECTED_SCRIPT || path.join(__dirname, "..", "src", "injected.js");
const INJECTED_SOURCE = fs.readFileSync(INJECTED_PATH, "utf8");

const MIN_DELAY_MS = 500;
const MAX_DELAY_MS = 60000;
const INSTANT_FLOOR_MS = 25;
const MAX_CLOCK_SKEW_MS = 15 * 60 * 1000;
const INITIAL_SKEW_MS = 60000;
const CLOCK_STEP_MS = 2000;

/* ------------------------------------------------------------------ *
 * Sandbox: fake timers + fake clock, so injected.js can run for real
 * ------------------------------------------------------------------ */

function createHarness() {
  let clock = 1700000000000;
  const setTimeoutCalls = [];
  const setIntervalCalls = [];
  const events = [];
  const listeners = {};
  const rafCalls = [];
  let nextHandle = 1;

  const win = {
    dispatchEvent(event) {
      events.push(event);
      for (const listener of listeners[event.type] || []) listener(event);
      return true;
    },
    addEventListener(type, listener) {
      listeners[type] = (listeners[type] || []).concat(listener);
    },
    setTimeout(handler, delay, ...args) {
      const handle = nextHandle++;
      setTimeoutCalls.push({ handle, handler, delay, args });
      return handle;
    },
    setInterval(handler, delay, ...args) {
      const handle = nextHandle++;
      setIntervalCalls.push({ handle, handler, delay, args });
      return handle;
    },
    clearTimeout() {},
    clearInterval() {},
    requestAnimationFrame(callback) {
      rafCalls.push(callback);
      return rafCalls.length;
    },
  };
  win.window = win;

  const sandbox = {
    window: win,
    document: {
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener: () => {},
    },
    performance: { now: () => 0 },
    Date: { now: () => clock },
    Object,
    Array,
    String,
    Number,
    Math,
    JSON,
    RegExp,
    Promise,
    Set,
    WeakMap,
    console,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
  };
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(INJECTED_SOURCE, context, { filename: "src/injected.js" });

  const originalRaf = win.requestAnimationFrame;

  return {
    win,
    sandbox,
    setTimeoutCalls,
    setIntervalCalls,
    events,
    rafCalls,
    clockNow: () => clock,
    advanceClock: (ms) => {
      clock += ms;
    },
    lastTimeoutDelay: () => (setTimeoutCalls.length ? setTimeoutCalls[setTimeoutCalls.length - 1].delay : null),
    lastIntervalDelay: () => (setIntervalCalls.length ? setIntervalCalls[setIntervalCalls.length - 1].delay : null),
    statsEvents: () => events.filter((e) => e.type === "__HURRY_UP_STAT__"),
    readyEventFired: () => events.some((e) => e.type === "__HURRY_UP_INJECTED_READY__"),
    clockSkew: () => sandbox.Date.now() - clock,
    // The injector's own countdown poll (the only setInterval it creates itself).
    runPoll: (times = 1) => {
      const poll = setIntervalCalls[0];
      if (!poll) return false;
      for (let i = 0; i < times; i++) poll.handler();
      return true;
    },
    originalRafIntact: () => win.requestAnimationFrame === originalRaf,
    sync: (detail) => win.dispatchEvent({ type: "__HURRY_UP_CONFIG_SYNC__", detail }),
    arm: (overrides = {}) =>
      win.dispatchEvent({
        type: "__HURRY_UP_CONFIG_SYNC__",
        detail: Object.assign(
          {
            enabled: true,
            speedUpTimers: true,
            mode: "instant",
            speedMultiplier: 50,
            minDelayMs: MIN_DELAY_MS,
            maxDelayMs: MAX_DELAY_MS,
            cloakFunctions: true,
            interceptFetchXhr: true,
            autoTriggerApiEndpoints: true,
            customApiPatterns: [],
          },
          overrides
        ),
      }),
    disarm: () =>
      win.dispatchEvent({
        type: "__HURRY_UP_CONFIG_SYNC__",
        detail: {
          enabled: false,
          speedUpTimers: true,
          mode: "instant",
          speedMultiplier: 50,
          minDelayMs: MIN_DELAY_MS,
          maxDelayMs: MAX_DELAY_MS,
          customApiPatterns: [],
        },
      }),
  };
}

let failures = 0;
function check(label, condition, extra) {
  if (condition) {
    console.log(`  \u2713 ${label}`);
  } else {
    failures++;
    console.log(`  \u2717 ${label}${extra ? ` -> ${extra}` : ""}`);
  }
}


/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

function testInertBeforeAnyConfirmation() {
  console.log("\nBefore the content script confirms a gate - everything must be native:");

  const h = createHarness();

  h.win.setTimeout(() => {}, 3000);
  check("setTimeout delay is untouched", h.lastTimeoutDelay() === 3000, `delay=${h.lastTimeoutDelay()}`);

  h.win.setInterval(() => {}, 1000);
  check("setInterval delay is untouched", h.lastIntervalDelay() === 1000, `delay=${h.lastIntervalDelay()}`);

  check("no clock skew is applied", h.clockSkew() === 0, `skew=${h.clockSkew()}`);
  check("requestAnimationFrame is not replaced", h.originalRafIntact());
  check("injector announces readiness to the content script", h.readyEventFired());
}

function testDisarmedPageStaysNative() {
  console.log("\nNon-gate page after sync(enabled: false) - still fully native:");

  const h = createHarness();
  h.disarm();

  h.win.setTimeout(() => {}, 3000);
  h.win.setInterval(() => {}, 1000);

  check("setTimeout delay is untouched", h.lastTimeoutDelay() === 3000, `delay=${h.lastTimeoutDelay()}`);
  check("setInterval delay is untouched", h.lastIntervalDelay() === 1000, `delay=${h.lastIntervalDelay()}`);
  check("no clock skew is applied", h.clockSkew() === 0, `skew=${h.clockSkew()}`);
  check("no timer stat is reported", h.statsEvents().length === 0, `stats=${h.statsEvents().length}`);
}

function testArmedGateShortensTimersSafely() {
  console.log("\nConfirmed gate page - long waits collapse, but never to 0ms:");

  const h = createHarness();
  h.arm();

  h.win.setTimeout(() => {}, 3000);
  check("long setTimeout is collapsed to the floor", h.lastTimeoutDelay() === INSTANT_FLOOR_MS, `delay=${h.lastTimeoutDelay()}`);
  check("collapsed delay is greater than 0 (no hot loop)", h.lastTimeoutDelay() > 0, `delay=${h.lastTimeoutDelay()}`);

  h.win.setInterval(() => {}, 1000);
  check("countdown interval is sped up to the floor", h.lastIntervalDelay() === INSTANT_FLOOR_MS, `delay=${h.lastIntervalDelay()}`);
  check("sped-up interval is greater than 0", h.lastIntervalDelay() > 0, `delay=${h.lastIntervalDelay()}`);

  h.win.setTimeout(() => {}, 100);
  check("short delays below minDelayMs are left alone", h.lastTimeoutDelay() === 100, `delay=${h.lastTimeoutDelay()}`);

  h.arm({ mode: "accelerated", speedMultiplier: 50 });
  h.win.setTimeout(() => {}, 5000);
  check("accelerated mode divides the delay", h.lastTimeoutDelay() === 100, `delay=${h.lastTimeoutDelay()}`);
  h.win.setTimeout(() => {}, 600);
  check("accelerated mode still respects the floor", h.lastTimeoutDelay() === INSTANT_FLOOR_MS, `delay=${h.lastTimeoutDelay()}`);
}

function testClockSkewIsScopedAndCapped() {
  console.log("\nVirtual clock - only grows while armed, always capped:");

  const h = createHarness();
  check("clock skew starts at 0", h.clockSkew() === 0, `skew=${h.clockSkew()}`);

  h.arm();
  const afterArm = h.clockSkew();
  check("arming jumps the clock once", afterArm === INITIAL_SKEW_MS + CLOCK_STEP_MS, `skew=${afterArm}`);

  const before = h.clockSkew();
  h.runPoll(4);
  check("each poll advances the clock by one bounded step", h.clockSkew() - before === 4 * CLOCK_STEP_MS, `delta=${h.clockSkew() - before}`);

  h.runPoll(5000);
  check("clock skew never exceeds the cap", h.clockSkew() === MAX_CLOCK_SKEW_MS, `skew=${h.clockSkew()}`);
}

function testAnimationFramesAreNotWarped() {
  console.log("\nAnimation frames - the injector must never warp the clock per frame:");

  const h = createHarness();
  h.arm();

  const skewBefore = h.clockSkew();
  for (let i = 0; i < 20; i++) h.win.requestAnimationFrame(() => {});

  check("20 frames do not advance the clock", h.clockSkew() === skewBefore, `delta=${h.clockSkew() - skewBefore}`);
  check("requestAnimationFrame is left as the native function", h.originalRafIntact());
}

function testStatsAreThrottled() {
  console.log("\nStat reporting - throttled so storage writes cannot storm:");

  const h = createHarness();
  h.arm();

  for (let i = 0; i < 50; i++) h.win.setTimeout(() => {}, 3000);
  check("many collapsed timers produce at most one stat event", h.statsEvents().length === 1, `stats=${h.statsEvents().length}`);

  h.advanceClock(2050);
  h.win.setTimeout(() => {}, 3000);
  check("a later collapse reports again", h.statsEvents().length === 2, `stats=${h.statsEvents().length}`);
}

function testDisarmingStopsEverything() {
  console.log("\nSync(enabled: false) after arming - timers go back to native:");

  const h = createHarness();
  h.arm();
  h.disarm();

  h.win.setTimeout(() => {}, 3000);
  check("setTimeout delay is native again", h.lastTimeoutDelay() === 3000, `delay=${h.lastTimeoutDelay()}`);

  const skewBefore = h.clockSkew();
  h.runPoll(3);
  check("polling no longer advances the clock", h.clockSkew() === skewBefore, `delta=${h.clockSkew() - skewBefore}`);
}

(function run() {
  testInertBeforeAnyConfirmation();
  testDisarmedPageStaysNative();
  testArmedGateShortensTimersSafely();
  testClockSkewIsScopedAndCapped();
  testAnimationFramesAreNotWarped();
  testStatsAreThrottled();
  testDisarmingStopsEverything();

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
