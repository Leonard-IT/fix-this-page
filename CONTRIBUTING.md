# Contributing

Thanks for helping out. Small fixes are just as welcome as features; you do not need to ask first for a typo or an obvious bug. For a larger change, open an issue first so we can agree on the approach before you spend time on it.

## Set up and run

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm ci
npm test
npm run build   # writes packages/fix-this-page/dist/
```

Try your change in a browser with [the demo page](packages/fix-this-page/examples/demo.html): build, serve `packages/fix-this-page` (for example `npx serve packages/fix-this-page`) and open `/examples/demo.html?fix`.

## Developing the annotator or the overlay

Edit `packages/fix-this-page/src/core/annotator/` (the annotation layer) or `packages/fix-this-page/src/` (the overlay), with tests next to the code in `packages/fix-this-page/test/`.

1. `npm test` after each change.
2. For the overlay in a browser: `npm run build`, serve `packages/fix-this-page` (see above) and open `/examples/demo.html?fix`. There is no watch mode, so rebuild after a change.

### Seeing your change in the hosted editor (maintainers)

The hosted site, [fixthis.page](https://fixthis.page), is a separate repository that has this package as a dependency and bundles `fix-this-page/core/annotator` from it. This repository is the only place the code lives; do not copy files across.

- Keep the two repositories side by side (`Projects/fix-this-page` and `Projects/fixthis.page`). The hosted repo's `package.json` has `"fix-this-page": "file:../fix-this-page/packages/fix-this-page"`, and `npm install` there links to your working copy.
- Run `npm ci` in this repository too, so the link resolves its own dependencies.
- In the hosted repo, `npm run local` re-bundles the annotator from your working copy before it starts, so an edit here shows up after a restart. `npm run local:overlay` builds the overlay here and serves it on the hosted site's own pages.
- To update the live site, run `npm run deploy` in the hosted repo. It bundles whatever is in this working copy, so commit (and, for a release, publish) here first.
- After the first npm release, change that dependency to the published version (`"fix-this-page": "^0.1.0"`). Then `npm update fix-this-page` followed by `npm run deploy` is a site update, and the site records which version it ships.

## How we write code

Follow [docs/CODING_GUIDELINES.md](docs/CODING_GUIDELINES.md) and the project profile in [AGENTS.md](AGENTS.md).

- Keep a change focused: no unrelated refactors next to a fix or feature.
- One thing per commit, with a short imperative subject in English (for example "Keep links when a text change spans markup").
- Add or update a test when you change behaviour. Run `npm test` before you open a pull request; CI runs it too.
- The overlay must stay free of network calls and of dependencies at run time.

## Changing the Page Change Format

`spec/` is the specification, a JSON schema, a validator and a test suite. A change to the format needs an issue first. Add a valid or invalid example to `spec/test-suite` for every rule you add.

## Releasing (maintainers)

The package is published to npm as `fix-this-page`. The workflow in `.github/workflows/release.yml` stages the package on npm when a version tag is pushed; it goes live once a maintainer approves it with 2FA. A published version can never be replaced, so work through the list in order and do not skip the checks.

### Where the version appears

A release touches every place below. Steps 3 to 5 and 7 of the list cover them.

| Place | What changes |
| --- | --- |
| `packages/fix-this-page/package.json` and `package-lock.json` | `version` (set by `npm version`) |
| `CHANGELOG.md` | new heading with the date; `[Unreleased]` stays, empty |
| `README.md` | CDN snippet: version in the URL and the `integrity` hash |
| `packages/fix-this-page/README.md` | CDN snippet (version and hash), the sentence about the short URL, and the `curl` example for other versions |

### Authentication

The workflow signs in with the repository secret `NPM_TOKEN`, a granular npm token that may stage this package. Once the trusted publisher is configured on npmjs.com (package settings; user `Leonard-IT`, repository `fix-this-page`, workflow `release.yml`), delete the token and its secret and remove the `NODE_AUTH_TOKEN` line from the workflow. Staging then needs no stored secret. Approving a staged package always asks for 2FA.

### Checklist for each release

Before tagging:

1. Be on `main`, up to date with `origin`, with a clean working tree, and make sure `main` is green in CI. You need Node.js 22 or newer.
2. Pick the version number ([Semantic Versioning](https://semver.org)). While the version is 0.x, a breaking change raises the minor version; what counts as breaking is written at the top of [CHANGELOG.md](CHANGELOG.md).
3. In [CHANGELOG.md](CHANGELOG.md), move the entries under `[Unreleased]` to a new heading `## [x.y.z] - YYYY-MM-DD` with today's date. Leave an empty `## [Unreleased]` above it.
4. Set the version: `npm version <patch|minor|major> --workspace fix-this-page --no-git-tag-version`. This updates `package.json` and the lock file.
5. Update the pinned version in the CDN snippet of [README.md](README.md) and in three places in [packages/fix-this-page/README.md](packages/fix-this-page/README.md): the snippet, the sentence after it that names the short URL, and the `curl` example. Check with `grep -rn "fix-this-page@" README.md packages/fix-this-page/README.md`: no old version may be left.
6. Run `npm ci`, `npm test` and `npm run build`. All three must pass.
7. Update the `integrity` hash in both CDN snippets. Every version has a new hash, and a stale one makes browsers refuse the script. Get it from the file you just built and put `sha384-` in front:

   ```bash
   openssl dgst -sha384 -binary packages/fix-this-page/dist/fixthis.js | openssl base64 -A
   ```

   The build is reproducible, so this equals the hash of the file that gets published. Step 12 checks that.
