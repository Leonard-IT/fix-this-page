// Shared by the overlay and the fixthis.page servers
// Writes a fixthis session as a Page Change Format (PCF) 0.1 document (spec/page-change-format.md, Appendix B for the
// differences). The session stays the storage format; PCF is what leaves the system.

const PCF = Object.freeze({ Format: 'page-change-format', Version: '0.1', SupportedMajor: '0' });
const ITEM_TYPE = Object.freeze({ Edit: 'edit', Duplicate: 'duplicate', Move: 'move', Delete: 'delete' });
const CHANGE_TYPE = Object.freeze({ Text: 'text', Attribute: 'attribute' });
const SELECTOR_TYPE = Object.freeze({ Css: 'CssSelector' });
const STATUS = Object.freeze({ Open: 'open', Done: 'done' });
const PLACEMENT = Object.freeze({ Position: 'after', DefaultOrder: 1 });
// A moved block goes on either side of the block it is placed next to
const MOVE_POSITIONS = Object.freeze(['before', 'after']);
// Spec Appendix C: fixthis.page's own data goes in this extension
const FIXTHIS_EXTENSION = 'page.fixthis';
const CALLBACK = Object.freeze({ Method: 'PATCH', IdPlaceholder: '{id}' });
// The session's own names
const SESSION_TYPE = Object.freeze({ Comment: 'comment', Edit: 'edit', Clone: 'clone', Move: 'move', Delete: 'delete' });
const SESSION_STATUS = Object.freeze({ Done: 'done', LegacyDone: 'verwerkt' });
const CHANGE_KIND = Object.freeze({ Text: 'text', Attr: 'attr' });
const ITEM_TYPE_BY_SESSION_TYPE = Object.freeze({
  [SESSION_TYPE.Comment]: ITEM_TYPE.Edit,
  [SESSION_TYPE.Edit]: ITEM_TYPE.Edit,
  [SESSION_TYPE.Clone]: ITEM_TYPE.Duplicate,
  [SESSION_TYPE.Move]: ITEM_TYPE.Move,
  [SESSION_TYPE.Delete]: ITEM_TYPE.Delete,
});

/**
 * The session as a PCF document. `now` is when the document is made, `generator` names the producer. `documentId` and
 * `callbackUrl` (the URL that takes reports, ending in the annotations path) are only for sessions on a server.
 * Items that ask for nothing are left out, as PCF has no way to write them.
 */
function toPcf(session, { now, generator, documentId, callbackUrl }) {
  const urlByPage = new Map(session.pages.map((page) => [page.id, page.url]));
  const items = session.annotations
    .map((annotation) => toItem(annotation, urlByPage.get(annotation.pageId)))
    .filter(asksForSomething);
  return withoutEmpty({
    format: PCF.Format,
    version: PCF.Version,
    id: documentId,
    created: now.toISOString(),
    generator: { ...generator },
    items,
    extensions: callbackUrl ? callbackExtension(callbackUrl) : undefined,
  }, ['items']);
}

function toItem(annotation, url) {
  return withoutEmpty({
    id: annotation.id,
    number: annotation.number,
    type: ITEM_TYPE_BY_SESSION_TYPE[annotation.type],
    target: toTarget(annotation.target || {}, url),
    changes: (annotation.changes || []).filter(hasRequestedValue).map(toChange),
    placement: toPlacement(annotation, url),
    comment: annotation.comment,
    author: annotation.author ? { name: annotation.author } : undefined,
    created: annotation.createdAt,
    status: isDone(annotation) ? STATUS.Done : STATUS.Open,
    extensions: reportExtension(annotation),
  });
}

// Spec 5.4: a duplicate goes after the original; a move says which block it goes next to, and on which side
function toPlacement(annotation, url) {
  if (annotation.type === SESSION_TYPE.Clone) return { position: PLACEMENT.Position, order: orderOf(annotation.placement) };
  if (annotation.type !== SESSION_TYPE.Move) return undefined;
  const { position, anchor } = annotation.placement || {};
  if (!MOVE_POSITIONS.includes(position) || !anchor) return undefined;
  return { position, target: toTarget(anchor, url) };
}

// Spec 5.1: an edit asks for concrete changes, or in words; a duplicate or delete is a request by itself, and so is a move
// that says where the block goes
function asksForSomething(item) {
  if (item.type === ITEM_TYPE.Move) return Boolean(item.placement);
  if (item.type !== ITEM_TYPE.Edit) return true;
  return Boolean(item.changes) || Boolean(item.comment && item.comment.trim());
}

// An empty href means the client has not given the new link yet; null asks to remove the attribute (spec 5.3)
function hasRequestedValue(change) {
  return change.kind !== CHANGE_KIND.Attr || change.to === null || Boolean(change.to);
}

function toTarget(target, url) {
  return withoutEmpty({
    url,
    selector: target.selector ? [{ type: SELECTOR_TYPE.Css, value: target.selector }] : undefined,
    html: target.html,
    text: target.text,
    heading: target.heading,
    viewport: toViewport(target.viewport),
  });
}

// The Worker stores 0 by 0 when the editor sent no size
function toViewport(viewport) {
  if (!viewport || !(viewport.w > 0 && viewport.h > 0)) return undefined;
  return { width: viewport.w, height: viewport.h };
}

// The session stores an absent attribute as an empty string; PCF writes null (spec 5.3)
function toChange(change) {
  if (change.kind === CHANGE_KIND.Attr) {
    return withoutEmpty({ type: CHANGE_TYPE.Attribute, path: change.path, name: change.name, from: change.from || null, to: change.to }, ['from', 'to']);
  }
  return withoutEmpty({ type: CHANGE_TYPE.Text, path: change.path, from: change.from ?? '', to: change.to ?? '' }, ['from', 'to']);
}

function callbackExtension(callbackUrl) {
  return { [FIXTHIS_EXTENSION]: { callback: { method: CALLBACK.Method, url: `${callbackUrl}/${CALLBACK.IdPlaceholder}` } } };
}

// Spec Appendix C: what the agent reported for the item
function reportExtension(annotation) {
  const report = withoutEmpty({
    summary: annotation.summary,
    clientTitle: annotation.clientTitle,
    clientSummary: annotation.clientSummary,
    at: annotation.doneAt,
  });
  return Object.keys(report).length ? { [FIXTHIS_EXTENSION]: { report } } : undefined;
}

const isDone = (annotation) => annotation.status === SESSION_STATUS.Done || annotation.status === SESSION_STATUS.LegacyDone;
const orderOf = (placement) => Number(placement && placement.order) || PLACEMENT.DefaultOrder;

/** Leaves out fields that are undefined, null, empty strings or empty arrays, except the ones in `keep`. */
function withoutEmpty(object, keep = []) {
  const isEmpty = (value) => value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => keep.includes(key) || !isEmpty(value)));
}

module.exports = { toPcf, withoutEmpty, FIXTHIS_EXTENSION, PCF, ITEM_TYPE, CHANGE_TYPE, SELECTOR_TYPE, STATUS, PLACEMENT, MOVE_POSITIONS, CHANGE_KIND };
