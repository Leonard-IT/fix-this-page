// Duplicated blocks: copies of an element shown after it, marked as ours.
const { ATTR } = require('./dom.js');

function createClone(source, cloneId, sourceSelector) {
  const copy = source.cloneNode(true);
  copy.setAttribute(ATTR.Clone, cloneId);
  copy.setAttribute(ATTR.Source, sourceSelector);
  return copy;
}

// Later copies of the same block go after the earlier ones, so they keep the order they were made in
function insertCloneAfter(source, copy) {
  const earlier = clonesOf(source.ownerDocument, copy.getAttribute(ATTR.Source)).filter((c) => c !== copy);
  const last = earlier.length ? earlier[earlier.length - 1] : source;
  last.after(copy);
}

function clonesOf(doc, sourceSelector) {
  return [...doc.querySelectorAll(`[${ATTR.Source}]`)].filter((c) => c.getAttribute(ATTR.Source) === sourceSelector);
}

module.exports = { createClone, insertCloneAfter, clonesOf };
