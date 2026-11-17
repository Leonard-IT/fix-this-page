const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { isDone } = require('../../../src/core/annotator/annotation-types');

describe('isDone', () => {
  it('treats the legacy Dutch status as done', () => {
    assert.equal(isDone({ status: 'done' }), true);
    assert.equal(isDone({ status: 'verwerkt' }), true);
    assert.equal(isDone({ status: 'open' }), false);
  });
});
