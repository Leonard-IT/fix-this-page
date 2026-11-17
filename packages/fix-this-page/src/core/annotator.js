// Annotation layer: lets someone point at elements of a page and record comments, text edits, link changes,
// duplicates and deletions. It only touches the document it is attached to. Storing, listing and sharing the
// items is up to the host: the snapshot editor today, the overlay on a live page later.
// The parts live in ./annotator/; this file is what the editor, the frames and the overlay load.
const { attach } = require('./annotator/attach.js');
const { ANNOTATION_TYPE, TYPE_LABEL, isDone } = require('./annotator/annotation-types.js');
const { applyAttributeChange, invertChanges, isSafeChange, textEdit, normalizedPositions } = require('./annotator/apply-changes.js');
const { snippet } = require('./annotator/describe-element.js');
const { addStyleSheet, keepEventsInside, annotationIcon } = require('./annotator/interface.js');
const { toolbarPosition, panelPosition } = require('./annotator/layout.js');
const { parseSelectorPart } = require('./annotator/selector.js');
const { diffTexts, linkChanges, previewableLinkChanges } = require('./annotator/text-diff.js');

module.exports = Object.freeze({
  attach, isDone, isSafeChange, applyAttributeChange, snippet, TYPE_LABEL, ANNOTATION_TYPE, annotationIcon, addStyleSheet, keepEventsInside,
  diffTexts, linkChanges, previewableLinkChanges, invertChanges, toolbarPosition, panelPosition, parseSelectorPart,
  textEdit, normalizedPositions,
});
