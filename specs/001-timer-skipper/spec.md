# Feature Specification: Hurry Up - Countdown Timer Skipper & Network Interceptor Extension

**Feature Directory**: `specs/001-timer-skipper`  
**Feature Status**: Ready for Planning  
**Target Platform**: Google Chrome / Chromium Browsers (Manifest V3)

---

## 1. Executive Summary & Purpose

Users visiting download, file-sharing, content, or verification portals frequently encounter artificial delay mechanisms:
1. Client-side JavaScript timers (`setTimeout`, `setInterval`) counting down from 5 to 60+ seconds.
2. Visual overlay elements (modal popups, "Please wait" backdrop containers) disabling access to the destination link.
3. Delayed network calls that defer requesting the download link or authorization token from the server until the timer runs out.

**Hurry Up** is a browser extension that eliminates these artificial delays automatically. It fast-forwards or skips countdown timers, suppresses blocking overlays, intercepts delayed API calls, auto-clicks download buttons, provides one-click domain-level exclusion, and offers a comprehensive tab-based settings dashboard with full backup/restore (import/export) capabilities.

---

## 2. User Stories & Value Proposition

- **As a user downloading files or tools**, I want countdown timers to resolve instantly so that I don't waste time waiting.
- **As a user encountering overlay modals**, I want the blocking screen to disappear and the download button to be revealed immediately.
- **As a user on a site where timers are necessary for functional reasons (e.g., banking, e-learning, timed quizzes)**, I want to disable the extension for that specific website in one click from the popup so that normal functionality is never broken.
- **As a power user**, I want to export my settings, exclusion lists, and custom selectors to a file and import them across multiple browsers/profiles seamlessly.
- **As a user facing delayed network-generated links**, I want the extension to intercept delayed API requests and trigger them immediately rather than waiting for client-side delays.

---

## 3. Requirements & Capabilities

### 3.1 Timing Interception & Acceleration
- **FR-1.1**: Intercept native `window.setTimeout` and `window.setInterval` before host page scripts run.
- **FR-1.2**: Support two configurable bypass modes:
  - *Instant Mode*: Coerces qualifying countdown delays directly to `0ms`.
  - *Accelerated Mode*: Multiplies the tick rate (e.g., 20x, 50x, 100x speed) for pages that require UI frames to count down step-by-step.
- **FR-1.3**: Filter delays with minimum (`minDelayMs`, default 500ms — low enough to catch 1-second ticking countdowns) and maximum (`maxDelayMs`, default 60000ms) thresholds to prevent breaking UI animations, carousels, or tooltip timeouts.
- **FR-1.4**: Mask/cloak overridden functions so `.toString()` checks return native function signatures (`function setTimeout() { [native code] }`).


### 3.2 DOM Overlay & Modal Suppression
- **FR-2.1**: Observe DOM additions via `MutationObserver` to detect and hide timer overlays, wait backdrops, and countdown banners using heuristics and configurable CSS selectors.
- **FR-2.2**: Unlock disabled/hidden **download-intent controls only** (`#dlBtn`, `#downloadBtn`, `a[download]`, or elements whose id/class/aria-label contains "download") and only on a page that passes the gate heuristic of FR-4.4. Generic disabled or `.is-hidden` elements on unrelated pages are never mutated (see FR-4.5).

### 3.3 Network Request Interception (Advanced API Bypass)
- **FR-3.1**: Intercept `window.fetch` and `XMLHttpRequest` in the page's execution world.
- **FR-3.2**: Detect delayed API calls matching download or token endpoints (e.g., `*generate_link*`, `*token*`, `*countdown*`).
- **FR-3.3**: Requests are observed and counted only — they are never modified, delayed further, blocked, or redirected.

