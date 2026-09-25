# ⚡ Hurry Up! — Countdown Timer Skipper & Fast Downloader

A zero-dependency Google Chrome / Chromium extension (**Manifest V3**) that skips
countdown timers on download-gate pages: it accelerates client-side timers, suppresses
"please wait" overlays, and — only when you opt in — clicks the download button the
page finally reveals.

- **Privacy:** no data collection, no telemetry, no network requests of its own — details in [PRIVACY.md](PRIVACY.md)
- **Permissions:** `storage` + `activeTab` only (no host permissions, no `downloads`, no `webRequest`)
- **Auto-clicking:** **off by default**, opt-in, and limited to pages that look like a real countdown gate
- **Dependencies:** none — no build step, no bundler, no remote code (MV3 compliant)
- **Tests:** `node test/content-guards.test.js` (no dependencies)
- **License:** [MIT](LICENSE)

---

## Safety first: what Hurry Up! will not do

Page-mutating automation is the risky part of an extension like this, so the behaviour is
deliberately conservative:

1. **No clicking on ordinary pages.** Auto-clicking only runs when the page shows a real
   countdown-gate signal (a countdown readout, a "please wait"/"your download will begin"
   message, or a gate container). A chat app, dashboard, code viewer, or document viewer
   that happens to contain a button labelled *Download* is ignored.
2. **Nothing is force-opened to be clicked.** Hidden, `disabled`, `aria-disabled`,
   `aria-hidden`, or `display:none` controls — including collapsed app action menus — are
   never revealed by the auto-clicker. If the page has not enabled the button, Hurry Up!
   waits.
3. **A click only happens on a genuinely visible, enabled, in-layout control** that matches
   one of your keywords, is not inside an ad wrapper, and is not inside a long block of page
   copy (`> 64` characters is treated as text, not a button label).
4. **Your exclusions win.** The per-site toggle, the global switch, and every feature switch
   are honoured — an excluded domain is left completely untouched (badge shows `OFF`).
5. **No data leaves your browser.** See [PRIVACY.md](PRIVACY.md).

If you ever see Hurry Up! click something on a site that is *not* a countdown gate, that is
a bug worth reporting immediately — see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Features

1. **JavaScript timer interception (MAIN-world injection)**
   - Hooks native `setTimeout`, `setInterval`, and `requestAnimationFrame` at
     `document_start`, before page scripts run.
   - Two bypass strategies: **Instant (0 ms)** or **Accelerated (multiplier)** for pages
     that need their per-second UI renders.
   - Delay-window boundaries (`minDelayMs` 500 ms – `maxDelayMs` 60 000 ms) keep UI
     animations, carousels, and tooltips from being destroyed.
   - Optional function cloaking so `.toString()` checks still report native code.

2. **Network hook (delayed download endpoints)**
   - Wraps `fetch` and `XMLHttpRequest` in the page to observe delayed download/token
     endpoints (`get_link`, `generate_link`, `ajax/verify`, `token`, …). Requests are never
     modified, blocked, or redirected — only observed and counted locally.

3. **Overlay and modal suppression**
   - A `MutationObserver` finds countdown backdrops, "please wait" modals, and artificial
     progress bars and hides them with an extension-namespaced class
     (`hurry-up-hidden-overlay`), and restores document scrolling when a gate locked it.

4. **Safe auto-clicking (opt-in)**
   - Off by default. Once enabled it clicks the first download-intent control that is really
     visible, enabled, and matched against your keyword list, after a configurable settling
     delay so the page's own click listeners are bound.
   - Anti-ad safeguard skips elements inside ad wrappers, sponsored blocks, and iframes.

5. **Per-site disable toggle (popup)**
   - Shows the current domain with a one-click on/off switch, quick switches for global
     protection, timer skipping, and auto-clicking, plus local counters.
   - The toolbar badge shows `OFF` on excluded domains.

6. **Full-page options dashboard**
   - **Timers & Speed Hack:** global switch, timer bypass, mode, multiplier, delay window,
     cloaking.
   - **Network Interceptor:** fetch/XHR hooking and watched API patterns.
   - **Excluded Websites:** search, add, and remove domains.
   - **Overlays & Auto-Click:** overlay selectors, auto-click opt-in, gate-only safety mode,
     anti-ad filter, keywords, settling delay.
   - **Backup & Restore:** JSON export, schema-validated import, factory reset.


---

## Installation (developer mode)

