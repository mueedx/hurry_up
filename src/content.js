/**
 * Hurry Up Extension - Content Script
 * Runs in ISOLATED world at document_start.
 *
 * Bridges storage settings into the page, suppresses countdown overlays, and (only on
 * pages that look like a real countdown gate, and only when the user opted in) unlocks
 * and clicks download controls. See hasDownloadGateSignal() / isElementClickable() for
 * the safety rails that keep this inert on ordinary websites.
 */

(async () => {
  if (window.__HURRY_UP_CONTENT_SCRIPT__) return;
  window.__HURRY_UP_CONTENT_SCRIPT__ = true;

  const currentHostname = window.location.hostname;
  
  function isAlive() {
    try {
      return typeof chrome !== "undefined" && chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  let settings;
  try {
    settings = await (window.HurryUpStorage ? window.HurryUpStorage.getStoredSettings() : getStoredSettings());
  } catch (e) {
    settings = window.HurryUpStorage ? window.HurryUpStorage.DEFAULT_SETTINGS : DEFAULT_SETTINGS;
  }

  const disabled = window.HurryUpStorage 
    ? window.HurryUpStorage.isDomainDisabled(currentHostname, settings)
    : isDomainDisabled(currentHostname, settings);

  function syncStateToInjected() {
    const isSiteEnabled = settings.globalEnabled && !disabled;
    const configPayload = {
      enabled: isSiteEnabled,
      speedUpTimers: settings.timerSettings.speedUpTimers,
      mode: settings.timerSettings.mode,
      speedMultiplier: settings.timerSettings.speedMultiplier,
      minDelayMs: settings.timerSettings.minDelayMs,
      maxDelayMs: settings.timerSettings.maxDelayMs,
      cloakFunctions: settings.timerSettings.cloakFunctions,
      interceptFetchXhr: settings.networkSettings.interceptFetchXhr,
      autoTriggerApiEndpoints: settings.networkSettings.autoTriggerApiEndpoints,
      customApiPatterns: settings.networkSettings.customApiPatterns
    };
    window.dispatchEvent(new CustomEvent("__HURRY_UP_CONFIG_SYNC__", { detail: configPayload }));
  }

  syncStateToInjected();
  window.addEventListener("__HURRY_UP_INJECTED_READY__", syncStateToInjected);

  window.addEventListener("__HURRY_UP_STAT__", (e) => {
    if (!isAlive()) return;
    if (!e.detail || !e.detail.type) return;
    try {
      if (e.detail.type === "timer") {
        if (window.HurryUpStorage) window.HurryUpStorage.incrementStat("timersSkipped", 1);
      } else if (e.detail.type === "network") {
        if (window.HurryUpStorage) window.HurryUpStorage.incrementStat("requestsAccelerated", 1);
      }
    } catch (err) {
      // Ignore orphaned context calls
    }
  });

  if (!settings.globalEnabled || disabled) {
    return;
  }

  const clickedElements = new WeakSet();
  let clickTimeout = null;

  // Elements whose visible label is longer than this are page copy, not buttons.
  const MAX_ACTION_LABEL_LENGTH = 64;

  // Containers that only exist on countdown / "please wait" download gates.
  const GATE_ELEMENT_SELECTOR = [
    "#dlBtn",
    "#downloadBtn",
    "#gateMsg",
    "#gateProg",
    "[id*='countdown' i]",
    "[class*='countdown' i]",
    "[class*='wait-overlay' i]",
    "[class*='wait-modal' i]",
    "[class*='wait-timer' i]",
    "[id*='please-wait' i]",
    "[class*='please-wait' i]"
  ].join(",");

  // Text that only appears on a wait-gate page.
  const GATE_TEXT_PATTERN =
    /(please\s+wait|wait(ing)?\s+\d+\s*(s|sec|second)|your\s+download\s+will|download\s+will\s+(begin|start)|preparing\s+your|generating\s+(your\s+)?(link|download)|skip\s+(the\s+)?wait|hold\s+on)/i;

  // Bare numbers or mm:ss / "12 seconds" style countdown readouts.
  const COUNTDOWN_TEXT_PATTERN =
    /^\s*(?:\d{1,4}\s*(?:s|sec|secs|second|seconds)\b|\d{1,2}:\d{2}|\d{1,4})\s*$/i;

  let gateSignalCache = { value: false, at: 0 };
  let realUrlCache = { value: null, at: 0 };

  /**
   * Whether auto-actions are limited to pages that look like a real download gate.
   */
  function isGateDetectionEnabled() {
    return !settings.autoClickSettings || settings.autoClickSettings.gateDetection !== false;
  }

  /**
   * Checks whether the current page actually looks like a countdown / download gate.
   * This is what keeps the auto-clicker from firing on ordinary pages (chat apps,
   * dashboards, docs, code viewers) that merely contain a button with a
   * download-related label.
   */
  function hasDownloadGateSignal() {
    const now = Date.now();
    if (now - gateSignalCache.at < 750) return gateSignalCache.value;

    let detected = false;
    try {
      const groups = [GATE_ELEMENT_SELECTOR];
      if (settings.overlaySettings && Array.isArray(settings.overlaySettings.customSelectors)) {
        groups.push(...settings.overlaySettings.customSelectors);
      }

      const seen = new Set();
      let inspected = 0;

      for (const group of groups) {
        if (detected || inspected > 300) break;
        let matches;
        try {
          matches = document.querySelectorAll(group);
        } catch (e) {
          continue; // Ignore malformed user supplied selectors
        }

        for (const el of matches) {
          if (detected || inspected > 300) break;
          if (seen.has(el)) continue;
          seen.add(el);
          inspected++;

          if (["BODY", "HTML", "MAIN", "SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
          if (el.closest("script, style, noscript")) continue;

          const text = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300);
          if (!text) continue;

          if (GATE_TEXT_PATTERN.test(text) || COUNTDOWN_TEXT_PATTERN.test(text)) {
            detected = true;
          }
        }
      }
    } catch (e) {
      detected = false;
    }

    gateSignalCache = { value: detected, at: now };
    return detected;
  }

  /**
   * Helper: is this a control we are allowed to interact with?
   */
  function isActionElement(el) {
    if (!el || !el.tagName) return false;
    if (["A", "BUTTON", "INPUT"].includes(el.tagName)) return true;
    return el.getAttribute("role") === "button";
  }

  /**
   * Helper: strict visibility / interactability check.
   * Unlike a naive offsetWidth check this refuses to treat a locked, disabled,
   * aria-hidden, or page-hidden control as "ready", so nothing is ever forced
   * open just to be clicked.
   */
  function isElementClickable(el) {
    if (!isActionElement(el) || !el.isConnected) return false;
    if (el.disabled) return false;
    if (el.getAttribute("aria-disabled") === "true") return false;
    if (el.classList.contains("disabled") || el.classList.contains("is-hidden")) return false;
    if (el.tagName === "A" && !el.getAttribute("href")) return false;
    if (el.closest("[hidden], [aria-hidden='true']")) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;

    const style = window.getComputedStyle(el);
    if (!style) return false;
    if (style.display === "none") return false;
    if (style.visibility !== "visible") return false;
    if (style.pointerEvents === "none") return false;
    if (parseFloat(style.opacity) === 0) return false;

    if (typeof el.checkVisibility === "function" && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }

    return true;
  }

  /**
   * Helper: pulls an embedded REAL_URL out of inline scripts (cached lookup).
   */
  function findEmbeddedRealUrl() {
    const now = Date.now();
    if (now - realUrlCache.at < 5000) return realUrlCache.value;

    let found = null;
    try {
      for (const s of document.querySelectorAll("script")) {
        const text = s.textContent || "";
        if (!text.includes("REAL_URL")) continue;
        const match = text.match(/REAL_URL\s*=\s*["']([^"']+)["']/);
        if (match && match[1]) {
          found = match[1].replace(/\\/g, "");
        }
      }
    } catch (e) {
      // Ignore inaccessible nodes
    }

    realUrlCache = { value: found, at: now };
    return found;
  }

  /**
   * Scans and suppresses timer overlays, message gates, and progress bars
   */
  function processOverlays() {
    if (!settings.overlaySettings || !settings.overlaySettings.hideOverlays) return;
    const selectors = settings.overlaySettings.customSelectors || [];

    for (const sel of selectors) {
      try {
        const matches = document.querySelectorAll(sel);
        for (const el of matches) {
          if (["BODY", "HTML", "MAIN"].includes(el.tagName)) continue;
          if (!el.classList.contains("hurry-up-hidden-overlay")) {
            el.classList.add("hurry-up-hidden-overlay");
            document.body?.classList.add("hurry-up-unlocked");
          }
        }
      } catch (e) {
        // Selector syntax safety
      }
    }

    // Explicitly target gateMsg & gateProg
    for (const id of ["gateMsg", "gateProg"]) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains("hurry-up-hidden-overlay")) {
        el.classList.add("hurry-up-hidden-overlay");
        document.body?.classList.add("hurry-up-unlocked");
      }
    }
  }

  /**
   * Unlocks hidden/disabled download buttons (e.g. #dlBtn on my-subs.co).
   *
   * Safety: this only runs on pages that actually look like a countdown gate, and
   * it only ever touches elements that are download controls. Generic
   * `button[disabled]` / `.is-hidden` / `[aria-disabled]` elements on ordinary
   * websites are never un-hidden, which is what previously allowed the extension
   * to reveal and click unrelated controls (e.g. a chat app's export action).
   */
  function unlockDownloadButtons() {
    if (isGateDetectionEnabled() && !hasDownloadGateSignal()) return;

    const downloadCandidates = document.querySelectorAll(
      "#dlBtn, #downloadBtn, a[download], [id*='download' i], [class*='download' i], [aria-label*='download' i], [data-testid*='download' i]"
    );
    if (!downloadCandidates.length) return;

    const foundRealUrl = findEmbeddedRealUrl();

    for (const btn of downloadCandidates) {
      if (!isActionElement(btn)) continue;

      if (btn.hasAttribute("disabled")) {
        btn.removeAttribute("disabled");
      }
      if (btn.getAttribute("aria-disabled") === "true") {
        btn.setAttribute("aria-disabled", "false");
      }
      if (btn.classList.contains("disabled")) {
        btn.classList.remove("disabled");
      }
      if (btn.classList.contains("is-hidden")) {
        btn.classList.remove("is-hidden");
      }
      if (btn.hasAttribute("tabindex")) {
        btn.removeAttribute("tabindex");
      }
      if (foundRealUrl && !btn.getAttribute("href")) {
        btn.setAttribute("href", foundRealUrl);
      }
      if (btn.style.display === "none") {
        btn.style.display = "inline-block";
      }
      if (btn.style.pointerEvents === "none") {
        btn.style.pointerEvents = "auto";
      }
    }
  }

  /**
   * Helper: checks if an element or its ancestors look like an ad banner
   */
  function isAdElement(el) {
    let curr = el;
    let depth = 0;
    while (curr && depth < 5) {
      const cls = (curr.className || "").toString().toLowerCase();
      const id = (curr.id || "").toString().toLowerCase();
      if (
        cls.includes("ad-") ||
        cls.includes("adsbygoogle") ||
        cls.includes("sponsored") ||
        cls.includes("banner-ad") ||
        id.includes("google_ads") ||
        curr.tagName === "IFRAME"
      ) {
        return true;
      }
      curr = curr.parentElement;
      depth++;
    }
    return false;
  }

  /**
   * Scans for download buttons to auto-click safely.
   *
   * Guard rails:
   *  - Requires the auto-click setting to be enabled (off by default).
   *  - Requires the page to look like a countdown / download gate.
   *  - Requires the target control to be genuinely visible and enabled; a locked
   *    or hidden control is never force-opened in order to click it.
   *  - Ignores long text blocks so page copy containing a keyword is not clicked.
   */
  function processAutoClick() {
    if (!settings.autoClickSettings || !settings.autoClickSettings.autoClick) return;
    if (isGateDetectionEnabled() && !hasDownloadGateSignal()) return;

    const keywords = (settings.autoClickSettings.customKeywords || []).map((k) => k.toLowerCase());
    if (!keywords.length) return;

    const candidates = document.querySelectorAll(
      "#dlBtn, #downloadBtn, a, button, input[type='button'], input[type='submit'], [role='button']"
    );

    for (const el of candidates) {
      if (clickedElements.has(el)) continue;

      const label = (el.innerText || el.textContent || el.value || "").trim();
      if (!label || label.length > MAX_ACTION_LABEL_LENGTH) continue;

      const text = label.toLowerCase();
      const isNamedDownloadBtn = el.id && (el.id.toLowerCase() === "dlbtn" || el.id.toLowerCase() === "downloadbtn");

      const matchesKeyword = isNamedDownloadBtn || keywords.some((kw) => text.includes(kw));
      if (!matchesKeyword) continue;

      // Anti-Ad safeguard
      if (settings.autoClickSettings.antiAdFilter && isAdElement(el)) {
        continue;
      }

      // Only genuine, page-revealed controls are clickable. Nothing is unlocked here:
      // if the site has not enabled the button yet, waiting is the correct behaviour.
      if (!isElementClickable(el)) continue;

      clickedElements.add(el);
      el.classList.add("hurry-up-highlight-target");

      const delay = settings.autoClickSettings.delayBeforeClickMs || 250;
      if (clickTimeout) clearTimeout(clickTimeout);
      clickTimeout = setTimeout(() => {
        try {
          if (!isElementClickable(el)) return;
          el.click();
          if (isAlive() && window.HurryUpStorage) {
            window.HurryUpStorage.incrementStat("buttonsClicked", 1);
          }
        } catch (err) {
          // Safe silent catch
        }
      }, delay);
      break;
    }
  }

  // Active mutation observer
  const observer = new MutationObserver(() => {
    processOverlays();
    unlockDownloadButtons();
    processAutoClick();
  });

  function initObserver() {
    processOverlays();
    unlockDownloadButtons();
    processAutoClick();

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "disabled", "href"] });
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        if (document.body) {
          observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "disabled", "href"] });
          processOverlays();
          unlockDownloadButtons();
          processAutoClick();
        }
      });
    }
  }

  initObserver();
})();
