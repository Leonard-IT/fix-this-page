// The overlay on a live page: the annotation layer from the snapshot editor, a dock with the items, and a store
// in the browser. It makes no network requests; prompts, links and files go to the clipboard or a download.
const { attach, isDone } = require('./core/annotator.js');
const { renderPrompt } = require('./core/render.js');
const { createStore, ANNOTATION_STATUS } = require('./store.js');
const { toPcf } = require('./core/pcf.js');
const { anchorsOn, newPageLinks } = require('./core/site-links.js');
const { readFeedbackFile } = require('./pcf.js');
const { createDock, DOCK_ACTION } = require('./dock.js');
const { shareUrl, hasSharedFeedback, readSharedFeedback, isComfortableLength } = require('./share-link.js');

// Frameworks re-render in bursts; wait for the page to settle before showing the items again
const SETTLE_MS = 300;
const NAVIGATE_EVENT = 'fixthis:navigate';
const MIME = Object.freeze({ Json: 'application/json' });
const FILE_NAME = Object.freeze({ ExportSuffix: '.pagechange.json', SiteFallback: 'page' });
const WWW_PREFIX = /^www\./;
// Hostnames are safe in file names, except an IPv6 address's brackets and colons
const UNSAFE_FILE_CHARS = /[^a-z0-9.-]+/g;
const JSON_INDENT = 2;
const GENERATOR = Object.freeze({ name: 'fix-this-page' });
const OBSERVED_CHANGES = Object.freeze({ childList: true, characterData: true, subtree: true });

/**
 * @param {{ win: Window, storage: Storage, now: () => Date, createId: () => string, onClose: () => void }} deps
 */
