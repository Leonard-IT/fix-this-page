// Keeps the overlay's feedback in the browser, in the localStorage of the site itself. Nothing leaves the browser.
// The data has the same shape as a session on the server, so the same prompt renderer can read it.
const { isSafeChange } = require('./core/annotator.js');

const STORAGE_KEY = 'fixthis:feedback';
const SESSION_ID = 'local';
const ANNOTATION_STATUS = Object.freeze({ Open: 'open', Done: 'done' });
const ANNOTATION_TYPES = Object.freeze(['comment', 'edit', 'clone', 'move', 'delete']);

/**
 * @param {{ storage: Storage, site: string, now: () => Date, createId: () => string }} deps
 * `storage.setItem` may throw (quota, private mode); the error reaches the caller.
 */
function createStore({ storage, site, now, createId }) {
  return { session, annotationsFor, add, setStatus, remove, clear, replace, merge };

  function session() {
    return read();
  }

  function annotationsFor(path) {
    return read().annotations.filter((annotation) => annotation.pageId === path);
  }

  function add(page, draft) {
    const data = read();
    const annotation = {
      ...draft,
      id: createId(),
      number: data.nextNumber,
      pageId: page.path,
      author: '',
      status: ANNOTATION_STATUS.Open,
      createdAt: now().toISOString(),
    };
    write({
      ...data,
      pages: withPage(data.pages, page),
      annotations: [...data.annotations, annotation],
      nextNumber: data.nextNumber + 1,
    });
    return annotation;
  }

  function setStatus(id, status) {
    const data = read();
    write({ ...data, annotations: data.annotations.map((a) => (a.id === id ? { ...a, status } : a)) });
  }

  function remove(id) {
    const data = read();
    write({ ...data, annotations: data.annotations.filter((a) => a.id !== id) });
  }

  function clear() {
    storage.removeItem(STORAGE_KEY);
  }

  /** Replaces everything with imported session data (see readFeedbackFile in pcf.js). Throws when it is not feedback. */
  function replace(imported) {
    write(toSession(imported, site));
  }

  /**
   * Adds the items of a shared link to what is here, so a link sent back and forth carries the conversation.
   * Answers how many items were new. Throws when it is not feedback.
   */
  function merge(incoming) {
    const merged = mergeSessions(read(), toSession(incoming, site));
    write(merged.session);
    return { added: merged.added };
  }

  function read() {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptySession(site);
    return toSession(JSON.parse(raw), site);
  }

  function write(data) {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}

function emptySession(site) {
  return { id: SESSION_ID, site, pages: [], annotations: [], nextNumber: 1 };
}

// Stored and imported data are both untrusted input: keep only well-formed pages and items
function toSession(data, site) {
  if (!isFeedbackData(data)) throw new Error('This is not a feedback file');
  const annotations = data.annotations.filter(isWellFormedAnnotation).map(withSafeChanges);
  const pages = Array.isArray(data.pages) ? data.pages.filter(isWellFormedPage) : [];
  return { id: SESSION_ID, site, pages, annotations, nextNumber: nextNumberAfter(annotations) };
}

function isFeedbackData(data) {
  return Boolean(data) && typeof data === 'object' && Array.isArray(data.annotations);
}

function isWellFormedAnnotation(annotation) {
  return Boolean(annotation)
    && typeof annotation.id === 'string'
    && typeof annotation.pageId === 'string'
    && ANNOTATION_TYPES.includes(annotation.type)
    && Boolean(annotation.target) && typeof annotation.target === 'object';
}

// The page is the site's live page, so a change that could run script is dropped, not only left unapplied
function withSafeChanges(annotation) {
  if (!Array.isArray(annotation.changes)) return annotation;
  return { ...annotation, changes: annotation.changes.filter(isSafeChange) };
}

function isWellFormedPage(page) {
  return Boolean(page) && typeof page.id === 'string' && typeof page.path === 'string' && typeof page.url === 'string';
}

function nextNumberAfter(annotations) {
  return Math.max(0, ...annotations.map((a) => Number(a.number) || 0)) + 1;
}

// The link's copy of an item wins, except that done stays done: an older link must not reopen what was fixed.
// Two people can both have made an item 1, so a new item whose number is taken gets the next free one.
function mergeSessions(local, incoming) {
  const incomingById = new Map(incoming.annotations.map((a) => [a.id, a]));
  const localIds = new Set(local.annotations.map((a) => a.id));
  const updated = local.annotations.map((a) => mergeItem(a, incomingById.get(a.id)));
  const newItems = incoming.annotations.filter((a) => !localIds.has(a.id));
  const annotations = [...updated, ...renumbered(newItems, updated)];
  const pages = incoming.pages.reduce(withPage, local.pages);
  return { session: { ...local, pages, annotations, nextNumber: nextNumberAfter(annotations) }, added: newItems.length };
}

function mergeItem(local, incoming) {
  if (!incoming) return local;
  const status = local.status === ANNOTATION_STATUS.Done ? ANNOTATION_STATUS.Done : incoming.status;
  return { ...incoming, number: local.number, status };
}

function renumbered(newItems, existing) {
  const taken = new Set(existing.map((a) => a.number));
  let next = nextNumberAfter([...existing, ...newItems]);
  return newItems.map((item) => {
    const number = taken.has(item.number) ? next++ : item.number;
    taken.add(number);
    return { ...item, number };
  });
}

function withPage(pages, page) {
  if (pages.some((p) => p.id === page.path)) return pages;
  return [...pages, { id: page.path, path: page.path, url: page.url }];
}

module.exports = { createStore, ANNOTATION_STATUS, STORAGE_KEY };