8. Check what goes in the package: `npm pack --dry-run --workspace fix-this-page`. Expect the two `dist/*.js` files, their `.map` files, `src/core`, the licence and the README, nothing else. Then, in `packages/fix-this-page`, run `npx serve .` and open `/examples/demo.html?fix`: the overlay must start.
9. Commit with the message `Release x.y.z`.
10. Tag it and push both: `git tag vx.y.z`, then `git push origin main vx.y.z`. The tag must equal `v` plus the package version, or the workflow stops. Watch the Release workflow in the Actions tab until it succeeds.
11. Open the staged package (the Staged Packages tab on npmjs.com, or `npm stage list fix-this-page`), check its contents and approve it with 2FA (`npm stage approve <stage-id>`). Only now does it go live.

After publishing:

12. Check the result:
    - The npm page `https://www.npmjs.com/package/fix-this-page` shows the new version, the README and the provenance badge.
    - `https://cdn.jsdelivr.net/npm/fix-this-page@x.y.z/dist/fixthis.js` and `.../dist/fixthis-overlay.js` both load.
    - The hash of the CDN file equals the one in the READMEs: `curl -sL https://cdn.jsdelivr.net/npm/fix-this-page@x.y.z/dist/fixthis.js | openssl dgst -sha384 -binary | openssl base64 -A`.
    - In an empty folder, `npm install fix-this-page` works and `fix-this-page/core/pcf` imports.
13. Create a GitHub release from the tag, with the changelog entry as its text.
14. Update the hosted site: see "Seeing your change in the hosted editor" above (`npm update fix-this-page`, then `npm run deploy` in the `fixthis.page` repository).

### If something goes wrong

- **The workflow fails before staging:** fix the cause, delete the tag (`git push origin :refs/tags/vx.y.z` and `git tag -d vx.y.z`), and tag again.
- **A staged package is wrong:** reject it in the Staged Packages tab, delete the tag as above, fix it and tag again.
- **A published version is wrong:** you cannot replace it. Publish a fixed version (a patch) and run `npm deprecate fix-this-page@x.y.z "reason"` on the bad one. Within 72 hours, `npm unpublish` is possible, but only when nobody depends on the package.

## Licence

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE) of this repository.

## Security issues

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md) for how to report it privately.
