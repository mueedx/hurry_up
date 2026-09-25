/**
 * Hurry Up Extension - Popup Script
 * Manages active domain detection, quick switches, and options navigation.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const activeDomainEl = document.getElementById("active-domain");
  const siteToggle = document.getElementById("site-toggle");
  const globalToggle = document.getElementById("global-toggle");
  const timerToggle = document.getElementById("timer-toggle");
  const clickToggle = document.getElementById("click-toggle");
  const globalBadge = document.getElementById("global-badge");
  const badgeText = document.getElementById("badge-text");
  const statSkipped = document.getElementById("stat-skipped");
  const statClicked = document.getElementById("stat-clicked");
  const openOptionsBtn = document.getElementById("open-options-btn");

  let currentHostname = "";
  let currentTabId = null;
  let settings = await getStoredSettings();

  // Retrieve active tab information
  if (chrome.tabs && chrome.tabs.query) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0]) {
      currentTabId = tabs[0].id;
      try {
        const url = new URL(tabs[0].url);
        if (url.protocol.startsWith("http")) {
          currentHostname = url.hostname.toLowerCase();
          activeDomainEl.textContent = currentHostname;
        } else {
          activeDomainEl.textContent = "Browser Internal Page";
          siteToggle.disabled = true;
        }
      } catch (e) {
        activeDomainEl.textContent = "Unavailable";
        siteToggle.disabled = true;
      }
    }
  }

  // Reflect settings in popup UI
  function updateUI() {
    const isSiteDisabled = currentHostname ? isDomainDisabled(currentHostname, settings) : false;
    const isGloballyEnabled = settings.globalEnabled;

    siteToggle.checked = !isSiteDisabled && isGloballyEnabled;
    globalToggle.checked = isGloballyEnabled;
    timerToggle.checked = settings.timerSettings.speedUpTimers;
    clickToggle.checked = settings.autoClickSettings.autoClick;

    if (!isGloballyEnabled) {
      badgeText.textContent = "Disabled";
      globalBadge.classList.add("disabled");
    } else if (isSiteDisabled) {
      badgeText.textContent = "Excluded";
      globalBadge.classList.add("disabled");
    } else {
      badgeText.textContent = "Active";
      globalBadge.classList.remove("disabled");
    }

    statSkipped.textContent = settings.stats.timersSkipped || 0;
    statClicked.textContent = settings.stats.buttonsClicked || 0;
  }

  updateUI();

  // Toggle current site enabled/disabled
  siteToggle.addEventListener("change", async () => {
    if (!currentHostname) return;

    if (siteToggle.checked) {
      // Remove from disabledDomains
      settings.disabledDomains = settings.disabledDomains.filter(
        (d) => d.toLowerCase() !== currentHostname && !currentHostname.endsWith("." + d.toLowerCase())
      );
    } else {
      // Add to disabledDomains
      if (!settings.disabledDomains.includes(currentHostname)) {
        settings.disabledDomains.push(currentHostname);
      }
    }

    await saveSettings(settings);
    updateUI();

    // Reload active tab so changes take effect immediately
    if (currentTabId && chrome.tabs && chrome.tabs.reload) {
      chrome.tabs.reload(currentTabId);
    }
  });

  // Global Master Toggle
  globalToggle.addEventListener("change", async () => {
    settings.globalEnabled = globalToggle.checked;
    await saveSettings(settings);
    updateUI();
  });

  // Quick Timers Toggle
  timerToggle.addEventListener("change", async () => {
    settings.timerSettings.speedUpTimers = timerToggle.checked;
    await saveSettings(settings);
  });

  // Quick Auto-Click Toggle
  clickToggle.addEventListener("change", async () => {
    settings.autoClickSettings.autoClick = clickToggle.checked;
    await saveSettings(settings);
  });

  // Open full options tab
  openOptionsBtn.addEventListener("click", () => {
    if (chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open("options.html", "_blank");
    }
  });
});
