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

**Hurry Up** is a browser extension that eliminates these artificial delays automatically. It fast-forwards or skips countdown timers, suppresses blocking overlays, intercepts delayed API calls, auto-clicks download buttons, provides one-click per-site activation (off by default on every site), and offers a comprehensive tab-based settings dashboard with full backup/restore (import/export) capabilities.

---

## 2. User Stories & Value Proposition

- **As a user downloading files or tools**, I want countdown timers to resolve instantly so that I don't waste time waiting.
- **As a user encountering overlay modals**, I want the blocking screen to disappear and the download button to be revealed immediately.
- **As a user on a site where timers are necessary for functional reasons (e.g., banking, e-learning, timed quizzes)**, I want the extension to stay off unless I explicitly switch it on for that website in one click from the popup, so that normal functionality is never broken.
- **As a power user**, I want to export my settings, the list of enabled websites, and custom selectors to a file and import them across multiple browsers/profiles seamlessly.
- **As a user facing delayed network-generated links**, I want the extension to intercept delayed API requests and trigger them immediately rather than waiting for client-side delays.

---

## 3. Requirements & Capabilities

### 3.1 Timing Interception & Acceleration
- **FR-1.1**: Intercept native `window.setTimeout` and `window.setInterval` before host page scripts run.
- **FR-1.2**: Support two configurable bypass modes:
  - *Instant Mode*: Collapses qualifying countdown delays to a small non-zero floor (`25ms`) so the callback still yields to the event loop. Delays are never rewritten to `0ms`, which would turn a countdown into a CPU-bound reschedule loop.
  - *Accelerated Mode*: Multiplies the tick rate (e.g., 20x, 50x, 100x speed) for pages that require UI frames to count down step-by-step.
- **FR-1.3**: Filter delays with minimum (`minDelayMs`, default 500ms — low enough to catch 1-second ticking countdowns) and maximum (`maxDelayMs`, default 60000ms) thresholds to prevent breaking UI animations, carousels, or tooltip timeouts.
- **FR-1.4**: Mask/cloak overridden functions so `.toString()` checks return native function signatures (`function setTimeout() { [native code] }`).
- **FR-1.5 (gate-scoped arming)**: Timer interception is inert until the ISOLATED-world content script confirms a countdown gate (FR-4.4) and sends an enabled config. Before that — and on every failure of the gate probe — the MAIN-world patches must behave as pass-through wrappers: identical behaviour, no delay rewriting, no clock skew.
- **FR-1.6 (no clock warping per frame)**: `requestAnimationFrame` must not be patched and the virtual clock must not advance per animation frame. Clock skew starts at `0`, is applied only while a gate is armed, advances in bounded steps, and is hard-capped (15 minutes) so schedulers, animation pipelines, and media players stay coherent.
- **FR-1.7 (stat throttling)**: Timer/request counters must be reported to `chrome.storage` at a bounded rate (≤ 1 write per 2s) so an accelerated gate cannot produce a storage-write storm.
- **FR-1.8 (overlay guard)**: A selector match alone is never sufficient to hide an element (FR-2.1); the element must additionally read as a gate (gate copy or a countdown readout) so unrelated UI such as a player timecode or a premiere banner is left visible.


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
- **FR-4.4 (gate detection)**: Auto-clicking, download-button unlocking, **and timer acceleration (FR-1.5)** must only run on a page that exhibits a countdown-gate signal: a gate container (`#gateMsg`, `#gateProg`, `#dlBtn`, `#downloadBtn`, countdown/wait-overlay selectors) whose text matches a wait-gate phrase ("please wait", "your download will begin", "generating link") or a countdown readout (bare number, `mm:ss`, "12 seconds"). A wait phrase adjacent to a numeric countdown also qualifies when a download word is present elsewhere in the page text. A bare duration, timecode, or video timestamp never qualifies on its own. This is the guard that stops the extension from acting on ordinary pages such as chat apps, dashboards, video sites, or document viewers.
- **FR-4.5 (never force-open)**: A control that is `disabled`, `aria-disabled`, `aria-hidden`, hidden by attribute, or `display:none` must never be revealed in order to be clicked. Unlocking only applies to explicitly download-intent controls on a detected gate page.
- **FR-4.6 (opt-in)**: Auto-clicking defaults to `false`; the extension must not click anything on any page until the user enables it in the popup or options dashboard.


