// Edits made inside a duplicated block are not items of their own: a target always refers to the original page,
// so they are kept as changes of the duplicate item, with paths from the copy.
const { SELF_PATH, SELECTOR_SEPARATOR, selectorFor } = require('./selector.js');

/** The changes made to `el`, given with paths from `el`, as changes with paths from the copy `el` is in. */
function rebaseChanges(changes, el, copy) {
  if (el === copy) return changes;
  const base = selectorFor(el, copy);
  return changes.map((change) => ({ ...change, path: pathInside(base, change.path || SELF_PATH) }));
}

function pathInside(base, path) {
  return path === SELF_PATH ? base : base + SELECTOR_SEPARATOR + path;
}

/**
 * The changes of a copy after more changes were made to it. Changes are applied in order, so each one is added
 * after the others; only a change that carries on the one before it is joined to it, so editing the same text
 * again does not leave a trail of steps, and editing it back to what it was leaves no change at all.
 */
function mergeChanges(existing, added) {
  return added.reduce(addChange, [...(existing || [])]);
}

function addChange(changes, change) {
  const last = changes[changes.length - 1];
  if (!last || !carriesOn(last, change)) return [...changes, change];
  const joined = { ...last, to: change.to };
  const rest = changes.slice(0, -1);
  return joined.from === joined.to ? rest : [...rest, joined];
}

function carriesOn(earlier, later) {
  return earlier.kind === later.kind && earlier.path === later.path && earlier.name === later.name;
}

module.exports = { rebaseChanges, mergeChanges };
