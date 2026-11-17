// Showing stored changes in the page, and taking them out again.
const { CHANGE_KIND } = require('./annotation-types.js');
const { SELF_PATH, resolve } = require('./selector.js');
const { directText, textNodesOf, norm } = require('./dom.js');

// The same list the server accepts; the editor itself only changes href
const CHANGEABLE_ATTRS = Object.freeze(['href', 'src', 'alt', 'title']);
const SCRIPT_SCHEME = /^(javascript|vbscript|data):/i;
const NODE_FILTER_SHOW_TEXT = 4; // NodeFilter.SHOW_TEXT, written out so the tests run without a DOM
// The same white space `norm` collapses
const WHITE_SPACE = /\s/;

/** The changes that undo the given ones. */
function invertChanges(changes) {
  return (changes || []).map((change) => ({ ...change, from: change.to, to: change.from }));
}

// Changes can come from an imported file or from storage the site's own scripts can write to, so on a live page
// an unchecked attribute change could add an event handler or a javascript: link to the site
function applyChanges(root, changes) {
  for (const change of (changes || []).filter(isSafeChange)) {
    const node = resolve(root.ownerDocument, change.path || SELF_PATH, root);
    if (!node) continue;
    if (change.kind === CHANGE_KIND.Text) applyTextChange(node, change.from, change.to);
    if (change.kind === CHANGE_KIND.Attr) applyAttributeChange(node, change);
  }
}

// PCF writes null to remove an attribute, and setAttribute would write the text "null" instead
function applyAttributeChange(node, change) {
  const name = change.name.toLowerCase();
  if (change.to === null) return node.removeAttribute(name);
  node.setAttribute(name, change.to);
}

// `from` is the element's whole text. Items saved before that held only the element's own text, and still replay.
// When neither matches, the page changed since the item was made, and the change is not shown.
function applyTextChange(el, from, to) {
  if (norm(el.textContent) === norm(from)) return replaceText(el, textEdit(from, to));
  if (directText(el) === norm(from)) setDirectText(el, to);
}

/** The part of `from` that `to` replaces, in positions of the normalized text: [start, end) becomes `insert`. */
function textEdit(from, to) {
  const a = norm(from);
  const b = norm(to);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let tail = 0;
  while (tail < a.length - start && tail < b.length - start && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1;
  return { start, end: a.length - tail, insert: b.slice(start, b.length - tail) };
}

// Changes only the text nodes the edit touches, so links and bold text inside the element keep their markup
function replaceText(el, { start, end, insert }) {
  const nodes = allTextNodes(el);
  const positions = normalizedPositions(nodes.map((node) => node.nodeValue));
  if (!positions.length) return el.appendChild(el.ownerDocument.createTextNode(insert));
  const first = positions[start] || afterPosition(positions[positions.length - 1]);
  if (end <= start) return nodes[first.index].insertData(first.offset, insert);
  const last = afterPosition(positions[end - 1]);
  if (first.index === last.index) return nodes[first.index].replaceData(first.offset, last.offset - first.offset, insert);
  nodes[first.index].replaceData(first.offset, nodes[first.index].length - first.offset, insert);
  nodes.slice(first.index + 1, last.index).forEach((node) => { node.nodeValue = ''; });
  nodes[last.index].deleteData(0, last.offset);
}

function afterPosition({ index, offset }) {
  return { index, offset: offset + 1 };
}

function allTextNodes(el) {
  const walker = el.ownerDocument.createTreeWalker(el, NODE_FILTER_SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

/**
 * For each character of the normalized text of these text node values (see `norm`): the node index and offset
 * it comes from. A run of white space counts as one space, at its first character; leading and trailing runs drop.
 */
function normalizedPositions(values) {
  const positions = [];
  let pendingSpace = null;
  values.forEach((value, index) => {
    for (let offset = 0; offset < value.length; offset += 1) {
      if (!WHITE_SPACE.test(value[offset])) {
        if (pendingSpace) positions.push(pendingSpace);
        pendingSpace = null;
        positions.push({ index, offset });
      } else if (positions.length && !pendingSpace) {
        pendingSpace = { index, offset };
      }
    }
  });
  return positions;
}

/**
 * A text change, or a change of an attribute the editor itself can make to a value that cannot run script.
 * Only `to` is checked: undoing a change applies the inverted change, which has the old value as its `to`.
 */
function isSafeChange(change) {
  if (!change || typeof change !== 'object') return false;
  if (change.kind === CHANGE_KIND.Text) return true;
  if (change.kind !== CHANGE_KIND.Attr || !CHANGEABLE_ATTRS.includes(String(change.name).toLowerCase())) return false;
  return !hasScriptScheme(change.to);
}

// Browsers skip control characters and whitespace inside a scheme, so "java\tscript:" still runs
function hasScriptScheme(value) {
  return SCRIPT_SCHEME.test(String(value ?? '').replace(/[\u0000-\x20]/g, ''));
}

// Keeps the surrounding whitespace and the element's children; other text nodes collapse to a space
function setDirectText(el, text) {
  const textNodes = textNodesOf(el);
  const first = textNodes.find((node) => node.nodeValue.trim()) || textNodes[0];
  if (!first) return el.appendChild(el.ownerDocument.createTextNode(text));
  first.nodeValue = first.nodeValue.match(/^\s*/)[0] + text + first.nodeValue.match(/\s*$/)[0];
  textNodes.filter((node) => node !== first && node.nodeValue.trim()).forEach((node) => { node.nodeValue = ' '; });
}

module.exports = { applyChanges, applyAttributeChange, invertChanges, isSafeChange, textEdit, normalizedPositions };
