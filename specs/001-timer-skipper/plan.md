# Architecture Plan: Hurry Up Timer Skipper Extension

**Branch**: `main`  
**Feature Spec**: `specs/001-timer-skipper/spec.md`  
**Status**: Ready for Implementation

---

## 1. Technical Context & Decisions

- **Extension Format**: Google Chrome Manifest V3.
- **Execution Worlds**:
  - `MAIN` execution world: For `injected.js` to patch page primitives (`window.setTimeout`, `window.setInterval`, `window.fetch`, `window.XMLHttpRequest`).
  - `ISOLATED` execution world: For `content.js` to query Chrome storage, inspect DOM mutations via `MutationObserver`, safely click validated download triggers, and bridge config to the page.
- **Background Worker**: `background.js` (MV3 Service Worker) for default settings setup, badge status sync (`OFF` indicator for excluded domains), and storage events.
- **Storage Strategy**: `chrome.storage.sync` with automatic fallback to `chrome.storage.local`.
- **Options UI**: Full-page tabbed settings view (`options_ui.open_in_tab: true`) with JSON export/import validation.

---

## 2. Research & Technical Findings

1. **MAIN World Injection**: Chrome 111+ supports `"world": "MAIN"` in `manifest.json` under `content_scripts`. This allows early, transparent patching of `setTimeout` before webpage scripts execute without requiring inline script tag tricks.
2. **Cloaking Native Overrides**:
   ```javascript
   function cloak(fn, original) {
     fn.toString = () => original.toString();
     Object.defineProperty(fn, 'name', { value: original.name, configurable: true });
     return fn;
   }
   ```
3. **Safe Auto-Clicker**:
   Must ignore ad slots (`ins.adsbygoogle`, elements containing suspicious affiliate query parameters, and iframe overlays) and enforce a minimum settling delay (default 200ms) to ensure page event listeners are active.
