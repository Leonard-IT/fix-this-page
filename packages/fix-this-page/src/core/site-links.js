// Which pages of the site a page links to that have no feedback yet. In the snapshot editor and under the overlay a
// click makes an item instead of following the link, and a snapshot's menus do not open, but the links are still in
// the markup; the editor and the overlay's dock offer them from there.
(() => {
  const WEB_PROTOCOLS = Object.freeze(['http:', 'https:']);
  // Links to files rather than pages
  const FILE_EXTENSION = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|rar|7z|docx?|xlsx?|pptx?|csv|txt|xml|json|mp3|mp4|mov|webm|wav|ics|vcf)$/i;
  // Parameters that only say where a visitor came from; with them, one page would be listed several times
  const TRACKING_PARAM = /^(utm_\w+|fbclid|gclid|msclkid|mc_cid|mc_eid|_ga)$/i;
  const WWW_PREFIX = /^www\./i;
  const TRAILING_SLASHES = /(.)\/+$/;
  const QUERY_START = '?';
  const PATH_SEPARATOR = '/';
  const LINK_SELECTOR = 'a[href]';
  // Links in our own interface are not the site's
  const OURS_SELECTOR = '[data-fb]';
  // The snapshot sends the links to the editor in one message, so they are capped
  const MAX_ANCHORS = 2000;
  const MAX_PATHS = 1000;
  const MAX_RESULTS = 100;
  // From this many pages of one kind on (blog posts, products, vacancies), one stands for all of them
  const MIN_GROUP_SIZE = 3;

  /** The hrefs of the site's links in the document, made absolute by the browser. */
  function anchorsOn(doc) {
    return [...doc.querySelectorAll(LINK_SELECTOR)]
      .filter((a) => !a.closest(OURS_SELECTOR))
      .slice(0, MAX_ANCHORS)
      .map((a) => a.href);
  }

  // example.com and www.example.com are the same site; a link from one to the other is still an internal link
  const bareHost = (hostname) => hostname.replace(WWW_PREFIX, '');
  const isSameSite = (url, site) => bareHost(url.hostname) === bareHost(site.hostname);
  const isWebPage = (url) => WEB_PROTOCOLS.includes(url.protocol) && !FILE_EXTENSION.test(url.pathname);

  function parse(href, base) {
    try { return new URL(href, base); } catch { return null; }
  }

  function withoutTracking(url) {
    const tracking = [...url.searchParams.keys()].filter((name) => TRACKING_PARAM.test(name));
    tracking.forEach((name) => url.searchParams.delete(name));
    url.hash = '';
    return url;
  }

  // '/about' and '/about/' are one page
  const pageKey = (url) => url.pathname.replace(TRAILING_SLASHES, '$1') + url.search;
  const pathOf = (url) => url.pathname + url.search;

  function sitePageUrl(href, site) {
    const url = parse(href);
    if (!url || !isWebPage(url) || !isSameSite(url, site)) return null;
    return withoutTracking(url);
  }

  /**
   * @param {string[]} hrefs the links on the page, absolute
   * @param {{ pageUrl: string, knownPaths: string[] }} context the page that holds them, and the paths with feedback
   * @returns {string[]} the path of every page without feedback, once, in the page's order
   */
  function newPageLinks(hrefs, { pageUrl, knownPaths }) {
    const site = new URL(pageUrl);
    const known = new Set([pageUrl, ...knownPaths].map((path) => pageKey(withoutTracking(new URL(path, site)))));
    const found = new Map();
    for (const href of hrefs) {
      const url = sitePageUrl(href, site);
      if (url && !known.has(pageKey(url)) && !found.has(pageKey(url))) found.set(pageKey(url), pathOf(url));
    }
    return [...found.values()].slice(0, MAX_PATHS);
  }

  // '/blog/post-1' and '/blog/post-2' are pages of one kind, as are '/shop?c=1' and '/shop?c=2'. A top-level page
  // such as '/about' is a section of the site and makes a group of its own.
  function groupOf(path) {
    const queryAt = path.indexOf(QUERY_START);
    if (queryAt >= 0) return path.slice(0, queryAt + 1);
    const trimmed = path.replace(TRAILING_SLASHES, '$1');
    const parentEnd = trimmed.lastIndexOf(PATH_SEPARATOR);
    return parentEnd > 0 ? trimmed.slice(0, parentEnd + 1) : trimmed;
  }

  const single = (path) => ({ path, similar: 0, group: '' });

  function groupedPages(paths) {
    const groups = new Map();
    paths.forEach((path) => groups.set(groupOf(path), [...(groups.get(groupOf(path)) || []), path]));
    return [...groups].flatMap(([group, members]) =>
      (members.length < MIN_GROUP_SIZE ? members.map(single) : [{ path: members[0], similar: members.length - 1, group }]));
  }

  /**
   * What to list: without a search, pages of one kind as one entry that says how many similar ones there are, and
   * `group` to search for to see them all; with a search, every path that contains it.
   * @param {string[]} paths from newPageLinks
   * @param {string} query what the person typed
   * @returns {{ path: string, similar: number, group: string }[]}
   */
  function pageLinkList(paths, query) {
    const wanted = String(query || '').trim().toLowerCase();
    if (!wanted) return groupedPages(paths);
    return paths.filter((path) => path.toLowerCase().includes(wanted)).slice(0, MAX_RESULTS).map(single);
  }

  const FixthisSiteLinks = Object.freeze({ anchorsOn, newPageLinks, pageLinkList });
  // A plain script in the editor; a CommonJS module in the overlay bundle and the tests
  if (typeof module === 'object' && module.exports) module.exports = FixthisSiteLinks;
  else globalThis.FixthisSiteLinks = FixthisSiteLinks;
})();
