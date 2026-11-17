// Checks whether a document follows Page Change Format 0.1 (spec/page-change-format.md): first against the JSON schema,
// then the rules a schema cannot express. Run it on files with `node spec/validator/validate.js <file>...`.
const fs = require('node:fs');
const { checkSchema } = require('./json-schema');
const SCHEMA = require('../schema/page-change-format-0.1.schema.json');

const ITEM_TYPE = Object.freeze({ Edit: 'edit', Duplicate: 'duplicate', Move: 'move', Delete: 'delete' });
const POSITION = Object.freeze({ Before: 'before', After: 'after' });
// Section 5.2: the fields that point to an element; a target without any of them is the page as a whole
const ELEMENT_ANCHORS = Object.freeze(['selector', 'html', 'text', 'heading']);
const MESSAGE = Object.freeze({
  DuplicateId: 'is also the id of an earlier item',
  DuplicateNumber: 'is also the number of an earlier item',
  EditWithoutRequest: 'an edit needs at least one change or a non-empty comment',
  DeleteWithChanges: 'a delete has no changes',
  PlacementOnlyForCopyOrMove: 'only a duplicate or a move has a placement',
  DuplicateGoesAfter: 'a duplicate goes after the original, so its position is after',
  DuplicateHasNoTarget: 'a duplicate goes next to its own element, so its placement has no target',
  MoveWithChanges: 'a move has no changes',
  MoveWithoutPlacement: 'a move needs a placement that says where the element goes',
  MoveWithoutTarget: 'a move needs the target of the element it goes next to',
  MoveHasNoOrder: 'a move has no order',
  MoveNextToItself: 'an element cannot go next to itself',
  MoveToWholePage: 'a move goes next to an element, so its destination must point to one, not to the page as a whole',
  MoveToOtherPage: 'a move stays on one page, so the destination has the same url as the target',
  WholePageNotComment: 'a target with only a url is the whole page, so the item must be an edit with a comment',
  AttributeChangesNothing: 'an attribute that was absent (from: null) cannot be removed (to: null)',
});
const EXIT_CODE = Object.freeze({ Invalid: 1 });
const USAGE = 'Usage: node spec/validator/validate.js <file.pagechange.json>...';

/** Answers the ways `document` breaks PCF 0.1, as a list of `{ path, message }` with a JSON Pointer path; empty when valid. */
function validate(document) {
  const schemaErrors = checkSchema(document, SCHEMA);
  // The rules below rely on the structure the schema guarantees, so they only run on a document that passes it
  if (schemaErrors.length) return schemaErrors;
  return [
    ...repeated(document.items, 'id', MESSAGE.DuplicateId),
    ...repeated(document.items, 'number', MESSAGE.DuplicateNumber),
    ...document.items.flatMap(itemErrors),
  ];
}

// Section 5: id and number are unique within the document
function repeated(items, field, message) {
  const seen = new Set();
  return items.flatMap((item, index) => {
    const value = item[field];
    if (value === undefined) return [];
    if (seen.has(value)) return [{ path: `/items/${index}/${field}`, message }];
    seen.add(value);
    return [];
  });
}

function itemErrors(item, index) {
  const at = (path, message) => ({ path: `/items/${index}${path}`, message });
  const changes = item.changes || [];
  const errors = [];
  if (item.type === ITEM_TYPE.Edit && !hasRequest(item)) errors.push(at('', MESSAGE.EditWithoutRequest));
  if (item.type === ITEM_TYPE.Delete && changes.length) errors.push(at('/changes', MESSAGE.DeleteWithChanges));
  errors.push(...placementErrors(item).map(({ path, message }) => at(path, message)));
  if (isWholePage(item.target) && !isCommentOnly(item)) errors.push(at('/target', MESSAGE.WholePageNotComment));
  changes.forEach((change, number) => {
    if (change.from === null && change.to === null) errors.push(at(`/changes/${number}`, MESSAGE.AttributeChangesNothing));
  });
  return errors;
}

// Section 5.4
function placementErrors(item) {
  const { placement } = item;
  if (item.type === ITEM_TYPE.Move) return movePlacementErrors(item);
  if (!placement) return [];
  if (item.type !== ITEM_TYPE.Duplicate) return [{ path: '/placement', message: MESSAGE.PlacementOnlyForCopyOrMove }];
  const errors = [];
  if (placement.position !== POSITION.After) errors.push({ path: '/placement/position', message: MESSAGE.DuplicateGoesAfter });
  if (placement.target) errors.push({ path: '/placement/target', message: MESSAGE.DuplicateHasNoTarget });
  return errors;
}

function movePlacementErrors(item) {
  const { placement } = item;
  if (!placement) return [{ path: '/placement', message: MESSAGE.MoveWithoutPlacement }];
  const errors = [];
  if ((item.changes || []).length) errors.push({ path: '/changes', message: MESSAGE.MoveWithChanges });
  if (!placement.target) errors.push({ path: '/placement/target', message: MESSAGE.MoveWithoutTarget });
  if (placement.order !== undefined) errors.push({ path: '/placement/order', message: MESSAGE.MoveHasNoOrder });
  if (placement.target) errors.push(...destinationErrors(item.target, placement.target));
  return errors;
}

function destinationErrors(target, destination) {
  const path = '/placement/target';
  if (isWholePage(destination)) return [{ path, message: MESSAGE.MoveToWholePage }];
  if (destination.url !== target.url) return [{ path, message: MESSAGE.MoveToOtherPage }];
  if (sameElement(target, destination)) return [{ path, message: MESSAGE.MoveNextToItself }];
  return [];
}

// The selector is how an element is told apart in the document; a producer that gives none cannot be checked
function sameElement(a, b) {
  const selector = (target) => (target.selector || []).map((s) => s.value).join('|');
  return selector(a) !== '' && selector(a) === selector(b);
}

// Section 5.1: an edit asks for concrete changes, or in words, or both
function hasRequest(item) {
  return (item.changes || []).length > 0 || hasComment(item);
}

function isWholePage(target) {
  return ELEMENT_ANCHORS.every((field) => target[field] === undefined || target[field].length === 0);
}

function isCommentOnly(item) {
  return item.type === ITEM_TYPE.Edit && hasComment(item);
}

const hasComment = (item) => typeof item.comment === 'string' && item.comment.trim() !== '';

/** Validates each file and prints what is wrong. Answers whether all files are valid. */
function validateFiles(files, print) {
  return files.map((file) => reportFile(file, print)).every(Boolean);
}

function reportFile(file, print) {
  const errors = errorsInFile(file);
  if (!errors.length) {
    print(`${file}: valid PCF 0.1`);
    return true;
  }
  errors.forEach(({ path, message }) => print(`${file} ${path || '/'}: ${message}`));
  return false;
}

function errorsInFile(file) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (cause) {
    return [{ path: '', message: `cannot be read as JSON: ${cause.message}` }];
  }
  return validate(document);
}

function main(files) {
  if (!files.length) {
    console.log(USAGE);
    return false;
  }
  return validateFiles(files, console.log);
}

if (require.main === module && !main(process.argv.slice(2))) process.exitCode = EXIT_CODE.Invalid;

module.exports = { validate };
