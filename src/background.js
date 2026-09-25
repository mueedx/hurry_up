/**
 * Hurry Up Extension - Background Service Worker
 * Manages badge states, storage sync, and install lifecycle
 */

try {
  importScripts("storage.js");
} catch (e) {
  console.warn("[HurryUp Background] importScripts failed, fallback active", e);
}

// On initial installation or update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[HurryUp] Installed with reason:", details.reason);
  if (typeof getStoredSettings === "function") {
    const current = await getStoredSettings();
    await saveSettings(current);
  }
});

/**
 * Updates the extension badge: green ON when the user opted this site in,
 * red OFF otherwise (the default state on every site).
 */
async function updateTabBadge(tabId, url) {
  if (!tabId || !url || !url.startsWith("http")) {
    chrome.action.setBadgeText({ tabId, text: "" });
    return;
  }

  try {
    const domain = new URL(url).hostname;
    const settings = typeof getStoredSettings === "function" 
      ? await getStoredSettings() 
      : { globalEnabled: true, enabledDomains: [] };

    const enabled = typeof isDomainEnabled === "function"
      ? isDomainEnabled(domain, settings)
      : false;

    if (enabled) {
      chrome.action.setBadgeText({ tabId, text: "ON" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#22C55E" }); // Green
    } else {
      chrome.action.setBadgeText({ tabId, text: "OFF" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#EF4444" }); // Red
    }
  } catch (err) {
    // URL parsing or tab error
  }
}

// Listen for tab URL updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url) {
    updateTabBadge(tabId, tab.url);
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      updateTabBadge(activeInfo.tabId, tab.url);
    }
  } catch (e) {
    // Tab might have been closed
  }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "UPDATE_BADGE" && sender.tab) {
    updateTabBadge(sender.tab.id, sender.tab.url);
    sendResponse({ ok: true });
  } else if (message && message.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  }
  return true;
});
