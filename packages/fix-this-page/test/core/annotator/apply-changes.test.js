const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { isSafeChange, applyAttributeChange, textEdit, normalizedPositions } = require('../../../src/core/annotator/apply-changes');

const CHANGE_KIND = Object.freeze({ Text: 'text', Attr: 'attr' });
const SELF_PATH = '.';

describe('isSafeChange', () => {
  const hrefTo = (to) => ({ kind: CHANGE_KIND.Attr, path: SELF_PATH, name: 'href', from: '/old', to });

  it('allows text changes and ordinary links', () => {
    const safe = [
      { kind: CHANGE_KIND.Text, path: 'h1', from: 'Hi', to: '<b>javascript:</b>' },
      hrefTo('/contact'), hrefTo('https://example.com'), hrefTo('mailto:a@example.com'), hrefTo('tel:+31201234567'), hrefTo(''),
    ];

    assert.deepEqual(safe.filter((change) => !isSafeChange(change)), []);
  });

  it('refuses links that run script, also when the scheme is disguised', () => {
    const unsafe = ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\tscript:alert(1)', '\u0001javascript:x', 'vbscript:x', 'data:text/html,x'];

    assert.deepEqual(unsafe.map(hrefTo).filter(isSafeChange), []);
  });

  it('refuses attributes the editor never changes, such as event handlers', () => {
    const changes = ['onclick', 'onMouseOver', 'style', 'srcdoc'].map((name) => ({ kind: CHANGE_KIND.Attr, path: SELF_PATH, name, from: '', to: 'x' }));

    assert.deepEqual(changes.filter(isSafeChange), []);
  });

  it('refuses unknown change kinds and malformed changes', () => {
    assert.deepEqual([{ kind: 'html', to: '<img onerror=x>' }, null, 'text'].filter(isSafeChange), []);
  });
});

describe('applyAttributeChange', () => {
  const fakeElement = (attributes) => ({
    attributes,
    setAttribute(name, value) { attributes[name] = String(value); },
    removeAttribute(name) { delete attributes[name]; },
  });

  it('removes the attribute when the change asks for null', () => {
    const el = fakeElement({ title: 'Old', href: '/a' });

    applyAttributeChange(el, { kind: CHANGE_KIND.Attr, path: SELF_PATH, name: 'TITLE', from: 'Old', to: null });

    assert.deepEqual(el.attributes, { href: '/a' });
  });

  it('sets the value otherwise, also an empty one', () => {
    const el = fakeElement({});

    applyAttributeChange(el, { kind: CHANGE_KIND.Attr, path: SELF_PATH, name: 'alt', from: null, to: '' });

    assert.deepEqual(el.attributes, { alt: '' });
  });
});

describe('textEdit', () => {
  it('replaces only the part that differs', () => {
    assert.deepEqual(textEdit('Call us today', 'Call us now'), { start: 8, end: 13, insert: 'now' });
  });

  it('removes a word with one of its spaces', () => {
    assert.deepEqual(textEdit('Call us today', 'Call today'), { start: 5, end: 8, insert: '' });
  });

  it('inserts without removing', () => {
    assert.deepEqual(textEdit('Call today', 'Call us today'), { start: 5, end: 5, insert: 'us ' });
  });

  it('compares normalized texts', () => {
    assert.deepEqual(textEdit('  Call\n  today ', 'Call today!'), { start: 10, end: 10, insert: '!' });
  });
});

describe('normalizedPositions', () => {
  it('maps each character of the normalized text to its text node and offset', () => {
    // "  Call " + "us" + " today\n" normalizes to "Call us today"
    const positions = normalizedPositions(['  Call ', 'us', ' today\n']);

    assert.equal(positions.length, 'Call us today'.length);
    assert.deepEqual(positions.slice(3, 9), [
      { index: 0, offset: 5 }, { index: 0, offset: 6 }, { index: 1, offset: 0 }, { index: 1, offset: 1 },
      { index: 2, offset: 0 }, { index: 2, offset: 1 },
    ]);
  });

  it('counts a run of white space across nodes as one space at its first character', () => {
    const positions = normalizedPositions(['a ', '  ', ' b']);

    assert.deepEqual(positions, [{ index: 0, offset: 0 }, { index: 0, offset: 1 }, { index: 2, offset: 1 }]);
  });

  it('has no positions for white space only', () => {
    assert.deepEqual(normalizedPositions([' \n ', '']), []);
  });
});
