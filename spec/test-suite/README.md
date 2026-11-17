# PCF 0.1 test suite

Test cases for anything that reads or checks Page Change Format 0.1 documents. Each file is one case:

```json
{
  "description": "Item ids are unique within the document",
  "invalidAt": "/items/1/id",
  "document": { "format": "page-change-format", "version": "0.1", "items": [] }
}
```

- `valid/`: documents that follow the specification. A validator reports no errors for them.
- `invalid/`: documents that break the specification in exactly one place. `invalidAt` is a [JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901) to that place: the field that is wrong, the field that is missing, or the item or change a rule is about. A validator rejects the document; one that reports locations reports this one.

The examples in `../examples/` are valid documents as well. `../validator/validate.test.js` runs the reference validator against all of them.