### 3.4 Safe Auto-Clicker
- **FR-4.1**: Detect target download links or action buttons by matching text keywords ("Download", "Get Link", "Direct Download", "Skip Wait") against the control's *visible label only*, and only when that label is a short action label (≤ 64 characters) so page copy that merely contains a keyword is never clicked.
- **FR-4.2**: Prevent false clicks on ad frames, sponsored links, or elements inside known ad containers (`ins.adsbygoogle`, ad-wrapper classes).
- **FR-4.3**: Provide a configurable settling delay before triggering the click to ensure DOM event handlers have attached, and re-verify that the control is still clickable at click time.
- **FR-4.4 (gate detection)**: Auto-clicking and download-button unlocking must only run on a page that exhibits a countdown-gate signal: a gate container (`#gateMsg`, `#gateProg`, `#dlBtn`, `#downloadBtn`, countdown/wait-overlay selectors) whose text matches a wait-gate phrase ("please wait", "your download will begin", "generating link") or a countdown readout (bare number, `mm:ss`, "12 seconds"). This is the guard that stops the extension from acting on ordinary pages such as chat apps, dashboards, or document viewers.
- **FR-4.5 (never force-open)**: A control that is `disabled`, `aria-disabled`, `aria-hidden`, hidden by attribute, or `display:none` must never be revealed in order to be clicked. Unlocking only applies to explicitly download-intent controls on a detected gate page.
- **FR-4.6 (opt-in)**: Auto-clicking defaults to `false`; the extension must not click anything on any page until the user enables it in the popup or options dashboard.


### 3.5 Per-Site Disabling & Quick-Access Popup
- **FR-5.1**: Provide a popup accessible directly from the extension icon showing:
  - Current active website hostname (e.g., `files.example.com`).
  - One-click toggle switch to enable/disable the extension on the current domain.
  - Global master on/off switch.
  - Quick count of bypassed timers/clicks on the active tab.
  - Quick-link button to open the full settings tab.
- **FR-5.2**: Update extension badge (e.g., displaying `OFF` or changing badge color) when visiting an excluded site.

### 3.6 Tab-Based Options & Settings Dashboard
- **FR-6.1**: Open a spacious, multi-tabbed options dashboard in a dedicated browser tab.
- **FR-6.2**: Provide distinct tabs:
  1. *Timers & Acceleration*: Master switch, bypass mode (Instant vs Accelerated), delay thresholds, cloaking.
  2. *Network Interceptor*: Fetch/XHR hook toggle, monitored endpoint keywords/patterns.
  3. *Excluded Websites*: Interactive table of excluded domains with search, manual domain addition, and one-click removal.
  4. *Overlays & Auto-Clicker*: Auto-hide overlays toggle, custom selectors, button text keywords, ad-safeguards.
  5. *Backup & Restore (Import / Export)*: JSON configuration exporter, schema-validated JSON importer with preview, and factory reset option.
  6. *Statistics*: Lifetime count of skipped timers, accelerated requests, and clicked buttons.

---

## 4. Verification & Acceptance Criteria

1. **Timer Skipping**: In `test/mock-timer-page.html`, a 10s countdown activates immediately or counts down in under 200ms without errors.
2. **Overlay Removal**: Timer overlay on the mock test page is suppressed and the download button is made interactable.
3. **Auto-Clicking**: With auto-clicking enabled in the popup, the download button is clicked automatically with debounce safety and only after the gate heuristic passes; with the default setting (`autoClick: false`) nothing on any page is clicked.
4. **Safety (regression)**: On an ordinary page with no countdown gate — including a *collapsed* menu containing a "Download…" control — no control is revealed, mutated, or clicked. Verified automatically by `node test/content-guards.test.js` and manually by Test 5 of the mock harness.
5. **Per-Site Exclusion**: Disabling the extension on a site from the popup immediately halts bypass logic on that site and persists across reloads.
6. **Settings Export/Import**: Exporting settings generates a valid `.json` file; modifying settings and re-importing the JSON restores configuration accurately.
7. **Network Interceptor**: Delayed API calls in the test harness are matched and counted without being modified.
