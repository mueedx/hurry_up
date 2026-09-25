/**
 * Hurry Up! - Content script guard regression tests
 *
 * Dependency-free: runs src/content.js inside a tiny DOM sandbox (no jsdom / puppeteer
 * required) and asserts the behaviour that fixes the "unwanted automatic download"
 * bug reported on ordinary websites such as chat applications:
 *
 *   1. A page with no countdown gate is never mutated or auto-clicked.
 *   2. A closed / hidden download control is never force-unlocked in order to be clicked.
 *   3. A real countdown gate page still unlocks and auto-clicks its download button.
 *   4. Auto-clicking stays inert while the opt-in setting is off.
 *   5. Ordinary and busy client-rendered sites (video search results, dashboards) never
 *      arm the MAIN-world timer patching, so their timers stay fully native.
 *   6. A real gate page *does* arm it, and opting out of gate detection arms it too.
 *
 * Usage:  node test/content-guards.test.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const storage = require(path.join(__dirname, "..", "src", "storage.js"));
const CONTENT_SCRIPT_PATH =
  process.env.HURRY_UP_CONTENT_SCRIPT || path.join(__dirname, "..", "src", "content.js");
const CONTENT_SCRIPT = fs.readFileSync(CONTENT_SCRIPT_PATH, "utf8");

/* ------------------------------------------------------------------ *
 * Minimal DOM shim (only what src/content.js touches)
 * ------------------------------------------------------------------ */

function splitSelectors(list) {
  const out = [];
  let depth = 0;
  let current = "";
  for (const ch of list) {
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current);
  return out;
}

