/**
 * Hurry Up Extension - Options Dashboard Script
 * Manages tab switching, the enabled-sites list, configuration forms, and JSON import/export.
 */

document.addEventListener("DOMContentLoaded", async () => {
  let settings = await getStoredSettings();

  // Toast Helper
  const toast = document.getElementById("toast");
  function showToast(message = "Configurations saved successfully!", isError = false) {
    toast.textContent = message;
    toast.style.backgroundColor = isError ? "rgba(244, 63, 94, 0.9)" : "rgba(16, 185, 129, 0.9)";
    toast.style.display = "block";
    setTimeout(() => {
      toast.style.display = "none";
    }, 2800);
  }

  // Tab Navigation Logic
  const tabBtns = document.querySelectorAll(".tab-nav-btn");
  const tabContents = document.querySelectorAll(".tab-panel");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      btn.classList.add("active");
      const targetEl = document.getElementById(targetId);
      if (targetEl) targetEl.classList.add("active");
    });
  });

  // Load configuration into Tab 1 (Timers)
  const optGlobalEnabled = document.getElementById("opt-global-enabled");
  const optSpeedupTimers = document.getElementById("opt-speedup-timers");
  const optCloakFunctions = document.getElementById("opt-cloak-functions");
  const optTimerMode = document.getElementById("opt-timer-mode");
  const optSpeedMultiplier = document.getElementById("opt-speed-multiplier");
  const optMinDelay = document.getElementById("opt-min-delay");
  const optMaxDelay = document.getElementById("opt-max-delay");
  const multiplierGroup = document.getElementById("multiplier-group");

  function populateTimerFields() {
    optGlobalEnabled.checked = settings.globalEnabled;
    optSpeedupTimers.checked = settings.timerSettings.speedUpTimers;
    optCloakFunctions.checked = settings.timerSettings.cloakFunctions;
    optTimerMode.value = settings.timerSettings.mode;
    optSpeedMultiplier.value = settings.timerSettings.speedMultiplier;
    optMinDelay.value = settings.timerSettings.minDelayMs;
    optMaxDelay.value = settings.timerSettings.maxDelayMs;

    multiplierGroup.style.display = optTimerMode.value === "accelerated" ? "block" : "none";
  }

  optTimerMode.addEventListener("change", () => {
    multiplierGroup.style.display = optTimerMode.value === "accelerated" ? "block" : "none";
  });

  document.getElementById("save-timers-btn").addEventListener("click", async () => {
    settings.globalEnabled = optGlobalEnabled.checked;
    settings.timerSettings.speedUpTimers = optSpeedupTimers.checked;
    settings.timerSettings.cloakFunctions = optCloakFunctions.checked;
    settings.timerSettings.mode = optTimerMode.value;
    settings.timerSettings.speedMultiplier = Number(optSpeedMultiplier.value) || 50;
    settings.timerSettings.minDelayMs = Number(optMinDelay.value) || 500;
    settings.timerSettings.maxDelayMs = Number(optMaxDelay.value) || 60000;

    await saveSettings(settings);
    showToast("Timer configurations saved!");
  });

  // Load configuration into Tab 2 (Network)
  const optInterceptNetwork = document.getElementById("opt-intercept-network");
  const optAutotriggerApi = document.getElementById("opt-autotrigger-api");
  const optApiPatterns = document.getElementById("opt-api-patterns");

  function populateNetworkFields() {
    optInterceptNetwork.checked = settings.networkSettings.interceptFetchXhr;
    optAutotriggerApi.checked = settings.networkSettings.autoTriggerApiEndpoints;
    optApiPatterns.value = (settings.networkSettings.customApiPatterns || []).join("\n");
  }

  document.getElementById("save-network-btn").addEventListener("click", async () => {
    settings.networkSettings.interceptFetchXhr = optInterceptNetwork.checked;
    settings.networkSettings.autoTriggerApiEndpoints = optAutotriggerApi.checked;
    settings.networkSettings.customApiPatterns = optApiPatterns.value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    await saveSettings(settings);
    showToast("Network interceptor settings saved!");
  });

  // Load configuration into Tab 3 (Enabled Websites allowlist)
  const exclusionsTableBody = document.getElementById("exclusions-table-body");
  const newDomainInput = document.getElementById("new-domain-input");
  const addDomainBtn = document.getElementById("add-domain-btn");
  const searchDomainInput = document.getElementById("search-domain-input");

  function renderEnabledSites(filterText = "") {
    exclusionsTableBody.innerHTML = "";
    const domains = (settings.enabledDomains || []).filter((d) =>
      d.toLowerCase().includes(filterText.toLowerCase())
    );

    if (domains.length === 0) {
      exclusionsTableBody.innerHTML = `
        <tr>
          <td colspan="2" class="empty-cell">No enabled websites yet - Hurry Up! is off everywhere by default.</td>
        </tr>
      `;
      return;
    }

    domains.forEach((domain) => {
      const row = document.createElement("tr");

      const domainTd = document.createElement("td");
      domainTd.textContent = domain;
      domainTd.style.fontWeight = "500";
      domainTd.style.color = "#f1f5f9";

      const actionTd = document.createElement("td");
      actionTd.style.textAlign = "right";

      const removeBtn = document.createElement("button");
      removeBtn.className = "btn btn-danger";
      removeBtn.style.padding = "4px 10px";
      removeBtn.style.fontSize = "12px";
      removeBtn.textContent = "Remove";

      removeBtn.addEventListener("click", async () => {
        settings.enabledDomains = settings.enabledDomains.filter((d) => d !== domain);
        await saveSettings(settings);
        renderEnabledSites(searchDomainInput.value);
        showToast(`Removed ${domain} - Hurry Up! is now off there`);
      });

      actionTd.appendChild(removeBtn);
      row.appendChild(domainTd);
      row.appendChild(actionTd);
      exclusionsTableBody.appendChild(row);
    });
  }

  addDomainBtn.addEventListener("click", async () => {
    let raw = newDomainInput.value.trim().toLowerCase();
    if (!raw) return;
    raw = raw.replace(/^https?:\/\//, "").split("/")[0];

    if (!settings.enabledDomains.includes(raw)) {
      settings.enabledDomains.push(raw);
      await saveSettings(settings);
      newDomainInput.value = "";
      renderEnabledSites(searchDomainInput.value);
      showToast(`Enabled Hurry Up! on ${raw}!`);
    } else {
      showToast("Domain is already enabled", true);
    }
  });

  searchDomainInput.addEventListener("input", (e) => {
    renderEnabledSites(e.target.value);
  });

  // Load configuration into Tab 4 (DOM Overlays & Auto-Click)
  const optHideOverlays = document.getElementById("opt-hide-overlays");
  const optOverlaySelectors = document.getElementById("opt-overlay-selectors");
  const optAutoclickBtn = document.getElementById("opt-autoclick-btn");
  const optGateDetection = document.getElementById("opt-gate-detection");
  const optAntiadFilter = document.getElementById("opt-antiad-filter");
  const optButtonKeywords = document.getElementById("opt-button-keywords");
  const optClickDelay = document.getElementById("opt-click-delay");

  function populateDomFields() {
    optHideOverlays.checked = settings.overlaySettings.hideOverlays;
    optOverlaySelectors.value = (settings.overlaySettings.customSelectors || []).join("\n");
    optAutoclickBtn.checked = settings.autoClickSettings.autoClick;
    optGateDetection.checked = settings.autoClickSettings.gateDetection !== false;
    optAntiadFilter.checked = settings.autoClickSettings.antiAdFilter;
    optButtonKeywords.value = (settings.autoClickSettings.customKeywords || []).join("\n");
    optClickDelay.value = settings.autoClickSettings.delayBeforeClickMs;
  }

  document.getElementById("save-dom-btn").addEventListener("click", async () => {
    settings.overlaySettings.hideOverlays = optHideOverlays.checked;
    settings.overlaySettings.customSelectors = optOverlaySelectors.value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    settings.autoClickSettings.autoClick = optAutoclickBtn.checked;
    settings.autoClickSettings.gateDetection = optGateDetection.checked;
    settings.autoClickSettings.antiAdFilter = optAntiadFilter.checked;
    settings.autoClickSettings.customKeywords = optButtonKeywords.value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    settings.autoClickSettings.delayBeforeClickMs = Number(optClickDelay.value) || 250;

    await saveSettings(settings);
    showToast("DOM & Auto-click settings saved!");
  });

  // Tab 5: Backup & Restore (Export & Import)
  const exportBtn = document.getElementById("export-settings-btn");
  const triggerImportBtn = document.getElementById("trigger-import-btn");
  const importFileInput = document.getElementById("import-file-input");
  const resetDefaultsBtn = document.getElementById("reset-defaults-btn");

  exportBtn.addEventListener("click", () => {
    const jsonStr = JSON.stringify(settings, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().split("T")[0];

    const a = document.createElement("a");
    a.href = url;
    a.download = `hurry-up-settings-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Configuration exported!");
  });

  triggerImportBtn.addEventListener("click", () => {
    importFileInput.value = "";
    importFileInput.click();
  });

  importFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const validation = validateSettings(parsed);

        if (!validation.valid && validation.errors.length > 0) {
          showToast(`Import error: ${validation.errors.join(", ")}`, true);
          return;
        }

        settings = validation.cleanConfig;
        await saveSettings(settings);
        initAll();
        showToast("Configurations imported successfully!");
      } catch (err) {
        showToast("Failed to parse settings JSON file", true);
      }
    };
    reader.readAsText(file);
  });

  resetDefaultsBtn.addEventListener("click", async () => {
    if (confirm("Are you sure you want to restore all settings back to default values?")) {
      settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      await saveSettings(settings);
      initAll();
      showToast("Configurations reset to defaults!");
    }
  });

  function initAll() {
    populateTimerFields();
    populateNetworkFields();
    renderEnabledSites();
    populateDomFields();
  }

  initAll();
});
