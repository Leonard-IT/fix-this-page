// The annotation layer itself: pointing at elements of a page, the toolbar and panel, and the pins.
const { ANNOTATION_TYPE, TYPE_LABEL, isDone } = require('./annotation-types.js');
const { applyToPage, NOTHING_TO_REVERT } = require('./apply-to-page.js');
const { applyChanges, invertChanges, isSafeChange } = require('./apply-changes.js');
const { createClone, insertCloneAfter, clonesOf } = require('./clones.js');
const { describeElement } = require('./describe-element.js');
const {
  ATTR, CLONE_SELECTOR, LINK_SELECTOR, isHostControl, isPageElement, tagOf, norm, esc,
} = require('./dom.js');
const {
  ACTION, SHIELDED_EVENTS, mountInterface, addStyleSheet, panelHtml, toolbarButton, resetPanelPosition, isActionAvailable, TOOLBAR_ACTIONS,
} = require('./interface.js');
const { EDGE_MARGIN, viewportOf, toolbarPosition, panelPosition, isOnScreen } = require('./layout.js');
const { PAGE_CSS } = require('./styles.js');
const { findTarget } = require('./selector.js');
const { elementTexts, diffTexts, leafTexts, linkChanges, previewableLinkChanges } = require('./text-diff.js');

const NEW_CLONE_ID = 'new';
const CLONE_PLACEMENT = Object.freeze({ relative_to: 'source', position: 'after' });
const PIN_MARGIN = 12;
const TIP_OFFSET = 36;
const REVEAL_DELAY_MS = 400;
const REVEAL_HIGHLIGHT_MS = 1200;
const KEY = Object.freeze({ Escape: 'Escape' });
const DISPLAY = Object.freeze({ None: 'none', Block: 'block', Flex: 'flex' });
const UI_PART = Object.freeze({
  HoverBox: '.hover', SelectionBox: '.sel', Pins: '.pins', Toolbar: '.toolbar', Tip: '.tip', Panel: '.panel',
});
const PANEL_CONTROL = Object.freeze({
  Note: '[data-x="note"]', NoteBox: '[data-x="notebox"]', Hint: '[data-x="hint"]', StepTwo: '[data-x="n2"]',
  Cancel: '[data-x="cancel"]', Save: '[data-x="save"]',
});
const HINT = Object.freeze({ Waiting: 'Waiting for your change…', Detected: 'Change detected ✓' });

/**
 * @typedef {{ selector: string, text: string, html: string, heading: string }} ElementDescription
 * @typedef {{ type: string, target: ElementDescription, comment?: string, changes?: object[], placement?: object }} Draft
 * @typedef {object} Host
 * @property {(draft: Draft) => Promise<object>} save  stores the item and answers the stored annotation (with id and number)
 * @property {(annotation: object) => void} onSaved
 * @property {(annotationId: string) => void} onPinClick
 * @property {(message: string) => void} notify
 */

/**
 * Attaches the annotation layer to a document. Nothing is stored here: every new item goes to `host.save`.
 * Elements marked with `data-fb` (such as a host's own controls) are left alone.
 * @param {Document} doc
 * @param {Host} host
 */
