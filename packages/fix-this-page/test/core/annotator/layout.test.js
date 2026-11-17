const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { toolbarPosition, panelPosition } = require('../../../src/core/annotator/layout');

const VIEWPORT = Object.freeze({ width: 1000, height: 800 });
const TOOLBAR_SIZE = Object.freeze({ width: 200, height: 40 });
const PANEL_SIZE = Object.freeze({ width: 400, height: 300 });
const rect = (top, height, left = 100) => ({ top, bottom: top + height, left, width: 100, height });

describe('toolbarPosition', () => {
  it('places the toolbar above the element when there is room', () => {
    assert.deepEqual(toolbarPosition(rect(200, 50), TOOLBAR_SIZE, VIEWPORT), { top: 152, left: 100 });
  });

  it('places the toolbar below the element when it is at the top of the screen', () => {
    assert.deepEqual(toolbarPosition(rect(20, 50), TOOLBAR_SIZE, VIEWPORT), { top: 78, left: 100 });
  });

  it('keeps the toolbar inside the screen for an element taller than the screen', () => {
    assert.deepEqual(toolbarPosition(rect(-100, 2000), TOOLBAR_SIZE, VIEWPORT), { top: 752, left: 100 });
  });

  it('keeps the toolbar inside the right edge of the screen', () => {
    assert.equal(toolbarPosition(rect(200, 50, 900), TOOLBAR_SIZE, VIEWPORT).left, 792);
  });
});

describe('panelPosition', () => {
  it('places the panel below the element when it fits there', () => {
    assert.deepEqual(panelPosition(rect(100, 50), PANEL_SIZE, VIEWPORT), { top: 162, left: 100 });
  });

  it('places the panel above the element when it does not fit below', () => {
    assert.deepEqual(panelPosition(rect(600, 50), PANEL_SIZE, VIEWPORT), { top: 288, left: 100 });
  });

  it('answers null when the panel fits on neither side', () => {
    assert.equal(panelPosition(rect(250, 300), PANEL_SIZE, VIEWPORT), null);
  });
});
