# fix-this-page

Let people give feedback on your website by pointing at things and changing them directly: comment on an element, edit its text, change a link, duplicate a block or mark it for deletion. You get the result as a prompt for your AI coding agent.

It is one script you add to your own site. It stays out of the way until someone opens a page with `?fix` in the address, and nothing is sent anywhere: the feedback stays in the browser of whoever gives it, until they copy a link, copy the prompt or save a file.

```html
<script src="https://cdn.jsdelivr.net/npm/fix-this-page@0.1.0/dist/fixthis.js"></script>
```

See the [package README](packages/fix-this-page/README.md) for installation, how feedback is given and shared, the limits and the security notes.

## What is in this repository

| Folder | Contents |
| --- | --- |
| [packages/fix-this-page](packages/fix-this-page) | The overlay, published to npm as `fix-this-page`. `src/core` holds the annotation layer, the PCF writer and the prompt renderer |
| [spec](spec) | The Page Change Format (PCF): an open JSON format for requested changes to a web page. Text, JSON schema, validator, examples and a test suite |
| [docs](docs) | The coding guidelines used in this repository |

[fixthis.page](https://fixthis.page) is a hosted service that does the same for any public URL without installing anything. Its code is not part of this repository; it uses the same core and the same format.

## Develop

You need Node.js 22 or newer.

```bash
npm ci
npm test
npm run build
npm run validate -- spec/examples/text-change.pagechange.json
```

Contributions are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md). Please report vulnerabilities privately, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). The text of the Page Change Format specification is released under CC0 1.0.
