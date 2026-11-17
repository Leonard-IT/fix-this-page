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

The package is published to npm as `fix-this-page`. The workflow in `.github/workflows/release.yml` publishes when a version tag is pushed.

One-time setup before the first release:

- Remove `"private": true` from `packages/fix-this-page/package.json`. Until then `npm publish` refuses, on purpose.
- Add an npm access token that may publish this package as the repository secret `NPM_TOKEN`.

For each release:

1. Make sure `main` is green in CI.
2. Move the entries under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md) to a new version heading with today's date.
3. Set the version: `npm version <patch|minor|major> --workspace fix-this-page --no-git-tag-version`. Update the pinned version in the CDN snippet in [README.md](README.md) to match.
4. Check what goes in the package: `npm pack --dry-run --workspace fix-this-page`. Expect the two `dist/*.js` files, their `.map` files, `src/core` and the licence.
5. Commit ("Release 0.2.0"), tag it (`git tag v0.2.0`) and push both (`git push origin main v0.2.0`). The tag must equal `v` plus the package version, or the workflow stops.
6. After the workflow succeeds, open `https://cdn.jsdelivr.net/npm/fix-this-page@0.2.0/dist/fixthis.js` and create a GitHub release from the tag.

A published version cannot be replaced. If it is wrong, publish a fixed version and run `npm deprecate` on the bad one.

## Licence

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE) of this repository.

## Security issues

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md) for how to report it privately.
