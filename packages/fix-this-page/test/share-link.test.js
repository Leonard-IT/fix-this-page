const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { shareUrl, hasSharedFeedback, readSharedFeedback, isComfortableLength } = require('../src/share-link');
const { createStore, ANNOTATION_STATUS } = require('../src/store');
const { readFeedbackFile } = require('../src/pcf');
const { toPcf } = require('../src/core/pcf');

const SITE = 'https://shop.example';
const NOW = new Date('2026-11-14T12:00:00Z');
const GENERATOR = Object.freeze({ name: 'fix-this-page' });
const HOME = Object.freeze({ path: '/', url: SITE + '/' });
const ABOUT = Object.freeze({ path: '/about', url: SITE + '/about' });

function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

function newStore(idPrefix) {
  let next = 0;
  return createStore({ storage: memoryStorage(), site: SITE, now: () => NOW, createId: () => `${idPrefix}${++next}` });
}

const comment = (text) => ({ type: 'comment', target: { selector: 'h1', text: 'Hello' }, comment: text });

// What the other person's overlay reads from a link that `from` sent
async function sentThroughLink(from) {
  const link = await shareUrl(SITE + '/', toPcf(from.session(), { now: NOW, generator: GENERATOR }));
  return readFeedbackFile(await readSharedFeedback(new URL(link).hash)).data;
}

describe('share link', () => {
  it('carries the document in the fragment of the page address', async () => {
    const doc = { format: 'page-change-format', version: '0.1', items: [] };

    const link = await shareUrl(SITE + '/pricing?fix#old', doc);

    assert.match(link, /^https:\/\/shop\.example\/pricing\?fix#fix=1[A-Za-z0-9_-]+$/);
    assert.deepEqual(await readSharedFeedback(new URL(link).hash), doc);
  });

  it('keeps a link with unicode text intact', async () => {
    const doc = { items: [{ comment: 'Prijs klopt niet: €12,50 → €14 😅' }] };

    const link = await shareUrl(SITE + '/', doc);

    assert.deepEqual(await readSharedFeedback(new URL(link).hash), doc);
  });

  it('tells feedback links from other fragments', () => {
    assert.equal(hasSharedFeedback('#fix=1abc'), true);
    assert.equal(hasSharedFeedback('#pricing'), false);
    assert.equal(hasSharedFeedback(''), false);
  });

  it('refuses a link that was cut off', async () => {
    const link = await shareUrl(SITE + '/', { items: [{ comment: 'x'.repeat(500) + Math.random() }] });

    await assert.rejects(readSharedFeedback(new URL(link).hash.slice(0, -10)), /incomplete or damaged/);
  });

  it('refuses a link from a newer encoding', async () => {
    await assert.rejects(readSharedFeedback('#fix=9abc'), /newer version/);
  });

  it('refuses a link that expands beyond any real feedback', async () => {
    const bomb = await shareUrl(SITE + '/', { padding: ' '.repeat(2 * 1024 * 1024) });

    assert.ok(bomb.length < 10000, 'the test link itself is short');
    await assert.rejects(readSharedFeedback(new URL(bomb).hash), /incomplete or damaged/);
  });

  it('calls a link up to 8000 characters comfortable', () => {
    assert.equal(isComfortableLength('x'.repeat(8000)), true);
    assert.equal(isComfortableLength('x'.repeat(8001)), false);
  });
});

describe('merging a shared link', () => {
  it('adds the items of a link to the ones already here', async () => {
    const client = newStore('c');
    client.add(HOME, comment('Logo is too small'));
    const developer = newStore('d');
    developer.add(ABOUT, comment('Own note'));

    const { added } = developer.merge(await sentThroughLink(client));

    assert.equal(added, 1);
    assert.deepEqual(developer.session().annotations.map((a) => a.comment).sort(), ['Logo is too small', 'Own note']);
    assert.deepEqual(developer.session().pages.map((p) => p.path).sort(), ['/', '/about']);
  });

  it('gives a new item the next free number when its number is taken here', async () => {
    const client = newStore('c');
    client.add(HOME, comment('From the client'));
    const developer = newStore('d');
    developer.add(HOME, comment('From the developer'));

    developer.merge(await sentThroughLink(client));

    assert.deepEqual(developer.session().annotations.map((a) => [a.number, a.comment]), [[1, 'From the developer'], [2, 'From the client']]);
    assert.equal(developer.add(HOME, comment('Next')).number, 3);
  });

  it('shows the client what the developer marked done when the link comes back', async () => {
    const client = newStore('c');
    const item = client.add(HOME, comment('Fix the typo'));
    const developer = newStore('d');
    developer.merge(await sentThroughLink(client));
    developer.setStatus(item.id, ANNOTATION_STATUS.Done);

    const { added } = client.merge(await sentThroughLink(developer));

    assert.equal(added, 0);
    assert.equal(client.session().annotations[0].status, ANNOTATION_STATUS.Done);
  });

  it('does not reopen an item that was done here when an older link arrives', async () => {
    const client = newStore('c');
    const item = client.add(HOME, comment('Fix the typo'));
    const olderLink = await sentThroughLink(client);
    const developer = newStore('d');
    developer.merge(olderLink);
    developer.setStatus(item.id, ANNOTATION_STATUS.Done);

    developer.merge(olderLink);

    assert.equal(developer.session().annotations[0].status, ANNOTATION_STATUS.Done);
  });

  it('can open the same link twice without doubling the items', async () => {
    const client = newStore('c');
    client.add(HOME, comment('Once'));
    const link = await sentThroughLink(client);
    const developer = newStore('d');

    developer.merge(link);
    const { added } = developer.merge(link);

    assert.equal(added, 0);
    assert.equal(developer.session().annotations.length, 1);
  });

  it('drops a change from a link that could run script on the site', () => {
    const developer = newStore('d');
    const href = (to) => ({ kind: 'attr', path: '.', name: 'href', from: '/a', to });

    developer.merge({ annotations: [{ id: 'x', pageId: '/', type: 'edit', target: {}, changes: [href('javascript:alert(1)'), href('/b')] }] });

    assert.deepEqual(developer.session().annotations[0].changes.map((c) => c.to), ['/b']);
  });
});
