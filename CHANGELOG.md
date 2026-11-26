# Changelog

All notable changes to the `fix-this-page` package are listed here. The format follows [Keep a Changelog](https://keepachangelog.com), and versions follow [Semantic Versioning](https://semver.org). While the version is 0.x, a breaking change raises the minor version.

Changes to the Page Change Format in `spec/`, the `fix-this-page/core/*` exports and the share link format (`#fix=1…`) count as breaking when they stop working with what earlier versions wrote or exported.

## [Unreleased]

## [0.1.1] - 2026-11-26

### Changed

- The README on npm shows the CDN snippet with `defer`, so the page can render while the loader downloads, and with the real `integrity` hash of the version, with a command to compute it for another version. The code in `dist` is the same as in 0.1.0.

## [0.1.0] - 2026-11-25

First version: the overlay (loader and full overlay), the annotation layer, the Page Change Format writer, the prompt renderer, and the Page Change Format specification.

### Added

- Move: put a block before or after another block. Page Change Format 0.1 has a `move` item type; its `placement` names the block it goes next to (`before` or `after`, with a `target`). Older consumers skip such an item, as section 9.1 says.
- Move by dragging: press the Move button and drag; the block goes where it is let go, next to the block under the pointer. A plain click on Move still starts the two-step choice.
- Swap: trade places with a block that looks the same (same tag and classes), such as another card or button. It is saved as one or two `move` items, so the Page Change Format does not change. A block alone in its wrapper takes the wrapper along, so cards in their own grid column swap columns.
