// What the loader (fixthis.js) and the full overlay (fixthis-overlay.js) agree on to find each other.
// The full overlay sits next to the loader, so self-hosted copies and CDN copies both work without configuration.
const OVERLAY_FILE = 'fixthis-overlay.js';
// The full overlay leaves its factory here; a global because the two files are separate scripts
const OVERLAY_GLOBAL = '__fixthisOverlay';

module.exports = { OVERLAY_FILE, OVERLAY_GLOBAL };
