const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { toPcf } = require('../../src/core/pcf');
const { validate } = require('../../../../spec/validator/validate');

const NOW = new Date('2026-11-11T08:00:00Z');
const OPTIONS = Object.freeze({
  now: NOW,
  generator: { name: 'fixthis.page' },
  documentId: 'Vq3kP0',
  callbackUrl: 'https://fixthis.page/api/sessions/Vq3kP0/annotations',
});

// A session as the Worker stores it, internal fields included
function session(annotations) {
  return {
    id: 'Vq3kP0', site: 'https://bakery.example', createdAt: '2026-11-10T09:00:00.000Z', nextNumber: 9, snapCount: 2,
    pages: [{ id: 'p1', url: 'https://bakery.example/', path: '/', title: 'Home', snapshotAt: '2026-11-10T09:00:00.000Z' }],
    annotations,
  };
}

function annotation(overrides = {}) {
  return {
    id: 'k3Fq', number: 1, pageId: 'p1', type: 'edit',
    target: { url: 'https://bakery.example/', selector: 'main h1', text: 'Fresh bread', html: '<h1>Fresh bread</h1>', heading: '', viewport: { w: 1280, h: 800 } },
    changes: [{ kind: 'text', path: '.', from: 'Fresh bread', to: 'Fresh bread daily' }],
    comment: '', author: '', status: 'open', createdAt: '2026-11-10T09:12:00.000Z',
    ...overrides,
  };
}

const exportOf = (annotations) => toPcf(session(annotations), OPTIONS);

describe('PCF export of a server session', () => {
  it('writes a valid document for every kind of item', () => {
    const exported = exportOf([
      annotation(),
      annotation({ id: 'c1', number: 2, type: 'comment', changes: [], comment: 'Bigger please', author: 'Anna' }),
      annotation({ id: 'd1', number: 3, type: 'clone', placement: { relative_to: 'source', position: 'after', order: 2 } }),
      annotation({ id: 'x1', number: 4, type: 'delete', changes: [] }),
    ]);

    assert.deepEqual(validate(exported), []);
  });

  it('names the session and where reports go, without the internal fields', () => {
    const exported = exportOf([]);

    assert.deepEqual(exported, {
      format: 'page-change-format',
      version: '0.1',
      id: 'Vq3kP0',
      created: NOW.toISOString(),
      generator: { name: 'fixthis.page' },
      items: [],
      extensions: { 'page.fixthis': { callback: { method: 'PATCH', url: 'https://fixthis.page/api/sessions/Vq3kP0/annotations/{id}' } } },
    });
  });

  it('puts what the agent reported in the fixthis extension of the item', () => {
    const done = annotation({ status: 'done', summary: 'index.html l.4', clientTitle: 'Updated', clientSummary: 'The headline changed.', doneAt: '2026-11-10T10:03:00.000Z' });

    const [item] = exportOf([done]).items;

    assert.deepEqual(item.extensions, {
      'page.fixthis': { report: { summary: 'index.html l.4', clientTitle: 'Updated', clientSummary: 'The headline changed.', at: '2026-11-10T10:03:00.000Z' } },
    });
  });

  it('writes the legacy status verwerkt as done', () => {
    const [item] = exportOf([annotation({ status: 'verwerkt' })]).items;

    assert.equal(item.status, 'done');
  });

  it('leaves out a viewport the editor did not send', () => {
    const [item] = exportOf([annotation({ target: { ...annotation().target, viewport: { w: 0, h: 0 } } })]).items;

    assert.equal(item.target.viewport, undefined);
  });

  it('writes an attribute that was absent as null', () => {
    const link = annotation({ changes: [{ kind: 'attr', path: '.', name: 'href', from: '', to: '/shop' }] });

    const [item] = exportOf([link]).items;

    assert.deepEqual(item.changes, [{ type: 'attribute', path: '.', name: 'href', from: null, to: '/shop' }]);
  });

  it('leaves out a link the client has not given yet, and an edit that then asks for nothing', () => {
    const noLinkYet = { kind: 'attr', path: '.', name: 'href', from: '/shop', to: '' };
    const withText = annotation({ changes: [annotation().changes[0], noLinkYet] });
    const onlyEmptyLink = annotation({ id: 'e2', number: 2, changes: [noLinkYet] });

    const items = exportOf([withText, onlyEmptyLink]).items;

    assert.deepEqual(items.map((item) => [item.id, item.changes.length]), [['k3Fq', 1]]);
  });
});
