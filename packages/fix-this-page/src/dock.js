// The overlay's own panel: the items of this page and what to do with them. It lives in a shadow DOM so the
// site's CSS cannot reach it, and carries data-fb so the annotation layer leaves it alone.
const { addStyleSheet, keepEventsInside, annotationIcon, isDone } = require('./core/annotator.js');
const { pageLinkList } = require('./core/site-links.js');

const DOCK_TAG = 'fixthis-dock';
const NOTICE_MS = 2600;
const FLASH_MS = 1400;
// On a phone the open dock would cover a third of the screen, so it starts as a pill
const SMALL_SCREEN_QUERY = '(max-width: 600px)';
// Kept for this tab, so a person who minimized the dock does not get it back open on every page of the site
const MINIMIZED_KEY = 'fixthis:minimized';
const STORED = Object.freeze({ Yes: '1', No: '0' });
// Same drawing style as the toolbar's icons
// How long the pill's copy button shows a check before it fades back
const COPIED_MS = 1000;
const CHECK_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const COPY_LABEL = Object.freeze({ Idle: 'Copy prompt', Done: 'Prompt copied' });
const POWER_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0"/></svg>';
const SITE_PATH = /^\/([^/\\]|$)/;
const DOCK_ACTION = Object.freeze({
  CopyPrompt: 'copy-prompt', CopyLink: 'copy-link', Export: 'export', Import: 'import', Clear: 'clear', Close: 'close',
  Collapse: 'collapse', ToggleStatus: 'toggle-status', Delete: 'delete', Reveal: 'reveal',
  SearchGroup: 'search-group', AddPage: 'add-page', Minimize: 'minimize', Expand: 'expand',
});
const LINK_SEARCH_SELECTOR = 'input[type="search"]';
const LINK_LIST_SELECTOR = '.linked-list';
// Typing in the search field must not reach the site's own keyboard shortcuts
const KEY_EVENTS = Object.freeze(['keydown', 'keyup', 'keypress']);
const DOCK_CSS = `
  /* The dock sits on someone else's site, so it carries its own copy of the fixthis.page tokens; the web fonts are not loaded here, the system fonts stand in */
  :host { all: initial; --yellow: #FFE14D; --ink: #0A0A0A; --paper: #FFFFFF; --muted: #3A3A3A; --border: 2px solid var(--ink); --shadow: 6px 6px 0 var(--ink); --shadow-sm: 3px 3px 0 var(--ink); --radius-lg: 18px; --radius-sm: 10px; --font-display: 'Space Grotesk', system-ui, -apple-system, "Segoe UI", sans-serif; --font-mono: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace; }
  * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  :focus-visible { outline: 3px solid var(--ink); outline-offset: -6px; }
  .dock { position: fixed; right: 16px; bottom: 16px; width: min(340px, calc(100vw - 32px)); background: var(--paper); color: var(--ink); border: var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow); font-size: 13px; overflow: hidden; }
  header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; }
  header b { font: 700 15px var(--font-display); letter-spacing: -0.02em; }
  header b i { background: var(--yellow); font-style: normal; padding: 0 3px; }
  header .count { color: var(--muted); margin-right: auto; }
  button { font: inherit; color: var(--ink); background: var(--paper); border: var(--border); border-radius: 8px; padding: 4px 9px; cursor: pointer; }
  button:hover { background: var(--yellow); }
  button.primary { background: var(--yellow); box-shadow: var(--shadow-sm); font-family: var(--font-display); font-weight: 700; }
  button.primary:hover { background: var(--ink); color: var(--yellow); }
  button.icon { border: 0; background: none; padding: 2px 6px; font-size: 16px; line-height: 1; color: var(--muted); }
  .body { border-top: var(--border); }
  .dock.collapsed .body { display: none; }
  ul { list-style: none; margin: 0; padding: 0; max-height: 40vh; overflow: auto; scrollbar-width: thin; scrollbar-color: var(--ink) transparent; }
  /* Chrome and Edge before 121 and Safari ignore the standard properties above */
  ul::-webkit-scrollbar { width: 8px; }
  ul::-webkit-scrollbar-thumb { background: var(--ink); border-radius: 4px; }
  li { display: flex; gap: 8px; align-items: flex-start; padding: 8px 12px; border-bottom: 1px solid var(--ink); cursor: pointer; }
  li.done { opacity: .6; }
  li.flash { background: var(--yellow); }
  .num { flex: none; width: 22px; height: 22px; border-radius: 50%; border: var(--border); background: var(--yellow); color: var(--ink); font: 700 11px var(--font-display); display: flex; align-items: center; justify-content: center; }
  li.done .num { background: var(--ink); color: var(--paper); }
  .type { flex: none; display: flex; align-items: center; height: 22px; color: var(--muted); }
  .what { flex: 1; min-width: 0; line-height: 22px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  li.expanded .what { white-space: pre-wrap; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; }
  .item-actions { display: flex; gap: 4px; }
  .item-actions button { padding: 1px 6px; font-size: 12px; }
  .pages { border-top: var(--border); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px; }
  .chip { display: flex; align-items: center; gap: 6px; padding: 2px 9px; border: var(--border); border-radius: 999px; background: var(--paper); color: var(--ink); font: 12.5px var(--font-mono); text-decoration: none; cursor: pointer; }
  .chip:hover { background: var(--yellow); }
  .chip.current { background: var(--yellow); cursor: default; }
  .chip.add { border-style: dashed; color: var(--muted); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .chip.add[aria-expanded="true"] { border-style: solid; color: var(--ink); }
  .chip b { padding: 1px 7px; border-radius: 999px; background: var(--ink); color: var(--paper); font: 700 11px var(--font-display); }
  .page { display: flex; align-items: center; gap: 8px; padding: 5px 12px; color: var(--ink); text-decoration: none; border-left: 3px solid transparent; }
  a.page:hover { background: var(--yellow); }
  .page .path { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-mono); font-size: 12.5px; }
  .linked { padding-bottom: 8px; }
  .linked-list { max-height: 20vh; overflow: auto; scrollbar-width: thin; scrollbar-color: var(--ink) transparent; }
  .linked-search { display: block; width: calc(100% - 24px); margin: 2px 12px 6px; padding: 5px 8px; font: inherit; color: var(--ink); background: var(--paper); border: var(--border); border-radius: 8px; }
  .linked-row { display: flex; align-items: center; padding-right: 12px; }
  .linked-row .page { flex: 1; min-width: 0; }
  .linked-row button { flex: none; padding: 1px 8px; border-radius: 999px; font-size: 11px; }
  .linked-none { padding: 5px 12px; color: var(--muted); }
  .empty { padding: 10px 12px; color: var(--muted); line-height: 1.4; }
  .note { display: flex; align-items: center; gap: 8px; padding: 9px 12px; background: var(--ink); color: var(--paper); font-size: 12.5px; }
  .note b { color: var(--yellow); }
  .note svg { flex: none; }
  .list-head { display: flex; align-items: center; justify-content: space-between; padding: 2px 12px; color: var(--muted); }
  button.text-link { background: none; border: 0; padding: 4px 0; color: var(--muted); text-decoration: underline; }
  button.text-link:hover { background: var(--yellow); color: var(--ink); }
  .actions { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-top: var(--border); }
  .actions .primary { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px; padding: 8px 14px; border-radius: var(--radius-sm); text-align: left; font-weight: 400; }
  .primary svg { flex: none; }
  .primary .label { display: flex; flex-direction: column; gap: 1px; }
  .primary b { font: 700 14px var(--font-display); }
  .primary small { font-size: 12.5px; }
  .secondary { display: flex; flex-wrap: wrap; gap: 8px; }
  .secondary button { flex: 1 1 auto; white-space: nowrap; display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; border-radius: 8px; }
  .notice { padding: 8px 12px; background: var(--ink); color: var(--paper); }
  header button.small { display: inline-flex; align-items: center; justify-content: center; height: 24px; min-width: 28px; padding: 0 8px; }
  /* Minimized: the dock is a pill with the count and a copy button, and nothing else */
  .dock.minimized { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; width: max-content; max-width: calc(100vw - 32px); background: none; border: 0; box-shadow: none; overflow: visible; }
  .pill, .pill-copy { background: var(--paper); border: var(--border); border-radius: 999px; box-shadow: var(--shadow-sm); }
  .pill { display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 7px; }
  .pill .path { color: var(--muted); font: 12.5px var(--font-mono); max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pill b { font: 700 14px var(--font-display); letter-spacing: -0.02em; } .pill b i { background: var(--yellow); font-style: normal; padding: 0 3px; }
  .dot { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; border: var(--border); background: var(--yellow); color: var(--ink); font: 700 11px var(--font-display); }
  .pill-copy { position: relative; display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; padding: 0; }
  .pill-copy span { display: flex; transition: opacity .3s ease; }
  .pill-copy .check { position: absolute; inset: 0; align-items: center; justify-content: center; opacity: 0; }
  .pill-copy.copied { background: var(--yellow); }
  .pill-copy.copied .check { opacity: 1; }
  .pill-copy.copied .copy { opacity: 0; }
  .pill-notice { flex-basis: 100%; padding: 8px 12px; background: var(--ink); color: var(--paper); border-radius: var(--radius-sm); text-align: right; }
  /* Fingers need bigger targets than a mouse: 44px is the usual minimum */
  @media (pointer: coarse) {
    header { min-height: 48px; }
    button, .item-actions button { min-height: 44px; min-width: 44px; }
    .chip { min-height: 44px; }
    .pill-copy { width: 44px; height: 44px; }
    button.icon { font-size: 22px; }
    li { padding: 10px 12px; }
  }
`;

