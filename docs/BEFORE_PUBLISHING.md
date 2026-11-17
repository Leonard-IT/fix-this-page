# Before making it public

A checklist for the first public release of `fix-this-page`. Nothing here has been done yet. Delete this file once the first version is published.

Publishing is hard to undo: a published npm version can never be replaced, and the CDNs (jsDelivr, unpkg) cache files once they are requested. Work through the list in order.

## 1. Accounts and names

- [ ] Check that the package name `fix-this-page` is free on npm (`npm view fix-this-page` should answer 404), or that you own it.
- [ ] Have an npm account with two-factor authentication on.
- [ ] Decide whether the package belongs to your own account or to an npm organisation, and publish under that one.
- [ ] Check that the domain in `homepage` (`https://fixthis.page`) is yours and does something useful, or change the field.

## 2. Repository

- [ ] Read the whole repository once as a stranger would: README files, docs, examples, tests. Look for names, paths, emails or notes you do not want public. Check the git history too (`git log -p`), because making the repository public publishes every commit.
- [ ] Check that `SECURITY.md` gives a way to report a vulnerability privately that actually reaches you, and that the contact address is one you want public.
- [ ] Check the issue templates in `.github/ISSUE_TEMPLATE`.
- [ ] In GitHub, switch on private vulnerability reporting (Settings, Code security).
- [ ] Protect `main` (Settings, Branches): require the Test workflow to pass.
- [ ] Make the repository public.

## 3. npm access for the release workflow

- [ ] Create an npm access token that may publish `fix-this-page` (a granular token limited to this package is best).
- [ ] Add it to the GitHub repository as the secret `NPM_TOKEN` (Settings, Secrets and variables, Actions).

## 4. Prepare the first version

- [ ] Remove `"private": true` from `packages/fix-this-page/package.json`. This is the lock that stops `npm publish`.
- [ ] Put the release date in `CHANGELOG.md`: change `0.1.0 - Not yet published` to `0.1.0 - YYYY-MM-DD`.
- [ ] Check that the version in `packages/fix-this-page/package.json` and the pinned version in the CDN snippet in `README.md` agree (now `0.1.0`).
- [ ] Run `npm ci`, `npm test` and `npm run build`. All must pass.
- [ ] Run `npm pack --dry-run --workspace fix-this-page` and check the file list: the two `dist/*.js` files, their `.map` files, `src/core`, the licence and the README, nothing else.
- [ ] Try the built files once in a browser: serve `packages/fix-this-page` with `npx serve .` and open `/examples/demo.html?fix`.

## 5. Publish

- [ ] Commit the changes ("Release 0.1.0").
- [ ] Tag it: `git tag v0.1.0`. The tag must be `v` plus the package version, or the workflow stops.
- [ ] Push the commit and the tag: `git push origin main v0.1.0`.
- [ ] Watch the Release workflow in the Actions tab until it succeeds.

## 6. After publishing

- [ ] Open `https://www.npmjs.com/package/fix-this-page` and check the version, the README and the provenance badge.
- [ ] Open `https://cdn.jsdelivr.net/npm/fix-this-page@0.1.0/dist/fixthis.js` and `.../dist/fixthis-overlay.js`: both must load.
- [ ] Add the CDN script tag to a scratch page and open it with `?fix`.
- [ ] Install it in an empty folder (`npm install fix-this-page`) and import something from `fix-this-page/core/pcf`.
- [ ] Create a GitHub release from the tag, with the changelog entry as its text.
- [ ] Delete this file.

## If something goes wrong

- The workflow fails before publishing: fix the cause, delete the tag (`git push origin :refs/tags/v0.1.0` and `git tag -d v0.1.0`), and tag again.
- A version is published but wrong: you cannot replace it. Publish a fixed version (`0.1.1`) and run `npm deprecate fix-this-page@0.1.0 "reason"` on the bad one. Within 72 hours of publishing, `npm unpublish` is possible, but only when nobody depends on the package.
