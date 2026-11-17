const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { toPcf, PCF } = require('../src/core/pcf');
const { readFeedbackFile } = require('../src/pcf');
const { validate } = require('../../../spec/validator/validate');
const { createStore } = require('../src/store');

const EXAMPLES_DIR = path.join(__dirname, '..', '..', '..', 'spec', 'examples');
const EXAMPLE_FILES = Object.freeze(fs.readdirSync(EXAMPLES_DIR).filter((name) => name.endsWith('.pagechange.json')));
const SITE = 'http://localhost:5173';
const NOW = new Date('2026-11-11T08:00:00Z');
const GENERATOR = Object.freeze({ name: 'fix-this-page' });

function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

function newStore() {
  let next = 0;
  return createStore({ storage: memoryStorage(), site: SITE, now: () => NOW, createId: () => 'id' + ++next });
}

const readExample = (name) => JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, name), 'utf8'));
const pcf = (items) => ({ format: PCF.Format, version: '0.1', items });
const item = (overrides = {}) => ({
  id: 'a1', type: 'edit', target: { url: 'https://example.com/about' }, comment: 'Shorter please', status: 'open', ...overrides,
});

describe('PCF export and import', () => {
  it('has the spec examples to test against', () => {
    assert.ok(EXAMPLE_FILES.length >= 5);
  });

  for (const name of EXAMPLE_FILES) {
    it(`keeps every item of ${name} when it goes through the overlay and back`, () => {
      const example = readExample(name);
      const store = newStore();

      store.replace(readFeedbackFile(example).data);
      const exported = toPcf(store.session(), { now: NOW, generator: GENERATOR });

      assert.deepEqual(exported.items, example.items);
    });
  }

  it('writes the document fields the spec requires', () => {
    const exported = toPcf(newStore().session(), { now: NOW, generator: GENERATOR });

    assert.deepEqual(exported, {
      format: 'page-change-format', version: '0.1', created: NOW.toISOString(), generator: { name: 'fix-this-page' }, items: [],
    });
  });

  it('exports an item made in the overlay with an absolute URL and PCF names', () => {
    const store = newStore();
    store.add({ path: '/team', url: SITE + '/team' }, {
      type: 'clone',
      target: { url: '/team', selector: 'li.card', text: 'Anna', html: '<li class="card">Anna</li>', heading: '', viewport: { w: 1280, h: 800 } },
      changes: [{ kind: 'attr', path: 'a', name: 'href', from: '/anna', to: '/bob' }],
      placement: { relative_to: 'source', position: 'after', order: 2 },
      comment: '',
    });

    const [exported] = toPcf(store.session(), { now: NOW, generator: GENERATOR }).items;

    assert.deepEqual(exported, {
      id: 'id1',
      number: 1,
      type: 'duplicate',
      target: {
        url: SITE + '/team',
        selector: [{ type: 'CssSelector', value: 'li.card' }],
        html: '<li class="card">Anna</li>',
        text: 'Anna',
        viewport: { width: 1280, height: 800 },
      },
      changes: [{ type: 'attribute', path: 'a', name: 'href', from: '/anna', to: '/bob' }],
      placement: { position: 'after', order: 2 },
      created: NOW.toISOString(),
      status: 'open',
    });
  });

  it('writes valid PCF for an item made in the overlay', () => {
    const store = newStore();
    store.add({ path: '/team', url: SITE + '/team' }, {
      type: 'edit', target: { url: '/team', selector: 'h1', text: 'Team', html: '<h1>Team</h1>' },
      changes: [{ kind: 'text', path: '.', from: 'Team', to: 'Our team' }], comment: '',
    });

    assert.deepEqual(validate(toPcf(store.session(), { now: NOW, generator: GENERATOR })), []);
  });

  it('keeps a link added where there was none when it goes out and back in', () => {
    const added = item({ target: { url: 'https://example.com/about', text: 'Shop' }, comment: undefined,
      changes: [{ type: 'attribute', path: '.', name: 'href', from: null, to: '/shop' }] });
    const store = newStore();

    store.replace(readFeedbackFile(pcf([added])).data);

    assert.deepEqual(toPcf(store.session(), { now: NOW, generator: GENERATOR }).items[0].changes, added.changes);
  });

  it('keeps items from another host by their path, as feedback from the live site is read on a development site', () => {
    const { data } = readFeedbackFile(pcf([item()]));

    assert.deepEqual([data.annotations[0].pageId, data.pages[0].url], ['/about', 'https://example.com/about']);
  });

  it('reads an edit with only a comment as a comment', () => {
    const { data } = readFeedbackFile(pcf([item()]));

    assert.equal(data.annotations[0].type, 'comment');
  });

  it('skips items the overlay cannot show, as a whole, and counts them', () => {
    const unknownType = item({ id: 'b1', type: 'move' });
    const unknownChange = item({ id: 'b2', changes: [{ type: 'style', path: '.', from: 'a', to: 'b' }] });
    const otherPlacement = item({ id: 'b4', type: 'duplicate', placement: { position: 'before' } });

    const { data, skipped } = readFeedbackFile(pcf([item(), unknownType, unknownChange, otherPlacement]));

    assert.deepEqual([data.annotations.map((a) => a.id), skipped], [['a1'], 3]);
  });

  it('keeps an item that removes an attribute when it goes out and back in', () => {
    const removed = item({ comment: undefined, changes: [{ type: 'attribute', path: '.', name: 'title', from: 'Old', to: null }] });
    const store = newStore();

    const { skipped, data } = readFeedbackFile(pcf([removed]));
    store.replace(data);

    assert.equal(skipped, 0);
    assert.deepEqual(toPcf(store.session(), { now: NOW, generator: GENERATOR }).items[0].changes, removed.changes);
  });

  it('treats an unknown status as open', () => {
    const { data } = readFeedbackFile(pcf([item({ status: 'in-review' })]));

    assert.equal(data.annotations[0].status, 'open');
  });

  it('refuses a document with an unsupported major version', () => {
    assert.throws(() => readFeedbackFile({ ...pcf([]), version: '1.0' }), /version 1.0 is not supported/);
  });

  it('accepts a higher minor version', () => {
    assert.equal(readFeedbackFile({ ...pcf([item()]), version: '0.7' }).data.annotations.length, 1);
  });

  it('refuses a document with an invalid, missing or repeated item id', () => {
    const invalid = [[item({ id: '../etc' })], [item({ id: undefined })], [null], [item(), item()]];

    for (const items of invalid) assert.throws(() => readFeedbackFile(pcf(items)), /id/);
  });

  it('still reads files from an earlier version of the overlay', () => {
    const legacy = { format: 'fixthis-feedback', version: 1, pages: [], annotations: [{ id: 'x', pageId: '/', type: 'comment', target: {}, comment: 'Hi' }] };
    const store = newStore();

    store.replace(readFeedbackFile(legacy).data);

    assert.equal(store.annotationsFor('/')[0].comment, 'Hi');
  });
});
