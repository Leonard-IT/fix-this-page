// Moving a block: where it can go, where the choices appear, and how it is placed. Decisions are plain functions;
// only `placeAt` and `rememberPosition` touch the page.
const { CLONE_SELECTOR, isAnnotatorElement, isPageElement } = require('./dom.js');

const EDGE_MARGIN = 44;
const POSITION = Object.freeze({ Before: 'before', After: 'after' });
const AXIS = Object.freeze({ Row: 'x', Column: 'y' });
const ROW_DIRECTIONS = Object.freeze(['row', 'row-reverse']);
const FLEX_DISPLAYS = Object.freeze(['flex', 'inline-flex']);
const CHOICE_LABEL = Object.freeze({
  [AXIS.Column]: { [POSITION.Before]: '↑ Before', [POSITION.After]: '↓ After' },
  [AXIS.Row]: { [POSITION.Before]: '← Before', [POSITION.After]: 'After →' },
});

/** Blocks of a row of flex items sit next to each other; everything else is stacked. */
function flowAxis(parentStyle) {
  const isRow = FLEX_DISPLAYS.includes(parentStyle.display) && ROW_DIRECTIONS.includes(parentStyle.flexDirection);
  return isRow ? AXIS.Row : AXIS.Column;
}

/**
 * Whether `anchor` can be the element the moved block goes next to. A block cannot go next to itself or to
 * something inside itself, and copies and the annotator's own elements are not part of the page's source.
 */
function canBeAnchor(moving, anchor) {
  if (!isPageElement(anchor) || isAnnotatorElement(anchor)) return false;
  if (anchor.closest(CLONE_SELECTOR)) return false;
  return !moving.contains(anchor);
}

/** A move that leaves the block where it is would be an item that asks for nothing. */
function isSamePlace(moving, anchor, position) {
  const neighbour = position === POSITION.Before ? anchor.previousElementSibling : anchor.nextElementSibling;
  return neighbour === moving;
}

/** The choices to offer on `anchor`: both sides, minus the one that changes nothing. */
function positionsFor(moving, anchor) {
  if (!canBeAnchor(moving, anchor)) return [];
  return Object.values(POSITION).filter((position) => !isSamePlace(moving, anchor, position));
}

/** Where the choice for `position` is drawn: on the leading or trailing edge of the anchor, centred on that edge. */
function choiceSpot(rect, axis, position, viewport) {
  const isBefore = position === POSITION.Before;
  const spot = axis === AXIS.Row
    ? { left: isBefore ? rect.left : rect.right, top: rect.top + rect.height / 2 }
    : { left: rect.left + rect.width / 2, top: isBefore ? rect.top : rect.bottom };
  return { left: clamp(spot.left, viewport.width), top: clamp(spot.top, viewport.height) };
}

// Keeps the choice inside the screen, so it can still be reached when the block's edge is scrolled out of view
function clamp(value, max) {
  return Math.min(Math.max(value, EDGE_MARGIN), max - EDGE_MARGIN);
}

function choiceLabel(axis, position) {
  return CHOICE_LABEL[axis][position];
}

function placeAt(el, anchor, position) {
  if (position === POSITION.Before) anchor.before(el);
  else anchor.after(el);
}

/** Answers how to put the element back where it is now. */
function rememberPosition(el) {
  const parent = el.parentNode;
  const next = el.nextSibling;
  return () => parent.insertBefore(el, next);
}

module.exports = { POSITION, AXIS, flowAxis, canBeAnchor, positionsFor, choiceSpot, choiceLabel, placeAt, rememberPosition };
