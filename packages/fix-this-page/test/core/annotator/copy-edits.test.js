const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { rebaseChanges, mergeChanges } = require('../../../src/core/annotator/copy-edits');
const { isActionAvailable, ACTION } = require('../../../src/core/annotator/interface');

const SELF_PATH = '.';
const text = (from, to, path = SELF_PATH) => ({ kind: 'text', path, from, to });

describe('rebaseChanges', () => {
  it('leaves the changes alone when the copy itself was changed', () => {
    const copy = {};
    const changes = [text('a', 'b', 'h3')];

    assert.deepEqual(rebaseChanges(changes, copy, copy), changes);
  });
});

describe('mergeChanges', () => {
  it('adds new changes after the ones the copy already has', () => {
    const merged = mergeChanges([text('Ann', 'Anna', 'h3')], [text('Chef', 'Boss', 'p')]);

    assert.deepEqual(merged, [text('Ann', 'Anna', 'h3'), text('Chef', 'Boss', 'p')]);
  });

  it('joins a change to the one before it when it carries on the same text', () => {
    const merged = mergeChanges([text('Ann', 'Anna', 'h3')], [text('Anna', 'Annabel', 'h3')]);

    assert.deepEqual(merged, [text('Ann', 'Annabel', 'h3')]);
  });

  it('leaves no change when the text is edited back to what it was', () => {
    assert.deepEqual(mergeChanges([text('Ann', 'Anna', 'h3')], [text('Anna', 'Ann', 'h3')]), []);
  });

  it('keeps the order when another change came in between', () => {
    const existing = [text('Ann Chef', 'Anna Chef', '.'), text('Anna', 'Anna!', 'h3')];

    assert.deepEqual(mergeChanges(existing, [text('Anna! Chef', 'X', '.')]), [...existing, text('Anna! Chef', 'X', '.')]);
  });

  it('does not join changes to different attributes of the same element', () => {
    const attr = (name, to) => ({ kind: 'attr', path: SELF_PATH, name, from: 'a', to });

    assert.equal(mergeChanges([attr('href', 'b')], [attr('title', 'c')]).length, 2);
  });

  it('starts from nothing when the copy has no changes yet', () => {
    assert.deepEqual(mergeChanges(undefined, [text('a', 'b')]), [text('a', 'b')]);
  });
});

describe('isActionAvailable inside a copy', () => {
  const inCopy = { closest: () => ({}), hasAttribute: () => false, parentElement: {}, ownerDocument: { body: null } };

  it('offers text and link edits and selecting the surrounding block', () => {
    const offered = [ACTION.Edit, ACTION.Parent, ACTION.Close].map((action) => isActionAvailable(action, inCopy));

    assert.deepEqual(offered, [true, true, true]);
  });

  it('does not offer what needs a target of its own', () => {
    const offered = [ACTION.Comment, ACTION.Clone, ACTION.Move, ACTION.Swap, ACTION.Delete].map((action) => isActionAvailable(action, inCopy));

    assert.deepEqual(offered, [false, false, false, false, false]);
  });

  it('does not select past the copy itself', () => {
    const copyRoot = { ...inCopy, hasAttribute: () => true };

    assert.equal(isActionAvailable(ACTION.Parent, copyRoot), false);
  });
});
