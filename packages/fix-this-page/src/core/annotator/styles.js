// The look of the annotation layer: a few rules for the page itself, and the interface in its own shadow DOM.
const { ATTR } = require('./dom.js');

const PAGE_CSS = `
  [${ATTR.Deleted}] { opacity: .3 !important; outline: 2px dashed #B00020 !important; outline-offset: 2px; }
  [${ATTR.Clone}] { outline: 2px dashed #0A0A0A !important; outline-offset: 2px; }
  [${ATTR.Editable}="true"] { outline: 2px solid #0A0A0A !important; outline-offset: 2px; cursor: text !important; }
  * { cursor: default; }`;
// The interface lives in a shadow DOM, so the site's CSS cannot reach it. It carries its own copy of the
// fixthis.page tokens (public/tokens.css); the web fonts are not loaded on other people's sites, so system fonts stand in.
const UI_CSS = `
  :host { all: initial; --yellow: #FFE14D; --ink: #0A0A0A; --paper: #FFFFFF; --paper-2: #F4F4F4; --muted: #3A3A3A; --error: #B00020; --border: 2px solid var(--ink); --shadow: 6px 6px 0 var(--ink); --shadow-sm: 3px 3px 0 var(--ink); --radius-lg: 18px; --radius-sm: 10px; --font-display: "Space Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif; --font-mono: "JetBrains Mono", ui-monospace, Consolas, monospace; }
  * { box-sizing: border-box; font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; }
  :focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
  .box { position: fixed; pointer-events: none; border-radius: 4px; display: none; }
  .hover { outline: 2px dashed var(--ink); background: rgba(255,225,77,.25); }
  .sel { outline: 2px solid var(--ink); background: rgba(255,225,77,.4); }
  .toolbar { position: fixed; display: none; gap: 4px; padding: 4px; background: var(--paper); border: var(--border); border-radius: var(--radius-sm); pointer-events: auto; box-shadow: var(--shadow-sm); flex-wrap: wrap; max-width: 560px; }
  .toolbar button { all: unset; cursor: pointer; color: var(--ink); font-size: 13px; font-weight: 600; padding: 6px 8px; border-radius: 7px; display: inline-flex; align-items: center; }
  .toolbar button:hover { background: var(--yellow); color: var(--ink); }
  .toolbar button:focus-visible { outline: 3px solid var(--ink); outline-offset: -3px; }
  .toolbar .tagname { color: var(--muted); font-size: 12px; padding: 6px 8px; font-family: var(--font-mono); }
  .panel { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); width: min(520px, calc(100vw - 32px)); background: var(--paper); color: var(--ink); border: var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow); padding: 16px; display: none; pointer-events: auto; font-size: 14px; }
  .panel h3 { margin: 0 0 4px; font: 700 16px var(--font-display); letter-spacing: -0.02em; }
  .panel p { margin: 0 0 10px; color: var(--muted); font-size: 13px; line-height: 1.4; }
  .panel label { display: block; font-size: 12px; font-weight: 600; margin: 8px 0 4px; color: var(--ink); }
  .panel input, .panel textarea { width: 100%; font: inherit; font-size: 14px; padding: 8px 10px; border: var(--border); border-radius: var(--radius-sm); color: var(--ink); background: var(--paper); }
  .panel input:focus, .panel textarea:focus { outline: 3px solid var(--yellow); outline-offset: 0; }
  .panel textarea { min-height: 64px; resize: vertical; }
  .panel .row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
  .panel button { font: inherit; font-size: 14px; padding: 7px 14px; border-radius: var(--radius-sm); border: var(--border); background: var(--paper); color: var(--ink); cursor: pointer; }
  .panel button:hover { background: var(--yellow); }
  .panel button.primary { background: var(--yellow); box-shadow: var(--shadow-sm); font-family: var(--font-display); font-weight: 700; }
  .panel button.primary:hover { background: var(--ink); color: var(--yellow); }
  .panel .step { display: flex; gap: 10px; align-items: flex-start; margin: 6px 0; color: var(--muted); font-size: 13px; }
  .panel .step b { color: var(--ink); }
  .panel .n { flex: none; width: 22px; height: 22px; border-radius: 50%; border: var(--border); background: var(--yellow); color: var(--ink); font: 700 12px var(--font-display); display: flex; align-items: center; justify-content: center; }
  .panel .n.off { background: var(--paper-2); color: var(--muted); }
  .panel .linkbtn { background: none; border: 0; padding: 4px 0; margin-top: 4px; color: var(--muted); text-decoration: underline; font-size: 13px; }
  .panel .linkbtn:hover { background: var(--yellow); color: var(--ink); }
  .panel .hint { margin-right: auto; align-self: center; color: var(--muted); font-size: 12px; }
  .panel button:disabled { opacity: .4; cursor: default; }
  .tip { position: fixed; display: none; background: var(--yellow); color: var(--ink); border: var(--border); font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 99px; pointer-events: none; animation: tipb 1s infinite alternate; }
  .tip::after { content: ""; position: absolute; left: 14px; bottom: -8px; border: 6px solid transparent; border-top-color: var(--ink); border-bottom: 0; }
  @keyframes tipb { to { margin-top: -5px; } }
  .pin { position: fixed; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; background: var(--yellow); color: var(--ink); font: 700 12px var(--font-display); display: flex; align-items: center; justify-content: center; pointer-events: auto; cursor: pointer; border: var(--border); }
  .pin.done { background: var(--ink); color: #fff; }
  @media (prefers-reduced-motion: reduce) { .tip { animation: none; } }
  /* Fingers need bigger targets than a mouse: 44px is the usual minimum */
  @media (pointer: coarse) {
    .toolbar button { box-sizing: border-box; min-width: 44px; min-height: 44px; justify-content: center; }
    .toolbar .tagname { align-self: center; }
    .panel button { min-height: 44px; }
    .panel .linkbtn { min-height: 44px; }
    .pin { width: 32px; height: 32px; margin: -16px 0 0 -16px; font-size: 14px; }
  }
`;
const UI_HTML = `
  <div class="box hover"></div><div class="box sel"></div>
  <div class="pins"></div>
  <div class="toolbar"></div>
  <div class="tip">✎ Click here and type your new text</div>
  <div class="panel"></div>`;

module.exports = { PAGE_CSS, UI_CSS, UI_HTML };
