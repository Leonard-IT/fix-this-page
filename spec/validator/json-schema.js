// A JSON Schema (2020-12) checker for only the keywords the PCF schema uses, so the validator needs no dependency and checks
// documents with the schema file itself. A keyword it does not know throws: the schema cannot start using something this
// checker would silently skip.

// Keywords that describe a schema without checking anything
const ANNOTATION_KEYWORDS = Object.freeze(['$schema', '$comment', '$defs', 'title', 'description']);
// Applied by the `if` keyword, which picks one of them
const BRANCH_KEYWORDS = Object.freeze(['then', 'else']);
const LOCAL_REF_PREFIX = '#/$defs/';
const MESSAGE = Object.freeze({
  NotAllowed: 'is not allowed here',
  Required: 'is required',
  UnknownField: 'is not a field the schema defines; data of your own belongs under extensions',
});

const KEYWORDS = Object.freeze({
  type: checkType,
  const: (node, schema) => (isEqual(node.value, schema.const) ? [] : [error(node, `must be ${JSON.stringify(schema.const)}`)]),
  enum: checkEnum,
  pattern: (node, schema) => (typeof node.value !== 'string' || new RegExp(schema.pattern, 'u').test(node.value)
    ? [] : [error(node, `does not match ${schema.pattern}`)]),
  minLength: (node, schema) => (typeof node.value !== 'string' || [...node.value].length >= schema.minLength
    ? [] : [error(node, `must have at least ${schema.minLength} characters`)]),
  minimum: (node, schema) => (typeof node.value !== 'number' || node.value >= schema.minimum
    ? [] : [error(node, `must be at least ${schema.minimum}`)]),
  required: checkRequired,
  properties: checkProperties,
  additionalProperties: checkAdditionalProperties,
  propertyNames: checkPropertyNames,
  items: checkItems,
  $ref: (node, schema, root) => check(node, resolveRef(schema.$ref, root), root),
  if: checkIf,
});

const TYPE_TEST = Object.freeze({
  string: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number' && Number.isFinite(value),
  integer: (value) => Number.isInteger(value),
  boolean: (value) => typeof value === 'boolean',
  null: (value) => value === null,
  array: (value) => Array.isArray(value),
  object: (value) => isObject(value),
});

/** Checks `value` against `schema`. Answers a list of `{ path, message }`, where `path` is a JSON Pointer; empty when valid. */
function checkSchema(value, schema) {
  return check({ value, path: '' }, schema, schema);
}

function check(node, schema, root) {
  if (schema === true) return [];
  if (schema === false) return [error(node, MESSAGE.NotAllowed)];
  return Object.keys(schema).flatMap((keyword) => checkKeyword({ node, schema, root }, keyword));
}

function checkKeyword({ node, schema, root }, keyword) {
  if (ANNOTATION_KEYWORDS.includes(keyword) || BRANCH_KEYWORDS.includes(keyword)) return [];
  if (!KEYWORDS[keyword]) throw new Error(`The schema uses "${keyword}", which this checker does not support`);
  return KEYWORDS[keyword](node, schema, root);
}

function checkType(node, schema) {
  const types = [].concat(schema.type);
  if (types.some((type) => TYPE_TEST[type](node.value))) return [];
  return [error(node, `must be of type ${types.join(' or ')}`)];
}

function checkEnum(node, schema) {
  if (schema.enum.some((allowed) => isEqual(node.value, allowed))) return [];
  return [error(node, `must be one of ${schema.enum.map((allowed) => JSON.stringify(allowed)).join(', ')}`)];
}

function checkRequired(node, schema) {
  if (!isObject(node.value)) return [];
  return schema.required.filter((name) => !hasOwn(node.value, name)).map((name) => error(childOf(node, name), MESSAGE.Required));
}

function checkProperties(node, schema, root) {
  if (!isObject(node.value)) return [];
  return Object.keys(schema.properties)
    .filter((name) => hasOwn(node.value, name))
    .flatMap((name) => check(childOf(node, name), schema.properties[name], root));
}

function checkAdditionalProperties(node, schema, root) {
  if (!isObject(node.value)) return [];
  const unknownNames = Object.keys(node.value).filter((name) => !hasOwn(schema.properties || {}, name));
  if (schema.additionalProperties === false) return unknownNames.map((name) => error(childOf(node, name), MESSAGE.UnknownField));
  return unknownNames.flatMap((name) => check(childOf(node, name), schema.additionalProperties, root));
}

function checkPropertyNames(node, schema, root) {
  if (!isObject(node.value)) return [];
  return Object.keys(node.value).flatMap((name) => check({ value: name, path: childOf(node, name).path }, schema.propertyNames, root));
}

function checkItems(node, schema, root) {
  if (!Array.isArray(node.value)) return [];
  return node.value.flatMap((value, index) => check({ value, path: childOf(node, index).path }, schema.items, root));
}

function checkIf(node, schema, root) {
  const branch = check(node, schema.if, root).length ? schema.else : schema.then;
  return branch === undefined ? [] : check(node, branch, root);
}

function resolveRef(ref, root) {
  const name = ref.startsWith(LOCAL_REF_PREFIX) ? ref.slice(LOCAL_REF_PREFIX.length) : null;
  if (!name || !root.$defs || !hasOwn(root.$defs, name)) throw new Error(`The schema refers to "${ref}", which this checker cannot resolve`);
  return root.$defs[name];
}

// RFC 6901: "~" and "/" in a name are escaped, so every path points to exactly one place
function childOf(node, name) {
  const token = String(name).replace(/~/g, '~0').replace(/\//g, '~1');
  return { value: node.value[name], path: `${node.path}/${token}` };
}

const error = (node, message) => ({ path: node.path, message });
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (object, name) => Object.prototype.hasOwnProperty.call(object, name);
// The PCF schema only compares with strings, so comparing JSON texts is exact enough
const isEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

module.exports = { checkSchema };
