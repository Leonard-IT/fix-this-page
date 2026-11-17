// Entry of fixthis-overlay.js, the full overlay. The loader adds it to the page only once the overlay is switched
// on, so visitors who never use it do not download it.
const { createOverlay } = require('./overlay.js');
const { OVERLAY_GLOBAL } = require('./handoff.js');

window[OVERLAY_GLOBAL] = Object.freeze({ createOverlay });