/**
 * @typedef {{ pagePath: string, items: object[], pages: { path: string, openCount: number, isCurrent: boolean }[], linkedPages: string[], openCount: number }} DockView; `pages` always holds the current page, `linkedPages` the paths without feedback
 * @param {Document} doc
 * @param {(action: string, id?: string) => void} onAction
 * @param {(file: File) => void} onImport
 */
function createDock(doc, onAction, onImport) {
  const host = doc.createElement(DOCK_TAG);
  host.setAttribute('data-fb', '');
  host.style.cssText = 'position:fixed;z-index:2147483646;display:block;';
  doc.documentElement.appendChild(host);
  keepEventsInside(host);
  const root = host.attachShadow({ mode: 'open' });
  addStyleSheet(doc, root, DOCK_CSS);
  root.innerHTML = '<div class="dock"></div><input type="file" accept="application/json,.json" hidden>';
  const dock = root.querySelector('.dock');
  const fileInput = root.querySelector('input[type="file"]');
  const win = doc.defaultView;
  const state = { collapsed: false, minimized: readMinimized(win), notice: '', noticeTimer: null, expanded: new Set(), linkQuery: '', addOpen: false, copied: false, copiedTimer: null };
  dock.addEventListener('click', onClick);
  dock.addEventListener('input', onSearch);
  KEY_EVENTS.forEach((type) => host.addEventListener(type, (event) => event.stopPropagation()));
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) onImport(fileInput.files[0]); fileInput.value = ''; });
  let lastView = null;

  return { render, notify, copied, flash, remove: () => host.remove() };

  function render(view) {
    lastView = view;
    const searching = root.activeElement && root.activeElement.matches(LINK_SEARCH_SELECTOR);
    dock.classList.toggle('collapsed', state.collapsed);
    dock.classList.toggle('minimized', state.minimized);
    if (state.minimized) { dock.innerHTML = pillHtml(view, state); return; }
    dock.innerHTML = headerHtml(view) + `<div class="body">${listHtml(view, state.expanded)}${pagesHtml(view, state)}${actionsHtml()}</div>`
      + (state.notice ? `<div class="notice">${esc(state.notice)}</div>` : '');
    // The page re-renders the dock now and then; whoever is typing a search keeps typing
    if (searching) focusSearch();
  }

  // Only the list changes while typing, so the field keeps its focus and cursor
  function onSearch(event) {
    if (!event.target.matches(LINK_SEARCH_SELECTOR)) return;
    state.linkQuery = event.target.value;
    dock.querySelector(LINK_LIST_SELECTOR).innerHTML = pageResultsHtml(lastView, state.linkQuery);
  }

  function searchGroup(group) {
    state.linkQuery = group;
    render(lastView);
    focusSearch();
  }

  function focusSearch() {
    const field = dock.querySelector(LINK_SEARCH_SELECTOR);
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }

  function notify(message) {
    state.notice = message;
    clearTimeout(state.noticeTimer);
    state.noticeTimer = setTimeout(() => { state.notice = ''; render(lastView); }, NOTICE_MS);
    render(lastView);
  }

  // The pill has no room for a message, so its copy button shows a check for a moment; the dock says it in words
  function copied(message) {
    if (!state.minimized) return notify(message);
    state.copied = true;
    showCopied(true);
    clearTimeout(state.copiedTimer);
    state.copiedTimer = setTimeout(() => { state.copied = false; showCopied(false); }, COPIED_MS);
  }

  // Changes the live button instead of rendering again, so the icons fade instead of jumping
  function showCopied(done) {
    const button = dock.querySelector('.pill-copy');
    if (!button) return;
    button.classList.toggle('copied', done);
    button.setAttribute('aria-label', done ? COPY_LABEL.Done : COPY_LABEL.Idle);
  }

  function flash(id) {
    state.collapsed = false;
    state.minimized = false;
    render(lastView);
    const item = dock.querySelector(`li[data-id="${CSS.escape(id)}"]`);
    if (!item) return;
    item.scrollIntoView({ block: 'nearest' });
    item.classList.add('flash');
    setTimeout(() => item.classList.remove('flash'), FLASH_MS);
  }

  function onClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    event.stopPropagation();
    const { action, id } = button.dataset;
    if (action === DOCK_ACTION.Collapse) return toggleCollapsed();
    if (action === DOCK_ACTION.SearchGroup) return searchGroup(id);
    if (action === DOCK_ACTION.AddPage) return toggleAddPage();
    if (action === DOCK_ACTION.Minimize) return setMinimized(true);
    if (action === DOCK_ACTION.Expand) return setMinimized(false);
    if (action === DOCK_ACTION.Reveal) toggleExpanded(id);
    if (action === DOCK_ACTION.Import) { render(lastView); return fileInput.click(); }
    onAction(action, id);
    render(lastView);
  }

  function setMinimized(minimized) {
    state.minimized = minimized;
    state.addOpen = false;
    storeMinimized(win, minimized);
    render(lastView);
  }

  function toggleAddPage() {
    state.addOpen = !state.addOpen;
    state.linkQuery = '';
    render(lastView);
    if (state.addOpen) focusSearch();
  }

  // The list cuts a long comment to one line; clicking the item shows all of it, clicking again cuts it again
  function toggleExpanded(id) {
    if (state.expanded.has(id)) state.expanded.delete(id);
    else state.expanded.add(id);
  }

  function toggleCollapsed() {
    state.collapsed = !state.collapsed;
    render(lastView);
  }
}

