# Tasks: Hurry Up Timer Skipper Extension

## Phase 1: Setup & Core Infrastructure
- [X] T001 Initialize directory structure (`icons/`, `src/`, `test/`) in root workspace
- [X] T002 Generate extension icons (`icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`)
- [X] T003 Create `src/storage.js` with settings schema, default configuration, and import/export validator
- [X] T004 Create `manifest.json` with MV3 declarative content scripts (`MAIN` & `ISOLATED` worlds) and options page

## Phase 2: Foundational & Service Worker
- [X] T005 Implement `src/background.js` for initial storage configuration, badge status (`OFF` badge), and tab updates

## Phase 3: User Story 1 - Timer Interception & Network Interceptor (P1)
- [X] T006 Implement `src/injected.js` (MAIN world) to override `setTimeout`, `setInterval`, `fetch`, and `XMLHttpRequest` with native cloaking
- [X] T007 Implement communication bridge in `src/content.js` to pass active domain exclusion status to `injected.js`

## Phase 4: User Story 2 - DOM Overlays & Safe Auto-Clicker (P1)
- [X] T008 Implement `src/content.css` for aggressive timer backdrop and countdown overlay suppression
- [X] T009 Implement `src/content.js` DOM observer (`MutationObserver`), timer detector, and safe auto-clicker

## Phase 5: User Story 3 - Per-Site Disabling & Quick-Access Popup (P2)
- [X] T010 Build `src/popup.html` and `src/popup.css` for active domain status, quick toggles, and options link
- [X] T011 Build `src/popup.js` to manage per-site toggle and persist changes to `chrome.storage.sync`

## Phase 6: User Story 4 - Tab-Based Options & Settings Dashboard (P2)
- [X] T012 Build `src/options.html` and `src/options.css` with 5-tab layout (Timers, Network, Excluded Sites, Overlays/Clicker, Backup/Restore)
- [X] T013 Implement `src/options.js` for tab navigation, exclusions management, and JSON backup export/import

## Phase 7: Verification & Testing
- [X] T014 Build `test/mock-timer-page.html` simulating `setTimeout`, `setInterval`, delayed `fetch` calls, and overlays
- [X] T015 Verify extension files, run syntax/lint checks, and test settings import/export validation

## Phase 8: Safety Hardening & Open-Source Readiness
- [X] T016 Fix unwanted auto-click/auto-download on non-gate pages: add countdown-gate detection (`hasDownloadGateSignal`) and gate the unlocker/auto-clicker behind it (FR-4.4)
- [X] T017 Add strict `isElementClickable()` checks so hidden, disabled, `aria-hidden`, `display:none`, or zero-size controls are never force-opened or clicked (FR-4.5)
- [X] T018 Make auto-clicking opt-in (`autoClickSettings.autoClick: false`) and drop generic keywords ("continue", "proceed") from the defaults; add `autoClickSettings.gateDetection` (FR-4.6)
- [X] T019 Narrow `unlockDownloadButtons()` to download-intent controls only (remove `button[disabled]`, `a[disabled]`, `[aria-disabled='true']`, `.is-hidden` from the selector) and memoize the `REAL_URL` script scan
- [X] T020 Restrict `src/content.css` to extension-namespaced classes (`hurry-up-*`) so the stylesheet no longer hides site-specific ids on unrelated pages
- [X] T021 Expose the gate-detection switch in the options dashboard and correct the popup auto-click default
- [X] T022 Add `test/content-guards.test.js` (dependency-free Node DOM sandbox) covering the regression, and add Test 5 to the mock harness
- [X] T023 Repair malformed markup/script ordering in `test/mock-timer-page.html` so Tests 3–4 bind correctly
- [X] T024 Add open-source files: `LICENSE` (MIT), `PRIVACY.md`, `CONTRIBUTING.md`, `.gitignore`, and rewrite `README.md` (features, settings reference, testing, Web Store checklist)


