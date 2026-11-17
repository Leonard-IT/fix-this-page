const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createStore, ANNOTATION_STATUS, STORAGE_KEY } = require('../src/store');
const { toPcf } = require('../src/core/pcf');
const { readFeedbackFile } = require('../src/pcf');
const { renderPrompt } = require('../src/core/render');
const { exportFileName } = require('../src/overlay');
const { buildOverlay, integrityOf } = require('../scripts/build');

const SITE = 'http://localhost:5173';
const NOW = new Date('2026-11-10T12:00:00Z');
const HOME = Object.freeze({ path: '/', url: SITE + '/' });
const ABOUT = Object.freeze({ path: '/about', url: SITE + '/about' });
// Everything that can send data off the machine from a browser script
const NETWORK_APIS = Object.freeze(['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'importScripts', 'import(']);
const LOADER_MAX_BYTES = 4096;

function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

function newStore(storage = memoryStorage()) {
  let next = 0;
  return createStore({ storage, site: SITE, now: () => NOW, createId: () => 'id' + ++next });
}

const comment = (text) => ({ type: 'comment', target: { selector: 'h1', text: 'Hello' }, comment: text });

describe('overlay store', () => {
  it('numbers new items and keeps them per page', () => {
    const store = newStore();

    store.add(HOME, comment('First'));
    store.add(ABOUT, comment('Second'));

    assert.deepEqual(store.annotationsFor('/').map((a) => [a.number, a.comment]), [[1, 'First']]);
    assert.deepEqual(store.annotationsFor('/about').map((a) => [a.number, a.comment]), [[2, 'Second']]);
    assert.deepEqual(store.session().pages.map((p) => p.path), ['/', '/about']);
  });

  it('stores a new item as open, with its creation time', () => {
    const store = newStore();

    const item = store.add(HOME, comment('First'));

    assert.equal(item.status, ANNOTATION_STATUS.Open);
    assert.equal(item.createdAt, NOW.toISOString());
  });

  it('keeps the items across page loads in the same storage', () => {
    const storage = memoryStorage();
    newStore(storage).add(HOME, comment('First'));

    const reloaded = newStore(storage);

    assert.equal(reloaded.annotationsFor('/').length, 1);
  });

  it('marks an item done and removes another', () => {
    const store = newStore();
    const first = store.add(HOME, comment('First'));
    const second = store.add(HOME, comment('Second'));

    store.setStatus(first.id, ANNOTATION_STATUS.Done);
    store.remove(second.id);

    assert.deepEqual(store.annotationsFor('/').map((a) => [a.id, a.status]), [[first.id, ANNOTATION_STATUS.Done]]);
  });

  it('imports an exported file and continues the numbering after it', () => {
    const source = newStore();
    source.add(HOME, comment('First'));
    source.add(HOME, comment('Second'));
    const target = newStore();

    target.replace(readFeedbackFile(JSON.parse(JSON.stringify(toPcf(source.session(), { now: NOW, generator: { name: 'fix-this-page' } })))).data);
    const added = target.add(HOME, comment('Third'));

    assert.equal(target.annotationsFor('/').length, 3);
    assert.equal(added.number, 3);
  });

  it('refuses a file that is not overlay feedback', () => {
    assert.throws(() => newStore().replace({ hello: 'world' }), /not a feedback file/);
  });

  it('drops malformed items from an imported file', () => {
    const store = newStore();

    store.replace({ annotations: [{ id: 'ok', pageId: '/', type: 'comment', target: {} }, { id: 'bad', pageId: '/', type: 'script' }, null] });

    assert.deepEqual(store.annotationsFor('/').map((a) => a.id), ['ok']);
  });

  it('drops changes from an imported file that could run script on the site', () => {
    const store = newStore();
    const href = (to) => ({ kind: 'attr', path: '.', name: 'href', from: '/a', to });
    const onclick = { kind: 'attr', path: '.', name: 'onclick', from: '', to: 'alert(1)' };
    const text = { kind: 'text', path: '.', from: 'Hi', to: 'Hello' };

    store.replace({ annotations: [{ id: 'x', pageId: '/', type: 'edit', target: {}, changes: [text, href('javascript:alert(1)'), onclick, href('/b')] }] });

    assert.deepEqual(store.annotationsFor('/')[0].changes, [text, href('/b')]);
  });

  it('leaves the storage empty after clearing', () => {
    const storage = memoryStorage();
    const store = newStore(storage);
    store.add(HOME, comment('First'));

    store.clear();

    assert.equal(storage.getItem(STORAGE_KEY), null);
    assert.equal(store.session().annotations.length, 0);
  });
});

describe('local prompt', () => {
  it('asks the agent to report in its reply instead of calling a server', () => {
    const store = newStore();
    store.add(HOME, comment('Make it bigger'));

    const markdown = renderPrompt(toPcf(store.session(), { now: NOW, generator: { name: 'fix-this-page' } }));

    assert.match(markdown, /Make it bigger/);
    assert.match(markdown, /End your reply with one line per item/);
    assert.doesNotMatch(markdown, /curl|https?:\/\/(?!localhost)/);
  });
});

describe('export file name', () => {
  // Local time, as the name is read by the person in their downloads folder
  const LOCAL_AFTERNOON = new Date(2026, 10, 13, 14, 5);

  it('names the file after the site, the date and the time', () => {
    assert.equal(exportFileName('www.Example.com', LOCAL_AFTERNOON), 'example.com-2026-11-13-1405.pagechange.json');
  });

  it('keeps the name safe for a file system when the host is an IPv6 address or missing', () => {
    assert.deepEqual(
      [exportFileName('[::1]', LOCAL_AFTERNOON), exportFileName('', LOCAL_AFTERNOON)],
      ['1-2026-11-13-1405.pagechange.json', 'page-2026-11-13-1405.pagechange.json'],
    );
  });
});

describe('overlay build', () => {
  it('contains no way to send data over the network, in the loader or the full overlay', async () => {
    const { loader, overlay } = await buildOverlay({ write: false });

    const found = NETWORK_APIS.filter((api) => loader.includes(api) || overlay.includes(api));

    assert.deepEqual(found, []);
  });

  it('keeps the loader small, as every visitor of the site downloads it', async () => {
    const { loader, overlay } = await buildOverlay({ write: false });

    assert.ok(Buffer.byteLength(loader) <= LOADER_MAX_BYTES, `loader is ${Buffer.byteLength(loader)} bytes`);
    assert.ok(overlay.length > loader.length * 10, 'the loader seems to include the full overlay');
  });

  it('pins the full overlay in the loader with its integrity hash', async () => {
    const { loader, overlay } = await buildOverlay({ write: false });

    assert.ok(loader.includes(integrityOf(overlay)));
  });
});
