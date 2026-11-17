# fix-this-page

Let people give feedback on your site by pointing at things and changing them directly: comment on an element, edit its text, change a link, duplicate a block or mark it for deletion. You get the result as a prompt for your AI coding agent.

It runs on your own pages, in development and on the live site, and stays out of the way until someone adds `?fix` to the address. Nothing is sent anywhere: the feedback stays in the browser of whoever gives it.

This is the overlay of [fixthis.page](https://fixthis.page), which does the same for any public URL without installing anything.

## Add it to your site

Include the loader with a `<script>` tag. That is the only supported way for now; importing the package in a bundler does not work, because the loader finds the rest of the overlay next to its own `src`.

From jsDelivr, pinned to a version:

```html
<script src="https://cdn.jsdelivr.net/npm/fix-this-page@0.1.0/dist/fixthis.js"
        integrity="sha384-…" crossorigin="anonymous"></script>
```

Use the full path to `dist/fixthis.js`, not the short `…/npm/fix-this-page@0.1.0` URL: the loader looks for `fixthis-overlay.js` in the same folder as its own address. Take the `integrity` value from the jsDelivr page of the version you use.

Or host the files yourself: copy `dist/fixthis.js` and `dist/fixthis-overlay.js` from the package into the same folder on your site, and include the first:

```html
<script src="/fixthis.js"></script>
```

### What it costs your visitors

The loader is about 2.5 KB and only checks whether the overlay should open. The full overlay (about 43 KB) is loaded the first time it is switched on, so visitors who never use it do not download it. The loader checks the full overlay against the integrity hash it was built with, so always deploy the two files from the same version.

Under a Content Security Policy, `script-src` must allow both files. The overlay adds no inline scripts, and its styles use constructed stylesheets, so a strict `style-src` is fine.

## Give feedback

1. Open any page of the site with `?fix` added to the address, for example `https://example.com/pricing?fix`. The overlay then stays on in that browser tab, also on other pages, until it is closed with the close button in its dock.
2. Click anything on the page to comment on it, edit its text, change a link, duplicate it or mark it for deletion. Clicks go to the overlay while it is on, so links and buttons of the site do nothing.
3. Send the feedback to the developer: **Copy link** gives a link that carries the feedback, to paste into any chat or email. **Save as a file** gives a file the developer can open with **Open a file** in their own browser, also on a development site. **Copy for an AI tool** gives the prompt for an AI coding agent.

The exported file is a [Page Change Format](../../spec/page-change-format.md) (PCF) 0.1 document, named after the site and the time, such as `example.com-2026-11-13-1432.pagechange.json`: an open JSON format for requested changes to a web page, so other tools can read it. Import reads PCF documents and files from earlier versions of the overlay. Items are matched to pages by path, not by host. Items the overlay cannot show, such as an item type from a later PCF version, are skipped and counted.

Feedback is kept per page path in the `localStorage` of the browser that gives it, for that site only. It does not leave that browser unless the person copies a link or prompt, or saves a file.

### Share links

**Copy link** puts the feedback, as a compressed PCF document, in the fragment of the page's address: `https://example.com/pricing#fix=1…`. Browsers never send the fragment to a server, so the feedback travels only inside the message it is sent in. Opening the link opens the overlay, asks before showing anything, and merges the items into the ones already there: new items are added, an item that is done stays done, and a number that is taken gets the next free one. The link can go back and forth between client and developer. A typical round of feedback gives a link of 1,000 to 3,000 characters; above 8,000 the overlay warns that some apps cut links off. See https://fixthis.page/docs/share-links.

Optional switches for developers:

- `window.fixthis.open()`, `.close()` and `.toggle()` from the browser console or your own code.
- `data-launcher` on the script tag adds a ✎ button in the corner. Leave it off on production, as every visitor would see it.

## The prompt

The prompt holds the items of all pages, each with what to find (selector, HTML snippet, text, nearest heading) and what to change. The agent reports per item in its reply, as there is no server to report to. Selectors on development builds are only a hint; the agent is told to find elements by snippet, text and section.

## Limits

- Items are kept per path, so routes that only differ in the `#hash` share one page.
- If your framework re-renders the page, the overlay shows the items again after a moment. A duplicated block inserted into a framework-managed element can confuse that framework until the overlay is closed.
- Browsers: Chrome and Edge 100+, Firefox 101+, Safari 16.4+.

## Security

An imported feedback file or an opened share link is untrusted input. A link asks before it shows anything, and one that would unpack to more than 1 MB is refused. The overlay only applies text changes and changes to `href`, `src`, `alt` and `title`, and refuses links that start with `javascript:`, `vbscript:` or `data:`. Please report vulnerabilities privately, as described in `SECURITY.md` in the repository.

## Build from source

From the repository root, after `npm install`:

```bash
npm run build:overlay   # writes packages/fix-this-page/dist/
npm test
```

Try it with [examples/demo.html](examples/demo.html): serve this folder (for example `npx serve .`) and open `/examples/demo.html?fix`.

## License

MIT
