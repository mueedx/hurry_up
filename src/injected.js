/**
 * Hurry Up Extension - Main World Injector
 * Runs at document_start in the MAIN world to override native timers, clocks & network APIs.
 */
(() => {
  if (window.__HURRY_UP_INJECTED__) return;
  window.__HURRY_UP_INJECTED__ = true;

  // Active configuration cache in page context
  const state = {
    enabled: true,
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
  const originalRequestAnimationFrame = window.requestAnimationFrame;

  // Backup native network primitives
  const originalFetch = window.fetch;
  const originalXhrOpen = window.XMLHttpRequest ? window.XMLHttpRequest.prototype.open : null;
  const originalXhrSend = window.XMLHttpRequest ? window.XMLHttpRequest.prototype.send : null;

  // Track virtual fast-forward clock delta
  let fastForwardDeltaMs = 0;

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

  // Fast-forward the virtual clock by 60 seconds immediately on load
  // and step it periodically
  fastForwardDeltaMs = 60000;

  // Overridden window.setTimeout
  const patchedSetTimeout = function (handler, timeout, ...args) {
    let delay = Number(timeout) || 0;

    if (state.enabled && state.speedUpTimers && delay >= state.minDelayMs && delay <= state.maxDelayMs) {
      window.dispatchEvent(new CustomEvent("__HURRY_UP_STAT__", { detail: { type: "timer" } }));
      if (state.mode === "instant") {
        delay = 0;
      } else {
        delay = Math.max(0, Math.floor(delay / state.speedMultiplier));
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
      window.dispatchEvent(new CustomEvent("__HURRY_UP_STAT__", { detail: { type: "timer" } }));
      
      if (state.mode === "instant") {
        if (typeof handler === "function") {
          try {
            handler();
            handler();
          } catch (e) {}
        }
        interval = 15;
      } else {
        interval = Math.max(20, Math.floor(interval / state.speedMultiplier));
      }
    }

    return originalSetInterval.call(this, handler, interval, ...args);
  };
  cloak(patchedSetInterval, "setInterval");
  window.setInterval = patchedSetInterval;

  // Accelerated requestAnimationFrame:
  // Immediately fires ticks so rAF-driven countdown loops complete instantly
  const patchedRequestAnimationFrame = function (callback) {
    if (state.enabled && state.speedUpTimers) {
      fastForwardDeltaMs += 10000; // Warp clock ahead by 10s per rAF tick
    }
    return originalRequestAnimationFrame.call(this, callback);
  };
  cloak(patchedRequestAnimationFrame, "requestAnimationFrame");
  window.requestAnimationFrame = patchedRequestAnimationFrame;

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
          window.dispatchEvent(new CustomEvent("__HURRY_UP_STAT__", { detail: { type: "network" } }));
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
          window.dispatchEvent(new CustomEvent("__HURRY_UP_STAT__", { detail: { type: "network" } }));
        }
      }
      return originalXhrSend.apply(this, arguments);
    };
  }

  // Comprehensive Proactive Page Solver (runs in page execution world)
  function solvePageCountdown() {
    if (!state.enabled) return;

    try {
      // 1. Advance fast forward clock
      fastForwardDeltaMs += 5000;

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

  // Run solver immediately and at intervals during loading
  solvePageCountdown();
  const pollInterval = originalSetInterval(solvePageCountdown, 50);

  window.addEventListener("DOMContentLoaded", () => {
    solvePageCountdown();
    originalSetTimeout(() => originalClearInterval(pollInterval), 4000);
  });

  // Listen for config sync from content script
  window.addEventListener("__HURRY_UP_CONFIG_SYNC__", (e) => {
    if (e.detail && typeof e.detail === "object") {
      Object.assign(state, e.detail);
    }
  });

  // Signal ready to content script
  window.dispatchEvent(new CustomEvent("__HURRY_UP_INJECTED_READY__"));
})();