### 3.5 Per-Site Opt-In & Quick-Access Popup
- **FR-5.0 (off by default)**: The extension must be **dormant on every site by default**. It may only act on a hostname listed in an opt-in allowlist (`enabledDomains`) that the user explicitly manages via the popup icon toggle (FR-5.1) or the options dashboard (FR-6.3), and only while the global switch (FR-5.1) is on. An empty allowlist — the shipped default — means no site is touched at all.
- **FR-5.1**: Provide a popup accessible directly from the extension icon showing:
  - Current active website hostname (e.g., `files.example.com`).
  - One-click toggle switch that turns the extension on/off **for the current domain only** (adds/removes it from the opt-in allowlist).
  - Global master on/off switch.
  - Quick count of bypassed timers/clicks on the active tab.
  - Quick-link button to open the full settings tab.
- **FR-5.2**: Update the extension badge per site: green `ON` where the extension is enabled for that host, red `OFF` everywhere else (the default state).

### 3.6 Tab-Based Options & Settings Dashboard
- **FR-6.1**: Open a spacious, multi-tabbed options dashboard in a dedicated browser tab.
- **FR-6.2**: Provide distinct tabs:
  1. *Timers & Acceleration*: Master switch, bypass mode (Instant vs Accelerated), delay thresholds, cloaking.
  2. *Network Interceptor*: Fetch/XHR hook toggle, monitored endpoint keywords/patterns.
  3. *Enabled Websites*: Interactive opt-in allowlist of domains where the extension may run, with search, manual domain addition, and one-click removal.
  4. *Overlays & Auto-Clicker*: Auto-hide overlays toggle, custom selectors, button text keywords, ad-safeguards.
  5. *Backup & Restore (Import / Export)*: JSON configuration exporter, schema-validated JSON importer with preview, and factory reset option.
  6. *Statistics*: Lifetime count of skipped timers, accelerated requests, and clicked buttons.

---

## 4. Verification & Acceptance Criteria

1. **Timer Skipping**: In `test/mock-timer-page.html`, a 10s countdown activates immediately or counts down in under 200ms without errors.
2. **Overlay Removal**: Timer overlay on the mock test page is suppressed and the download button is made interactable.
3. **Auto-Clicking**: With auto-clicking enabled in the popup, the download button is clicked automatically with debounce safety and only after the gate heuristic passes; with the default setting (`autoClick: false`) nothing on any page is clicked.
4. **Safety (regression)**: On an ordinary page with no countdown gate — including a *collapsed* menu containing a "Download…" control — no control is revealed, mutated, or clicked. Verified automatically by `node test/content-guards.test.js` and manually by Test 5 of the mock harness.
5. **Per-Site Opt-In (off by default)**: With the shipped settings (`enabledDomains: []`) the extension acts on **no site at all** — enabling a site from the popup (or the Enabled Websites tab) activates bypass logic for that host only, persists across reloads, and switching it off again halts the logic immediately. Verified by the per-site opt-in suite in `node test/content-guards.test.js`.
6. **Settings Export/Import**: Exporting settings generates a valid `.json` file; modifying settings and re-importing the JSON restores configuration accurately.
7. **Network Interceptor**: Delayed API calls in the test harness are matched and counted without being modified.
8. **Gate-scoped timing (regression)**: On an ordinary, busy client-rendered page (video/dashboard/SPA-like content, ticking timecodes, "please wait" spinners without a gate) the injector must leave `setTimeout`, `setInterval`, `Date`/`performance.now`, and `requestAnimationFrame` untouched — verified by `node test/injected-guards.test.js` and by the timer-arming assertions in `test/content-guards.test.js`.
