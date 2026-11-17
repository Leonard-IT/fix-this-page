// What an item records about its element, so a developer or an agent can find it in the source.
const { selectorFor } = require('./selector.js');
const {
  ATTR, SKIPPED_TAGS, NODE_TYPE, isAnnotatorElement, isDocumentRoot, tagOf, norm,
} = require('./dom.js');

const HEADING_PATTERN = /^H[1-6]$/;
const MAX_TEXT_LENGTH = 300;
const MAX_HEADING_LENGTH = 100;
// The html anchor keeps what an agent can find in the source; see `snippet`
const SNIPPET = Object.freeze({ MaxLength: 600, MaxDepth: 3, MaxText: 60, MaxAttributeValue: 100 });
const SNIPPET_STRIPPED_ATTRS = Object.freeze([ATTR.Editable, ATTR.Deleted, ATTR.Clone, ATTR.Moving, ATTR.Moved]);
const ELLIPSIS = '…';
const SVG_TAG = 'svg';
const SVG_KEPT_ATTRS = Object.freeze(['class']);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// What outerHTML escapes, so the snippet reads like the page's own markup
const HTML_ESCAPES = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' });
const ESCAPED_IN_TEXT = /[&<>]/g;
const ESCAPED_IN_ATTRIBUTE = /[&"]/g;

/**
 * @typedef {{ selector: string, text: string, html: string, heading: string }} ElementDescription
 * @returns {ElementDescription}
 */
function describeElement(el) {
  return {
    selector: selectorFor(el),
    text: norm(el.textContent).slice(0, MAX_TEXT_LENGTH),
    html: snippet(el),
    heading: nearestHeading(el),
  };
}

// The heading of the section the element is in: the nearest heading before it, at the same level or higher up the tree
function nearestHeading(el) {
  for (let current = el; current && !isDocumentRoot(current); current = current.parentElement) {
    const heading = previousHeading(current);
    if (heading) return norm(heading.textContent).slice(0, MAX_HEADING_LENGTH);
  }
  return '';
}

function previousHeading(el) {
  for (let sibling = el.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
    if (HEADING_PATTERN.test(sibling.tagName) && !isAnnotatorElement(sibling)) return sibling;
  }
  return null;
}

/**
 * The element as a skeleton: tags and attributes a few levels deep and the start of each text, with deeper content
 * and SVG drawings as `…`. Those are page data or drawing paths that no source search finds, and they made a
 * comment on a card several kilobytes large. Levels are dropped from the bottom until it fits.
 */
function snippet(el) {
  for (let depth = SNIPPET.MaxDepth; depth >= 0; depth -= 1) {
    const html = skeleton(el, depth);
    if (html.length <= SNIPPET.MaxLength) return html;
  }
  return skeleton(el, 0).slice(0, SNIPPET.MaxLength) + ELLIPSIS;
}

function skeleton(node, depth) {
  if (node.nodeType === NODE_TYPE.Text) return escapeHtml(shorten(node.nodeValue.replace(/\s+/g, ' '), SNIPPET.MaxText), ESCAPED_IN_TEXT);
  const tag = tagOf(node);
  const open = `<${tag}${attributesOf(node)}>`;
  if (VOID_TAGS.has(tag)) return open;
  return `${open}${contentOf(node, depth)}</${tag}>`;
}

function contentOf(el, depth) {
  const children = [...el.childNodes].filter(isSnippetContent);
  if (!children.length) return '';
  if (tagOf(el) === SVG_TAG) return ELLIPSIS;
  // A label such as a button text is often written as is in the source, so it stays at the deepest level
  if (depth === 0 && !isOnlyText(children)) return ELLIPSIS;
  return children.map((child) => skeleton(child, depth - 1)).join('');
}

function isOnlyText(children) {
  return children.length === 1 && children[0].nodeType === NODE_TYPE.Text;
}

function isSnippetContent(node) {
  if (node.nodeType === NODE_TYPE.Text) return Boolean(node.nodeValue.trim());
  return node.nodeType === NODE_TYPE.Element && !SKIPPED_TAGS.has(node.tagName) && !isAnnotatorElement(node);
}

function attributesOf(el) {
  const kept = tagOf(el) === SVG_TAG ? (a) => SVG_KEPT_ATTRS.includes(a.name) : (a) => !SNIPPET_STRIPPED_ATTRS.includes(a.name);
  return [...el.attributes].filter(kept)
    .map((a) => ` ${a.name}="${escapeHtml(shorten(a.value, SNIPPET.MaxAttributeValue), ESCAPED_IN_ATTRIBUTE)}"`).join('');
}

function shorten(text, max) {
  return text.length > max ? text.slice(0, max) + ELLIPSIS : text;
}

function escapeHtml(text, pattern) {
  return text.replace(pattern, (c) => HTML_ESCAPES[c]);
}

module.exports = { describeElement, snippet };
