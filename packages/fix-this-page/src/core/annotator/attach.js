// The annotation layer itself: pointing at elements of a page, the toolbar and panel, and the pins.
const { ANNOTATION_TYPE, TYPE_LABEL, isDone } = require('./annotation-types.js');
const { applyToPage, NOTHING_TO_REVERT } = require('./apply-to-page.js');
const { applyChanges, invertChanges, isSafeChange } = require('./apply-changes.js');
const { createClone, insertCloneAfter, clonesOf } = require('./clones.js');
const { rebaseChanges, mergeChanges } = require('./copy-edits.js');
const { describeElement } = require('./describe-element.js');
const { swapPartners, swapUnit, swapMoves } = require('./swap.js');
const {
  flowAxis, positionsFor, choiceSpot, choiceLabel, hasDragStarted, dropPosition, dropLine, placeAt, rememberPosition,
} = require('./move.js');
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
const MOVE_ATTRIBUTES = Object.freeze([ATTR.Moving, ATTR.Moved]);
const PIN_MARGIN = 12;
const TIP_OFFSET = 36;
const REVEAL_DELAY_MS = 400;
const REVEAL_HIGHLIGHT_MS = 1200;
const KEY = Object.freeze({ Escape: 'Escape' });
const DISPLAY = Object.freeze({ None: 'none', Block: 'block', Flex: 'flex' });
const UI_PART = Object.freeze({
  HoverBox: '.hover', SelectionBox: '.sel', Pins: '.pins', Drops: '.drops', Toolbar: '.toolbar', Tip: '.tip', Panel: '.panel',
});
const PANEL_CONTROL = Object.freeze({
  Note: '[data-x="note"]', NoteBox: '[data-x="notebox"]', Hint: '[data-x="hint"]', StepTwo: '[data-x="n2"]',
  Cancel: '[data-x="cancel"]', Save: '[data-x="save"]',
});
const HINT = Object.freeze({ Waiting: 'Waiting for your change…', Detected: 'Change detected ✓' });
const MOVE_TEXT = Object.freeze({ Pick: 'Hover or tap the block it should go next to, then choose Before or After. The move is saved right away.' });
const SWAP_TEXT = Object.freeze({
  Pick: 'Click the outlined block it should trade places with. The swap is saved right away.',
  NoPlace: 'These two blocks cannot be swapped here. Use Move instead.',
});