function headerHtml(view) {
  return `<header data-action="${DOCK_ACTION.Collapse}" title="Show or hide the list">
    <b>fixthis<i>.local</i></b><span class="count">${view.openCount} open</span>
    <button class="small" data-action="${DOCK_ACTION.Minimize}" aria-label="Minimize" title="Minimize to a small pill">–</button>
    <button class="small" data-action="${DOCK_ACTION.Close}" aria-label="Turn off" title="Turn off the overlay to see the page as it is. Add ?fix to the address to bring it back.">${POWER_ICON}</button>
  </header>`;
}

// The count, where the person is, and the one action most people come for; a click on the pill opens the dock
function pillHtml(view, { notice, copied }) {
  const copyIcon = `<span class="copy">${annotationIcon({ type: 'clone' }).svg}</span><span class="check">${CHECK_ICON}</span>`;
  return `${notice ? `<div class="pill-notice">${esc(notice)}</div>` : ''}
    <button class="pill" data-action="${DOCK_ACTION.Expand}" title="Open fixthis">
      <span class="dot">${view.openCount}</span><b>fixthis<i>.local</i></b><span class="path">${esc(view.pagePath)}</span>
    </button>
    <button class="pill-copy${copied ? ' copied' : ''}" data-action="${DOCK_ACTION.CopyPrompt}" aria-label="${copied ? COPY_LABEL.Done : COPY_LABEL.Idle}" title="Copy the open items as a prompt for your AI coding tool">${copyIcon}</button>`;
}

