const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { anchorsOn, newPageLinks, pageLinkList } = require('../../src/core/site-links');

const PAGE_URL = 'https://example.com/';
const pathsOf = (hrefs, knownPaths = ['/']) => newPageLinks(hrefs, { pageUrl: PAGE_URL, knownPaths });
const site = (...paths) => paths.map((path) => 'https://example.com' + path);

describe('site links', () => {
  it('offers the paths of the pages of the same site', () => {
    assert.deepEqual(pathsOf(site('/about', '/contact')), ['/about', '/contact']);
  });

  it('leaves out other sites, mail and phone links, and files', () => {
    const hrefs = ['https://other.com/about', 'mailto:hi@example.com', 'tel:+31201234567', ...site('/brochure.pdf', '/logo.PNG')];

    assert.deepEqual(pathsOf(hrefs), []);
  });

  it('counts the www and bare host as one site', () => {
    assert.deepEqual(pathsOf(['https://www.example.com/contact']), ['/contact']);
  });

  it('leaves out the pages that have feedback, with or without a trailing slash', () => {
    assert.deepEqual(pathsOf(site('/#top', '/services/', '/blog'), ['/', '/services']), ['/blog']);
  });

  it('lists a page once, also when links differ only in anchor or tracking parameters', () => {
    assert.deepEqual(pathsOf(site('/blog#latest', '/blog?utm_source=menu', '/blog/')), ['/blog']);
  });

  it('keeps parameters that choose content', () => {
    assert.deepEqual(pathsOf(site('/shop?category=shoes&utm_medium=nav')), ['/shop?category=shoes']);
  });

  it('skips links that are not valid urls', () => {
    assert.deepEqual(pathsOf(['http://', ...site('/ok')]), ['/ok']);
  });

  it('reads the links of a document, without the ones in our own interface', () => {
    const anchor = (href, ours = false) => ({ href, closest: () => (ours ? {} : null) });
    const doc = { querySelectorAll: () => [anchor('https://example.com/about'), anchor('https://example.com/ours', true)] };

    assert.deepEqual(anchorsOn(doc), ['https://example.com/about']);
  });
});

describe('page link list', () => {
  it('shows pages of one kind as one entry with the number of similar ones', () => {
    const paths = ['/about', '/jobs/welder', '/jobs/painter', '/jobs/mechanic', '/contact'];

    assert.deepEqual(pageLinkList(paths, ''), [
      { path: '/about', similar: 0, group: '' },
      { path: '/jobs/welder', similar: 2, group: '/jobs/' },
      { path: '/contact', similar: 0, group: '' },
    ]);
  });

  it('keeps a pair of pages of one kind apart', () => {
    assert.deepEqual(pageLinkList(['/services/repair', '/services/paint'], '').map((l) => l.path), ['/services/repair', '/services/paint']);
  });

  it('groups pages that differ only in their parameters', () => {
    assert.deepEqual(pageLinkList(['/shop?c=1', '/shop?c=2', '/shop?c=3'], ''), [{ path: '/shop?c=1', similar: 2, group: '/shop?' }]);
  });

  it('never groups top-level pages', () => {
    assert.equal(pageLinkList(['/a', '/b', '/c', '/d'], '').length, 4);
  });

  it('searches through every path, also the grouped ones, ignoring case', () => {
    const paths = ['/about', '/jobs/welder', '/jobs/painter', '/jobs/mechanic'];

    assert.deepEqual(pageLinkList(paths, ' Jobs/P ').map((l) => l.path), ['/jobs/painter']);
  });
});
