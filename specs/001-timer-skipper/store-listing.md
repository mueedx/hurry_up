# Chrome Web Store Listing — Draft Copy

Ready-to-paste copy for the Chrome Web Store developer dashboard. Keep this file in sync
with `manifest.json` whenever the name, description, or permissions change.

---

## 1. Store listing fields

| Field | Value | Limit |
| --- | --- | --- |
| **Name** | `Hurry Up! - Timer Skipper & Fast Downloader` | 75 chars (43 used) |
| **Summary** | `Skips countdown timers and wait overlays on download-gate pages. Opt-in, gate-aware auto-clicking. No data collection.` | 132 chars (118 used) |
| **Category** | Productivity / Developer Tools | — |
| **Language** | English | — |
| **Homepage URL** | `https://github.com/mueedx/resume` (or the repo permalink) | — |
| **Privacy policy URL** | **required** — host `PRIVACY.md` (GitHub Pages or the repo permalink) | — |

### Detailed description

```
Skip the "please wait 30 seconds" gate.

Hurry Up! speeds up the countdown on download-gate pages so the file link appears
immediately, and — only if you ask it to — clicks the button the page finally reveals.

HOW IT WORKS
• Accelerates the page's own countdown timers (setTimeout / setInterval / page clock)
  so a 30 second wait resolves in a fraction of a second.
• Suppresses the "please wait" overlay and countdown backdrop that blocks the page.
• Optionally clicks the revealed download button for you (off by default, opt-in).
• Can also unlock a download button a gate left disabled.

WHAT MAKES IT SAFE
This extension never guesses. It stays completely inert on ordinary websites:
• Timers are only touched on a page that really looks like a countdown gate. On every
  other site — video sites, chat apps, dashboards, document viewers — timing stays
  native, nothing is collapsed to 0 ms, and no clock is warped.
• Overlays are only hidden when their own text is a genuine countdown or wait readout,
  never just because a class name says "timer".
• Hidden, disabled, or aria-hidden controls are never force-revealed in order to be
  clicked.
• Auto-clicking is off until you turn it on, and only matches short button labels.
• Your excluded-site list always wins.

PRIVACY
No accounts, no analytics, no telemetry, no servers, no network requests of its own.
Nothing is collected and nothing leaves your browser. Settings live in your browser
profile. Permissions are limited to "storage" and "activeTab".

FREE AND OPEN SOURCE
MIT licensed, zero dependencies, no build step, Manifest V3 compliant. Settings can be
exported and imported as JSON.
```

---

## 2. Single purpose statement

```
Skip countdown waits on download-gate pages.
```

---

## 3. Permission justifications

Paste each into the matching field on the **Privacy practices** tab.

- **`storage`** — Persists the user's settings, per-site exclusions, and local counters in
  the browser profile. Optional Chrome Sync is used only to carry the same settings to the
  user's other signed-in devices. No page data is stored or transmitted.

- **`activeTab`** — Lets the toolbar popup apply the user's toggle (enable/exclude) to the
  tab the user is actively viewing, without requesting broad tab access.

- **Content script on `<all_urls>` (host permission)** — Countdown download gates appear
  on arbitrary domains, so the timing/DOM logic has to be injectable wherever the user
  browses. The scripts are inert until a countdown-gate heuristic confirms a gate: on
  ordinary pages no timer is patched, no clock is warped, and no DOM is modified. The
  scripts read page text locally only for that gate check, never collect it, never store
  it, and never transmit it. Users can additionally exclude any domain from the popup.

- **Remote code** — None. No `eval`, no `new Function`, no remote scripts, no CDN assets,
  no build step.

- **`requestAnimationFrame` / clock** — Not patched outside gate pages; the extension never
  warps animation frames (see README "Safety first").

---

## 4. Data usage disclosure answers

| Question | Answer |
| --- | --- |
| Does this item collect or use user data? | **No** |
| Personally identifiable information | No |
| Health, financial, authentication information | No |
| Personal communications | No |
| Location | No |
| Web history | No |
| User activity | No |
| Website content | No |
| Sold to third parties | No |
| Used or transferred for purposes unrelated to the item's single purpose | No |
| Used or transferred to determine creditworthiness / for lending | No |

Certify: the three Chrome Web Store developer-program policy statements (no sale of data,
no unrelated use, no creditworthiness use) all hold, as documented in `PRIVACY.md`.

---

## 5. Screenshots (required: at least one at 1280×800, max 5)

| # | Shot | What to show |
| --- | --- | --- |
| 1 | Popup | Per-site toggle ON, `globalEnabled` ON, exclusion list visible on a real domain. |
| 2 | Options → Timers & Speed Hack | Timer interception toggle, execution strategy (`Instant` ≈25 ms floor), delay window. |
| 3 | Options → Overlays & Auto-Click | Overlay suppression plus the opt-in auto-click switch and its safety notes. |
| 4 | Options → Backups / Excluded Sites | Export/import controls and the exclusion manager. |
| 5 | Before/after on a gate page | Countdown gate counting down vs. button already revealed (blur any real URL). |

Optional promo tile: 440×280. Store icon `icons/icon128.png` is already 128×128 RGBA.

---

## 6. Versioning and packaging

```bash
# 1. Bump "version" in manifest.json (semver). Use 1.0.1+ if 1.0.0 was ever uploaded,
#    because timer behaviour changed in the gate-scoping fix.
# 2. Verify the build:
node test/content-guards.test.js
node test/injected-guards.test.js
for f in src/*.js test/*.js; do node --check "$f"; done
# 3. Package runtime files only (exclude test/, specs/, *.md, .git/):
zip -r hurry-up-<version>.zip manifest.json icons src -x "*.DS_Store"
```

Confirm the archive contains exactly `manifest.json`, `icons/*`, and `src/*` before
uploading.

---

## 7. Reviewer test instructions (paste into "Notes for reviewers")

```
No login, no account, no network access required.

1. Automated evidence (Node, no dependencies):
   node test/content-guards.test.js
   node test/injected-guards.test.js
   Both print "ALL CHECKS PASSED". The suites assert that ordinary pages keep native
   timers, that hidden controls are never force-revealed, and that a real gate page
   still unlocks and clicks exactly once.

2. Manual reproduction:
   - Open test/mock-timer-page.html from the unpacked extension's folder
     (enable "Allow access to file URLs", or serve it with `python3 -m http.server`).
   - Test 1: a 10s setTimeout gate resolves immediately and (with auto-click on) the
     revealed button is clicked.
   - Test 5 (regression): a collapsed menu containing "Download chat transcript" stays
     hidden and is never clicked.

3. Behaviour note: timer acceleration is scoped to pages that look like a countdown
   gate. Surfaces such as video search results therefore keep native timing by design;
   no permission is used to read or transmit page content.
```

---

## 8. Remaining manual steps before upload

- [ ] Publish `PRIVACY.md` at a public URL and paste it into the listing (required).
- [ ] Capture the 1280×800 screenshots from §5 (a real browser is required).
- [ ] Bump `manifest.json` `version` if `1.0.0` has already been uploaded anywhere.
- [ ] Build `hurry-up-<version>.zip` with the command in §6 and inspect its contents.
- [ ] Upload, fill in the copy from §1–§4, and paste §7 into the reviewer notes.

