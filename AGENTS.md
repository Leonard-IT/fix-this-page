# Agent instructions

Follow [docs/CODING_GUIDELINES.md](docs/CODING_GUIDELINES.md); the project profile below fills in what the guidelines leave to the codebase.

# Project profile

## Stack and commands
- Plain JavaScript (CommonJS), no framework, bundled for the browser with esbuild. Node.js 22 or newer to develop.
- Install:  `npm ci`
- Test:     `npm test` (Node's built-in test runner; no browser needed)
- Build:    `npm run build` (writes `packages/fix-this-page/dist/`)
- No formatter or linter is configured; match the code around your change.

## Language
- Identifiers, comments, commits and docs: English.
- Text shown to users: English.

## Conventions these guidelines leave to the codebase
- Enums and constants: frozen object, `UPPER_SNAKE_CASE`, members in `PascalCase`; constants sit under the imports.
- Layout: `packages/fix-this-page/src` is the overlay (loader, dock, store, share links); `src/core` holds the annotation layer, the
  PCF writer and the prompt renderer, which other tools also import as `fix-this-page/core/*`. `spec/` is the Page Change Format.
- The overlay makes no network calls and loads nothing from other hosts; a test fails the build if the bundle contains any.

## Known directions
- Page Change Format minor versions may add item and change types (insert, move, style). Unknown types are skipped, never an error.

## Expensive to change
- The Page Change Format (`spec/`) and what `src/core/pcf.js` writes: other tools read these files.
- The `fix-this-page/core/*` exports: other repositories import them.
- The share link format (`#fix=1…`) and the `localStorage` key: links and stored feedback outlive a release.
- The two files in `dist/` must be deployed together: the loader pins the overlay by hash.
