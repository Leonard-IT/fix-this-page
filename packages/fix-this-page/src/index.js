// Entry of fixthis.js, the small loader a site includes. It is meant to stay on production pages, so on its own it
// only installs the switches; the full overlay (fixthis-overlay.js) is added to the page the first time one is used:
// ?fix in the address, window.fixthis.open(), or the corner button when the script tag has data-launcher.
// There is no keyboard shortcut, as every visitor of the site would have it. Feedback stays in the visitor's browser.
const { OVERLAY_FILE, OVERLAY_GLOBAL } = require('./handoff.js');

// The build replaces FIXTHIS_OVERLAY_INTEGRITY with the SRI hash of the full overlay it built alongside,
// so a loader pinned with its own integrity hash also pins the code it loads
const OVERLAY_INTEGRITY = FIXTHIS_OVERLAY_INTEGRITY;
const OPEN_FLAG_KEY = 'fixthis:open';
const QUERY_FLAG = 'fix';
// A shared feedback link (share-link.js) opens the overlay too; the loader only checks the prefix, to stay small
const SHARED_FEEDBACK_HASH = '#fix=';
const LAUNCHER_ATTR = 'data-launcher';
const ID_BYTES = 9;
const ID_RADIX = 36;
const LAUNCHER_CSS = 'position:fixed;right:16px;bottom:16px;z-index:2147483646;width:40px;height:40px;border-radius:50%;'
  + 'border:2px solid #0A0A0A;background:#FFE14D;color:#0A0A0A;font:700 18px system-ui,sans-serif;cursor:pointer;'
  + 'box-shadow:3px 3px 0 #0A0A0A;';

install(window, document.currentScript);

function install(win, script) {
  if (win.fixthis) return; // the script was included twice
  const overlaySrc = overlayUrl(script);
  const launcher = script && script.hasAttribute(LAUNCHER_ATTR) ? createLauncher(win.document, open) : null;
  let overlay = null; // created once the full overlay has loaded
  let loading = null;
  let wantsOpen = false;
  win.fixthis = Object.freeze({ open, close, toggle });
  whenReady(win.document, () => {
    if (launcher) win.document.documentElement.appendChild(launcher);
    if (shouldOpenOnLoad(win)) open();
  });

  function open() {
    wantsOpen = true;
    rememberOpen(win, true);
    if (launcher) launcher.hidden = true;
    withOverlay((ready) => { if (wantsOpen) ready.open(); });
  }

  function close() {
    wantsOpen = false;
    if (overlay) overlay.close();
    rememberOpen(win, false);
    if (launcher) launcher.hidden = false;
  }

  function toggle() {
    if (wantsOpen) close();
    else open();
  }

  // Switching it off while the full overlay is still loading wins: `use` checks wantsOpen again
  function withOverlay(use) {
    if (overlay) return use(overlay);
    loading = loading || loadOverlay(win, overlaySrc);
    loading.then((createOverlay) => {
      overlay = overlay || createOverlay({
        win,
        storage: win.localStorage,
        now: () => new Date(),
        createId: () => randomId(win),
        onClose: close,
      });
      use(overlay);
    }).catch((error) => {
      loading = null; // a later attempt may succeed, for example after a network hiccup
      close(); // otherwise every following page load in this tab would try again
      win.console.error(error);
    });
  }
}

function overlayUrl(script) {
  if (!script || !script.src) return null;
  return new URL(OVERLAY_FILE, script.src).href;
}

/** Adds the full overlay to the page and answers its factory. */
function loadOverlay(win, src) {
  const loaded = win[OVERLAY_GLOBAL];
  if (loaded) return Promise.resolve(loaded.createOverlay);
  if (!src) return Promise.reject(new Error('fixthis: include fixthis.js with a src, so it can find ' + OVERLAY_FILE));
  return new Promise((resolve, reject) => {
    const tag = win.document.createElement('script');
    tag.src = src;
    tag.integrity = OVERLAY_INTEGRITY;
    tag.crossOrigin = 'anonymous'; // the integrity check needs CORS when the files come from a CDN
    tag.addEventListener('load', () => {
      if (win[OVERLAY_GLOBAL]) resolve(win[OVERLAY_GLOBAL].createOverlay);
      else reject(new Error('fixthis: ' + src + ' loaded but did not start'));
    });
    tag.addEventListener('error', () => reject(new Error('fixthis: could not load ' + src)));
    win.document.head.appendChild(tag);
  });
}

// Stays open across page loads in the same tab, so following a link does not switch it off
function shouldOpenOnLoad(win) {
  return new URLSearchParams(win.location.search).has(QUERY_FLAG) || win.location.hash.startsWith(SHARED_FEEDBACK_HASH) || readOpenFlag(win);
}

function readOpenFlag(win) {
  try {
    return win.sessionStorage.getItem(OPEN_FLAG_KEY) === '1';
  } catch {
    return false; // storage can be blocked; the overlay then simply starts closed
  }
}

function rememberOpen(win, isOpen) {
  try {
    if (isOpen) win.sessionStorage.setItem(OPEN_FLAG_KEY, '1');
    else win.sessionStorage.removeItem(OPEN_FLAG_KEY);
  } catch {
    // storage can be blocked; only remembering the state across page loads is lost
  }
}

function createLauncher(doc, open) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.setAttribute('data-fb', '');
  button.title = 'Give feedback on this page';
  button.setAttribute('aria-label', button.title);
  button.textContent = '✎';
  button.style.cssText = LAUNCHER_CSS;
  button.addEventListener('click', open);
  return button;
}

function whenReady(doc, run) {
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}

// getRandomValues also works outside a secure context, unlike crypto.randomUUID (plain http on a LAN address)
function randomId(win) {
  const bytes = win.crypto.getRandomValues(new Uint8Array(ID_BYTES));
  return Array.from(bytes, (b) => b.toString(ID_RADIX).padStart(2, '0')).join('');
}
