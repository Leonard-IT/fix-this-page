// Showing a stored item in the page.
const { ANNOTATION_TYPE } = require('./annotation-types.js');
const { applyChanges, invertChanges } = require('./apply-changes.js');
const { createClone, insertCloneAfter } = require('./clones.js');
const { ATTR } = require('./dom.js');

const NOTHING_TO_REVERT = () => {};

/** Shows the item's change in the page; answers the element its pin belongs on and how to take the change out. */
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

module.exports = { applyToPage, NOTHING_TO_REVERT };