function createOverlay({ win, storage, now, createId, onClose }) {
  const doc = win.document;
  const store = createStore({ storage, site: win.location.origin, now, createId });
  let session = null; // { annotator, dock, observer, settleTimer, path, stopListening }

  return { open, close, isOpen: () => Boolean(session) };

  function open() {
    if (session) return;
    const annotator = attach(doc, { save, replace, onSaved: renderDock, onPinClick: (id) => session.dock.flash(id), notify });
    const dock = createDock(doc, onDockAction, importFile);
    session = { annotator, dock, observer: null, settleTimer: null, path: currentPath(), stopListening: null };
    session.observer = new win.MutationObserver(onPageMutation);
    session.stopListening = listenForNavigation();
    showPage();
    if (hasSharedFeedback(win.location.hash)) openSharedFeedback();
  }

  function close() {
    if (!session) return;
    clearTimeout(session.settleTimer);
    session.observer.disconnect();
    session.stopListening();
    session.annotator.detach();
    session.dock.remove();
    session = null;
  }

  // ---------- showing the items ----------
  function showPage() {
    pauseObserver(() => session.annotator.showAnnotations(store.annotationsFor(session.path)));
    renderDock();
  }

  function renderDock() {
    const all = store.session().annotations;
    const isOpenItem = (a) => !isDone(a);
    session.dock.render({
      pagePath: session.path,
      items: all.filter((a) => a.pageId === session.path),
      openCount: all.filter(isOpenItem).length,
      pages: pagesWithOpenItems(all.filter(isOpenItem), session.path),
      linkedPages: linkedPagesWithoutFeedback(all),
    });
  }

  // A click on the page makes an item instead of following the link, so the dock offers the pages this one links to
  function linkedPagesWithoutFeedback(annotations) {
    const knownPaths = annotations.map((a) => a.pageId);
    // Items are kept per path, so the address's query (?fix among others) is not part of the current page
    return newPageLinks(anchorsOn(doc), { pageUrl: win.location.origin + session.path, knownPaths });
  }

  // Our own changes to the page must not count as the site re-rendering
  function pauseObserver(work) {
    session.observer.disconnect();
    try {
      work();
    } finally {
      session.observer.takeRecords();
      session.observer.observe(doc.body, OBSERVED_CHANGES);
    }
  }

  function onPageMutation(records) {
    if (!records.some(isSiteChange)) return;
    scheduleShowPage();
  }

  function scheduleShowPage() {
    clearTimeout(session.settleTimer);
    session.settleTimer = setTimeout(showPageWhenIdle, SETTLE_MS);
  }

  function showPageWhenIdle() {
    if (!session) return;
    if (session.annotator.isBusy()) return scheduleShowPage();
    session.path = currentPath();
    showPage();
  }

  function listenForNavigation() {
    patchHistoryOnce(win);
    const onNavigate = () => { if (currentPath() !== session.path) scheduleShowPage(); };
    win.addEventListener('popstate', onNavigate);
    win.addEventListener(NAVIGATE_EVENT, onNavigate);
    return () => {
      win.removeEventListener('popstate', onNavigate);
      win.removeEventListener(NAVIGATE_EVENT, onNavigate);
    };
  }

  function currentPath() {
    return win.location.pathname;
  }

  // ---------- saving ----------
  async function save(draft) {
    const page = { path: session.path, url: win.location.origin + session.path };
    const target = { url: session.path, viewport: { w: win.innerWidth, h: win.innerHeight }, ...draft.target };
    return store.add(page, { ...draft, target });
  }

  // The new item is stored before the old one is taken out, so a failure never loses the copy
  async function replace(id, draft) {
    const annotation = await save(draft);
    store.remove(id);
    return annotation;
  }

  function notify(message) {
    if (session) session.dock.notify(message);
  }

  // ---------- dock actions ----------
  function onDockAction(action, id) {
    const handler = {
      [DOCK_ACTION.CopyPrompt]: copyPrompt,
      [DOCK_ACTION.CopyLink]: copyLink,
      [DOCK_ACTION.Export]: saveFile,
      [DOCK_ACTION.Clear]: clearAll,
      [DOCK_ACTION.Close]: onClose,
      [DOCK_ACTION.ToggleStatus]: () => toggleStatus(id),
      [DOCK_ACTION.Delete]: () => removeItem(id),
      [DOCK_ACTION.Reveal]: () => session.annotator.reveal(id),
    }[action];
    if (handler) handler();
  }

  async function copyPrompt() {
    const markdown = renderPrompt(feedbackDocument());
    await copyText(win, markdown);
    if (session) session.dock.copied('Prompt copied. Paste it into your AI coding tool.');
  }

  // The link opens the page the person is on, without ?fix: the fragment alone opens the overlay
  async function copyLink() {
    const link = await shareUrl(win.location.origin + session.path, feedbackDocument());
    await copyText(win, link);
    if (!isComfortableLength(link)) return notify('Link copied, but it is long; some chat apps cut it off. If it does not open, use "Save as a file".');
    notify('Link copied. Send it to your developer in any chat or email; the feedback travels inside the link.');
  }

  // A link comes from anyone and shows its changes on this site, so the person agrees first and the dock stays visible.
  // The fragment is removed right away, so a reload or a copied address does not carry it on.
  async function openSharedFeedback() {
    const hash = win.location.hash;
    win.history.replaceState(win.history.state, '', win.location.pathname + win.location.search);
    try {
      const { data, skipped } = readFeedbackFile(await readSharedFeedback(hash));
      const count = data.annotations.length;
      if (!win.confirm(`This link carries ${count} suggested change(s) for this site from someone else. Show them here?`)) return;
      const { added } = store.merge(data);
      if (session) showPage();
      notify(sharedFeedbackNotice(count, added, skipped));
    } catch (error) {
      notify('Could not open the link: ' + error.message);
    }
  }

  function saveFile() {
    const fileName = exportFileName(win.location.hostname, now());
    download(fileName, exportPcf(), MIME.Json);
    notify(`Saved ${fileName}. Send it to your developer; they open it in fixthis to see every change.`);
  }

  function toggleStatus(id) {
    const annotation = store.session().annotations.find((a) => a.id === id);
    if (!annotation) return;
    store.setStatus(id, isDone(annotation) ? ANNOTATION_STATUS.Open : ANNOTATION_STATUS.Done);
    session.annotator.updateAnnotations(store.annotationsFor(session.path));
    renderDock();
  }

  function removeItem(id) {
    if (!win.confirm('Delete this item?')) return;
    store.remove(id);
    showPage();
  }

  function clearAll() {
    if (!win.confirm('Delete all feedback for this site from this browser?')) return;
    store.clear();
    showPage();
  }

  // The file is a Page Change Format document, so other tools can read it and the overlay can read theirs
  function exportPcf() {
    return JSON.stringify(feedbackDocument(), null, JSON_INDENT);
  }

  // The prompt is rendered from the same document as the export, so both always say the same
  function feedbackDocument() {
    return toPcf(store.session(), { now: now(), generator: GENERATOR });
  }

  async function importFile(file) {
    if (!win.confirm('Replace the feedback in this browser with the items in this file?')) return;
    try {
      const { data, skipped } = readFeedbackFile(JSON.parse(await file.text()));
      store.replace(data);
      showPage();
      notify(skipped ? `Feedback imported. ${skipped} item(s) skipped: this overlay cannot show them.` : 'Feedback imported.');
    } catch (error) {
      notify('Import failed: ' + error.message);
    }
  }

  function download(fileName, content, type) {
    const url = win.URL.createObjectURL(new win.Blob([content], { type }));
    const link = doc.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => win.URL.revokeObjectURL(url), 0);
  }
}