// Storage can be blocked; then the dock just starts the way the screen size says
function readMinimized(win) {
  try {
    const stored = win.sessionStorage.getItem(MINIMIZED_KEY);
    if (stored !== null) return stored === STORED.Yes;
  } catch {}
  return win.matchMedia(SMALL_SCREEN_QUERY).matches;
}

function storeMinimized(win, minimized) {
  try { win.sessionStorage.setItem(MINIMIZED_KEY, minimized ? STORED.Yes : STORED.No); } catch {}
}

function listHtml(view, expanded) {
  if (!view.items.length) {
    return '<div class="empty">Click anything on this page to comment on it, edit its text, change a link, duplicate a block or mark it for deletion.</div>';
  }
  return `${listHeadHtml(view.items.length)}<ul>${view.items.map((item) => itemHtml(item, expanded.has(item.id))).join('')}</ul>`;
}

// Clearing is not a way of sending, so it sits with the list it empties, as plain text rather than a button
function listHeadHtml(count) {
  const label = count === 1 ? '1 item on this page' : `${count} items on this page`;
  return `<div class="list-head"><span>${label}</span><button class="text-link" data-action="${DOCK_ACTION.Clear}" title="Remove all feedback from this browser">Clear all</button></div>`;
}

// The kind of item is the toolbar's icon, as in the buttons that made it; the summary is what the person reads
function itemHtml(annotation, isExpanded) {
  const done = isDone(annotation);
  const { label, svg } = annotationIcon(annotation);
  return `<li class="${done ? 'done' : ''}${isExpanded ? ' expanded' : ''}" aria-expanded="${isExpanded}" data-id="${esc(annotation.id)}" data-action="${DOCK_ACTION.Reveal}">
    <span class="num">${done ? '✓' : Number(annotation.number) || 0}</span>
    <span class="type" title="${esc(label)}" role="img" aria-label="${esc(label)}">${svg}</span>
    <span class="what">${esc(summaryOf(annotation) || label.toLowerCase())}</span>
    <span class="item-actions">
      <button data-action="${DOCK_ACTION.ToggleStatus}" data-id="${esc(annotation.id)}" title="${done ? 'Mark as open again' : 'Mark as fixed; it is left out of the prompt'}">${done ? 'reopen' : 'done'}</button>
      <button data-action="${DOCK_ACTION.Delete}" data-id="${esc(annotation.id)}" aria-label="Delete item" title="Delete item">✕</button>
    </span>
  </li>`;
}

