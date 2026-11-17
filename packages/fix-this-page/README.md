# fix-this-page

Let people give feedback on your site by pointing at things and changing them directly: comment on an element, edit its text, change a link, duplicate or move a block, or mark it for deletion. You get the result as a prompt for your AI coding agent.

It runs on your own pages, in development and on the live site, and stays out of the way until someone adds `?fix` to the address. Nothing is sent anywhere: the feedback stays in the browser of whoever gives it.

This is the overlay of [fixthis.page](https://fixthis.page), which does the same for any public URL without installing anything.

## Add it to your site

You add one `<script>` tag to your pages. Pick the option that fits; they all end the same way.

The overlay is two files that belong together: `fixthis.js` (the small loader your pages include) and `fixthis-overlay.js` (the full overlay, which the loader fetches the first time it is switched on). The loader looks for the overlay **in the same folder as itself**, and it checks the overlay against a hash made in the same build. So always put both files in one folder, and always take both from the same version.

### Option A: from a CDN (least work)

```html
<script src="https://cdn.jsdelivr.net/npm/fix-this-page@0.1.0/dist/fixthis.js"
        integrity="sha384-…" crossorigin="anonymous"></script>
```

Use the full path to `dist/fixthis.js`, not the short `…/npm/fix-this-page@0.1.0` URL. Take the `integrity` value from the jsDelivr page of the version you use.

### Option B: copy the files from the npm package

```bash
npm install fix-this-page
```

Copy `node_modules/fix-this-page/dist/fixthis.js` and `node_modules/fix-this-page/dist/fixthis-overlay.js` into the folder your site serves as static files (see [Where the files go](#where-the-files-go)), then add the tag from [Add the tag](#add-the-tag).

### Option C: build it yourself from this repository

Use this to run a modified version, or when you do not want npm or a CDN. You need [Git](https://git-scm.com) and [Node.js](https://nodejs.org) 22 or newer.

1. Get the code and build it:

   ```bash
   git clone https://github.com/Leonard-IT/fix-this-page.git
   cd fix-this-page
   npm ci
   npm run build
   ```

   The build writes four files to `packages/fix-this-page/dist/`. You need the two that end in `.js`; the `.map` files are only for debugging.

2. Copy the two `.js` files into your project. Replace `/path/to/your-project/public` with the folder your site serves as static files (see below):

   ```bash
   # macOS, Linux, Git Bash
   cp packages/fix-this-page/dist/fixthis*.js /path/to/your-project/public/
   ```

   ```powershell
   # Windows PowerShell
   Copy-Item packages/fix-this-page/dist/fixthis*.js C:/path/to/your-project/public/
   ```

3. Add the tag (below). Commit the two copied files to **your** project, not to this repository: `dist/` is ignored here.

To update later, build the new version and replace **both** files.

### Where the files go

Put them in the folder your site serves as-is, so that `https://your-site.example/fixthis.js` opens the script in a browser:

| Your site is… | Folder |
| --- | --- |
| Plain HTML | Next to `index.html` |
| Vite, Next.js, Astro, SvelteKit, Laravel, Rails | `public/` (`static/` in SvelteKit) |
| Anything else | The folder your web server or host publishes; if `/fixthis.js` shows a 404 page, it is the wrong folder |

You may use a subfolder, such as `/tools/`, if the tag points there. Keep both files in it.

### Add the tag

Add it to every page where feedback should be possible, in the `<head>` or just before `</body>`:

```html
<script src="/fixthis.js"></script>
```

Use a plain script tag: no `type="module"`, and keep the file name `fixthis.js`. In a framework, put the tag in the shared layout or the root HTML template (`index.html`, `layout`, `_document`, …), and make sure it is not removed in production builds.

### Run your site locally with npx

Opening `index.html` by double-clicking it (a `file://` address) does not work: the browser blocks the loader from fetching the overlay. Serve the folder over HTTP instead. If you have Node.js, you already have `npx`, and this is the simplest way:

1. Open a terminal in the folder your site serves (the one that holds `index.html` and the two `.js` files).
2. Run:

   ```bash
   npx serve .
   ```

3. The first time you run it, npx asks `Need to install the following packages: serve. Ok to proceed? (y)`. Type `y` and press Enter. It downloads `serve` once, so you need an internet connection for that step; after that it starts quickly. Add `--yes` (`npx --yes serve .`) to skip the question.
4. Open the address it prints, usually `http://localhost:3000`, and add `?fix` to it (see below).

Stop the server with Ctrl+C. If port 3000 is taken, `serve` picks another and prints it.

### Check that it works

1. Open your page with `?fix` added to the address, for example `http://localhost:3000/?fix`.
2. A small panel (the dock) appears on the page. Click any element to comment on it or change it.

Nothing happens? Open the browser's developer tools and look at the Network and Console tabs:

| You see | Cause and fix |
| --- | --- |
| `fixthis.js` is a 404 | The file is not in the folder your site serves, or the `src` in the tag is wrong. |
| Console: `fixthis: could not load …/fixthis-overlay.js`, and in the Network tab that file is a 404 | It is not in the same folder as `fixthis.js`. Copy both files together. |
| The same console message, but the file loads (status 200) and the browser reports an `integrity` problem | The two files come from different builds, or a host changed the file. Replace both with files from one build. |
| A message about Content Security Policy | Allow both files in `script-src` (see below). |
| Nothing in either tab | The tag is not on this page, or a cached page was served; reload without cache. |

### What it costs your visitors

The loader is about 2.5 KB and only checks whether the overlay should open. The full overlay (about 43 KB) is loaded the first time it is switched on, so visitors who never use it do not download it. The loader checks the full overlay against the integrity hash it was built with, so always deploy the two files from the same version.

Under a Content Security Policy, `script-src` must allow both files. The overlay adds no inline scripts, and its styles use constructed stylesheets, so a strict `style-src` is fine.

## Give feedback

1. Open any page of the site with `?fix` added to the address, for example `https://example.com/pricing?fix`. The overlay then stays on in that browser tab, also on other pages, until it is closed with the close button in its dock.
2. Click anything on the page to comment on it, edit its text, change a link, duplicate it, move it or mark it for deletion. Clicks go to the overlay while it is on, so links and buttons of the site do nothing.
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

## Develop

See [CONTRIBUTING.md](../../CONTRIBUTING.md) in the repository root. Try your build with [examples/demo.html](examples/demo.html): serve this folder (for example `npx serve .`) and open `/examples/demo.html?fix`.

## License

MIT
Copy-Item packages/fix-this-page/dist/fixthis*.js C:/path/to/your-project/public/
   ```