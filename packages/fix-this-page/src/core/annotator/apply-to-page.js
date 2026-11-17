// Showing a stored item in the page.
const { ANNOTATION_TYPE } = require('./annotation-types.js');
const { applyChanges, invertChanges } = require('./apply-changes.js');
const { createClone, insertCloneAfter } = require('./clones.js');
const { ATTR } = require('./dom.js');
const { POSITION, canBeAnchor, placeAt, rememberPosition } = require('./move.js');
const { findTarget } = require('./selector.js');

const NOTHING_TO_REVERT = () => {};

/**
 * Shows the item's change in the page; answers the element its pin belongs on and how to take the change out,
 * or null when the change cannot be shown, for example because the block it goes next to is gone.
 */
function applyToPage(annotation, el) {
  switch (annotation.type) {
    case ANNOTATION_TYPE.Edit:
      applyChanges(el, annotation.changes);
      return { el, revert: () => applyChanges(el, invertChanges(annotation.changes)) };
    case ANNOTATION_TYPE.Delete:
      el.setAttribute(ATTR.Deleted, '');
      return { el, revert: () => el.removeAttribute(ATTR.Deleted) };
    case ANNOTATION_TYPE.Clone:
      return showClone(annotation, el);
    case ANNOTATION_TYPE.Move:
      return showMove(annotation, el);
    default:
      return { el, revert: NOTHING_TO_REVERT };
  }
}

function showClone(annotation, source) {
  const copy = createClone(source, annotation.id, annotation.target.selector);
  insertCloneAfter(source, copy);
  applyChanges(copy, annotation.changes);
  return { el: copy, revert: () => copy.remove() };
}

function showMove(annotation, el) {
  const { position, anchor: description } = annotation.placement || {};
  const anchor = description && findTarget(el.ownerDocument, description);
  if (!anchor || !Object.values(POSITION).includes(position) || !canBeAnchor(el, anchor)) return null;
  const restore = rememberPosition(el);
  placeAt(el, anchor, position);
  el.setAttribute(ATTR.Moved, '');
  return { el, revert: () => { el.removeAttribute(ATTR.Moved); restore(); } };
}

module.exports = { applyToPage, NOTHING_TO_REVERT };