// The pages with open items as chips, one click away; "+ page" opens a search for a page that has no feedback yet.
// A click on the page itself makes an item instead of following a link, so this is the way to the next page.
function pagesHtml(view, { addOpen, linkQuery }) {
  const add = `<button class="chip add" data-action="${DOCK_ACTION.AddPage}" aria-expanded="${addOpen}" title="Go to a page that has no feedback yet">${addOpen ? '× close' : '+ page'}</button>`;
  const chips = `<div class="chips">${view.pages.map(pageChipHtml).join('')}${add}</div>`;
  if (!addOpen) return `<div class="pages">${chips}</div>`;
  return `<div class="pages">${chips}<div class="linked">
    <input type="search" class="linked-search" value="${esc(linkQuery)}" placeholder="Type a page, e.g. /vacatures" aria-label="Search the linked pages" autocomplete="off">
    <div class="linked-list">${pageResultsHtml(view, linkQuery)}</div></div></div>`;
}

function pageChipHtml(page) {
  const count = page.openCount ? `<b>${page.openCount}</b>` : '';
  const path = esc(page.path);
  if (page.isCurrent) return `<span class="chip current" aria-current="page">${path}${count}</span>`;
  if (!isSitePath(page.path)) return `<span class="chip">${path}${count}</span>`;
  return `<a class="chip" href="${path}" title="Go to this page">${path}${count}</a>`;
}

