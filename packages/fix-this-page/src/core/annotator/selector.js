// Finding an element again: a selector that matches the original source code, with a text search as fallback.
const {
  SKIPPED_TAGS, CLONE_SELECTOR, isAnnotatorElement, isDocumentRoot, isElement, tagOf, norm,
} = require('./dom.js');

const SELF_PATH = '.';
const SELECTOR_SEPARATOR = ' > ';
const SELECTOR_PART_PATTERN = /^([a-z][a-z0-9-]*)(?:#([^.:\s]+))?[^:]*?(?::nth-of-type\((\d+)\))?$/i;
const ID_PATTERN = /^[A-Za-z][\w-]*$/;
const CLASS_PATTERN = /^[A-Za-z_][\w-]*$/;
const OWN_CLASS_PREFIX = 'fb-';
const MAX_SELECTOR_CLASSES = 2;
const TAG = Object.freeze({ Html: 'html', Body: 'body' });

// Duplicated blocks are not counted, so selectors match the original source code.
function selectorFor(el, root) {
  if (root && el === root) return SELF_PATH;
  const parts = root ? relativeSegments(el, root) : documentSegments(el);
  return parts.join(SELECTOR_SEPARATOR);
}

function relativeSegments(el, root) {
  const parts = [];
  for (let current = el; isElement(current) && current !== root; current = current.parentElement) {
    parts.unshift(structuralSegment(current));
  }
  return parts;
}

function documentSegments(el) {
  const parts = [];
  for (let current = el; isElement(current); current = current.parentElement) {
    if (isDocumentRoot(current)) return [tagOf(current), ...parts];
    const idSegment = uniqueIdSegment(current);
    if (idSegment) return [idSegment, ...parts]; // an id is unique, so the path can start there
    parts.unshift(structuralSegment(current));
  }
  return parts;
}

function uniqueIdSegment(el) {
  if (!hasUniqueId(el)) return '';
  return tagOf(el) + '#' + el.id;
}

function hasUniqueId(el) {
  if (!el.id || !ID_PATTERN.test(el.id)) return false;
  return el.ownerDocument.querySelectorAll('#' + CSS.escape(el.id)).length === 1;
}

function structuralSegment(el) {
  const classes = [...el.classList].filter(isStableClass).slice(0, MAX_SELECTOR_CLASSES).map((c) => '.' + c).join('');
  const siblings = childrenWithTag(el.parentElement, tagOf(el));
  const position = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(el) + 1})` : '';
  return tagOf(el) + classes + position;
}

function isStableClass(className) {
  return CLASS_PATTERN.test(className) && !className.startsWith(OWN_CLASS_PREFIX);
}

function resolve(doc, selector, root) {
  if (!selector) return null;
  if (selector === SELF_PATH) return root;
  const parts = selector.split(SELECTOR_SEPARATOR).map(parseSelectorPart);
  if (parts.includes(null)) return null;
  const [first, ...rest] = parts;
  const start = root ? nthChild(root, first) : resolveDocumentStart(doc, first);
  return rest.reduce((current, segment) => current && nthChild(current, segment), start) || null;
}

function resolveDocumentStart(doc, segment) {
  if (segment.tag === TAG.Html) return doc.documentElement;
  if (segment.tag === TAG.Body) return doc.body;
  if (segment.id) return doc.getElementById(segment.id);
  return nthChild(doc.documentElement, segment);
}

function parseSelectorPart(part) {
  const match = part.match(SELECTOR_PART_PATTERN);
  if (!match) return null;
  const [, tag, id, nth] = match;
  return { tag: tag.toLowerCase(), id, nth: nth ? Number(nth) : 1 };
}

function nthChild(parent, { tag, nth }) {
  return childrenWithTag(parent, tag)[nth - 1];
}

function childrenWithTag(parent, tag) {
  return [...parent.children].filter((child) => tagOf(child) === tag && !isAnnotatorElement(child));
}

function findTarget(doc, target) {
  return resolve(doc, target.selector) || findByText(doc, target.text);
}

// Fallback when the selector no longer matches, for example after a new snapshot
function findByText(doc, text) {
  if (!text) return null;
  const wanted = norm(text);
  const matches = [...doc.body.querySelectorAll('*')].filter((el) => isSearchable(el) && norm(el.textContent) === wanted);
  return matches.length ? matches[matches.length - 1] : null; // the last match is the deepest
}

function isSearchable(el) {
  return !SKIPPED_TAGS.has(el.tagName) && !el.closest(CLONE_SELECTOR);
}

module.exports = { SELF_PATH, SELECTOR_SEPARATOR, selectorFor, resolve, parseSelectorPart, findTarget };
