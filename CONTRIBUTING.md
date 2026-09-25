# Contributing to Hurry Up!

Thanks for helping improve Hurry Up! This project is a zero-dependency,
build-step-free Manifest V3 extension: the files in `src/` are exactly what Chrome
loads.

## Ground rules

1. **Privacy first.** No network calls from extension code, no analytics, no
   remote resources, no third-party scripts, no `eval`/`new Function`. Manifest V3
   forbids remote code and the project will not accept it.
2. **Minimal permissions.** Do not add a permission or host permission unless it is
   strictly required and explained in the pull request. `storage` + `activeTab` are
   the only permissions today.
3. **Do not break other websites.** Anything that mutates page state (unlocking
   controls, clicking, hiding overlays) must be conservative, gated by the download
   gate heuristic, and must never touch controls that are disabled, hidden, or
   aria-hidden.
4. **No new dependencies.** The extension has no `package.json`, no bundler, and no
   runtime libraries. Plain browser JavaScript only (`const`/`let`, async/await,
   template literals are all fine).

## Project layout

```text
manifest.json               MV3 manifest (permissions, content scripts, popup, options)
src/injected.js             MAIN-world hooks: setTimeout/setInterval/rAF/fetch/XHR
src/storage.js              Defaults, schema validation, get/save, domain exclusions
src/content.js              ISOLATED world: gate detection, overlay suppression, safe auto-click
src/background.js           Service worker: badge state
src/popup.*                 Quick toggles + stats
src/options.*               Full dashboard (timers, network, exclusions, DOM, backup)
test/mock-timer-page.html   Manual browser test bench
test/content-guards.test.js Automated guard regression tests (Node, no deps)
specs/001-timer-skipper/    Feature spec, plan, tasks
```

## Local development

1. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and
   select the repository root.
2. After editing `src/*`, click the reload icon on the extension card.
3. Open the test bench (`test/mock-timer-page.html`) with "Allow access to file URLs"
   enabled to exercise timers, overlays, network hooks, and auto-clicking.
4. Reload the page under test after changing settings — content scripts read settings
   at `document_start`.

## Automated checks

Run the guard regression suite before opening a pull request:

```bash
node test/content-guards.test.js
```

It executes `src/content.js` inside a minimal in-repo DOM sandbox and asserts that:

- ordinary pages (chat apps, dashboards) are never mutated or auto-clicked,
- a closed/hidden download control is never force-unlocked, and
- a real countdown gate page still unlocks and clicks its download button.

Syntax check for every script:

```bash
for f in src/*.js test/*.js; do node --check "$f"; done
```

If you intentionally change behaviour, add or update a check in
`test/content-guards.test.js` so the change is covered.

## Coding conventions

- 2-space indentation, double quotes, semicolons.
- JSDoc-style comment blocks above each function explaining intent and safety
  implications; keep the existing `// Safe silent catch`-style guards for orphaned
  extension contexts.
- Settings changes require three edits: `DEFAULT_SETTINGS` **and** `validateSettings`
  in `src/storage.js`, plus the UI in `src/options.html` / `src/options.js` (and
  `src/popup.html` / `src/popup.js` if it is a quick toggle).
- Never assume `chrome.*` is available — content scripts must keep working after the
  extension is reloaded (guard with `isAlive()` / `isExtensionContextValid()`).
- When adding a page-mutating behaviour, prefer extension-namespaced classes
  (`hurry-up-*`) over inline styles or site-specific selectors.

## Reporting bugs

Please include:

- Browser and version, extension version, and OS
- The exact page URL (or a minimal reproduction) and the steps you took
- Whether the site is excluded, and whether auto-clicking is enabled
- Console errors from the page and from the extension's service worker
  (`chrome://extensions` → **Inspect views: service worker**)

For an unwanted click/download on a site that is *not* a countdown gate, say so
explicitly — that is treated as a safety bug and is the highest priority class of fix.

## Pull requests

- Keep the diff focused; one behaviour change per PR.
- Update `README.md`, `PRIVACY.md`, and the spec in `specs/` when user-visible
  behaviour or defaults change.
- Describe how you tested it (automated suite + the manual test bench).
