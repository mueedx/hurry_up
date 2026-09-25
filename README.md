# Hurry Up! — Countdown Timer Skipper & Fast Downloader

A zero-dependency Manifest V3 Chrome extension that speeds up countdown timers on download-gate pages, hides the "please wait" overlay, and optionally clicks the button the page reveals.

No data collection, no telemetry, no network requests of its own. See [PRIVACY.md](PRIVACY.md).

Permissions are `storage` and `activeTab` only. No build step, no bundler, no remote code. MIT licensed.

## Install

Open `chrome://extensions/`, enable developer mode, and click "Load unpacked" with this folder selected. Enable "Allow access to file URLs" on the Details page if you want to run the test bench over `file://`.

## Use

The extension is off on every site when you install it, so the badge reads `OFF` until you act.

On a download-gate page, click the toolbar icon and flip the site switch on, then reload the tab. Settings are read at `document_start`, so a reload is required.

The countdown speeds up and the overlay disappears. Auto-Click is a separate opt-in in the popup. Flip the site switch off again to make the extension dormant there.

## What it will not do

Auto-clicking needs a gate signal: a countdown readout, a "please wait" message, or a gate container. A dashboard with a *Download* button is ignored.

Hidden, `disabled`, `aria-hidden`, and `display:none` controls are never revealed in order to be clicked. A click needs a visible, enabled, in-layout control matching your keywords, outside ad wrappers, and not inside a block of page copy over 64 characters.

Timers are only patched after a page passes the gate heuristic. On ordinary sites nothing collapses to `0 ms`, no clock skew is applied, and `requestAnimationFrame` is never touched.

Overlays are hidden only when their own text reads as a countdown, never from a class name alone, so a video timecode or premiere banner survives.

Clicking something on a non-gate page is a bug. Report it in [CONTRIBUTING.md](CONTRIBUTING.md).

## Features

- Timers. Hooks `setTimeout`, `setInterval`, and the virtual clock at `document_start`, once a gate is confirmed by name, by gate text, or by a wait word beside a numeric countdown. Instant mode collapses long waits to a 25 ms tick, accelerated divides by the multiplier, and nothing is ever set to `0 ms`. Clock skew is capped at 15 minutes. `requestAnimationFrame` is left alone. The delay window runs 500 ms to 60,000 ms so animations and tooltips survive. Optional function cloaking passes `.toString()` checks. Stats report at most once every two seconds.
- Network. Wraps `fetch` and `XMLHttpRequest` to count calls to endpoints like `get_link`, `generate_link`, and `token`. Requests are observed, never modified or blocked.
- Overlays. A `MutationObserver` hides countdown backdrops and "please wait" modals via `hurry-up-hidden-overlay`, and restores scrolling when a gate locked it.
- Auto-click. Opt-in. Clicks the first download-intent control that is visible, enabled, and keyword-matched, after a settling delay so page listeners are bound. Skips ad wrappers and iframes.
- Popup. One-click per-site switch, quick toggles, and local counters. Badge is green `ON` on enabled sites and red `OFF` elsewhere.
- Options. Tabs for timers, network patterns, the enabled-sites allowlist, overlay selectors and keywords, and JSON export/import with factory reset.

## Settings reference

Defaults live in `src/storage.js` and are validated on every read and write.

| Setting | Default | Notes |
| --- | --- | --- |
| `globalEnabled` | `true` | Master switch. |
| `enabledDomains` | `[]` | Opt-in allowlist. The extension is off on any site not listed. Legacy `disabledDomains` data is dropped on import. |
| `timerSettings.speedUpTimers` | `true` | Patch timers on confirmed gate pages only. |
| `timerSettings.mode` | `"instant"` | `"instant"` collapses waits to 25 ms, `"accelerated"` divides by the multiplier. |
| `timerSettings.speedMultiplier` | `50` | Used in `"accelerated"` mode. |
| `timerSettings.minDelayMs` / `maxDelayMs` | `500` / `60000` | Only delays in this window are accelerated, never below 25 ms. |
| `timerSettings.cloakFunctions` | `true` | Mask patched functions from `.toString()`. |
| `networkSettings.interceptFetchXhr` | `true` | Observe fetch and XHR. |
| `networkSettings.customApiPatterns` | `get_link`, `generate_link`, `token`, `ajax/verify` | Substrings matched against endpoints. |
| `overlaySettings.hideOverlays` | `true` | Hide overlays matching the selector list and containing real gate text. |
| `overlaySettings.customSelectors` | countdown / timer / `#gateMsg` / `#gateProg` | One per line. |
| `autoClickSettings.autoClick` | `false` | Opt-in. Nothing is clicked until you enable it. |
| `autoClickSettings.gateDetection` | `true` | Gate heuristic for clicking and for arming timers. Leave on. |
| `autoClickSettings.customKeywords` | `download`, `get link`, `direct download`, `skip wait`, … | Matched against short button labels only. |
| `autoClickSettings.delayBeforeClickMs` | `250` | Settling delay before the click. |
| `autoClickSettings.antiAdFilter` | `true` | Skip ad wrappers and iframes. |
| `stats.*` | `0` | Local counters only. |

