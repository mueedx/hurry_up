/**
 * Hurry Up Extension - Main World Injector
 * Runs at document_start in the MAIN world to override native timers, clocks & network APIs.
 *
 * Safety contract: every patch installed here is a pass-through until the ISOLATED-world
 * content script dispatches __HURRY_UP_CONFIG_SYNC__ with `enabled: true`, which only
 * happens for pages that pass the countdown-gate heuristic (or when the user explicitly
 * turns gate detection off). Ordinary websites therefore keep fully native timing.
 */
(() => {
  if (window.__HURRY_UP_INJECTED__) return;
  window.__HURRY_UP_INJECTED__ = true;

  // Active configuration cache in page context.
  // `enabled` starts false on purpose: every timer patch below is a pass-through
  // until the ISOLATED-world content script confirms that this page really is a
  // countdown / wait gate. Ordinary sites (YouTube, chat apps, dashboards, video
  // players) therefore keep completely native timing.
  const state = {
    enabled: false,
    speedUpTimers: true,
    mode: "instant", // "instant" or "accelerated"
    speedMultiplier: 50,
    minDelayMs: 500,
    maxDelayMs: 60000,
    cloakFunctions: true,
    interceptFetchXhr: true,
    autoTriggerApiEndpoints: true,
    customApiPatterns: [
      "get_link", "getlink", "generatelink", "generate_link",
      "countdown_complete", "ajax/verify", "token", "download_url"
    ]
  };

  // --- Safety limits -------------------------------------------------------
  const INSTANT_FLOOR_MS = 25; // Never collapse a wait to 0ms: that turns a gate
                               // countdown into a tight CPU loop and starves the page.
  const MAX_CLOCK_SKEW_MS = 15 * 60 * 1000; // Hard ceiling for the virtual clock.
  const INITIAL_SKEW_MS = 60000; // First jump once a gate page is confirmed.
  const CLOCK_STEP_MS = 2000; // Growth per poll tick while a gate is active.
  const POLL_INTERVAL_MS = 250;
  const STAT_THROTTLE_MS = 2000; // Keep chrome.storage writes far below sync quota.

  // Helper to cloak functions so function.toString() looks native
  function cloak(fn, originalName) {
    if (!state.cloakFunctions) return fn;
    const nativeStr = `function ${originalName || fn.name}() { [native code] }`;
    try {
      Object.defineProperty(fn, "toString", {
        value: function toString() {
          return nativeStr;
        },
        writable: true,
        configurable: true
      });
      Object.defineProperty(fn, "name", {
        value: originalName || fn.name,
        configurable: true
      });
    } catch (e) {
      // Ignore strict mode or frozen errors
    }
    return fn;
  }

  // Backup native timing and clock primitives
  const originalDateNow = Date.now;
  const originalPerformanceNow = performance.now.bind(performance);
  const originalSetTimeout = window.setTimeout;
  const originalSetInterval = window.setInterval;
  const originalClearTimeout = window.clearTimeout;
  const originalClearInterval = window.clearInterval;

  // Backup native network primitives
  const originalFetch = window.fetch;
  const originalXhrOpen = window.XMLHttpRequest ? window.XMLHttpRequest.prototype.open : null;
  const originalXhrSend = window.XMLHttpRequest ? window.XMLHttpRequest.prototype.send : null;

  // Track virtual fast-forward clock delta. It only ever moves once a countdown
  // gate has been confirmed, and it is always clamped to MAX_CLOCK_SKEW_MS.
  let fastForwardDeltaMs = 0;

  // Throttled stat reporting: a fast-forwarded gate can rewrite hundreds of timers,
  // and one storage write per timer used to stall the page and blow the
  // chrome.storage.sync write quota.
  let lastStatAt = 0;
  function dispatchStat(type) {
    const now = originalDateNow();
    if (now - lastStatAt < STAT_THROTTLE_MS) return;
    lastStatAt = now;
    window.dispatchEvent(new CustomEvent("__HURRY_UP_STAT__", { detail: { type } }));
  }

  // Clock Warping: Date.now()
  // Sites like my-subs.co check: end = Date.now() + SECONDS*1000; (Date.now() >= end)
  const patchedDateNow = function () {
    if (state.enabled && state.speedUpTimers) {
      return originalDateNow() + fastForwardDeltaMs;
    }
    return originalDateNow();
  };
  cloak(patchedDateNow, "now");
  Date.now = patchedDateNow;

  // Clock Warping: performance.now()
  const patchedPerformanceNow = function () {
    if (state.enabled && state.speedUpTimers) {
      return originalPerformanceNow() + fastForwardDeltaMs;
    }
    return originalPerformanceNow();
  };
  cloak(patchedPerformanceNow, "now");
  performance.now = patchedPerformanceNow;

  // The virtual clock starts at zero skew and is only advanced by solvePageCountdown()
  // while a confirmed gate is on screen, so a page we never armed sees native time.

  // Overridden window.setTimeout
  const patchedSetTimeout = function (handler, timeout, ...args) {
    let delay = Number(timeout) || 0;

    if (state.enabled && state.speedUpTimers && delay >= state.minDelayMs && delay <= state.maxDelayMs) {
      dispatchStat("timer");
      if (state.mode === "instant") {
        delay = INSTANT_FLOOR_MS;
      } else {
        delay = Math.max(INSTANT_FLOOR_MS, Math.floor(delay / state.speedMultiplier));
      }
    }

    return originalSetTimeout.call(this, handler, delay, ...args);
  };
  cloak(patchedSetTimeout, "setTimeout");
  window.setTimeout = patchedSetTimeout;

  // Overridden window.setInterval
  const patchedSetInterval = function (handler, timeout, ...args) {
    let interval = Number(timeout) || 0;

    if (state.enabled && state.speedUpTimers && interval >= state.minDelayMs && interval <= state.maxDelayMs) {
      dispatchStat("timer");

      if (state.mode === "instant") {
        // A 25ms tick still finishes a 30s countdown in well under a second, without
        // the double-firing (or 0ms hot loop) the old implementation produced.
        interval = INSTANT_FLOOR_MS;
      } else {
        interval = Math.max(INSTANT_FLOOR_MS, Math.floor(interval / state.speedMultiplier));
      }
    }

    return originalSetInterval.call(this, handler, interval, ...args);
  };
  cloak(patchedSetInterval, "setInterval");
  window.setInterval = patchedSetInterval;

  // requestAnimationFrame is deliberately NOT patched: warping the clock on every
  // frame (the old code added 10s per tick) desynchronises every animation,
  // scheduler, and video pipeline on the page. rAF-driven countdowns read
  // Date.now()/performance.now() inside their callback, so advancing the virtual
  // clock in solvePageCountdown() still resolves them.

  // Network Hook: window.fetch
  if (originalFetch) {
    const patchedFetch = async function (input, init) {
      if (state.enabled && state.interceptFetchXhr) {
        let url = "";
        if (typeof input === "string") {
          url = input;
        } else if (input && input.url) {
          url = input.url;
        }

        const matchesPattern = state.customApiPatterns.some((p) =>
          url.toLowerCase().includes(p.toLowerCase())
        );

        if (matchesPattern) {
          dispatchStat("network");
        }
      }
      return originalFetch.apply(this, arguments);
    };
    cloak(patchedFetch, "fetch");
    window.fetch = patchedFetch;
  }

  // Network Hook: XMLHttpRequest
  if (originalXhrOpen && originalXhrSend) {
    window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__hurry_up_url = url;
      return originalXhrOpen.apply(this, [method, url, ...rest]);
    };

    window.XMLHttpRequest.prototype.send = function (body) {
      if (state.enabled && state.interceptFetchXhr && this.__hurry_up_url) {
        const matchesPattern = state.customApiPatterns.some((p) =>
          String(this.__hurry_up_url).toLowerCase().includes(p.toLowerCase())
        );
        if (matchesPattern) {
          dispatchStat("network");
        }
      }
      return originalXhrSend.apply(this, arguments);
    };
  }

  // Comprehensive Proactive Page Solver (runs in page execution world)
  // Only ever runs while `state.enabled` is true, i.e. after the content script
  // confirmed this page is a countdown gate.
  function solvePageCountdown() {
    if (!state.enabled || !state.speedUpTimers) return;

    try {
      // 1. Advance the virtual clock by one bounded step. A site that computed its
      //    deadline as `Date.now() + N*1000` is outrun within a fraction of a second,
      //    and the skew can never exceed MAX_CLOCK_SKEW_MS.
      fastForwardDeltaMs = Math.min(fastForwardDeltaMs + CLOCK_STEP_MS, MAX_CLOCK_SKEW_MS);

      // 2. Extract REAL_URL if embedded in page scripts (e.g. my-subs.co)
      let foundRealUrl = null;
      const scripts = document.querySelectorAll("script");
      for (const s of scripts) {
        const text = s.textContent || "";
        if (text.includes("REAL_URL")) {
          const match = text.match(/REAL_URL\s*=\s*["']([^"']+)["']/);
          if (match && match[1]) {
            foundRealUrl = match[1].replace(/\\/g, "");
          }
        }
      }

      // 3. Unlock dlBtn / downloadBtn
      const btn = document.getElementById("dlBtn") || document.getElementById("downloadBtn");
      if (btn) {
        if (foundRealUrl && !btn.getAttribute("href")) {
          btn.setAttribute("href", foundRealUrl);
        }
        btn.classList.remove("is-hidden", "disabled");
        btn.removeAttribute("aria-disabled");
        btn.removeAttribute("tabindex");
        btn.removeAttribute("disabled");
        btn.style.display = "inline-block";
        btn.style.pointerEvents = "auto";
      }

      // 4. Hide gateMsg and gateProg
      const msg = document.getElementById("gateMsg");
      const prog = document.getElementById("gateProg");
      if (msg) msg.classList.add("is-hidden");
      if (prog) prog.classList.add("is-hidden");

      // 5. Clear interval & zero sec if legacy interval exists
      if (typeof window.countDownInterval !== "undefined" && window.countDownInterval) {
        originalClearInterval(window.countDownInterval);
      }
      if (typeof window.sec !== "undefined" && typeof window.sec === "number") {
        window.sec = 0;
      }
    } catch (e) {
      // Safe catch
    }
  }

  // The solver is polled continuously but exits immediately unless the content
  // script armed us, so an ordinary page pays nothing but a boolean check.
  originalSetInterval(solvePageCountdown, POLL_INTERVAL_MS);

  window.addEventListener("DOMContentLoaded", solvePageCountdown);

  // Listen for config sync from content script
  window.addEventListener("__HURRY_UP_CONFIG_SYNC__", (e) => {
    if (!e.detail || typeof e.detail !== "object") return;

    const wasEnabled = state.enabled;
    Object.assign(state, e.detail);

    if (!wasEnabled && state.enabled) {
      // This page has just been confirmed as a countdown gate. Jump the virtual clock
      // once so a deadline the site already computed counts as elapsed, then let the
      // poll keep nudging it forward.
      fastForwardDeltaMs = Math.min(Math.max(fastForwardDeltaMs, INITIAL_SKEW_MS), MAX_CLOCK_SKEW_MS);
      solvePageCountdown();
    }
  });

  // Signal ready to content script
  window.dispatchEvent(new CustomEvent("__HURRY_UP_INJECTED_READY__"));
})();
