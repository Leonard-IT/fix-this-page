const ANNOTATION_TYPE = Object.freeze({ Comment: 'comment', Edit: 'edit', Clone: 'clone', Delete: 'delete' });
const ANNOTATION_STATUS = Object.freeze({ Done: 'done', LegacyDone: 'verwerkt' });
const TYPE_LABEL = Object.freeze({
  [ANNOTATION_TYPE.Comment]: 'Comment',
  [ANNOTATION_TYPE.Edit]: 'Edit',
  [ANNOTATION_TYPE.Clone]: 'Duplicate',
  [ANNOTATION_TYPE.Delete]: 'Delete',
});
const CHANGE_KIND = Object.freeze({ Text: 'text', Attr: 'attr' });

function isDone(annotation) {
  return annotation.status === ANNOTATION_STATUS.Done || annotation.status === ANNOTATION_STATUS.LegacyDone;
}

module.exports = { ANNOTATION_TYPE, TYPE_LABEL, CHANGE_KIND, isDone };
