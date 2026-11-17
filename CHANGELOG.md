# Changelog

All notable changes to the `fix-this-page` package are listed here. The format follows [Keep a Changelog](https://keepachangelog.com), and versions follow [Semantic Versioning](https://semver.org). While the version is 0.x, a breaking change raises the minor version.

Changes to the Page Change Format in `spec/`, the `fix-this-page/core/*` exports and the share link format (`#fix=1…`) count as breaking when they stop working with what earlier versions wrote or exported.

## [Unreleased]

### Added

- Move: put a block before or after another block. Page Change Format 0.1 has a `move` item type; its `placement` names the block it goes next to (`before` or `after`, with a `target`). Older consumers skip such an item, as section 9.1 says.

## [0.1.0] - Not yet published

First version: the overlay (loader and full overlay), the annotation layer, the Page Change Format writer, the prompt renderer, and the Page Change Format specification.