1. Open Chrome or any Chromium-based browser (Edge, Brave, Chromium).
2. Go to `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this repository folder.
5. Optional: on the extension's **Details** page enable **Allow access to file URLs** if you
   want to test the local harness from `file://`.

---

## Usage

1. Open a download-gate page (the ones that count down before revealing a link).
2. The countdown speeds up and the "please wait" overlay disappears.
3. If you want the download button clicked for you, enable **Auto-Click** in the popup —
   it is off by default.
4. If a site misbehaves, open the popup and switch that site **off**; Hurry Up! will not run
   there again until you re-enable it.

---

## Settings reference

All defaults come from `src/storage.js` and are validated on every read/write
(`validateSettings`).

| Setting | Default | Notes |
| --- | --- | --- |
| `globalEnabled` | `true` | Master switch for the whole extension. |
| `disabledDomains` | `[]` | Domains where the extension must not run (popup toggle). |
| `timerSettings.speedUpTimers` | `true` | Hook `setTimeout`/`setInterval`/rAF. |
| `timerSettings.mode` | `"instant"` | `"instant"` (0 ms) or `"accelerated"`. |
| `timerSettings.speedMultiplier` | `50` | Used when mode is `"accelerated"`. |
| `timerSettings.minDelayMs` / `maxDelayMs` | `500` / `60000` | Only delays inside this window are accelerated. |
| `timerSettings.cloakFunctions` | `true` | Mask patched functions from `.toString()`. |
| `networkSettings.interceptFetchXhr` | `true` | Observe (never modify) fetch/XHR calls. |
| `networkSettings.customApiPatterns` | `get_link`, `generate_link`, `token`, `ajax/verify`, … | Substring patterns counted against watched endpoints. |
| `overlaySettings.hideOverlays` | `true` | Hide countdown overlays that match the selector list. |
| `overlaySettings.customSelectors` | countdown / timer / `#gateMsg` / `#gateProg` selectors | One selector per line. |
| `autoClickSettings.autoClick` | **`false`** | Opt-in; nothing is ever clicked until you enable it. |
| `autoClickSettings.gateDetection` | `true` | Only unlock/click on pages that look like a countdown gate. Leave on. |
| `autoClickSettings.customKeywords` | `download`, `get link`, `direct download`, `skip wait`, `click here to download` | Matched against short button labels only. |
| `autoClickSettings.delayBeforeClickMs` | `250` | Settling delay before the click. |
| `autoClickSettings.antiAdFilter` | `true` | Skip ad wrappers, sponsored blocks, iframes. |
| `stats.*` | `0` | Local counters only (timers skipped, requests accelerated, buttons clicked). |

Exported backups are validated on import: unknown keys are dropped and invalid values fall
back to defaults instead of being written through.

---

## Testing

### Automated guard regression tests (no dependencies)

```bash
node test/content-guards.test.js
```

This runs `src/content.js` inside a minimal in-repo DOM sandbox and verifies:

- an ordinary page (hidden export menu, locked `#dlBtn`, visible `Download` button) is never
  mutated or clicked,
- a hidden control is never force-unlocked in order to be clicked,
- a real countdown gate page still unlocks and auto-clicks its button exactly once,
- auto-clicking stays inert while the opt-in setting is off.

### Manual browser test bench

Open `test/mock-timer-page.html` (enable **Allow access to file URLs** if you load it via
`file://`):

| Test | What it verifies |
| --- | --- |
| 1 – Trigger 10s Timer | `setTimeout(..., 10000)` gate resolves immediately; the revealed button is clicked (if auto-click is on). |
| 2 – Start Interval Ticker | `setInterval(..., 1000)` ticking countdown is accelerated. |
| 3 – Blocking Overlay | The "please wait" modal is suppressed. |
| 4 – Fetch Download Token | Watched endpoint `/api/generate_link` is observed and counted. |
| 5 – Closed Download Menu | **Regression guard:** a collapsed menu containing *Download chat transcript* must stay hidden and unclicked. |

Enable **Auto-Click** in the popup before running Tests 1–3, and reload the page after
changing settings — content scripts read settings at `document_start`.

---

## Project layout

