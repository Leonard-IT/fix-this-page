const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  POSITION, AXIS, flowAxis, canBeAnchor, positionsFor, choiceSpot, choiceLabel, hasDragStarted, dropPosition, dropLine, placeAt,
} = require('../../../src/core/annotator/move');

const BODY = { tagName: 'BODY' };
const DOCUMENT = Object.freeze({ body: BODY, documentElement: { tagName: 'HTML' } });
BODY.ownerDocument = DOCUMENT;
const VIEWPORT = Object.freeze({ width: 1000, height: 800 });

// Just enough of an element for the decisions: blocks are siblings in the order they are given
function blocks(count, overrides = {}) {
  const list = Array.from({ length: count }, (_, index) => ({
    tagName: 'DIV', ownerDocument: DOCUMENT, hasAttribute: () => false, closest: () => null,
    contains(other) { return other === this; }, previousElementSibling: null, nextElementSibling: null, name: `b${index}`, ...overrides,
  }));
  list.forEach((block, index) => {
    block.previousElementSibling = list[index - 1] || null;
    block.nextElementSibling = list[index + 1] || null;
  });
  return list;
}

describe('flowAxis', () => {
  it('puts blocks of a flex row next to each other and everything else below each other', () => {
    assert.equal(flowAxis({ display: 'flex', flexDirection: 'row' }), AXIS.Row);
    assert.equal(flowAxis({ display: 'inline-flex', flexDirection: 'row-reverse' }), AXIS.Row);
    assert.equal(flowAxis({ display: 'flex', flexDirection: 'column' }), AXIS.Column);
    assert.equal(flowAxis({ display: 'block', flexDirection: 'row' }), AXIS.Column);
  });
});

describe('canBeAnchor', () => {
  it('accepts another block', () => {
    const [moving, other] = blocks(2);

    assert.equal(canBeAnchor(moving, other), true);
  });

  it('refuses the block itself and anything inside it', () => {
    const [moving, inside] = blocks(2);
    moving.contains = (node) => node === moving || node === inside;

    assert.deepEqual([moving, inside].map((anchor) => canBeAnchor(moving, anchor)), [false, false]);
  });

  it('refuses the page itself, the annotator and copies', () => {
    const [moving] = blocks(1);
    const [copy] = blocks(1, { hasAttribute: (name) => name === 'data-fb-clone' });
    const [insideCopy] = blocks(1, { closest: () => ({}) });

    assert.deepEqual([BODY, copy, insideCopy].map((anchor) => canBeAnchor(moving, anchor)), [false, false, false]);
  });
});

describe('positionsFor', () => {
  it('offers both sides of a block that is not next to the moving one', () => {
    const [moving, , far] = blocks(3);

    assert.deepEqual(positionsFor(moving, far), [POSITION.Before, POSITION.After]);
  });

  it('leaves out the side that would put the block where it already is', () => {
    const [first, second, third] = blocks(3);

    assert.deepEqual(positionsFor(second, first), [POSITION.Before]);
    assert.deepEqual(positionsFor(second, third), [POSITION.After]);
  });

  it('offers nothing on a block that cannot be an anchor', () => {
    const [moving] = blocks(1);

    assert.deepEqual(positionsFor(moving, moving), []);
  });
});

describe('choiceSpot', () => {
  const rect = { left: 100, right: 300, top: 200, bottom: 280, width: 200, height: 80 };

  it('puts the choices on the top and bottom edge of a stacked block, in the middle', () => {
    assert.deepEqual(choiceSpot(rect, AXIS.Column, POSITION.Before, VIEWPORT), { left: 200, top: 200 });
    assert.deepEqual(choiceSpot(rect, AXIS.Column, POSITION.After, VIEWPORT), { left: 200, top: 280 });
  });

  it('puts the choices on the left and right edge of a block in a row, halfway up', () => {
    assert.deepEqual(choiceSpot(rect, AXIS.Row, POSITION.Before, VIEWPORT), { left: 100, top: 240 });
    assert.deepEqual(choiceSpot(rect, AXIS.Row, POSITION.After, VIEWPORT), { left: 300, top: 240 });
  });

  it('keeps a choice on screen when the edge is scrolled out of view', () => {
    const above = { ...rect, top: -400, bottom: -320 };

    assert.equal(choiceSpot(above, AXIS.Column, POSITION.Before, VIEWPORT).top, 44);
    assert.equal(choiceSpot({ ...rect, bottom: 5000 }, AXIS.Column, POSITION.After, VIEWPORT).top, 756);
  });
});

describe('choiceLabel', () => {
  it('points the way the block is placed', () => {
    assert.equal(choiceLabel(AXIS.Column, POSITION.After), '↓ After');
    assert.equal(choiceLabel(AXIS.Row, POSITION.Before), '← Before');
  });
});

describe('hasDragStarted', () => {
  const start = { x: 100, y: 100 };

  it('keeps a press that barely moves a click', () => {
    assert.equal(hasDragStarted(start, { x: 103, y: 102 }), false);
  });

  it('starts a drag once the pointer has travelled', () => {
    assert.equal(hasDragStarted(start, { x: 100, y: 106 }), true);
    assert.equal(hasDragStarted(start, { x: 95, y: 96 }), true);
  });
});

describe('dropPosition', () => {
  const rect = { left: 100, right: 300, top: 200, bottom: 280, width: 200, height: 80 };

  it('puts a stacked block before the anchor in its top half and after it in its bottom half', () => {
    assert.equal(dropPosition(rect, AXIS.Column, { x: 290, y: 239 }), POSITION.Before);
    assert.equal(dropPosition(rect, AXIS.Column, { x: 110, y: 240 }), POSITION.After);
  });

  it('puts a block in a row before the anchor in its left half and after it in its right half', () => {
    assert.equal(dropPosition(rect, AXIS.Row, { x: 199, y: 270 }), POSITION.Before);
    assert.equal(dropPosition(rect, AXIS.Row, { x: 200, y: 210 }), POSITION.After);
  });
});

describe('dropLine', () => {
  const rect = { left: 100, right: 300, top: 200, bottom: 280, width: 200, height: 80 };

  it('draws a stacked drop across the top or bottom edge', () => {
    assert.deepEqual(dropLine(rect, AXIS.Column, POSITION.Before), { left: 100, top: 198, width: 200, height: 4 });
    assert.deepEqual(dropLine(rect, AXIS.Column, POSITION.After), { left: 100, top: 278, width: 200, height: 4 });
  });

  it('draws a drop in a row along the left or right edge', () => {
    assert.deepEqual(dropLine(rect, AXIS.Row, POSITION.Before), { left: 98, top: 200, width: 4, height: 80 });
    assert.deepEqual(dropLine(rect, AXIS.Row, POSITION.After), { left: 298, top: 200, width: 4, height: 80 });
  });
});

describe('placeAt', () => {
  it('puts the block before or after the anchor', () => {
    const calls = [];
    const anchor = { before: (el) => calls.push(['before', el]), after: (el) => calls.push(['after', el]) };

    placeAt('block', anchor, POSITION.Before);
    placeAt('block', anchor, POSITION.After);

    assert.deepEqual(calls, [['before', 'block'], ['after', 'block']]);
  });
});
