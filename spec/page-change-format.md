# Page Change Format (PCF) 0.1

**Status:** draft, not published.

**License:** the text of this specification is released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The JSON schema, validator and other code around it are MIT-licensed.

Page Change Format is a JSON format for requested changes to a web page: what someone wants changed, on which element of which page, and what has happened to the request since. The format does not depend on any AI provider or feedback tool. A client can produce a PCF document in one tool, and a developer or an AI coding agent can process it with any other tool.

fixthis.page is the reference implementation.

## 1. Conventions

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, RECOMMENDED, MAY and OPTIONAL are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they appear in all capitals.

A PCF document is a JSON text ([RFC 8259](https://www.rfc-editor.org/rfc/rfc8259)) encoded as UTF-8. Timestamps are [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) strings in UTC that end in `Z`, for example `2026-11-10T09:12:00Z`. Field names are English. Values written by people (comments, new text) can be in any language.

**Text.** Wherever this specification speaks of the text of an element, it means the element's text content including that of its descendants, with every run of white space replaced by one space and leading and trailing white space removed. Producers MUST write text in this form. Consumers that compare text with the source MUST first bring the source into the same form: decode character references, ignore tags between words, and normalize white space.

## 2. Roles

- A **producer** writes PCF documents: a feedback tool, a browser overlay, an export.
- A **consumer** reads PCF documents and acts on them: an AI coding agent, a developer tool, a converter, a validator.
- A tool that reads a document, changes item statuses and writes it back is both.

## 3. Scope

PCF 0.1 covers only what is needed to get a change request from a person looking at a page to whoever changes the page's source:

- four item types: edit, duplicate, move and delete;
- text changes and attribute changes inside an element;
- the status of each item, and an optional report of what was done.

Out of scope for 0.1: screenshots, screen areas, style changes (CSS properties), inserting new elements, threads and replies, and access control. Producers can carry such data in extensions (section 9). Later minor versions can add item types, change types and placements without breaking 0.1 consumers (section 9.1).

## 4. Document

```json
{
  "format": "page-change-format",
  "version": "0.1",
  "id": "Vq3kP0",
  "generator": { "name": "fixthis.page", "version": "2026.11" },
  "items": [ ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `$schema` | MAY | The URL of a JSON schema for the document, for editors and validators. |
| `format` | MUST | The string `page-change-format`. |
| `version` | MUST | The version of this specification the document follows, as `major.minor`. This document defines `0.1`. |
| `id` | MAY | An identifier for the document, unique for the producer. A tool that writes statuses back uses it to find the original. |
| `created` | MAY | When the document, or the feedback round it holds, was created. |
| `generator` | MAY | The producer: `name`, and optionally `version` and `url`. |
| `items` | MUST | An array of items (section 5). It MAY be empty. |
| `extensions` | MAY | Producer-specific data (section 9). |

A consumer MUST reject a document whose `format` is not `page-change-format`. A consumer MUST reject a document with a major version it does not support, and SHOULD process a document with a higher minor version as far as it understands it (section 9.1). This also holds for `0.x`: unlike the usual semantic versioning convention, a minor version of PCF never breaks a consumer of an earlier minor version.

## 5. Item

An item is one requested change to one element, or to a page as a whole.

```json
{
  "id": "k3Fq",
  "number": 3,
  "type": "edit",
  "target": {
    "url": "https://example.com/pricing",
    "selector": [
      { "type": "CssSelector", "value": "main > section:nth-of-type(2) > h2" }
    ],
    "html": "<h2 class=\"title\">Our prices for children</h2>",
    "text": "Our prices for children",
    "heading": "Pricing"
  },
  "changes": [
    { "type": "text", "path": ".", "from": "Our prices for children", "to": "Our prices for people" }
  ],
  "comment": "Children is the wrong word here.",
  "author": { "name": "Anna" },
  "created": "2026-11-10T09:12:00Z",
  "status": "open"
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | MUST | A string of 1 to 64 characters from `A–Z`, `a–z`, `0–9`, `_` and `-`, unique within the document. Reports refer to items by `id`. |
| `number` | MAY | A positive integer people can use to refer to the item ("item 3"). Unique within the document when present, and the same in every export of the same item. |
| `type` | MUST | `edit`, `duplicate`, `move` or `delete` (section 5.1). |
| `target` | MUST | The element or page the item is about (section 5.2). |
| `changes` | MAY | Changes to the element (section 5.3). |
| `placement` | MAY | Where a copy goes (`duplicate`) or where the element goes (`move`); MUST be present for `move` (section 5.4). |
| `comment` | MAY | Free text from the person who made the item. |
| `author` | MAY | Who made the item: an object with `name`. It MAY be left out; anonymous items are allowed. |
| `created` | SHOULD | When the item was made. |
| `status` | MUST | `open` or `done` (section 6). |
| `extensions` | MAY | Producer-specific data (section 9). |

### 5.1 Types

| Type | Meaning | Rules |
| --- | --- | --- |
| `edit` | Change the element: concrete changes to its text or attributes, a request in words, or both. | `changes` MUST contain at least one change, or `comment` MUST be present and non-empty. |
| `duplicate` | Duplicate the element and place the copy next to it. | `changes`, when present, apply to the copy only. Without changes, the copy has the same content as the original. |
| `move` | Move the element to another place in the page. | `placement` MUST say where, and `changes` MUST be empty. |
| `delete` | Remove the element. | `changes` MUST be empty. |

An `edit` with only a `comment` is a request in words: the person describes what should change, and the consumer works out how. A link is not a separate type: changing a link is an `edit` with an attribute change on `href`, usually together with a text change.

### 5.2 Target

The target describes one element on one page, in several ways at once, because the page can change between the moment the item is made and the moment it is processed.

| Field | Required | Meaning |
| --- | --- | --- |
| `url` | MUST | The absolute URL of the page the element was on. |
| `selector` | SHOULD | An array of selectors (below). |
| `html` | SHOULD | The element's outer HTML as it was rendered in the browser (after scripts ran), not as it is in the source. Producers MAY shorten it and MAY normalize its white space. Shortening SHOULD keep what a source search can use, the tags and attributes nearest the element, and drop what it cannot, such as deeper descendants and `svg` content, replacing each with `…`. |
| `text` | SHOULD | The element's text (section 1). Producers MAY shorten it to its start. |
| `heading` | MAY | The text of the nearest heading above the element, to tell similar elements apart. |
| `viewport` | MAY | The size of the browser window: `{ "width": 1280, "height": 800 }` in CSS pixels. |
| `extensions` | MAY | Producer-specific data (section 9). |

A target without `selector`, `html`, `text` and `heading` (or with only empty values for them) means the page as a whole. Such an item MUST be an `edit` with a non-empty `comment`.

The URL can point to a development or staging host rather than the live site. Consumers SHOULD map it to the source by its path, and keep the query and fragment as given, because single-page applications can use them for routes.

Each selector is an object with a `type`. PCF 0.1 defines one type, taken from the [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/#selectors) with the same meaning:

- `CssSelector`: `value` is a CSS selector that matched the element in the page as it was.

All selectors in the array describe the same element; they are alternatives, not steps. Consumers MUST ignore selector types they do not know. Later versions can add selector types, for example the source file and line that a development build exposes for an element.

**Finding the element.** Selectors are hints, not addresses. Class names on development builds are often generated, and duplicated blocks make positional selectors ambiguous. A consumer that maps a target to source code SHOULD use `html`, `text` and `heading` as search anchors, and use the `CssSelector` only to confirm or to choose between candidates. When the anchors do not lead to exactly one element, the consumer SHOULD skip the item and say so, rather than guess.

**Where the source is.** The source of a page is wherever its content comes from: templates and components, but also data files, translation files or a content management system. Text found in a component that is used on several pages changes all of them. A consumer SHOULD report both situations rather than decide silently.

### 5.3 Changes

Each change is an object with a `type`.

**Text change**

```json
{ "type": "text", "path": "h3", "from": "Old title", "to": "New title" }
```

**Attribute change**

```json
{ "type": "attribute", "path": ".", "name": "href", "from": "/old", "to": "/new" }
```

| Field | Required | Meaning |
| --- | --- | --- |
| `type` | MUST | `text` or `attribute`. |
| `path` | SHOULD | Which part of the target the change applies to: `.` for the element itself, or a chain of child selectors from the element, such as `div:nth-of-type(2) > p`. Missing means `.`. |
| `name` | MUST for `attribute` | The attribute name as written in HTML: lowercase, except on SVG and MathML elements, which keep their case (`viewBox`). |
| `from` | MUST | For `text`: the text before the change (section 1), or an empty string when there was none. For `attribute`: the value before the change, or `null` when the attribute was absent. |
| `to` | MUST | For `text`: the requested text, or an empty string to remove the text. For `attribute`: the requested value, or `null` to remove the attribute. |
| `extensions` | MAY | Producer-specific data (section 9). |

**Path.** A consumer resolves `path` as `element.querySelector(":scope > " + path)` and uses the first match. Positions such as `:nth-of-type` count elements of the original page only, not copies made by duplicate items. A producer SHOULD choose the deepest element that holds the whole change.

The action follows from `from` and `to`, so it is not stored:

| Change | `from` | `to` | Action |
| --- | --- | --- | --- |
| text | non-empty | non-empty | replace `from` with `to` |
| text | empty | non-empty | the element at `path` had no text; give it `to` |
| text | non-empty | empty | remove the text; the element stays |
| attribute | any | string | set the attribute to `to`; an empty string is a valid value (`alt=""`) |
| attribute | string | `null` | remove the attribute |

A producer MUST NOT write a change that has no requested value yet. An empty attribute value is a request, not a gap.

Before replacing or removing text, a consumer MUST check that `from` is still present in the source, compared as described in section 1, and SHOULD skip and report the change if it is not. When the text spans inline markup, such as a link or bold text inside a paragraph, the consumer SHOULD keep the markup and change only the words that differ; when it cannot tell where the change belongs, it SHOULD skip and report.

When a text change touches a phone number, email address or URL, a consumer SHOULD check related attribute values (such as a `tel:` or `mailto:` link on the same element or its parent) and report a mismatch rather than change them silently.

**Attributes.** Any attribute name is allowed in a document. Consumers MUST NOT apply event handler attributes (names starting with `on`), MUST NOT apply `javascript:` or `data:` URLs to `href` or `src`, and SHOULD ask a person before applying any attribute other than `href`, `src`, `alt` and `title`. Producers MAY limit which attributes people can change.

### 5.4 Placement (duplicate and move)

For a `duplicate`:

```json
{ "position": "after", "order": 2 }
```

- `position`: `after`, the only value for a duplicate. The copy goes directly after the original element, as a sibling.
- `order`: a positive integer, default `1`. When one element is duplicated several times, the copy with `order` *n* goes after the copy with `order` *n − 1*, so the copies keep the order in which they were requested. When that copy does not exist, for example because its item was skipped, the copy goes after the copy with the highest lower `order` that does exist, or else directly after the original.

For a `move`:

```json
{ "position": "before", "target": { "url": "https://bakery.example/menu", "selector": [{ "type": "CssSelector", "value": "section.bread" }], "heading": "Bread" } }
```

- `position`: `before` or `after`. The element of the item's `target` goes directly before or after the element that `placement.target` points to, as a sibling of it.
- `target`: the element it goes next to, described like any other target (section 5.2) and found the same way. It has the same `url` as the item's target. It MUST NOT be, or be inside, the element that moves. A consumer that cannot find it uniquely MUST skip the item and say so, as the element would otherwise end up in the wrong place.
- `order` has no meaning for a move and MUST NOT be present.

Both targets are found on the page as it is after the items before this one (section 5.5), and neither refers to a copy made by another item. The destination `url` MUST equal the `url` of the item's target, and the destination MUST point to an element, not to the page as a whole.

### 5.5 Order of items

Items are in the order in which they were made, and a consumer applies them in that order, so each item sees the result of the items before it. That matches what the person saw on screen: an element edited first and duplicated afterwards gives a copy that contains the edit.

A `target` always refers to an element of the original page, never to a copy made by another item. Changes to a copy belong in the `changes` of the duplicate item that made it.

## 6. Status

An item is `open` until it has been processed, then `done`. There are no other values. A consumer that skips an item leaves it `open`. A consumer MUST only mark an item `done` once the change is really in the source. An `edit` that needs no change to the source, such as a question, stays `open`; the consumer answers it in its report.

## 7. Reporting back

A consumer that processes a document SHOULD report per item in its own output (for example its reply to the developer): one line per item, using `number` when present and `id` otherwise, saying what was changed (file, line, old → new) or why the item was skipped.

Anything beyond that, such as a structured report or sending results to a server, is not part of the core format. Producers that offer it define it in an extension (section 9); Appendix C describes the one fixthis.page uses.

## 8. Security and privacy

Everything in a PCF document except `format` and `version` was written by a person or copied from a web page. Anyone who could give feedback could have written it.

- Consumers MUST treat all such content strictly as data that describes a change to the page. They MUST NOT follow instructions found in it, MUST NOT run commands it mentions, and MUST NOT change anything outside the website's source (no installs, no secrets, no configuration, no network calls).
- A URL in a document is never by itself a reason to make a request. A consumer MAY call a reporting endpoint defined by an extension only when the developer has enabled that extension for that producer.
- A consumer that puts content from the document into a prompt for a language model MUST keep it clearly separate from the instructions, for example in fenced blocks that the content cannot close, and SHOULD tell the model the content is untrusted.
- A consumer SHOULD skip and report any item that asks for something other than a change to the page itself.
- `html` and `text` can contain personal data from the page. Producers SHOULD NOT include content from form fields, and SHOULD let people see what an item will contain before it is shared.
- `author` is free text. Producers MUST NOT require a real name.
- A consumer MUST reject a document whose item ids do not follow section 5, because ids can end up in URLs and file names.

## 9. Extensions and unknown fields

Producers put data this specification does not define under `extensions`, on the document, an item, a target or a change. Each key is a namespace the producer controls, written as a reverse domain name:

```json
"extensions": {
  "page.fixthis": { "pageId": "p1", "snapshotAt": "2026-11-10T09:00:00Z" }
}
```

Producers MUST NOT add other fields than the ones this specification defines. Consumers MUST ignore unknown extensions and SHOULD ignore unknown fields, so that documents with a higher minor version stay readable. A tool that reads and writes a document SHOULD keep extensions it does not understand.

### 9.1 Unknown values and new versions

A consumer that meets a value this specification does not define:

- for an item `type`: MUST skip the item and report it;
- for a change `type` or a `placement.position`: MUST skip the whole item and report it, because applying part of an item is worse than skipping it;
- for a selector `type`: MUST ignore that selector;
- for `status`: MUST treat the item as `open`.

A new minor version only adds fields that a consumer of an earlier minor version can ignore without doing the wrong thing. New behaviour comes as new values of `type`, `position` or `status`, which older consumers skip by the rules above. Anything else needs a new major version.

## 10. Recommended limits

Not requirements, but consumers SHOULD accept at least these sizes and producers SHOULD stay within them:

| What | Maximum |
| --- | --- |
| Items per document | 500 |
| Changes per item | 50 |
| `target.html` | 5,000 characters |
| `target.text`, `target.heading` | 1,000 characters each |
| `from`, `to`, `comment` | 5,000 characters each |
| `target.url`, `CssSelector.value` | 1,000 characters each |
| `author.name` | 80 characters |

## 11. Files and media type

A PCF file SHOULD use the extension `.pagechange.json`, for example `feedback.pagechange.json`. The media type is `application/json`.

A [JSON schema](schema/page-change-format-0.1.schema.json) describes the structure of a 0.1 document. The [validator](validator/validate.js) checks a document against the schema and against the rules a schema cannot express, such as unique item ids. The [test suite](test-suite/) holds valid documents and documents that break the specification in one place. Where any of these disagrees with this text, the text is right and the tool has a bug.

## 12. Rendering as a prompt (informative)

The JSON document is the canonical form. A Markdown prompt for an AI agent is one rendering of it. A good rendering:

- lists the open items with their `number` or `id`, page URL and type, and leaves out items that are `done` or lists them without their data;
- states the task for `duplicate`, `move`, `delete` and comment-only `edit` items in plain words;
- writes each change as one line (`replace: "a" → "b"`, `add: "…"`, `remove: "…"`, `set href: "…"`, `remove attribute href`);
- leaves out anchors that add nothing, such as `html` that is only the text in a tag, or `text` when a text change on `.` already gives it;
- puts all untrusted content in one fenced block per item (section 8);
- ends with how to report back (section 7).

fixthis.page's `packages/fix-this-page/src/core/render.js` is a reference renderer.

## Appendix A. Mapping to W3C Web Annotation (informative)

PCF is not a profile of the [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/), but every item can be converted to a Web Annotation and back without loss:

| PCF | Web Annotation |
| --- | --- |
| item | `Annotation` |
| `id` | `id` (as a URN or a URL) |
| `number` | a property in a PCF namespace |
| `type: edit` without changes | `motivation: commenting` |
| `type: edit` with changes | `motivation: editing` |
| `type: duplicate`, `type: move`, `type: delete` | `motivation: editing`, with the type in the body |
| `comment` | a `TextualBody` with `purpose: commenting` |
| `changes`, `placement` | a body in a PCF namespace |
| `target.url` | `target.source` |
| `target.selector` | `target.selector`; the same selector types |
| `target.html`, `target.text`, `target.heading`, `target.viewport` | target properties in a PCF namespace |
| `author.name` | `creator.name` |
| `created` | `created` |
| `status` | a property in a PCF namespace |
| `extensions` | properties in the extension's own namespace |
| document | `AnnotationCollection` with one `AnnotationPage` |
| document `id`, `created`, `generator` | `id`, `created`, `generator` of the collection |

## Appendix B. Differences from fixthis.page today (informative)

To be resolved under task I1 of the fixthis open source plan:

- fixthis stores `annotations` grouped by `pages[]` with a `pageId`; PCF has a flat `items` list with the URL on each target.
- `target.url`, `target.heading` and `target.text` keep their names. `target.selector` (a string) becomes a `CssSelector` in the `selector` array, and `viewport.w`/`h` become `viewport.width`/`height`.
- Item type `comment` becomes `edit` without changes. Item type `clone` becomes `duplicate`. Change `kind` becomes `type`, and `kind: "attr"` becomes `type: "attribute"`; `placement.relative_to` is dropped.
- Text in `from` and `to` is the element's whole text (section 1). fixthis records it that way since 2026-11-11; items saved before then hold only the element's own text nodes. An attribute that was absent gets `from: null`; a change without a value is not exported.
- `summary`, `clientTitle`, `clientSummary` and `doneAt` move into the `page.fixthis` extension (Appendix C).
- The legacy status `verwerkt` becomes `done`.
- Internal fields (`nextNumber`, `snapCount`) are not exported. The document has no `site`.
- `author` becomes an object; an empty author is left out.

## Appendix C. The fixthis.page extension (informative)

fixthis.page reports results back to its server. That is specific to fixthis, so it lives in the `page.fixthis` extension rather than in the core.

On the document, the endpoint for reports:

```json
"extensions": {
  "page.fixthis": {
    "callback": { "method": "PATCH", "url": "https://fixthis.page/api/sessions/Vq3kP0/annotations/{id}" }
  }
}
```

On an item, the report:

```json
"extensions": {
  "page.fixthis": {
    "report": {
      "summary": "index.html l.42: children → people",
      "clientTitle": "The headline now says people",
      "clientSummary": "The word children is replaced by people in the main headline on the home page.",
      "at": "2026-11-10T10:03:00Z"
    }
  }
}
```

The request body is `status` plus the fields of `report`. `{id}` in the URL is replaced with the item's `id`, which section 5 limits to characters that are safe in a URL. If the URL contains a credential, the document is a secret.
