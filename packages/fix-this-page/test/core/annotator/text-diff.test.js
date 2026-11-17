const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { diffTexts, linkChanges, previewableLinkChanges } = require('../../../src/core/annotator/text-diff');

const CHANGE_KIND = Object.freeze({ Text: 'text', Attr: 'attr' });
const SELF_PATH = '.';

describe('diffTexts', () => {
  // elementTexts of <section><h2>Team</h2><p>Call <a>us</a> today</p></section>
  const section = (h2, p, a, pOwn) => [
    { path: SELF_PATH, text: `${h2} ${p}`, own: '' },
    { path: 'h2', text: h2, own: h2 },
    { path: 'p', text: p, own: pOwn },
    { path: 'p > a', text: a, own: a },
  ];
  const original = section('Team', 'Call us today', 'us', 'Call today');
  const text = (path, from, to) => ({ kind: CHANGE_KIND.Text, path, from, to });

  it('reports no changes when the texts are the same', () => {
    assert.deepEqual(diffTexts(original, original), []);
  });

  it('reports the change on the deepest element that holds it, with whole texts', () => {
    const after = section('Our team', 'Call us today', 'us', 'Call today');

    assert.deepEqual(diffTexts(original, after), [text('h2', 'Team', 'Our team')]);
  });

  it('reports a change next to a link on the paragraph, with the link text included', () => {
    const after = section('Team', 'Call us tomorrow', 'us', 'Call tomorrow');

    assert.deepEqual(diffTexts(original, after), [text('p', 'Call us today', 'Call us tomorrow')]);
  });

  it('reports a change inside the link on the link only', () => {
    const after = section('Team', 'Call me today', 'me', 'Call today');

    assert.deepEqual(diffTexts(original, after), [text('p > a', 'us', 'me')]);
  });

  it('reports separate changes in separate elements', () => {
    const after = section('Our team', 'Call me today', 'me', 'Call today');

    assert.deepEqual(diffTexts(original, after), [text('h2', 'Team', 'Our team'), text('p > a', 'us', 'me')]);
  });

  it('reports a removed element on its parent', () => {
    const after = [original[0], original[1]].map((entry) => (entry.path === SELF_PATH ? { ...entry, text: 'Team' } : entry));

    assert.deepEqual(diffTexts(original, after), [text(SELF_PATH, 'Team Call us today', 'Team')]);
  });

  it('reports an added element on its parent', () => {
    const before = [{ path: SELF_PATH, text: 'Team', own: '' }, { path: 'h2', text: 'Team', own: 'Team' }];
    const after = [{ path: SELF_PATH, text: 'Team New intro', own: '' }, before[1], { path: 'p', text: 'New intro', own: 'New intro' }];

    assert.deepEqual(diffTexts(before, after), [text(SELF_PATH, 'Team', 'Team New intro')]);
  });
});

describe('linkChanges', () => {
  const singleTextLink = { href: '/old', text: 'Read more', leaves: [{ path: 'span', text: 'Read more' }] };
  const nestedLink = { href: '/old', text: 'Read more now', leaves: [{ path: SELF_PATH, text: 'Read' }, { path: 'b', text: 'more now' }] };

  it('reports nothing when the link is unchanged', () => {
    assert.deepEqual(linkChanges(singleTextLink, { href: '/old', text: 'Read more' }), []);
  });

  it('reports a new address as an href change on the link itself', () => {
    const changes = linkChanges(singleTextLink, { href: '/new', text: 'Read more' });

    assert.deepEqual(changes, [{ kind: CHANGE_KIND.Attr, path: SELF_PATH, name: 'href', from: '/old', to: '/new' }]);
  });

  it('puts a new text on the only piece of text in the link', () => {
    const changes = linkChanges(singleTextLink, { href: '/old', text: 'Continue' });

    assert.deepEqual(changes, [{ kind: CHANGE_KIND.Text, path: 'span', from: 'Read more', to: 'Continue' }]);
  });

  it('puts a new text on the whole link when the link holds several texts', () => {
    const changes = linkChanges(nestedLink, { href: '/old', text: 'Continue' });

    assert.deepEqual(changes, [{ kind: CHANGE_KIND.Text, path: SELF_PATH, from: 'Read more now', to: 'Continue' }]);
  });
});

describe('previewableLinkChanges', () => {
  const changes = [
    { kind: CHANGE_KIND.Attr, path: SELF_PATH, name: 'href', from: '/old', to: '/new' },
    { kind: CHANGE_KIND.Text, path: SELF_PATH, from: 'Read more now', to: 'Continue' },
  ];

  it('previews every change of a link with one piece of text', () => {
    const link = { leaves: [{ path: 'span', text: 'Read more' }] };

    assert.deepEqual(previewableLinkChanges(link, changes), changes);
  });

  it('previews only the address of a link with several texts, so its markup stays intact', () => {
    const link = { leaves: [{ path: SELF_PATH, text: 'Read' }, { path: 'b', text: 'more now' }] };

    assert.deepEqual(previewableLinkChanges(link, changes), [changes[0]]);
  });
});
