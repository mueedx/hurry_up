/**
 * Hurry Up Extension - Storage & Configuration Engine
 */

const DEFAULT_SETTINGS = {
  version: 1,
  globalEnabled: true,
  disabledDomains: [],
  timerSettings: {
    speedUpTimers: true,
    mode: "instant", // "instant" (0ms) or "accelerated" (multiplier)
    speedMultiplier: 50,
    minDelayMs: 500, // 500ms threshold ensures 1000ms ticking countdowns like my-subs.co are caught
    maxDelayMs: 60000,
    cloakFunctions: true
  },
  networkSettings: {
    interceptFetchXhr: true,
    autoTriggerApiEndpoints: true,
    customApiPatterns: [
      "get_link",
      "getlink",
      "generatelink",
      "generate_link",
      "countdown_complete",
      "ajax/verify",
      "token",
      "download_url"
    ]
  },
  overlaySettings: {
    hideOverlays: true,
    customSelectors: [
      "#countdown",
      ".countdown",
      "[id*='countdown' i]",
      "[class*='countdown' i]",
      "#timer",
      ".timer",
      "[id*='wait-timer' i]",
      "[class*='wait-overlay' i]",
      ".timer-backdrop",
      "#please-wait-modal"
    ]
  },
  autoClickSettings: {
    autoClick: false, // Opt-in: the extension never clicks a page control until the user enables this
    gateDetection: true, // Only act on pages that actually look like a countdown / download gate
    delayBeforeClickMs: 250,
    antiAdFilter: true,
    customKeywords: [
      "download",
      "get link",
      "direct download",
      "skip wait",
      "click here to download"
    ]
  },
  stats: {
    timersSkipped: 0,
    requestsAccelerated: 0,
    buttonsClicked: 0
  }
};

/**
 * Checks if chrome runtime/storage context is valid and available
 */
function isExtensionContextValid() {
  try {
    return typeof chrome !== "undefined" && 
           chrome.runtime && 
           !!chrome.runtime.id && 
           chrome.storage && 
           !!chrome.storage.sync;
  } catch (e) {
    return false;
  }
}

/**
 * Validates a configuration object against expected schema.
 */
function validateSettings(config) {
  const errors = [];
  if (!config || typeof config !== "object") {
    return { valid: false, errors: ["Configuration must be an object."], cleanConfig: null };
  }

  const clean = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  if (typeof config.globalEnabled === "boolean") {
    clean.globalEnabled = config.globalEnabled;
  }

  if (Array.isArray(config.disabledDomains)) {
    clean.disabledDomains = Array.from(
      new Set(
        config.disabledDomains
          .filter((d) => typeof d === "string")
          .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0])
          .filter(Boolean)
      )
    );
  }

  if (config.timerSettings && typeof config.timerSettings === "object") {
    const ts = config.timerSettings;
    if (typeof ts.speedUpTimers === "boolean") clean.timerSettings.speedUpTimers = ts.speedUpTimers;
    if (["instant", "accelerated"].includes(ts.mode)) clean.timerSettings.mode = ts.mode;
    if (typeof ts.speedMultiplier === "number" && ts.speedMultiplier > 0) clean.timerSettings.speedMultiplier = ts.speedMultiplier;
    if (typeof ts.minDelayMs === "number" && ts.minDelayMs >= 0) clean.timerSettings.minDelayMs = ts.minDelayMs;
    if (typeof ts.maxDelayMs === "number" && ts.maxDelayMs >= clean.timerSettings.minDelayMs) clean.timerSettings.maxDelayMs = ts.maxDelayMs;
    if (typeof ts.cloakFunctions === "boolean") clean.timerSettings.cloakFunctions = ts.cloakFunctions;
  }

  if (config.networkSettings && typeof config.networkSettings === "object") {
    const ns = config.networkSettings;
    if (typeof ns.interceptFetchXhr === "boolean") clean.networkSettings.interceptFetchXhr = ns.interceptFetchXhr;
    if (typeof ns.autoTriggerApiEndpoints === "boolean") clean.networkSettings.autoTriggerApiEndpoints = ns.autoTriggerApiEndpoints;
    if (Array.isArray(ns.customApiPatterns)) {
      clean.networkSettings.customApiPatterns = ns.customApiPatterns.filter((p) => typeof p === "string" && p.trim().length > 0);
    }
  }

  if (config.overlaySettings && typeof config.overlaySettings === "object") {
    const os = config.overlaySettings;
    if (typeof os.hideOverlays === "boolean") clean.overlaySettings.hideOverlays = os.hideOverlays;
    if (Array.isArray(os.customSelectors)) {
      clean.overlaySettings.customSelectors = os.customSelectors.filter((s) => typeof s === "string" && s.trim().length > 0);
    }
  }

  if (config.autoClickSettings && typeof config.autoClickSettings === "object") {
    const ac = config.autoClickSettings;
    if (typeof ac.autoClick === "boolean") clean.autoClickSettings.autoClick = ac.autoClick;
    if (typeof ac.gateDetection === "boolean") clean.autoClickSettings.gateDetection = ac.gateDetection;
    if (typeof ac.delayBeforeClickMs === "number" && ac.delayBeforeClickMs >= 0) clean.autoClickSettings.delayBeforeClickMs = ac.delayBeforeClickMs;
    if (typeof ac.antiAdFilter === "boolean") clean.autoClickSettings.antiAdFilter = ac.antiAdFilter;
    if (Array.isArray(ac.customKeywords)) {
      clean.autoClickSettings.customKeywords = ac.customKeywords.filter((k) => typeof k === "string" && k.trim().length > 0);
    }
  }

  if (config.stats && typeof config.stats === "object") {
    clean.stats.timersSkipped = Number(config.stats.timersSkipped) || 0;
    clean.stats.requestsAccelerated = Number(config.stats.requestsAccelerated) || 0;
    clean.stats.buttonsClicked = Number(config.stats.buttonsClicked) || 0;
  }

  return { valid: errors.length === 0, errors, cleanConfig: clean };
}