function pageResultsHtml(view, query) {
  const entries = pageLinkList(view.linkedPages, query).filter((entry) => isSitePath(entry.path));
  if (entries.length) return entries.map(linkedPageHtml).join('');
  const typed = typedPath(view, query);
  return typed ? linkHtml(typed, `Go to ${typed}`) : '<div class="linked-none">no links match</div>';
}

// A page that is not linked from here can still be reached by typing its path, when nothing matches it
function typedPath(view, query) {
  const path = query.trim();
  const isKnown = view.pages.some((page) => page.path === path);
  return isSitePath(path) && !isKnown ? path : '';
}

function linkHtml(path, label) {
  return `<a class="page" href="${esc(path)}" title="Go to this page"><span class="path">${esc(label)}</span></a>`;
}

// Pages of one kind (posts, products) show as one entry; its count searches for all of them
function linkedPageHtml({ path, similar, group }) {
  const link = linkHtml(path, path);
  if (!similar) return link;
  return `<div class="linked-row">${link}<button data-action="${DOCK_ACTION.SearchGroup}" data-id="${esc(group)}" title="Show all pages under ${esc(group)}">+${similar}</button></div>`;
}

// Stored and imported paths are untrusted: only a path on this site becomes a link, never `//host` or `javascript:`
function isSitePath(path) {
  return SITE_PATH.test(path);
}

const COPY_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
const SAVE_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 19h14"/></svg>';
const LOCK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const OPEN_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

const LINK_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>';

// Every way out is in view and says who it is for: the prompt goes to an AI tool, the link and file go to a developer
function actionsHtml() {
  return `<div class="actions">
    <button class="primary" data-action="${DOCK_ACTION.CopyPrompt}" title="Copy the open items as a prompt for your AI coding tool">${COPY_ICON}<span class="label"><b>Copy for an AI tool</b><small>Paste it into Claude, Cursor or ChatGPT</small></span></button>
    <div class="secondary">
      <button data-action="${DOCK_ACTION.CopyLink}" title="Copy a link that carries the feedback; send it to your developer in any chat or email">${LINK_ICON}Copy link</button>
      <button data-action="${DOCK_ACTION.Export}" title="Save the feedback as a file for your developer">${SAVE_ICON}Save as a file</button>
      <button data-action="${DOCK_ACTION.Import}" title="Load feedback from a file into this page">${OPEN_ICON}Open a file</button>
    </div>
  </div>
  <div class="note">${LOCK_ICON}<span><b>Only in this browser.</b> Nothing is uploaded.</span></div>`;
}

function summaryOf(annotation) {
  if (annotation.comment) return annotation.comment;
  const firstChange = (annotation.changes || [])[0];
  if (firstChange) return firstChange.to || firstChange.from || '';
  return (annotation.target && annotation.target.text) || '';
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { createDock, DOCK_ACTION };
