const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { POSITION } = require('../../../src/core/annotator/move');
const { veilPath, looksAlike, canSwap, swapUnit, swapMoves } = require('../../../src/core/annotator/swap');

const DOCUMENT = { body: null, documentElement: null };

// Just enough of an element tree for the decisions: node('div', ['card'], [children])
function node(tag, classes = [], children = []) {
  const el = {
    tagName: tag.toUpperCase(), classList: classes, children, parentElement: null, ownerDocument: DOCUMENT,
    hasAttribute: () => false, closest: () => null,
    contains(other) { return other === el || children.some((child) => child.contains(other)); },
    get childElementCount() { return children.length; },
    get firstElementChild() { return children[0] || null; },
    get previousElementSibling() { return sibling(el, -1); },
    get nextElementSibling() { return sibling(el, 1); },
  };
  children.forEach((child) => { child.parentElement = el; });
  return el;
}

function sibling(el, step) {
  const list = el.parentElement ? el.parentElement.children : [];
  return list[list.indexOf(el) + step] || null;
}

function page(...children) {
  const body = node('body', [], children);
  DOCUMENT.body = body;
  return body;
}

describe('looksAlike', () => {
  it('matches the same tag with the same classes, in any order', () => {
    const [a, b, c, d] = [node('div', ['card', 'big']), node('div', ['big', 'card']), node('div', ['card']), node('div', ['x'])];
    page(node('p', [], [a]), node('p', [], [b]), node('p', [], [c]), node('p', [], [d]));
    assert.equal(looksAlike(a, b), true);
    assert.equal(looksAlike(a, c), true, 'shares a class and has the same build');
    assert.equal(looksAlike(c, d), false, 'other parent, no shared class');
    assert.equal(looksAlike(node('div', ['card']), node('li', ['card'])), false);
  });

  it('matches blocks without classes only as siblings', () => {
    const [a, b] = [node('li'), node('li')];
    const other = node('li');
    page(node('ul', [], [a, b]), node('ul', [], [other]));

    assert.equal(looksAlike(a, b), true);
    assert.equal(looksAlike(a, other), false);
  });
});

describe('looksAlike with differing classes', () => {
  const item = (modifier) => node('article', ['item', modifier], [node('div', ['top'], [node('h3')]), node('div', ['bot'])]);

  it('matches siblings of the same build that differ in a modifier class', () => {
    const [a, b] = [item('i-0'), item('i-1')];
    page(node('div', ['grid'], [a, b]));

    assert.equal(looksAlike(a, b), true);
  });

  it('matches blocks of the same build in different parents when they share a class', () => {
    const [a, b] = [item('i-0'), item('i-1')];
    page(node('div', [], [a]), node('div', [], [b]));

    assert.equal(looksAlike(a, b), true);
  });

  it('refuses a different build, or a different parent without a shared class', () => {
    const [a, other] = [item('i-0'), node('article', ['item', 'i-1'], [node('p')])];
    const stranger = node('article', ['x'], [node('div', ['top'], [node('h3')]), node('div', ['bot'])]);
    page(node('div', [], [a, other]), node('div', [], [stranger]));

    assert.equal(looksAlike(a, other), false);
    assert.equal(looksAlike(a, stranger), false);
  });
});

describe('canSwap', () => {
  it('refuses the block itself and a look-alike inside it', () => {
    const inner = node('div', ['box']);
    const outer = node('div', ['box'], [inner]);
    page(outer);

    assert.equal(canSwap(outer, outer), false);
    assert.equal(canSwap(outer, inner), false);
    assert.equal(canSwap(inner, outer), false);
  });
});

describe('swapUnit', () => {
  it('is the block itself when it has siblings', () => {
    const [a, b] = [node('div', ['card']), node('div', ['card'])];
    page(node('div', ['grid'], [a, b]));

    assert.equal(swapUnit(a, b), a);
  });

  it('takes the wrapper along when the block is alone in it', () => {
    const [a, b] = [node('div', ['card']), node('div', ['card'])];
    const [colA, colB] = [node('div', ['col'], [a]), node('div', ['col'], [b])];
    page(node('div', ['grid'], [colA, colB]));

    assert.equal(swapUnit(a, b), colA);
    assert.equal(swapUnit(b, a), colB);
  });

  it('stops at a wrapper that also holds the other block', () => {
    const b = node('div', ['card']);
    const a = node('div', ['card']);
    const inner = node('div', [], [a]);
    page(node('section', [], [inner, b]));

    assert.equal(swapUnit(a, b), inner);
  });
});

describe('swapMoves', () => {
  it('needs one move for neighbours', () => {
    const [a, b, c] = [node('li'), node('li'), node('li')];
    page(node('ul', [], [a, b, c]));

    assert.deepEqual(swapMoves(a, b), [{ el: a, anchor: b, position: POSITION.After }]);
    assert.deepEqual(swapMoves(c, b), [{ el: c, anchor: b, position: POSITION.Before }]);
  });

  it('puts the first next to the second, and the second where the first was', () => {
    const [a, b, c] = [node('li'), node('li'), node('li')];
    page(node('ul', [], [a, b, c]));

    assert.deepEqual(swapMoves(a, c), [
      { el: a, anchor: c, position: POSITION.Before },
      { el: c, anchor: b, position: POSITION.Before },
    ]);
    assert.deepEqual(swapMoves(c, a), [
      { el: c, anchor: a, position: POSITION.Before },
      { el: a, anchor: b, position: POSITION.After },
    ]);
  });

  it('answers no moves when the first has nothing next to it to mark its place', () => {
    const [a, b] = [node('div', ['card']), node('div', ['card'])];
    page(node('div', [], [a]), node('div', [], [b]));

    assert.deepEqual(swapMoves(a, b), []);
  });
});

describe('veilPath', () => {
  const viewport = { width: 100, height: 80 };

  it('cuts a ring-sized hole around each rectangle', () => {
    assert.equal(
      veilPath(viewport, [{ left: 20, top: 20, width: 30, height: 10 }]),
      "path(evenodd, 'M0 0H100V80H0ZM13 13h44v24h-44Z')",
    );
  });

  it('leaves out a rectangle inside another, which would fill its hole again', () => {
    const outer = { left: 10, top: 10, width: 60, height: 50 };
    const inner = { left: 20, top: 20, width: 10, height: 10 };

    assert.equal(veilPath(viewport, [outer, inner]), veilPath(viewport, [outer]));
  });
});
