// Swapping two look-alike blocks, such as two cards or two buttons. A swap is stored as one or two moves, so the
// Page Change Format needs nothing new. Decisions only; the moves are placed by the caller.
const { CLONE_SELECTOR, isAnnotatorElement, isPageElement } = require('./dom.js');
const { POSITION } = require('./move.js');

/** Classes in any order mean the same look. */
function classKey(el) {
  return [...el.classList].sort().join(' ');
}

// Deep enough to tell a card from a button, shallow enough that one extra paragraph deep inside does not matter
const SKELETON_DEPTH = 3;

/** The tags of an element and its descendants, ignoring classes, so blocks built from one template read the same. */
function skeleton(el, depth = SKELETON_DEPTH) {
  if (depth === 0) return el.tagName;
  return `${el.tagName}[${[...el.children].map((child) => skeleton(child, depth - 1)).join(',')}]`;
}

function sharesClass(a, b) {
  const names = new Set(b.classList);
  return [...a.classList].some((name) => names.has(name));
}

/**
 * Whether two blocks look alike: the same tag and the same classes, or the same tag and the same build with
 * differing classes (a modifier such as `card-2`) when they share a class or a parent. Blocks without classes only
 * look alike as siblings, since every plain `div` of a page would otherwise be on offer.
 */
function looksAlike(a, b) {
  if (a.tagName !== b.tagName) return false;
  const sameParent = a.parentElement === b.parentElement;
  if (classKey(a) === classKey(b)) return a.classList.length > 0 || sameParent;
  if (!sameParent && !sharesClass(a, b)) return false;
  return skeleton(a) === skeleton(b);
}

/** Whether `other` can trade places with `el`: another look-alike of the page's own, apart from it. */
function canSwap(el, other) {
  if (other === el || !isPageElement(other) || isAnnotatorElement(other)) return false;
  if (other.closest(CLONE_SELECTOR)) return false;
  if (el.contains(other) || other.contains(el)) return false;
  return looksAlike(el, other);
}

/** The blocks `el` can trade places with, in page order. */
function swapPartners(el) {
  return [...el.ownerDocument.getElementsByTagName(el.tagName)].filter((other) => canSwap(el, other));
}

/**
 * What actually trades places: a block that is alone in its wrapper takes the wrapper along, as in a grid where
 * each card has its own column. It stops at a wrapper that also holds the other block.
 */
function swapUnit(el, other) {
  let unit = el;
  while (isWrapperOf(unit.parentElement, unit) && !unit.parentElement.contains(other)) unit = unit.parentElement;
  return unit;
}

function isWrapperOf(parent, child) {
  return isPageElement(parent) && parent.childElementCount === 1 && parent.firstElementChild === child;
}

/**
 * The moves that swap two units, in the order they are applied. Neighbours need one move. Otherwise the first
 * goes next to the second, and the second goes where the first was, next to the first's old neighbour.
 * Answers no moves when the first has no neighbour to mark its place.
 * @returns {{ el: Element, anchor: Element, position: string }[]}
 */
function swapMoves(first, second) {
  if (first.nextElementSibling === second) return [{ el: first, anchor: second, position: POSITION.After }];
  if (first.previousElementSibling === second) return [{ el: first, anchor: second, position: POSITION.Before }];
  const place = placeOf(first);
  if (!place) return [];
  return [{ el: first, anchor: second, position: POSITION.Before }, { el: second, ...place }];
}

function placeOf(el) {
  if (el.previousElementSibling) return { anchor: el.previousElementSibling, position: POSITION.After };
  if (el.nextElementSibling) return { anchor: el.nextElementSibling, position: POSITION.Before };
  return null;
}

// The candidates' ring (outline and the gap before it) reaches this far outside the block
const RING_SIZE = 7;

function isInside(inner, outer) {
  return inner !== outer && inner.left >= outer.left && inner.top >= outer.top
    && inner.left + inner.width <= outer.left + outer.width && inner.top + inner.height <= outer.top + outer.height;
}

/**
 * A clip path that covers the whole viewport except a ring-sized margin around each given rectangle, so the page
 * can be washed out with the swap candidates left as they are. A rectangle inside another one is left out: with the
 * even-odd rule it would fill the hole again.
 * @param {{ width: number, height: number }} viewport
 * @param {{ left: number, top: number, width: number, height: number }[]} rects
 */
function veilPath(viewport, rects) {
  const holes = rects.filter((rect) => !rects.some((other) => isInside(rect, other)))
    .map((r) => `M${r.left - RING_SIZE} ${r.top - RING_SIZE}h${r.width + 2 * RING_SIZE}v${r.height + 2 * RING_SIZE}h${-(r.width + 2 * RING_SIZE)}Z`);
  return `path(evenodd, 'M0 0H${viewport.width}V${viewport.height}H0Z${holes.join('')}')`;
}

module.exports = { veilPath, looksAlike, canSwap, swapPartners, swapUnit, swapMoves };
