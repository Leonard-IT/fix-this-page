const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { annotationIcon } = require('../../../src/core/annotator/interface');

const CHANGE_KIND = Object.freeze({ Text: 'text', Attr: 'attr' });
const SELF_PATH = '.';

describe('annotationIcon', () => {
  const attr = (name) => ({ kind: CHANGE_KIND.Attr, name, path: SELF_PATH, from: 'a', to: 'b' });
  const text = { kind: CHANGE_KIND.Text, path: SELF_PATH, from: 'a', to: 'b' };

  it('gives every kind of item its own icon and label', () => {
    const icons = ['comment', 'edit', 'clone', 'delete'].map((type) => annotationIcon({ type }));

    assert.deepEqual(icons.map((i) => i.label), ['Comment', 'Edit', 'Duplicate', 'Delete']);
    assert.equal(new Set(icons.map((i) => i.svg)).size, 4);
  });

  it('shows the link icon for an edit that only changes a link', () => {
    assert.equal(annotationIcon({ type: 'edit', changes: [attr('href')] }).label, 'Link');
  });

  it('keeps the edit icon when the text changes too, or another attribute', () => {
    assert.equal(annotationIcon({ type: 'edit', changes: [attr('href'), text] }).label, 'Edit');
    assert.equal(annotationIcon({ type: 'edit', changes: [attr('alt')] }).label, 'Edit');
  });

  it('draws a decorative svg of the size asked for', () => {
    assert.match(annotationIcon({ type: 'comment' }, 20).svg, /^<svg [^>]*width="20" height="20"[^>]*aria-hidden="true">/);
  });
});