/**
 * @typedef {{ selector: string, text: string, html: string, heading: string }} ElementDescription
 * @typedef {{ type: string, target: ElementDescription, comment?: string, changes?: object[], placement?: object }} Draft
 * @typedef {object} Host
 * @property {(draft: Draft) => Promise<object>} save  stores the item and answers the stored annotation (with id and number)
 * @property {(annotation: object) => void} onSaved
 * @property {(annotationId: string, draft: Draft) => Promise<object>} replace  stores the draft in place of an item, and answers the new item
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
  const state = { selected: null, editing: null, moving: null, swapping: null, pins: [], panelAnchor: null, applied: [] };
  const startAction = Object.freeze({
    [ACTION.Comment]: startComment,
    [ACTION.Edit]: startTextEdit,
    [ACTION.Link]: startLinkEdit,
    [ACTION.Clone]: startDuplicate,
    [ACTION.Move]: startMove,
    [ACTION.Swap]: startSwap,
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
      if (!shown) { missingIds.add(annotation.id); continue; }
      state.applied.push({ annotation, revert: shown.revert });
      addPin(annotation, shown.el);
    }
    return missingIds;
  }

  /** Takes the layer out of the page again: its interface, its listeners and every change it shows. */
  function detach() {
    if (state.editing) state.editing.cancel();
    if (state.moving) state.moving.cancel();
    if (state.swapping) state.swapping.cancel();
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
    return Boolean(state.editing) || Boolean(state.moving) || Boolean(state.swapping) || isPanelOpen();
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
    if (state.moving) return isInterfaceEvent(event) ? undefined : offerPositions(event.target);
    if (state.swapping) return isInterfaceEvent(event) ? undefined : showSwapPartner(event.target);
    if (isBusy() || isInterfaceEvent(event) || !isPageElement(event.target)) return hideBox(UI_PART.HoverBox);
    showBox(UI_PART.HoverBox, event.target);
  }

  function onClick(event) {
    if (isInterfaceEvent(event)) return;
    if (isInEditedElement(event)) return; // lets the cursor be placed in the text
    event.preventDefault();
    event.stopImmediatePropagation();
    if (state.moving) return offerPositions(event.target);
    if (state.swapping) return chooseSwapPartner(event.target);
    if (isBusy()) return;
    const el = event.target;
    if (!isPageElement(el)) return clearSelection();
    select(el);
  }

  function onDoubleClick(event) {
    if (isInterfaceEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (isBusy()) return;
    const el = event.target;
    if (!isPageElement(el)) return;
    select(el);
    runAction(ACTION.Edit);
  }

  function onKeyDown(event) {
    if (event.key !== KEY.Escape) return;
    if (state.editing) return state.editing.cancel();
    if (state.moving) return state.moving.cancel();
    if (state.swapping) return state.swapping.cancel();
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
    clearDrops();
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
    const moveButton = toolbar.querySelector(`[data-a="${ACTION.Move}"]`);
    if (moveButton) moveButton.onpointerdown = (event) => watchForDrag(moveButton, event, el);
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
        await saveEdit({ el, target, changes, comment }, () => { el.innerHTML = originalHtml; });
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
        await saveEdit({ el: link, target, changes, comment }, () => applyChanges(link, invertChanges(previewed)));
      },
      onCancel: () => select(el),
    });
  }

  // The copy is saved at once; after that its parts are changed like those of any other block
  async function startDuplicate(el) {
    const target = describeElement(el);
    const order = clonesOf(doc, target.selector).length + 1;
    const copy = createClone(el, NEW_CLONE_ID, target.selector);
    insertCloneAfter(el, copy);
    copy.scrollIntoView({ block: 'center', behavior: 'smooth' });
    clearSelection();
    try {
      const annotation = await host.save({
        type: ANNOTATION_TYPE.Clone, target, changes: [], comment: '', placement: { ...CLONE_PLACEMENT, order },
      });
      copy.setAttribute(ATTR.Clone, annotation.id);
      afterSave(annotation, copy, () => copy.remove());
      select(copy);
    } catch (error) {
      copy.remove();
      host.notify('Saving failed: ' + error.message);
      select(el);
    }
  }

  // The block stays where it is until a spot is chosen; choosing shows it there, and saving keeps it there
  function startMove(el) {
    beginMove(el);
    openMovePanel();
  }

  function beginMove(el) {
    const target = describeElement(el);
    const restore = rememberPosition(el);
    const cancel = () => {
      restore();
      MOVE_ATTRIBUTES.forEach((name) => el.removeAttribute(name));
      state.moving = null;
      clearDrops();
      hideBox(UI_PART.HoverBox);
      closePanel();
      select(el);
    };
    state.moving = { el, restore, cancel, target };
    el.setAttribute(ATTR.Moving, '');
    clearSelection();
  }

  function openMovePanel() {
    openPanel({
      title: 'Move block', text: MOVE_TEXT.Pick, cancelOnly: true, onCancel: state.moving.cancel,
    });
  }

  // A press on the Move button stays a click, which starts the two-step move, until the pointer travels;
  // then the block is dragged and goes where it is let go
  function watchForDrag(button, down, el) {
    const start = pointOf(down);
    button.setPointerCapture(down.pointerId);
    button.onpointermove = (event) => {
      if (!hasDragStarted(start, pointOf(event))) return;
      button.onpointermove = null;
      startDrag(el, event.pointerId);
    };
    button.onlostpointercapture = () => { button.onpointermove = null; };
  }

  // The pointer is captured by the layer's host from here on, so letting go is not also a click on the button
  // and the toolbar can be hidden without ending the drag
  function startDrag(el, pointerId) {
    uiHost.setPointerCapture(pointerId);
    beginMove(el);
    const move = state.moving;
    const dragEnd = new AbortController();
    const options = { signal: dragEnd.signal };
    // Escape can end the move halfway through a drag
    const isStillDragging = () => {
      if (state.moving === move) return true;
      dragEnd.abort();
      return false;
    };
    uiHost.addEventListener('pointermove', (event) => { if (isStillDragging()) showDrop(move, pointOf(event)); }, options);
    uiHost.addEventListener('pointerup', () => { if (isStillDragging()) dropDragged(move); dragEnd.abort(); }, options);
    uiHost.addEventListener('pointercancel', () => { if (isStillDragging()) move.cancel(); dragEnd.abort(); }, options);
  }

  function showDrop(move, point) {
    move.drop = dropUnder(move.el, point);
    if (!move.drop) {
      hideBox(UI_PART.HoverBox);
      return clearDrops();
    }
    const { anchor, axis, position } = move.drop;
    const rect = anchor.getBoundingClientRect();
    showBox(UI_PART.HoverBox, anchor);
    const line = dropLine(rect, axis, position);
    part(UI_PART.Drops).innerHTML = `<div class="dropline" style="left:${line.left}px;top:${line.top}px;width:${line.width}px;height:${line.height}px"></div>`;
  }

  // The block the pointer is over, and the side of it the pointer is on, if letting go there would move anything
  function dropUnder(el, point) {
    const anchor = doc.elementFromPoint(point.x, point.y);
    const positions = anchor ? positionsFor(el, anchor) : [];
    if (!positions.length) return null;
    const axis = flowAxis(win.getComputedStyle(anchor.parentElement));
    const position = dropPosition(anchor.getBoundingClientRect(), axis, point);
    if (!positions.includes(position)) return null;
    return { anchor, axis, position };
  }

  function dropDragged(move) {
    if (!move.drop) return move.cancel();
    chooseSpot(move.drop.anchor, move.drop.position);
  }

  function pointOf(event) {
    return { x: event.clientX, y: event.clientY };
  }

  // The choices appear on the block the pointer is over, on its edges
  function offerPositions(anchor) {
    const positions = positionsFor(state.moving.el, anchor);
    if (!positions.length) return clearDrops();
    showBox(UI_PART.HoverBox, anchor);
    const axis = flowAxis(win.getComputedStyle(anchor.parentElement));
    const rect = anchor.getBoundingClientRect();
    const drops = part(UI_PART.Drops);
    drops.innerHTML = positions.map((position) => dropButton(position, axis, choiceSpot(rect, axis, position, viewportOf(win)))).join('');
    drops.querySelectorAll('button').forEach((button) => {
      button.onclick = (event) => { event.stopPropagation(); chooseSpot(anchor, button.dataset.p); };
    });
  }

  function dropButton(position, axis, spot) {
    return `<button class="drop" data-p="${position}" style="left:${spot.left}px;top:${spot.top}px">${choiceLabel(axis, position)}</button>`;
  }

  function clearDrops() {
    part(UI_PART.Drops).innerHTML = '';
  }

  async function chooseSpot(anchor, position) {
    const { el, restore, target } = state.moving;
    // The anchor is described on the page as it was, before the block is shown in its new place
    restore();
    // The choices were offered while an earlier choice was shown, so this one can be where the block started
    if (!positionsFor(el, anchor).includes(position)) return resetChoice(el);
    const placement = { position, anchor: describeElement(anchor) };
    placeAt(el, anchor, position);
    el.removeAttribute(ATTR.Moving);
    el.setAttribute(ATTR.Moved, '');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    clearDrops();
    hideBox(UI_PART.HoverBox);
    try {
      const annotation = await host.save({ type: ANNOTATION_TYPE.Move, target, placement });
      state.moving = null;
      closePanel();
      afterSave(annotation, el, () => { el.removeAttribute(ATTR.Moved); restore(); });
    } catch (error) {
      host.notify('Saving failed: ' + error.message); // the block stays where it was shown, so another spot can be chosen
      // A drag has no panel yet; without one there would be no way to choose again or cancel
      if (!isPanelOpen()) openMovePanel();
    }
  }

  // Back to the start of a move: the block is where it began and nothing is chosen yet
  function resetChoice(el) {
    state.moving.placement = null;
    el.removeAttribute(ATTR.Moved);
    el.setAttribute(ATTR.Moving, '');
    clearDrops();
    hideBox(UI_PART.HoverBox);
    const panel = part(UI_PART.Panel);
    panel.querySelector('p').textContent = MOVE_TEXT.Pick;
    panel.querySelector(PANEL_CONTROL.Save).disabled = true;
  }

  // The look-alikes are outlined; clicking one trades places with it and saves the swap as moves
  function startSwap(el) {
    const partners = swapPartners(el);
    partners.forEach((partner) => partner.setAttribute(ATTR.SwapPartner, ''));
    el.setAttribute(ATTR.Moving, '');
    clearSelection();
    const end = () => {
      partners.forEach((partner) => partner.removeAttribute(ATTR.SwapPartner));
      el.removeAttribute(ATTR.Moving);
      hideBox(UI_PART.HoverBox);
      state.swapping = null;
      closePanel();
    };
    const cancel = () => { end(); select(el); };
    state.swapping = { el, partners, end, cancel };
    openPanel({ title: 'Swap block', text: SWAP_TEXT.Pick, cancelOnly: true, onCancel: cancel });
  }

  // Look-alikes can be nested; the innermost one under the pointer is meant, and it comes last in page order
  function swapPartnerAt(node) {
    return state.swapping.partners.filter((partner) => partner.contains(node)).pop();
  }

  function showSwapPartner(node) {
    const partner = swapPartnerAt(node);
    if (!partner) return hideBox(UI_PART.HoverBox);
    showBox(UI_PART.HoverBox, partner);
  }

  async function chooseSwapPartner(node) {
    const partner = swapPartnerAt(node);
    if (!partner) return;
    const { el, end } = state.swapping;
    const moves = swapMoves(swapUnit(el, partner), swapUnit(partner, el));
    if (!moves.length) return host.notify(SWAP_TEXT.NoPlace);
    end();
    for (const move of moves) {
      if (!(await saveMove(move))) return;
    }
  }

  // Each move is described on the page as it is at that moment, after the moves before it, as consumers apply them
  async function saveMove({ el, anchor, position }) {
    const target = describeElement(el);
    const placement = { position, anchor: describeElement(anchor) };
    const restore = rememberPosition(el);
    const takeOut = () => { el.removeAttribute(ATTR.Moved); restore(); };
    placeAt(el, anchor, position);
    el.setAttribute(ATTR.Moved, '');
    try {
      const annotation = await host.save({ type: ANNOTATION_TYPE.Move, target, placement });
      afterSave(annotation, el, takeOut);
      return true;
    } catch (error) {
      takeOut();
      host.notify('Saving failed: ' + error.message);
      return false;
    }
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

  // A change inside a copy goes into the item that made the copy, which is saved again with the change added
  async function saveEdit({ el, target, changes, comment }, revert) {
    const copy = el.closest(CLONE_SELECTOR);
    if (copy) return saveCopyEdit(copy, el, changes, comment);
    const annotation = await host.save({ type: ANNOTATION_TYPE.Edit, target, changes, comment });
    afterSave(annotation, el, revert);
  }

  async function saveCopyEdit(copy, el, changes, comment) {
    const shown = state.applied.find((applied) => applied.annotation.id === copy.getAttribute(ATTR.Clone));
    if (!shown) throw new Error('This copy is not saved yet');
    const { annotation: previous } = shown;
    const annotation = await host.replace(previous.id, {
      type: ANNOTATION_TYPE.Clone,
      target: previous.target,
      changes: mergeChanges(previous.changes, rebaseChanges(changes, el, copy)),
      comment: [previous.comment, comment].filter(Boolean).join('\n'),
      placement: previous.placement,
    });
    forget(shown);
    copy.setAttribute(ATTR.Clone, annotation.id);
    afterSave(annotation, copy, shown.revert);
  }

  function forget(shown) {
    state.applied = state.applied.filter((applied) => applied !== shown);
    const pin = state.pins.find((p) => p.annotation.id === shown.annotation.id);
    if (!pin) return;
    pin.node.remove();
    state.pins = state.pins.filter((p) => p !== pin);
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
    const save = panel.querySelector(PANEL_CONTROL.Save);
    if (save) save.onclick = () => submitPanel(panel, () => onSave(field));
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
