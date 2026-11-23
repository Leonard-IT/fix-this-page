const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { snippet, readableText } = require('../../../src/core/annotator/describe-element');

describe('snippet', () => {
  // Just enough of a DOM node for the snippet
  const el = (tag, attributes = {}, ...childNodes) => ({
    nodeType: 1,
    tagName: tag.toUpperCase(),
    attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
    hasAttribute: (name) => name in attributes,
    childNodes: childNodes.map((child) => (typeof child === 'string' ? { nodeType: 3, nodeValue: child } : child)),
  });
  const icon = () => el('svg', { width: '14', viewBox: '0 0 24 24', class: 'icon' }, el('path', { d: 'M2 12s3.5-6 10-6' }));

  it('keeps tags, attributes and text a few levels deep', () => {
    const card = el('a', { class: 'card', href: '/item/1' }, el('h3', {}, 'BMW 3 Serie'), el('img', { alt: 'Photo', src: '/a.jpg' }));

    assert.equal(snippet(card), '<a class="card" href="/item/1"><h3>BMW 3 Serie</h3><img alt="Photo" src="/a.jpg"></a>');
  });

  it('leaves out drawings and deeper levels', () => {
    const deep = el('div', { class: 'l0' }, icon(), el('div', { class: 'l1' }, el('div', { class: 'l2' }, el('div', { class: 'l3' }, el('p', {}, 'Deep')))));

    assert.equal(snippet(deep), '<div class="l0"><svg class="icon">…</svg><div class="l1"><div class="l2"><div class="l3">…</div></div></div></div>');
  });

  it('keeps a label at the deepest level, as it is often written as is in the source', () => {
    const deep = el('div', {}, el('div', {}, el('div', {}, el('button', {}, 'Send'))));

    assert.equal(snippet(deep), '<div><div><div><button>Send</button></div></div></div>');
  });

  it('shortens long texts and values, and leaves out the editor\'s own attributes and elements', () => {
    const long = 'x'.repeat(200);
    const node = el('p', { title: long, contenteditable: 'true' }, long, el('fb-ui', {}, 'Toolbar'), el('span', { 'data-fb-clone': 'a1' }, 'Copy'));

    assert.equal(snippet(node), `<p title="${'x'.repeat(100)}…">${'x'.repeat(60)}…</p>`);
  });

  it('drops levels until it fits, so a large block stays small', () => {
    const rows = Array.from({ length: 30 }, (_, i) => el('li', {}, el('a', { href: `/item/${i}` }, `Item ${i}`)));
    const html = snippet(el('ul', { class: 'list' }, ...rows));

    assert.ok(html.length <= 600);
    assert.ok(html.startsWith('<ul class="list"><li>'));
  });

  it('escapes the characters the markup needs', () => {
    assert.equal(snippet(el('a', { title: 'Say "hi" & go' }, 'a < b & c')), '<a title="Say &quot;hi&quot; &amp; go">a &lt; b &amp; c</a>');
  });
});

describe('readableText', () => {
  const node = (tag, ...childNodes) => ({
    nodeType: 1, tagName: tag.toUpperCase(), hasAttribute: () => false,
    childNodes: childNodes.map((child) => (typeof child === 'string' ? { nodeType: 3, nodeValue: child } : child)),
  });

  it('keeps the text of neighbouring blocks apart', () => {
    const card = node('article', node('span', 'M'), node('div', node('h3', 'Michiel')), node('p', 'Hij is blij.'));

    assert.equal(readableText(card), 'M Michiel Hij is blij.');
  });

  it('does not split a word at inline markup', () => {
    assert.equal(readableText(node('p', 'Hel', node('b', 'lo'), ' world')), 'Hello world');
  });
});