function attach(doc, host) {
  const win = doc.defaultView;
  // applied: what is shown in the page for each item, with how to take it out again
  const state = { selected: null, editing: null, pins: [], panelAnchor: null, applied: [] };
  const startAction = Object.freeze({
    [ACTION.Comment]: startComment,
    [ACTION.Edit]: startTextEdit,
    [ACTION.Link]: startLinkEdit,
    [ACTION.Clone]: startDuplicate,
    [ACTION.Delete]: startDelete,
  });
  const listeners = new AbortController();
  const removePageStyle = addStyleSheet(doc, doc, PAGE_CSS);
  const { element: uiHost, root: ui } = mountInterface(doc);
  listenToPage();

  return { showAnnotations, updateAnnotations, reveal, isBusy, detach };

  // ---------- public ----------
  /**
   * Shows the stored items in the page, replacing what was shown before, and answers the ids of the items
   * whose element is gone. Calling it again with the same items gives the same page.
   */
  function showAnnotations(annotations) {
    revertApplied();
    clearPins();
    const missingIds = new Set();
    for (const annotation of annotations) {
      const el = findTarget(doc, annotation.target || {});
      if (!el) { missingIds.add(annotation.id); continue; }
      const shown = applyToPage(annotation, el);
      state.applied.push({ annotation, revert: shown.revert });
      addPin(annotation, shown.el);
    }
    return missingIds;
  }

  /** Takes the layer out of the page again: its interface, its listeners and every change it shows. */
  function detach() {
    if (state.editing) state.editing.cancel();
    closePanel();
    revertApplied();
    listeners.abort();
    uiHost.remove();
    removePageStyle();
  }

  function updateAnnotations(annotations) {
    for (const pin of state.pins) {
      const fresh = annotations.find((annotation) => annotation.id === pin.annotation.id);
      if (!fresh) continue;
      pin.annotation = fresh;
      pin.node.classList.toggle('done', isDone(fresh));
    }
  }

  function reveal(annotationId) {
    const pin = state.pins.find((p) => p.annotation.id === annotationId);
    if (!pin) return;
    pin.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => {
      showBox(UI_PART.SelectionBox, pin.el);
      setTimeout(() => hideBox(UI_PART.SelectionBox), REVEAL_HIGHLIGHT_MS);
    }, REVEAL_DELAY_MS);
  }

  function isBusy() {
    return Boolean(state.editing) || isPanelOpen();
  }

  // ---------- page events ----------
  // Captured on the window, the first stop of every event, so the site's own handlers do not run
  function listenToPage() {
    const options = { capture: true, signal: listeners.signal };
    win.addEventListener('mousemove', onHover, options);
    SHIELDED_EVENTS.forEach((type) => win.addEventListener(type, shieldPage, options));
    win.addEventListener('click', onClick, options);
    win.addEventListener('dblclick', onDoubleClick, options);
    win.addEventListener('submit', (event) => event.preventDefault(), options);
    win.addEventListener('keydown', onKeyDown, options);
    win.addEventListener('scroll', reflow, options);
    win.addEventListener('resize', reflow, { signal: listeners.signal });
  }

  function shieldPage(event) {
    if (isInterfaceEvent(event) || isInEditedElement(event)) return;
    event.stopImmediatePropagation();
  }

  function onHover(event) {
    if (isBusy() || isInterfaceEvent(event) || !isPageElement(event.target)) return hideBox(UI_PART.HoverBox);
    showBox(UI_PART.HoverBox, event.target);
  }

  function onClick(event) {
    if (isInterfaceEvent(event)) return;
    if (isInEditedElement(event)) return; // lets the cursor be placed in the text
    event.preventDefault();
    event.stopImmediatePropagation();
    if (isBusy()) return;
    const el = event.target;
    if (!isPageElement(el)) return clearSelection();
    if (el.closest(CLONE_SELECTOR)) return host.notify('This is a copy. Change it via its item in the list, or delete that item.');
    select(el);
  }

  function onDoubleClick(event) {
    if (isInterfaceEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (isBusy()) return;
    const el = event.target;
    if (!isPageElement(el) || el.closest(CLONE_SELECTOR)) return;
    select(el);
    runAction(ACTION.Edit);
  }

  function onKeyDown(event) {
    if (event.key !== KEY.Escape) return;
    if (state.editing) return state.editing.cancel();
    if (isPanelOpen()) return closePanel();
    clearSelection();
  }

  function reflow() {
    if (state.selected) {
      showBox(UI_PART.SelectionBox, state.selected);
      placeToolbar();
    }
    positionPins();
    placePanel();
    hideBox(UI_PART.HoverBox);
  }

  function isInterfaceEvent(event) {
    return event.composedPath().some((node) => node === uiHost || isHostControl(node));
  }

  function isInEditedElement(event) {
    return Boolean(state.editing) && state.editing.el.contains(event.target);
  }

  // ---------- selection and toolbar ----------
  function select(el) {
    state.selected = el;
    showBox(UI_PART.SelectionBox, el);
    renderToolbar(el);
    placeToolbar();
  }

  function renderToolbar(el) {
    const toolbar = part(UI_PART.Toolbar);
    const actions = TOOLBAR_ACTIONS.filter((a) => isActionAvailable(a.id, el));
    toolbar.innerHTML = `<span class="tagname">${esc(tagOf(el))}</span>` + actions.map(toolbarButton).join('');
    toolbar.style.display = DISPLAY.Flex;
    toolbar.querySelectorAll('button').forEach((button) => {
      button.onclick = (event) => { event.stopPropagation(); runAction(button.dataset.a); };
    });
  }

  function placeToolbar() {
    const toolbar = part(UI_PART.Toolbar);
    if (!state.selected || toolbar.style.display === DISPLAY.None) return;
    const size = { width: toolbar.offsetWidth, height: toolbar.offsetHeight };
    const { top, left } = toolbarPosition(state.selected.getBoundingClientRect(), size, viewportOf(win));
    Object.assign(toolbar.style, { top: top + 'px', left: left + 'px' });
  }

  function clearSelection() {
    state.selected = null;
    hideBox(UI_PART.SelectionBox);
    hideToolbar();
  }

  function hideToolbar() {
    part(UI_PART.Toolbar).style.display = DISPLAY.None;
  }

  function runAction(action) {
    const el = state.selected;
    if (!el) return;
    if (action === ACTION.Close) return clearSelection();
    if (action === ACTION.Parent) return select(el.parentElement);
    hideToolbar();
    if (startAction[action]) startAction[action](el);
  }

  // ---------- actions ----------
  function startComment(el) {
    openPanel({
      anchor: el, title: 'Comment', text: 'What should be different about this part?', saveLabel: 'Post comment',
      onSave: async (field) => {
        const comment = field('comment').value.trim();
        if (!comment) throw new Error('Type a comment first');
        const annotation = await host.save({ type: ANNOTATION_TYPE.Comment, target: describeElement(el), comment });
        afterSave(annotation, el, NOTHING_TO_REVERT);
      },
      onCancel: () => select(el),
    });
  }

  function startTextEdit(el) {
    const target = describeElement(el);
    const before = elementTexts(el);
    const originalHtml = el.innerHTML;
    el.setAttribute(ATTR.Editable, 'true');
    el.focus();
    const hideTip = showTypingTip(el);
    const cancel = () => {
      hideTip();
      el.innerHTML = originalHtml;
      el.removeAttribute(ATTR.Editable);
      state.editing = null;
      closePanel();
      select(el);
    };
    state.editing = { el, cancel };
    const panel = openPanel({
      anchor: el, title: 'Edit text', collapseComment: true, saveDisabled: true, hint: HINT.Waiting,
      html: `<div class="step"><span class="n">1</span><span><b>Type directly in the page.</b> Click the green outlined text and change it.</span></div>
        <div class="step"><span class="n off" data-x="n2">2</span><span>Click <b>Save</b> when you are done.</span></div>`,
      onSave: async (field) => {
        hideTip();
        const changes = diffTexts(before, elementTexts(el));
        const comment = field('comment').value.trim();
        if (!changes.length && !comment) throw new Error('Nothing has changed');
        el.removeAttribute(ATTR.Editable);
        state.editing = null;
        const annotation = await host.save({ type: ANNOTATION_TYPE.Edit, target, changes, comment });
        afterSave(annotation, el, () => { el.innerHTML = originalHtml; });
      },
      onCancel: cancel,
    });
    const sync = () => {
      const changed = diffTexts(before, elementTexts(el)).length > 0;
      showEditProgress(panel, changed);
      if (changed) hideTip();
    };
    el.addEventListener('input', () => { sync(); placePanel(); });
    panel.querySelector('textarea').addEventListener('input', sync);
    el.addEventListener('focus', hideTip, { once: true });
  }

  function startLinkEdit(el) {
    const link = el.closest(LINK_SELECTOR);
    const original = { href: link.getAttribute('href') || '', text: norm(link.textContent), leaves: leafTexts(link) };
    openPanel({
      anchor: link, title: 'Edit link',
      fields: `<label>Links to</label><input name="href" value="${esc(original.href)}">
        <label>Link text</label><input name="text" value="${esc(original.text)}">`,
      onSave: async (field) => {
        const changes = linkChanges(original, { href: field('href').value.trim(), text: norm(field('text').value) });
        const comment = field('comment').value.trim();
        if (!changes.length && !comment) throw new Error('Nothing has changed');
        if (!changes.every(isSafeChange)) throw new Error('A link cannot start with javascript:, vbscript: or data:');
        const target = describeElement(link);
        const previewed = previewableLinkChanges(original, changes);
        applyChanges(link, previewed);
        const annotation = await host.save({ type: ANNOTATION_TYPE.Edit, target, changes, comment });
        afterSave(annotation, link, () => applyChanges(link, invertChanges(previewed)));
      },
      onCancel: () => select(el),
    });
  }

  function startDuplicate(el) {
    const target = describeElement(el);
    const order = clonesOf(doc, target.selector).length + 1;
    const before = elementTexts(el);
    const copy = createClone(el, NEW_CLONE_ID, target.selector);
    insertCloneAfter(el, copy);
    copy.setAttribute(ATTR.Editable, 'true');
    copy.scrollIntoView({ block: 'center', behavior: 'smooth' });
    clearSelection();
    const cancel = () => { copy.remove(); state.editing = null; closePanel(); select(el); };
    state.editing = { el: copy, cancel };
    openPanel({
      anchor: copy, title: 'Duplicate block', text: "The copy is outlined in green below the original. Change the copy's texts and click Save.",
      saveLabel: 'Save copy',
      onSave: async (field) => {
        copy.removeAttribute(ATTR.Editable);
        const changes = diffTexts(before, elementTexts(copy));
        state.editing = null;
        const annotation = await host.save({
          type: ANNOTATION_TYPE.Clone, target, changes, comment: field('comment').value.trim(),
          placement: { ...CLONE_PLACEMENT, order },
        });
        copy.setAttribute(ATTR.Clone, annotation.id);
        afterSave(annotation, copy, () => copy.remove());
      },
      onCancel: cancel,
    });
  }

  function startDelete(el) {
    el.setAttribute(ATTR.Deleted, '');
    openPanel({
      anchor: el, title: 'Delete', text: 'This part will be marked for deletion. It stays visible (faded) so the developer can see what is meant.',
      saveLabel: 'Mark for deletion',
      onSave: async (field) => {
        const target = describeElement(el);
        const annotation = await host.save({ type: ANNOTATION_TYPE.Delete, target, comment: field('comment').value.trim() });
        afterSave(annotation, el, () => el.removeAttribute(ATTR.Deleted));
      },
      onCancel: () => { el.removeAttribute(ATTR.Deleted); select(el); },
    });
  }

  function afterSave(annotation, el, revert) {
    clearSelection();
    state.applied.push({ annotation, revert });
    addPin(annotation, el);
    host.onSaved(annotation);
  }

  // Newest first, so a later change is taken out before the one it was made on top of
  function revertApplied() {
    state.applied.reverse().forEach((applied) => applied.revert());
    state.applied = [];
  }

  function showTypingTip(el) {
    const tip = part(UI_PART.Tip);
    const rect = el.getBoundingClientRect();
    Object.assign(tip.style, {
      display: DISPLAY.Block,
      left: Math.max(EDGE_MARGIN, rect.left) + 'px',
      top: Math.max(EDGE_MARGIN, rect.top - TIP_OFFSET) + 'px',
    });
    return () => { tip.style.display = DISPLAY.None; };
  }

  function showEditProgress(panel, changed) {
    const canSave = changed || Boolean(panel.querySelector('textarea').value.trim());
    panel.querySelector(PANEL_CONTROL.Save).disabled = !canSave;
    panel.querySelector(PANEL_CONTROL.StepTwo).classList.toggle('off', !canSave);
    panel.querySelector(PANEL_CONTROL.Hint).textContent = changed ? HINT.Detected : HINT.Waiting;
  }

  // ---------- panel ----------
  function openPanel(options) {
    const panel = part(UI_PART.Panel);
    panel.innerHTML = panelHtml(options);
    panel.style.display = DISPLAY.Block;
    wirePanel(panel, options);
    anchorPanel(options.anchor || null);
    const firstField = panel.querySelector('input, textarea');
    if (firstField && !state.editing) setTimeout(() => firstField.focus(), 0);
    return panel;
  }

  function wirePanel(panel, { onSave, onCancel }) {
    const field = (name) => panel.querySelector(`[name="${name}"]`);
    const noteButton = panel.querySelector(PANEL_CONTROL.Note);
    if (noteButton) noteButton.onclick = () => revealNote(panel, noteButton);
    panel.querySelector(PANEL_CONTROL.Cancel).onclick = () => { closePanel(); if (onCancel) onCancel(); };
    panel.querySelector(PANEL_CONTROL.Save).onclick = () => submitPanel(panel, () => onSave(field));
    // keys typed in the panel must not reach the page's Escape handling or the site's shortcuts
    panel.addEventListener('keydown', (event) => event.stopPropagation());
  }

  async function submitPanel(panel, save) {
    const button = panel.querySelector(PANEL_CONTROL.Save);
    button.disabled = true;
    try {
      await save();
      closePanel();
    } catch (error) {
      host.notify('Saving failed: ' + error.message);
      button.disabled = false;
    }
  }

  function revealNote(panel, noteButton) {
    noteButton.hidden = true;
    panel.querySelector(PANEL_CONTROL.NoteBox).hidden = false;
    panel.querySelector('textarea').focus();
    placePanel();
  }

  function anchorPanel(el) {
    state.panelAnchor = el;
    placePanel();
  }

  // Puts the panel just below (or above) the element being edited, without covering it.
  // If it fits on neither side, the panel stays at the bottom of the screen.
  function placePanel() {
    const panel = part(UI_PART.Panel);
    if (!state.panelAnchor || !isPanelOpen()) return;
    const size = { width: panel.offsetWidth, height: panel.offsetHeight };
    const position = panelPosition(state.panelAnchor.getBoundingClientRect(), size, viewportOf(win));
    if (!position) return resetPanelPosition(panel);
    Object.assign(panel.style, { top: position.top + 'px', left: position.left + 'px', bottom: 'auto', transform: 'none' });
  }

  function closePanel() {
    const panel = part(UI_PART.Panel);
    panel.style.display = DISPLAY.None;
    panel.innerHTML = '';
    state.panelAnchor = null;
    resetPanelPosition(panel);
  }

  function isPanelOpen() {
    return part(UI_PART.Panel).style.display === DISPLAY.Block;
  }

  // ---------- pins ----------
  function addPin(annotation, el) {
    const node = doc.createElement('div');
    node.className = `pin t-${annotation.type}${isDone(annotation) ? ' done' : ''}`;
    node.textContent = annotation.number;
    node.title = `${TYPE_LABEL[annotation.type]}${annotation.comment ? ': ' + annotation.comment : ''}`;
    node.onclick = (event) => { event.stopPropagation(); host.onPinClick(annotation.id); };
    part(UI_PART.Pins).appendChild(node);
    state.pins.push({ annotation, el, node });
    positionPins();
  }

  function clearPins() {
    state.pins = [];
    part(UI_PART.Pins).innerHTML = '';
  }

  function positionPins() {
    const viewport = viewportOf(win);
    for (const pin of state.pins) {
      const rect = pin.el.getBoundingClientRect();
      pin.node.style.display = isOnScreen(rect, viewport) ? DISPLAY.Flex : DISPLAY.None;
      pin.node.style.left = Math.max(PIN_MARGIN, rect.left) + 'px';
      pin.node.style.top = Math.max(PIN_MARGIN, rect.top) + 'px';
    }
  }

  // ---------- interface helpers ----------
  function part(selector) {
    return ui.querySelector(selector);
  }

  function showBox(selector, el) {
    const rect = el.getBoundingClientRect();
    Object.assign(part(selector).style, {
      display: DISPLAY.Block, left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px',
    });
  }

  function hideBox(selector) {
    part(selector).style.display = DISPLAY.None;
  }
}

module.exports = { attach };
