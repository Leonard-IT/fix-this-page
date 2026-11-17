// What the annotation layer knows about the document it is attached to: our own markers, which elements are
// not the page's, and the plain text of an element.
const ATTR = Object.freeze({
  Clone: 'data-fb-clone', Source: 'data-fb-source', Deleted: 'data-fb-deleted', Moving: 'data-fb-moving', Moved: 'data-fb-moved', Ours: 'data-fb', Editable: 'contenteditable',
});
const UI_TAG = 'fb-ui';
const CLONE_SELECTOR = `[${ATTR.Clone}]`;
const LINK_SELECTOR = 'a[href]';
// Not part of the page's content, so they are never searched or diffed
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', UI_TAG.toUpperCase(), 'NOSCRIPT', 'TEMPLATE']);
const NODE_TYPE = Object.freeze({ Element: 1, Text: 3 });

function isAnnotatorElement(el) {
  return el.hasAttribute(ATTR.Clone) || el.hasAttribute(ATTR.Ours) || tagOf(el) === UI_TAG;
}

// The host's own controls, such as the overlay's dock, carry data-fb and are not part of the page
function isHostControl(node) {
  return node.nodeType === NODE_TYPE.Element && node.hasAttribute(ATTR.Ours);
}

function isDocumentRoot(el) {
  return el === el.ownerDocument.body || el === el.ownerDocument.documentElement;
}

function isPageElement(el) {
  return Boolean(el) && !isDocumentRoot(el);
}

function isElement(node) {
  return Boolean(node) && node.nodeType === NODE_TYPE.Element;
}

function tagOf(el) {
  return el.tagName.toLowerCase();
}

function directText(el) {
  return norm(textNodesOf(el).map((node) => node.nodeValue).join(' '));
}

function textNodesOf(el) {
  return [...el.childNodes].filter((node) => node.nodeType === NODE_TYPE.Text);
}

function norm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = {
  ATTR, UI_TAG, CLONE_SELECTOR, LINK_SELECTOR, SKIPPED_TAGS, NODE_TYPE,
  isAnnotatorElement, isHostControl, isDocumentRoot, isPageElement, isElement, tagOf, directText, textNodesOf, norm, esc,
};