function sharedFeedbackNotice(count, added, skipped) {
  const updated = count - added;
  const parts = [`${added} new`, updated ? `${updated} updated` : '', skipped ? `${skipped} skipped: this overlay cannot show them` : ''];
  return `Feedback from the link: ${parts.filter(Boolean).join(', ')}.`;
}

// A change by the site, not by the overlay: our interface, dock and copies carry data-fb attributes or our tag
function isSiteChange(record) {
  const node = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
  return Boolean(node) && !node.closest('[data-fb], [data-fb-clone], fb-ui');
}

// Single-page apps change the address with pushState/replaceState, which fires no event of its own
function patchHistoryOnce(win) {
  if (win.history.fixthisPatched) return;
  for (const method of ['pushState', 'replaceState']) {
    const original = win.history[method];
    win.history[method] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      win.dispatchEvent(new win.Event(NAVIGATE_EVENT));
      return result;
    };
  }
  win.history.fixthisPatched = true;
}

// The clipboard API needs a secure context; plain http on a LAN address falls back to a hidden textarea
async function copyText(win, text) {
  try {
    await win.navigator.clipboard.writeText(text);
  } catch {
    const area = win.document.createElement('textarea');
    area.setAttribute('data-fb', '');
    area.value = text;
    win.document.body.appendChild(area);
    area.select();
    win.document.execCommand('copy');
    area.remove();
  }
}

// The current page always leads the list, also without open items, so the person can see where they are
function pagesWithOpenItems(openItems, currentPath) {
  const counts = new Map([[currentPath, 0]]);
  openItems.forEach((item) => counts.set(item.pageId, (counts.get(item.pageId) || 0) + 1));
  return [...counts].map(([path, openCount]) => ({ path, openCount, isCurrent: path === currentPath }));
}

/**
 * The export's file name, such as `example.com-2026-11-13-1432.pagechange.json`, in the visitor's local time,
 * so files from several sites or sessions sort and can be told apart in a downloads folder.
 */
function exportFileName(hostname, date) {
  const site = String(hostname || '').toLowerCase().replace(WWW_PREFIX, '').replace(UNSAFE_FILE_CHARS, '-').replace(/^-+|-+$/g, '');
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `${site || FILE_NAME.SiteFallback}-${day}-${time}${FILE_NAME.ExportSuffix}`;
}

module.exports = { createOverlay, exportFileName };