/**
 * In-memory fallback if extension context is invalidated
 */
let memorySettingsCache = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

/**
 * Retrieve current settings with fallback to defaults and protection against invalidation
 */
async function getStoredSettings() {
  return new Promise((resolve) => {
    if (!isExtensionContextValid()) {
      resolve(memorySettingsCache);
      return;
    }

    try {
      chrome.storage.sync.get("hurryUpSettings", (result) => {
        if (chrome.runtime.lastError || !result || !result.hurryUpSettings) {
          try {
            chrome.storage.local.get("hurryUpSettings", (localResult) => {
              if (chrome.runtime.lastError || !localResult || !localResult.hurryUpSettings) {
                resolve(memorySettingsCache);
              } else {
                const validation = validateSettings(localResult.hurryUpSettings);
                memorySettingsCache = validation.cleanConfig;
                resolve(validation.cleanConfig);
              }
            });
          } catch (e) {
            resolve(memorySettingsCache);
          }
        } else {
          const validation = validateSettings(result.hurryUpSettings);
          memorySettingsCache = validation.cleanConfig;
          resolve(validation.cleanConfig);
        }
      });
    } catch (err) {
      resolve(memorySettingsCache);
    }
  });
}

/**
 * Persist updated settings to sync and local storage safely
 */
async function saveSettings(config) {
  const validation = validateSettings(config);
  memorySettingsCache = validation.cleanConfig;
  const data = { hurryUpSettings: validation.cleanConfig };

  return new Promise((resolve) => {
    if (!isExtensionContextValid()) {
      resolve(validation.cleanConfig);
      return;
    }

    try {
      chrome.storage.sync.set(data, () => {
        if (chrome.runtime.lastError) {
          try {
            chrome.storage.local.set(data, () => resolve(validation.cleanConfig));
          } catch (e) {
            resolve(validation.cleanConfig);
          }
        } else {
          try {
            chrome.storage.local.set(data, () => resolve(validation.cleanConfig));
          } catch (e) {
            resolve(validation.cleanConfig);
          }
        }
      });
    } catch (err) {
      resolve(validation.cleanConfig);
    }
  });
}

/**
 * Increments a stat key atomically and safely
 */
async function incrementStat(statKey, amount = 1) {
  if (!isExtensionContextValid()) return;
  try {
    const current = await getStoredSettings();
    if (current && current.stats && typeof current.stats[statKey] === "number") {
      current.stats[statKey] += amount;
      await saveSettings(current);
    }
  } catch (e) {
    // Fail silently if context was invalidated
  }
}

/**
 * Checks if a hostname is excluded
 */
function isDomainDisabled(hostname, settings) {
  if (!settings || !settings.globalEnabled) return true;
  if (!hostname || !Array.isArray(settings.disabledDomains)) return false;
  const target = hostname.toLowerCase();
  return settings.disabledDomains.some((d) => target === d || target.endsWith("." + d));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_SETTINGS,
    isExtensionContextValid,
    validateSettings,
    getStoredSettings,
    saveSettings,
    incrementStat,
    isDomainDisabled
  };
} else if (typeof window !== "undefined") {
  window.HurryUpStorage = {
    DEFAULT_SETTINGS,
    isExtensionContextValid,
    validateSettings,
    getStoredSettings,
    saveSettings,
    incrementStat,
    isDomainDisabled
  };
}
