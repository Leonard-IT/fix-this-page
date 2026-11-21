// The annotation layer's own interface: the toolbar buttons, the panel's markup, and mounting it in the page.
const { ANNOTATION_TYPE, TYPE_LABEL, CHANGE_KIND } = require('./annotation-types.js');
const { ATTR, UI_TAG, LINK_SELECTOR, esc } = require('./dom.js');
const { UI_CSS, UI_HTML } = require('./styles.js');
const { swapPartners } = require('./swap.js');

const ACTION = Object.freeze({
  Comment: 'comment', Edit: 'edit', Link: 'link', Clone: 'clone', Move: 'move', Swap: 'swap', Delete: 'delete', Parent: 'parent', Close: 'close',
});
const TOOLBAR_ACTIONS = Object.freeze([
  { id: ACTION.Comment, label: 'Comment', icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
  { id: ACTION.Edit, label: 'Edit text', icon: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>' },
  { id: ACTION.Link, label: 'Link', icon: '<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>' },
  { id: ACTION.Clone, label: 'Duplicate', icon: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' },
  { id: ACTION.Move, label: 'Move: click, or press and drag', icon: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>' },
  { id: ACTION.Swap, label: 'Swap with a block like this', icon: '<path d="M7 3 3 7l4 4M3 7h14M17 21l4-4-4-4M21 17H7"/>' },
  { id: ACTION.Delete, label: 'Delete', icon: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>' },
  { id: ACTION.Parent, label: 'Select the surrounding block', icon: '<rect x="3" y="3" width="18" height="18" rx="3" stroke-dasharray="3 3"/><rect x="8" y="8" width="8" height="8" rx="1.5"/>' },
  { id: ACTION.Close, label: 'Close', icon: '<path d="M18 6 6 18M6 6l12 12"/>' },
]);
const ICON_SIZE = 16;
// On a live page the site's own handlers must not see these while the layer is active.
// Default actions stay, so focus and text selection keep working.
// Stopping these does not cancel their default action, so a finger still scrolls the page
const SHIELDED_EVENTS = Object.freeze([
  'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'touchcancel',
]);
const CONTAINED_EVENTS = Object.freeze([...SHIELDED_EVENTS, 'click', 'dblclick']);

function mountInterface(doc) {
  const element = doc.createElement(UI_TAG);
  element.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;display:block;';
  doc.documentElement.appendChild(element);
  keepEventsInside(element);
  const root = element.attachShadow({ mode: 'open' });
  root.innerHTML = UI_HTML;
  addStyleSheet(doc, root, UI_CSS);
  return { element, root };
}

/**
 * Events on our own controls are let through on the window so the controls work; this stops them at the
 * control's host element, after the controls handled them, so the site's handlers never see a tap on them.
 */
function keepEventsInside(element) {
  CONTAINED_EVENTS.forEach((type) => element.addEventListener(type, (event) => event.stopPropagation()));
}

/**
 * Adds CSS to a document or shadow root and answers a function that removes it again. A constructed
 * stylesheet is used where possible, because a site's Content Security Policy may block inline `<style>`.
 */
function addStyleSheet(doc, target, css) {
  if (!('adoptedStyleSheets' in target)) return addStyleElement(doc, target, css);
  const sheet = new doc.defaultView.CSSStyleSheet();
  sheet.replaceSync(css);
  target.adoptedStyleSheets = [...target.adoptedStyleSheets, sheet];
  return () => { target.adoptedStyleSheets = target.adoptedStyleSheets.filter((s) => s !== sheet); };
}

function addStyleElement(doc, target, css) {
  const style = doc.createElement('style');
  style.setAttribute(ATTR.Ours, '');
  style.textContent = css;
  const parent = target === doc ? doc.head || doc.documentElement : target;
  parent.appendChild(style);
  return () => style.remove();
}

function iconSvg(icon, size = ICON_SIZE) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`;
}

function toolbarButton({ id, label, icon }) {
  return `<button data-a="${id}" title="${label}" aria-label="${label}">${iconSvg(icon)}</button>`;
}

const isLinkChange = (change) => change.kind === CHANGE_KIND.Attr && change.name === 'href';

/**
 * The toolbar's icon and label for an item, so a list shows the same symbols as the buttons that made the items.
 * A link change has its own button there, although it is stored as an edit.
 * @returns {{ label: string, svg: string }}
 */
function annotationIcon(annotation, size = ICON_SIZE) {
  const changes = annotation.changes || [];
  const isLinkEdit = annotation.type === ANNOTATION_TYPE.Edit && changes.length > 0 && changes.every(isLinkChange);
  const action = TOOLBAR_ACTIONS.find((a) => a.id === (isLinkEdit ? ACTION.Link : annotation.type)) || TOOLBAR_ACTIONS[0];
  return { label: isLinkEdit ? action.label : TYPE_LABEL[annotation.type] || action.label, svg: iconSvg(action.icon, size) };
}

function panelHtml({ title, text, html = '', fields = '', saveLabel = 'Save', collapseComment = false, saveDisabled = false, hint = '', cancelOnly = false }) {
  if (cancelOnly) return `<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}<div class="row"><button data-x="cancel">Cancel</button></div>`;
  const noteLabel = collapseComment ? 'Note for the developer' : 'Comment (optional)';
  const notePlaceholder = collapseComment ? 'Why this change? This is NOT where the new text goes.' : 'Explanation for the developer';
  return `<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${html}${fields}
    ${collapseComment ? '<button class="linkbtn" data-x="note">+ Add a note for the developer (optional)</button>' : ''}
    <div data-x="notebox" ${collapseComment ? 'hidden' : ''}><label>${noteLabel}</label><textarea name="comment" placeholder="${notePlaceholder}"></textarea></div>
    <div class="row">${hint ? `<span class="hint" data-x="hint">${esc(hint)}</span>` : ''}<button data-x="cancel">Cancel</button><button class="primary" data-x="save" ${saveDisabled ? 'disabled' : ''}>${esc(saveLabel)}</button></div>`;
}

function resetPanelPosition(panel) {
  Object.assign(panel.style, { top: '', left: '', bottom: '', transform: '' });
}

function isActionAvailable(action, el) {
  if (action === ACTION.Link) return Boolean(el.closest(LINK_SELECTOR));
  if (action === ACTION.Parent) return hasSelectableParent(el);
  if (action === ACTION.Swap) return swapPartners(el).length > 0;
  return true;
}

function hasSelectableParent(el) {
  return Boolean(el.parentElement) && el.parentElement !== el.ownerDocument.body;
}

module.exports = {
  ACTION, SHIELDED_EVENTS, mountInterface, keepEventsInside, addStyleSheet, annotationIcon, panelHtml, toolbarButton,
  resetPanelPosition, isActionAvailable, TOOLBAR_ACTIONS,
};
