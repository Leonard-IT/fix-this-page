// Builds the two overlay files into dist/: fixthis.js, the small loader a site includes, and fixthis-overlay.js,
// the full overlay the loader adds to the page once it is switched on.
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const { OVERLAY_FILE } = require('../src/handoff.js');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const LOADER_ENTRY = path.join(ROOT, 'src', 'index.js');
const OVERLAY_ENTRY = path.join(ROOT, 'src', 'bundle.js');
const SRC = path.join(ROOT, 'src');
const LOADER_FILE = 'fixthis.js';
const WATCH_FLAG = '--watch';
// An editor saves a file in several writes; one rebuild after they settle is enough
const REBUILD_DELAY_MS = 100;
const MAP_EXTENSION = '.map';
const INTEGRITY_ALGORITHM = 'sha384';
// Browsers that support constructable stylesheets, AbortSignal on listeners and CSS.escape
const TARGETS = Object.freeze(['chrome100', 'firefox101', 'safari16.4']);

/**
 * Builds both files and their source maps; with `write: false` it answers the code instead of writing it.
 * @returns {Promise<{ loader: string, overlay: string, files: string[] }>}
 */
async function buildOverlay({ write }) {
  const overlay = await bundle(OVERLAY_ENTRY, OVERLAY_FILE, {});
  // The loader pins the overlay as it is served, so the hash covers the file with its source map comment
  const loader = await bundle(LOADER_ENTRY, LOADER_FILE, { FIXTHIS_OVERLAY_INTEGRITY: JSON.stringify(integrityOf(overlay.code)) });
  const files = write ? await writeFiles(loader, overlay) : [];
  return { loader: loader.code, overlay: overlay.code, files };
}

/** @returns {Promise<{ name: string, code: string, map: string }>} the code ends with the source map comment */
async function bundle(entry, name, define) {
  const result = await esbuild.build({
    entryPoints: [entry],
    outfile: path.join(DIST, name),
    sourcemap: 'external',
    sourcesContent: true,
    bundle: true,
    format: 'iife',
    target: [...TARGETS],
    minify: true,
    legalComments: 'none',
    define,
    write: false,
  });
  const byExtension = (extension) => result.outputFiles.find((file) => file.path.endsWith(extension)).text;
  return { name, code: byExtension('.js') + sourceMapComment(name), map: byExtension(MAP_EXTENSION) };
}

const sourceMapComment = (name) => `\n//# sourceMappingURL=${name}${MAP_EXTENSION}\n`;

/** The Subresource Integrity value of the code, as the browser computes it over the file's bytes. */
function integrityOf(code) {
  return INTEGRITY_ALGORITHM + '-' + crypto.createHash(INTEGRITY_ALGORITHM).update(code, 'utf8').digest('base64');
}

async function writeFiles(...bundles) {
  await fs.mkdir(DIST, { recursive: true });
  const byName = {};
  for (const { name, code, map } of bundles) {
    byName[name] = code;
    byName[name + MAP_EXTENSION] = map;
  }
  const files = Object.keys(byName).map((name) => path.join(DIST, name));
  await Promise.all(files.map((file) => fs.writeFile(file, byName[path.basename(file)], 'utf8')));
  return files;
}

const logBuilt = ({ files }) => console.log('Built ' + files.map((file) => path.relative(ROOT, file)).join(', '));

/** Rebuilds when something under src/ changes. A failed rebuild is logged and the watcher keeps running. */
function watchOverlay() {
  let timer;
  const rebuild = () => buildOverlay({ write: true }).then(logBuilt).catch((error) => console.error(error.message));
  fsSync.watch(SRC, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, REBUILD_DELAY_MS);
  });
  console.log('Watching src/ for changes');
  return rebuild();
}

if (require.main === module) {
  const run = process.argv.includes(WATCH_FLAG) ? watchOverlay() : buildOverlay({ write: true }).then(logBuilt);
  run.catch((error) => { console.error(error); process.exitCode = 1; });
}

module.exports = { buildOverlay, integrityOf };
