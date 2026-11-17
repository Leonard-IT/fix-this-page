const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { parseSelectorPart } = require('../../../src/core/annotator/selector');

describe('parseSelectorPart', () => {
  it('reads the tag, id and position of a selector part', () => {
    assert.deepEqual(parseSelectorPart('section#team'), { tag: 'section', id: 'team', nth: 1 });
    assert.deepEqual(parseSelectorPart('div.card.wide:nth-of-type(3)'), { tag: 'div', id: undefined, nth: 3 });
  });

  it('answers null for a part it cannot read', () => {
    assert.equal(parseSelectorPart('> div'), null);
  });
});
