// Where the interface goes on screen. Pure: rectangles and sizes in, positions out.
const EDGE_MARGIN = 8;
const PANEL_GAP = 12;

function viewportOf(win) {
  return { width: win.innerWidth, height: win.innerHeight };
}

/** Above the element when there is room, otherwise below it, always inside the viewport. */
function toolbarPosition(rect, size, viewport) {
  const above = rect.top - size.height - EDGE_MARGIN;
  const below = Math.min(rect.bottom + EDGE_MARGIN, viewport.height - size.height - EDGE_MARGIN);
  const top = above >= EDGE_MARGIN ? above : Math.max(EDGE_MARGIN, below);
  return { top, left: clampLeft(rect, size.width, viewport.width) };
}

/** Below the element, else above it; null when it fits on neither side. */
function panelPosition(rect, size, viewport) {
  if (fitsBelow(rect, size.height, viewport.height)) return { top: rect.bottom + PANEL_GAP, left: clampLeft(rect, size.width, viewport.width) };
  if (fitsAbove(rect, size.height, viewport.height)) return { top: rect.top - PANEL_GAP - size.height, left: clampLeft(rect, size.width, viewport.width) };
  return null;
}

function fitsBelow(rect, height, viewportHeight) {
  return rect.bottom > 0 && rect.bottom + PANEL_GAP + height <= viewportHeight - EDGE_MARGIN;
}

function fitsAbove(rect, height, viewportHeight) {
  return rect.top < viewportHeight && rect.top - PANEL_GAP - height >= EDGE_MARGIN;
}

function clampLeft(rect, width, viewportWidth) {
  return Math.max(EDGE_MARGIN, Math.min(rect.left, viewportWidth - width - EDGE_MARGIN));
}

function isOnScreen(rect, viewport) {
  const hasSize = rect.width > 0 || rect.height > 0;
  return hasSize && rect.bottom > 0 && rect.top < viewport.height;
}

module.exports = { EDGE_MARGIN, viewportOf, toolbarPosition, panelPosition, isOnScreen };