function matchSimple(el, selector) {
  const sel = selector.trim();
  if (!sel) return false;

  const tag = (sel.match(/^[a-zA-Z][a-zA-Z0-9-]*/) || [null])[0];
  if (tag && el.tagName !== tag.toUpperCase()) return false;

  const id = (sel.match(/#([\w-]+)/) || [null, null])[1];
  if (id && el.id !== id) return false;

  for (const m of sel.matchAll(/\.([\w-]+)/g)) {
    if (!el.classList.contains(m[1])) return false;
  }

  for (const m of sel.matchAll(/\[([\w-]+)(?:(\*?=)\s*['"]?([^'"\]]*?)['"]?\s*(i)?)?\]/g)) {
    const name = m[1];
    const op = m[2];
    const value = m[3];
    const flag = m[4];
    const actual = el.getAttribute(name);
    if (actual === null) return false;
    if (op === "=" && (flag ? actual.toLowerCase() !== value.toLowerCase() : actual !== value)) return false;
    if (op === "*=" && (flag ? !actual.toLowerCase().includes(value.toLowerCase()) : !actual.includes(value))) return false;
  }

  return true;
}

function matches(el, selectorList) {
  return splitSelectors(selectorList).some((sel) => matchSimple(el, sel));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function settingsWith(patch) {
  const settings = JSON.parse(JSON.stringify(storage.DEFAULT_SETTINGS));
  if (patch && patch.autoClickSettings) {
    Object.assign(settings.autoClickSettings, patch.autoClickSettings);
  }
  return settings;
}

function makeEl(options = {}) {
  const attrs = Object.assign({}, options.attrs);
  let hiddenAttr = !!options.hidden;

  const el = {
    tagName: (options.tag || "DIV").toUpperCase(),
    id: options.id || "",
    isConnected: true,
    disabled: !!options.disabled,
    parent: null,
    children: [],
    clicked: 0,
    onClick: options.onClick || null,
    _text: options.text || "",
    _classes: new Set((options.className || "").split(/\s+/).filter(Boolean)),
    _style: Object.assign(
      { display: "block", visibility: "visible", pointerEvents: "auto", opacity: "1" },
      options.style
    ),
    _rect: Object.assign({ width: 120, height: 24 }, options.rect),
  };

  Object.defineProperty(el, "className", {
    get: () => [...el._classes].join(" "),
  });

  Object.defineProperty(el, "style", {
    get: () => el._style,
  });

  el.classList = {
    add: (...names) => names.forEach((n) => el._classes.add(n)),
    remove: (...names) => names.forEach((n) => el._classes.delete(n)),
    contains: (n) => el._classes.has(n),
    toString: () => [...el._classes].join(" "),
  };

  el.getAttribute = (name) => {
    if (name === "hidden") return hiddenAttr ? "" : null;
    return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
  };
  el.setAttribute = (name, value) => {
    if (name === "hidden") {
      hiddenAttr = true;
      return;
    }
    attrs[name] = String(value);
  };
  el.removeAttribute = (name) => {
    if (name === "hidden") {
      hiddenAttr = false;
      return;
    }
    delete attrs[name];
  };
  el.hasAttribute = (name) => el.getAttribute(name) !== null;

  Object.defineProperty(el, "textContent", {
    get: () => el._text + el.children.map((c) => c.textContent).join(" "),
  });
  Object.defineProperty(el, "innerText", {
    get: () => el.textContent,
  });

  el.getBoundingClientRect = () => Object.assign({ top: 0, left: 0, x: 0, y: 0 }, el._rect);
  // Faithful-enough rendering state: a hidden element reports 0x0 like a real browser does.
  const isRendered = () => !hiddenAttr && el._style.display !== "none" && el._style.visibility === "visible";
  Object.defineProperty(el, "offsetWidth", { get: () => (isRendered() ? el._rect.width : 0) });
  Object.defineProperty(el, "offsetHeight", { get: () => (isRendered() ? el._rect.height : 0) });
  el.checkVisibility = () => isRendered();
  el.closest = (selectorList) => {
    let node = el;
    while (node) {
      if (matches(node, selectorList)) return node;
      node = node.parent;
    }
    return null;
  };
  el.matches = (selectorList) => matches(el, selectorList);
  el.click = () => {
    el.clicked++;
    if (typeof el.onClick === "function") el.onClick(el);
  };
  el.appendChild = (child) => {
    child.parent = el;
    el.children.push(child);
    return child;
  };

  return el;
}



function createPage(elements, settings, options = {}) {
  const registry = [...elements];
  const body = makeEl({ tag: "BODY" });

  for (const el of registry) {
    if (!el.parent) body.appendChild(el);
  }

  // Text-node stand-in so the content script's TreeWalker text sampling works here.
  const textNode = (owner) => ({
    nodeValue: owner.textContent,
    parentElement: owner,
  });

  const documentStub = {
    body,
    title: options.title || "Some page - Example",
    readyState: "complete",
    getElementById: (id) => registry.find((el) => el.id === id) || null,
    querySelector: (selectorList) => registry.find((el) => matches(el, selectorList)) || null,
    querySelectorAll: (selectorList) => registry.filter((el) => matches(el, selectorList)),
    createTreeWalker: (root) => {
      const nodes = [textNode(root)];
      let index = 0;
      return {
        nextNode: () => (index < nodes.length ? nodes[index++] : null),
      };
    },
    addEventListener: () => {},
  };

  const dispatchedEvents = [];
  const listeners = {};

  const windowStub = {
    location: { hostname: "example.test" },
    dispatchEvent: (event) => {
      dispatchedEvents.push(event);
      for (const listener of listeners[event.type] || []) listener(event);
      return true;
    },
    addEventListener: (type, listener) => {
      listeners[type] = (listeners[type] || []).concat(listener);
    },
    getComputedStyle: (el) => el._style,
    HurryUpStorage: {
      DEFAULT_SETTINGS: storage.DEFAULT_SETTINGS,
      getStoredSettings: async () => JSON.parse(JSON.stringify(settings)),
      isDomainDisabled: storage.isDomainDisabled,
      incrementStat: () => {},
    },
  };

  const sandbox = {
    window: windowStub,
    document: documentStub,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    MutationObserver: class MutationObserver {
      observe() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
    WeakSet,
    Set,
    Date,
    JSON,
    Math,
    Number,
    parseFloat,
    Object,
    Array,
    String,
    RegExp,
    Promise,
  };
  sandbox.window.window = windowStub;
  sandbox.window.document = documentStub;
  sandbox.globalThis = sandbox;

  return {
    sandbox,
    body,
    // Latest MAIN-world config the content script published (what src/injected.js acts on).
    latestConfig: () => {
      const syncs = dispatchedEvents.filter((e) => e.type === "__HURRY_UP_CONFIG_SYNC__");
      return syncs.length ? syncs[syncs.length - 1].detail : null;
    },
  };
}

async function loadContentScript(sandbox) {
  const context = vm.createContext(sandbox);
  vm.runInContext(CONTENT_SCRIPT, context, { filename: "src/content.js" });
  await wait(30);
}

let failures = 0;
function check(label, condition, extra) {
  if (condition) {
    console.log(`  \u2713 ${label}`);
  } else {
    failures++;
    console.log(`  \u2717 ${label}${extra ? ` -> ${extra}` : ""}`);
  }
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

async function testOrdinaryPageIsLeftAlone() {
  console.log("\nOrdinary page (e.g. a chat app) - must stay untouched:");

  const hiddenMenu = makeEl({ tag: "DIV", id: "chat-action-menu", hidden: true, style: { display: "none" } });
  const exportBtn = makeEl({
    tag: "BUTTON",
    id: "export-chat-btn",
    className: "btn",
    text: "Download chat transcript",
    hidden: true,
    style: { display: "none" },
  });
  const lockedLink = makeEl({
    tag: "A",
    id: "dlBtn",
    className: "is-hidden",
    text: "Download",
    style: { display: "none" },
  });
  // Mirrors a chat app's collapsed "Download as .txt" menu entry: hidden by class
  // and display:none, never rendered until the user opens the menu.
  const menuItem = makeEl({
    tag: "A",
    className: "download-item is-hidden",
    text: "Download as .txt",
    attrs: { "aria-hidden": "true" },
    style: { display: "none" },
  });
  hiddenMenu.appendChild(exportBtn);

  const { sandbox, latestConfig } = createPage(
    [hiddenMenu, exportBtn, lockedLink, menuItem],
    settingsWith({ autoClickSettings: { autoClick: true } })
  );
  await loadContentScript(sandbox);
  await wait(500);

  check("hidden 'Download chat transcript' control is not clicked", exportBtn.clicked === 0, `clicked=${exportBtn.clicked}`);
  check("hidden control keeps its hidden attribute", exportBtn.hasAttribute("hidden"));
  check("hidden control keeps display:none", exportBtn._style.display === "none");
  check("is-hidden download control is not force-unlocked", lockedLink.classList.contains("is-hidden"));
  check("is-hidden download control keeps display:none", lockedLink._style.display === "none");
  check("collapsed 'Download as .txt' menu entry keeps is-hidden", menuItem.classList.contains("is-hidden"));
  check("collapsed 'Download as .txt' menu entry keeps display:none", menuItem._style.display === "none");
  check("collapsed 'Download as .txt' menu entry is not clicked", menuItem.clicked === 0, `clicked=${menuItem.clicked}`);

  const config = latestConfig();
  check("ordinary page never arms the MAIN-world timer warping", !!config && config.enabled === false, `enabled=${config && config.enabled}`);
}

async function testVisibleButtonWithoutGateIsNotClicked() {
  console.log("\nVisible download button but no countdown gate - must not be clicked:");

  const button = makeEl({ tag: "BUTTON", id: "download-report", text: "Download" });
  const { sandbox, latestConfig } = createPage([button], settingsWith({ autoClickSettings: { autoClick: true } }));
  await loadContentScript(sandbox);
  await wait(500);

  check("keyword-matched button on a non-gate page is ignored", button.clicked === 0, `clicked=${button.clicked}`);

  const config = latestConfig();
  check("non-gate page leaves page timers native", !!config && config.enabled === false, `enabled=${config && config.enabled}`);
}

async function testBusyClientRenderedSiteStaysDisarmed() {
  console.log("\nBusy client-rendered site (video search results) - timers must stay native:");

  const title = makeEl({ tag: "DIV", className: "video-title", text: "mansoor ali khan" });
  const row = makeEl({ tag: "DIV", className: "video-row", text: "Mere Rashke Qamar 3:45 | 12:03" });
  const row2 = makeEl({ tag: "DIV", className: "video-row", text: "Tumhe Dillagi 4:12" });
  const playerTimer = makeEl({ tag: "DIV", className: "ytp-timer", text: "12:03" });
  const premiereCountdown = makeEl({ tag: "DIV", id: "countdown", text: "Premieres in 2 hours" });
  const menuItem = makeEl({
    tag: "A",
    className: "download-item is-hidden",
    text: "Download",
    style: { display: "none" },
  });

  const { sandbox, latestConfig } = createPage(
    [title, row, row2, playerTimer, premiereCountdown, menuItem],
    settingsWith({ autoClickSettings: { autoClick: true } }),
    { title: "mansoor ali khan - VideoSite" }
  );
  await loadContentScript(sandbox);
  await wait(600);

  const config = latestConfig();
  check("durations and video titles do not arm timer warping", !!config && config.enabled === false, `enabled=${config && config.enabled}`);
  check("video player timecode is never treated as a gate", !playerTimer.classList.contains("hurry-up-hidden-overlay"));
  check("premiere countdown is never treated as a gate", !premiereCountdown.classList.contains("hurry-up-hidden-overlay"));
  check("collapsed download menu entry stays hidden", menuItem._style.display === "none");
}

async function testLooseWaitCopyIsNotAGate() {
  console.log("\nLoading spinner copy ('Please wait...') with no countdown - must stay disarmed:");

  const spinner = makeEl({ tag: "DIV", className: "spinner", text: "Please wait while we load your dashboard" });
  const { sandbox, latestConfig } = createPage(
    [spinner],
    settingsWith({ autoClickSettings: { autoClick: true } }),
    { title: "Please wait - Dashboard" }
  );
  await loadContentScript(sandbox);
  await wait(500);

  const config = latestConfig();
  check("'please wait' without a countdown does not arm timer warping", !!config && config.enabled === false, `enabled=${config && config.enabled}`);
}

async function testGateDetectionOptOutArmsEverything() {
  console.log("\nGate detection switched off by the user - acceleration is allowed everywhere:");

  const button = makeEl({ tag: "BUTTON", id: "dlBtn", text: "Download", style: { display: "none" } });
  const { sandbox, latestConfig } = createPage(
    [button],
    settingsWith({ autoClickSettings: { autoClick: false, gateDetection: false } })
  );
  await loadContentScript(sandbox);
  await wait(500);

  const config = latestConfig();
  check("opt-out of gate detection arms timer warping immediately", !!config && config.enabled === true, `enabled=${config && config.enabled}`);
  check("gate detection is still on by default", storage.DEFAULT_SETTINGS.autoClickSettings.gateDetection === true);
}

async function testGatePageStillWorks() {
  console.log("\nCountdown gate page - unlock + auto-click must still work:");

  const gate = makeEl({
    tag: "DIV",
    id: "please-wait-modal",
    text: "\u26a0\ufe0f Please wait 10 seconds before downloading...",
  });
  const gateMsg = makeEl({ tag: "DIV", id: "gateMsg", text: "Your download will begin shortly" });
  const downloadBtn = makeEl({
    tag: "BUTTON",
    id: "dlBtn",
    className: "is-hidden",
    text: "Download",
    style: { display: "none" },
  });

  const { sandbox, latestConfig } = createPage(
    [gate, gateMsg, downloadBtn],
    settingsWith({ autoClickSettings: { autoClick: true } })
  );
  await loadContentScript(sandbox);
  await wait(500);

  check("gate page download button is unlocked (is-hidden removed)", !downloadBtn.classList.contains("is-hidden"));
  check("gate page download button is revealed", downloadBtn._style.display !== "none");
  check("gate message overlay is suppressed", gateMsg.classList.contains("hurry-up-hidden-overlay"));
  check("download button is auto-clicked exactly once", downloadBtn.clicked === 1, `clicked=${downloadBtn.clicked}`);

  const config = latestConfig();
  check("gate page arms the MAIN-world timer warping", !!config && config.enabled === true, `enabled=${config && config.enabled}`);
}

async function testAutoClickOptIn() {
  console.log("\nAuto-click is opt-in - nothing is clicked while the setting is off:");

  const gate = makeEl({ tag: "DIV", id: "please-wait-modal", text: "Please wait 5 seconds" });
  const downloadBtn = makeEl({ tag: "BUTTON", id: "downloadBtn", text: "Download", style: { display: "none" } });

  const { sandbox } = createPage([gate, downloadBtn], settingsWith({ autoClickSettings: { autoClick: false } }));
  await loadContentScript(sandbox);
  await wait(500);

  check("auto-click default is off", storage.DEFAULT_SETTINGS.autoClickSettings.autoClick === false);
  check("nothing is clicked when auto-click is off", downloadBtn.clicked === 0, `clicked=${downloadBtn.clicked}`);
}

(async () => {
  await testOrdinaryPageIsLeftAlone();
  await testVisibleButtonWithoutGateIsNotClicked();
  await testGatePageStillWorks();
  await testAutoClickOptIn();
  await testBusyClientRenderedSiteStaysDisarmed();
  await testLooseWaitCopyIsNotAGate();
  await testGateDetectionOptOutArmsEverything();

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();