Exported backups are validated on import. Unknown keys are dropped and invalid values fall back to defaults.

## Testing

```bash
node test/content-guards.test.js   # content script: gate detection, auto-click
node test/injected-guards.test.js  # injector: timer arming, skew, stat throttle
```

Both run under plain Node with no dependencies and print `ALL CHECKS PASSED`. The first runs `src/content.js` in a DOM sandbox and asserts that ordinary pages are never mutated or clicked, hidden controls are never revealed to be clicked, real gates still click exactly once, the empty default leaves every site untouched, and video timecodes are never hidden. The second runs `src/injected.js` in a fake-timer sandbox and asserts that nothing is patched before a gate is confirmed, waits never collapse to `0 ms`, clock skew is capped at 15 minutes, animation frames never warp the clock, and stats are throttled.

For manual checks, open `test/mock-timer-page.html` and switch the site on in the popup. It covers a 10s `setTimeout` gate, a ticking `setInterval` countdown, a blocking modal, a watched `/api/generate_link` fetch, and a closed menu containing *Download chat transcript* that must stay hidden and unclicked. Enable Auto-Click before the first three and reload after changing settings.

## Project layout

```text
manifest.json                 MV3 manifest: permissions, content scripts, popup, options
src/injected.js               MAIN world: setTimeout, setInterval, rAF, fetch, XHR hooks
src/storage.js                Defaults, schema validation, get/save, per-site allowlist
src/content.js                ISOLATED world: gate detection, overlays, safe auto-click
src/content.css               Extension-namespaced overlay and highlight styles
src/background.js             Service worker: badge state
src/popup.html / .css / .js   Quick toggles and counters
src/options.html / .css / .js Full dashboard
test/                         Manual bench and guard regression tests
specs/001-timer-skipper/      Feature spec, plan, tasks, and store listing copy
```

## Privacy

Nothing is collected and nothing is sent. There is no server, no analytics, and no third-party code. Settings live in `chrome.storage` in your own profile, and Chrome may sync them between your signed-in profiles. Page content is processed in memory only. Full disclosure in [PRIVACY.md](PRIVACY.md).

| Permission | Reason |
| --- | --- |
| `storage` | Save settings and the enabled-sites list. |
| `activeTab` | Apply changes to the tab you are viewing. |
| Content script on `<all_urls>` | Gates appear on many domains, so the logic must run wherever you browse. It does nothing until you enable the site. |

## Publishing

Listing copy, permission justifications, data-use answers, the screenshot shot list, and reviewer notes are all drafted in `specs/001-timer-skipper/store-listing.md`.

Before uploading: publish `PRIVACY.md` at a public URL, capture at least one 1280 by 800 screenshot, and bump `version` in `manifest.json` if 1.0.0 has shipped anywhere. Then package only the runtime files and confirm the archive holds exactly `manifest.json`, `icons/*`, and `src/*`.

```bash
node test/content-guards.test.js
node test/injected-guards.test.js
for f in src/*.js test/*.js; do node --check "$f"; done
zip -r hurry-up-<version>.zip manifest.json icons src -x "*.DS_Store"
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Nothing happens on a site | It is off everywhere by default. Switch it on for that site, keep the global switch on, reload. |
| Timer skipped but no click | Auto-Click is off by default. Enable it in the popup. |
| A gate is not detected or not accelerated | Turn off "Only Act On Countdown Gate Pages" for that site, reload, and open an issue with the URL. |
| Timers feel odd on a site | Turn off "Skip JavaScript Timers" or flip that domain's popup switch off. The injector is a pass-through until a gate is confirmed. |
| A site breaks | Disable the extension for that domain and open an issue. Non-gate breakage is treated as a bug. |
| Settings did not apply | Reload the tab. Content scripts do not hot-reload. |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions and the privacy and no-dependency rules.

## License

[MIT](LICENSE) © 2026 Mueed Mubashar.

Intended for skipping artificial wait timers on pages you are permitted to access. It does not bypass paywalls, authentication, DRM, or server-side entitlement checks. Using it may violate some sites' terms of service, and you are responsible for how you use it. Provided as is, without warranty of any kind.
