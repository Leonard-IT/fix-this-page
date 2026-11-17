// Comparing the texts of an element before and after an edit, and turning that into Page Change Format changes.
const { CHANGE_KIND } = require('./annotation-types.js');
const { SELF_PATH, SELECTOR_SEPARATOR, selectorFor } = require('./selector.js');
const { SKIPPED_TAGS, directText, norm } = require('./dom.js');

/** For the root and every element inside it: its path from the root, its whole text and its own text. */
function elementTexts(root) {
  const texts = [];
  const walk = (el) => {
    texts.push({ path: selectorFor(el, root), text: norm(el.textContent), own: directText(el) });
    for (const child of el.children) if (!SKIPPED_TAGS.has(child.tagName)) walk(child);
  };
  walk(root);
  return texts;
}

/**
 * The text changes between two `elementTexts` results, as Page Change Format describes them: `from` and `to` are
 * an element's whole text, on the deepest element that holds the whole change. An element whose own text or set of
 * children changed holds its change; otherwise the change is looked for in its children.
 */
function diffTexts(before, after) {
  const beforeByPath = new Map(before.map((entry) => [entry.path, entry]));
  const afterByPath = new Map(after.map((entry) => [entry.path, entry]));
  const changes = [];
  const visit = (path) => {
    const old = beforeByPath.get(path);
    const now = afterByPath.get(path);
    if (old.text === now.text) return;
    const childPaths = childPathsOf(before, path);
    const holdsChange = old.own !== now.own || !samePaths(childPaths, childPathsOf(after, path));
    if (holdsChange) changes.push(textChange(path, old.text, now.text));
    else childPaths.forEach(visit);
  };
  if (beforeByPath.has(SELF_PATH) && afterByPath.has(SELF_PATH)) visit(SELF_PATH);
  return changes;
}

function childPathsOf(texts, path) {
  return texts.map((entry) => entry.path).filter((candidate) => parentPathOf(candidate) === path);
}

function parentPathOf(path) {
  if (path === SELF_PATH) return null;
  const cut = path.lastIndexOf(SELECTOR_SEPARATOR);
  return cut < 0 ? SELF_PATH : path.slice(0, cut);
}

function samePaths(a, b) {
  return a.length === b.length && a.every((path, i) => path === b[i]);
}

// The link panel changes a link's text as a whole; its pieces of text decide where that change goes
function leafTexts(root) {
  const leaves = [];
  const walk = (el) => {
    const text = directText(el);
    if (text) leaves.push({ path: selectorFor(el, root), text });
    for (const child of el.children) if (!SKIPPED_TAGS.has(child.tagName)) walk(child);
  };
  walk(root);
  return leaves;
}

function textChange(path, from, to) {
  return { kind: CHANGE_KIND.Text, path, from, to };
}

/** The changes to a link, given its original state and the values from the link panel. */
function linkChanges(original, edited) {
  const changes = [];
  if (edited.href !== original.href) {
    changes.push({ kind: CHANGE_KIND.Attr, path: SELF_PATH, name: 'href', from: original.href, to: edited.href });
  }
  if (edited.text !== original.text) changes.push(linkTextChange(original, edited.text));
  return changes;
}

// A link with one piece of text gets the change on that text; otherwise the whole link text is meant
function linkTextChange(original, text) {
  if (original.leaves.length === 1) return textChange(original.leaves[0].path, original.leaves[0].text, text);
  return textChange(SELF_PATH, original.text, text);
}

// Replacing the text of a link with nested elements would flatten them, so only a single text is previewed
function previewableLinkChanges(original, changes) {
  if (original.leaves.length === 1) return changes;
  return changes.filter((change) => change.kind === CHANGE_KIND.Attr);
}

module.exports = { elementTexts, diffTexts, leafTexts, linkChanges, previewableLinkChanges };
