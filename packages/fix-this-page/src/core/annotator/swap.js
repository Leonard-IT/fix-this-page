// Swapping two look-alike blocks, such as two cards or two buttons. A swap is stored as one or two moves, so the
// Page Change Format needs nothing new. Decisions only; the moves are placed by the caller.
const { CLONE_SELECTOR, isAnnotatorElement, isPageElement } = require('./dom.js');
const { POSITION } = require('./move.js');

/** Classes in any order mean the same look. */
function classKey(el) {
  return [...el.classList].sort().join(' ');
}

/**
 * Whether two blocks look alike: the same tag and the same classes. Blocks without classes only look alike as
 * siblings, since every plain `div` of a page would otherwise be on offer.
 */
function looksAlike(a, b) {
  if (a.tagName !== b.tagName || classKey(a) !== classKey(b)) return false;
  return a.classList.length > 0 || a.parentElement === b.parentElement;
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

module.exports = { looksAlike, canSwap, swapPartners, swapUnit, swapMoves };