```text
manifest.json                 MV3 manifest: permissions, content scripts, popup, options
src/injected.js               MAIN world: setTimeout/setInterval/rAF/fetch/XHR hooks
src/storage.js                Defaults, schema validation, get/save, domain exclusions
src/content.js                ISOLATED world: gate detection, overlays, safe unlock/auto-click
src/content.css               Extension-namespaced overlay/highlight styles
src/background.js             Service worker: badge state
src/popup.html / .css / .js   Quick toggles and counters
src/options.html / .css / .js Full dashboard (tabs, exclusions, import/export)
test/mock-timer-page.html     Manual browser test bench
test/content-guards.test.js   Automated guard regression tests (Node only)
specs/001-timer-skipper/      Feature spec, plan, tasks
```

---

## Privacy

Hurry Up! collects nothing and sends nothing. There is no server, no analytics, no
third-party code, and no remote resource loading. Settings live in `chrome.storage` (your
browser profile; Chrome may sync them between your own signed-in profiles), and page
content is processed locally, in memory, only.

Read the full disclosure: [PRIVACY.md](PRIVACY.md).

| Permission | Reason |
| --- | --- |
| `storage` | Save your settings and exclusions in your browser profile. |
| `activeTab` | Apply changes to the tab you are actively using. |
| Content script on `<all_urls>` | Countdown gates exist on many domains, so the timer/DOM logic must be able to run wherever you browse. It is inert on non-gate pages. |


---

## Publishing to the Chrome Web Store

Submission checklist for this repository:

- [x] **Manifest V3** with a service worker (`src/background.js`).
- [x] **Remote code:** none — no `eval`, no `new Function`, no remote scripts.
- [x] **Minimal permissions:** `storage` + `activeTab`, with content scripts declared in the
      manifest (no optional host-permission escalation).
- [x] **Single purpose:** *"Skip countdown waits on download-gate pages."*
- [x] **Privacy policy URL:** required because the extension reads page data — publish
      `PRIVACY.md` (GitHub Pages, or the repository permalink) and paste the URL in the listing.
- [x] **Data-use disclosure:** no data collected, nothing sold, nothing transferred to third parties.
- [x] **In-repo test evidence** for reviewers: `test/content-guards.test.js` plus the manual
      test bench.
- [ ] **Screenshots:** at least one at **1280×800** (max 5). Suggested: popup with the per-site
      toggle, options "Timers & Speed Hack", options "Overlays & Auto-Click".
- [ ] **Store icon:** 128×128 PNG (already in `icons/icon128.png`); 440×280 promo tile optional.
- [ ] **Packaging:** zip only the runtime files — `manifest.json`, `icons/`, `src/`. Exclude
      `test/`, `specs/`, `.git/`, `*.md`, and any `.zip` (see `.gitignore`).

```bash
# From the repository root, build a store-ready archive:
zip -r hurry-up-1.0.0.zip manifest.json icons src -x "*.DS_Store"
```

- [ ] **Permission justifications** to paste into the listing:
  - `storage` — persists user settings and the excluded-domain list locally.
  - `activeTab` — applies the user's chosen action to the active tab.
  - Content script injection — required to neutralise in-page countdown timers on the
    websites the user visits; it does not read, collect, or transmit page data.
- [ ] **Version bump** in `manifest.json` before each upload (current: `1.0.0`).
- [ ] **Reviewer note:** auto-clicking is disabled by default, no login or account is required,
      and countdown behaviour can be verified with the included test harness.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Nothing happens on a site | Check that the global switch is on and the site is not in **Excluded Websites**, then reload the tab (settings are read at `document_start`). |
| A timer is skipped but the button is not clicked | Auto-clicking is off by default — enable **Auto-Click** in the popup. |
| A gated page is not detected | Temporarily turn off **Only Act On Countdown Gate Pages** for that site and open an issue with the URL so the heuristic can be extended safely. |
| A site breaks (layout, modal, script error) | Disable the extension for that domain with the popup toggle and open an issue. |
| Settings did not apply | Reload the tab after saving; content scripts do not hot-reload. |

---

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout,
coding conventions, and the privacy / no-dependency rules.

```bash
node test/content-guards.test.js                          # guard regression tests
for f in src/*.js test/*.js; do node --check "$f"; done    # syntax check
```

---

## License

[MIT](LICENSE) © 2026 Mueed Mubashar.

## Disclaimer

Hurry Up! is intended for legitimate use: skipping artificial wait timers on pages you are
permitted to access. It does not bypass paywalls, authentication, DRM, or server-side
entitlement checks — it only accelerates client-side timing delays that run in your own
browser. Using it may violate the terms of service of some websites, and you are responsible
for how you use it. The software is provided "as is", without warranty of any kind, as set out
in the [MIT License](LICENSE).

