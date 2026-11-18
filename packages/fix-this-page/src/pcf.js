// Reads Page Change Format (PCF) 0.1 documents for the overlay's Import (spec/page-change-format.md). Export uses the
// shared writer in src/core/pcf.js. Inside the browser the items keep the shape of a fixthis session, because the prompt
// renderer reads that shape.
const { ANNOTATION_TYPE } = require('./core/annotator.js');
const { withoutEmpty, PCF, ITEM_TYPE, CHANGE_TYPE, SELECTOR_TYPE, STATUS, PLACEMENT, MOVE_POSITIONS, CHANGE_KIND } = require('./core/pcf.js');

// The session keeps where a copy goes relative to; PCF only has the original
const RELATIVE_TO_SOURCE = 'source';
// Section 5: ids end up in URLs and file names, so a document with other ids is refused as a whole
const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Reads an imported file: a PCF document, or a file from an earlier version of the overlay.
 * Answers session data for the store and how many items were skipped. Throws when the file cannot be used at all.
 */
function readFeedbackFile(data) {
  if (data && data.format === PCF.Format) return fromPcf(data);
  return { data, skipped: 0 };
}

function fromPcf(doc) {
  assertUsableDocument(doc);
  const items = doc.items.filter(canShow);
  const annotations = items.map(toAnnotation);
  return { data: { pages: pagesOf(items), annotations }, skipped: doc.items.length - items.length };
}

// Section 4 and 8: refuse the document as a whole rather than guess
function assertUsableDocument(doc) {
  if (String(doc.version).split('.')[0] !== PCF.SupportedMajor) throw new Error(`PCF version ${doc.version} is not supported`);
  if (!Array.isArray(doc.items)) throw new Error('This PCF file has no items');
  const ids = doc.items.map((item) => item && item.id);
  if (!ids.every((id) => typeof id === 'string' && ITEM_ID.test(id))) throw new Error('This PCF file has an item with an invalid id');
  if (new Set(ids).size !== ids.length) throw new Error('This PCF file has two items with the same id');
}

// Section 9.1: an item with anything the overlay cannot show is skipped as a whole, as applying part of it is worse
function canShow(item) {
  if (!Object.values(ITEM_TYPE).includes(item.type)) return false;
  if (!item.target || pathOf(item.target.url) === null) return false;
  if (!canPlace(item)) return false;
  return (item.changes || []).every(canApply);
}

// A move needs the block it goes next to; any other placement can only be "after" (spec 5.4)
function canPlace(item) {
  if (item.type === ITEM_TYPE.Move) return Boolean(item.placement) && MOVE_POSITIONS.includes(item.placement.position) && Boolean(item.placement.target);
  return !item.placement || item.placement.position === PLACEMENT.Position;
}

// An attribute change sets a value, or removes the attribute with null (spec 5.3)
function canApply(change) {
  if (change.type === CHANGE_TYPE.Text) return true;
  return change.type === CHANGE_TYPE.Attribute && typeof change.name === 'string' && (typeof change.to === 'string' || change.to === null);
}

function toAnnotation(item) {
  const changes = (item.changes || []).map(fromChange);
  const target = item.target;
  return {
    id: item.id,
    number: item.number,
    type: annotationTypeOf(item, changes),
    pageId: pathOf(target.url),
    target: withoutEmpty({
      ...toElementData(target),
      url: pathOf(target.url),
      viewport: target.viewport && { w: target.viewport.width, h: target.viewport.height },
    }),
    changes,
    placement: placementOf(item),
    comment: item.comment || '',
    author: (item.author && item.author.name) || '',
    status: item.status === STATUS.Done ? STATUS.Done : STATUS.Open,
    createdAt: item.created || '',
  };
}

function placementOf(item) {
  if (item.type === ITEM_TYPE.Move) return { position: item.placement.position, anchor: toElementData(item.placement.target) };
  if (item.type !== ITEM_TYPE.Duplicate) return undefined;
  return { relative_to: RELATIVE_TO_SOURCE, position: PLACEMENT.Position, order: Number(item.placement && item.placement.order) || PLACEMENT.DefaultOrder };
}

// The overlay calls an edit that only has a comment a comment, and a duplicate a clone
function annotationTypeOf(item, changes) {
  if (item.type === ITEM_TYPE.Duplicate) return ANNOTATION_TYPE.Clone;
  if (item.type === ITEM_TYPE.Delete) return ANNOTATION_TYPE.Delete;
  if (item.type === ITEM_TYPE.Move) return ANNOTATION_TYPE.Move;
  return changes.length ? ANNOTATION_TYPE.Edit : ANNOTATION_TYPE.Comment;
}

// The session stores an absent attribute (from: null in PCF) as an empty string
function fromChange(change) {
  if (change.type === CHANGE_TYPE.Attribute) {
    return withoutEmpty({ kind: CHANGE_KIND.Attr, path: change.path || '.', name: change.name, from: change.from ?? '', to: change.to }, ['from', 'to']);
  }
  return withoutEmpty({ kind: CHANGE_KIND.Text, path: change.path || '.', from: change.from, to: change.to }, ['from', 'to']);
}

// What the session keeps to find an element again
function toElementData(target) {
  return withoutEmpty({ selector: cssSelectorOf(target.selector), text: target.text, html: target.html, heading: target.heading });
}

function cssSelectorOf(selectors) {
  const css = (Array.isArray(selectors) ? selectors : []).find((s) => s && s.type === SELECTOR_TYPE.Css);
  return css ? String(css.value) : undefined;
}

// Items are kept per path: the URL can be a staging or development host (section 5.2), so the origin is not compared
function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

function pagesOf(items) {
  const byPath = new Map();
  for (const { target } of items) {
    const path = pathOf(target.url);
    if (!byPath.has(path)) byPath.set(path, { id: path, path, url: new URL(path, target.url).href });
  }
  return [...byPath.values()];
}

module.exports = { readFeedbackFile };
