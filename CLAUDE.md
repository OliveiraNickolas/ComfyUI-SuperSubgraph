# ComfyUI-SuperSubgraph

ComfyUI extension, **frontend only**. UI logic lives in `web/js/super_subgraph.js`,
its CSS in `web/js/super_subgraph_css.js` (code comments are in Portuguese;
match that). ComfyUI loads every `.js` under `web/` as an extension, so extra
modules there must only export (no side effects). `__init__.py` only exports
`WEB_DIRECTORY` (no Python nodes).

**A Super Subgraph is a NATIVE ComfyUI subgraph with a card on top.** It has
no execution engine of its own: execution, entering/breadcrumb/Esc, inputs and
outputs, undo and unpacking are ComfyUI's. Classic subgraphs stay classic and
live side by side with Super ones. Never reintroduce an own node type or
execution engine — an earlier version did (removed on 2026-09-26) and it broke
workflows (dangling links, whole runs failing, odd navigation).

Goal of the project: the Super Subgraph must feel like a **native ComfyUI
feature** — same scale, same look as a node's widgets, works with any
installed node, any browser, any OS.

## Workflow

- Deliver every change end to end: commit and **push directly to `main`**
  (no branch or PR needed; the owner asked for this).
- Before pushing, always run all of these and make them pass:
  - `node --check web/js/super_subgraph.js && node --check web/js/super_subgraph_css.js`
  - `python3 -m py_compile __init__.py`
  - `npm test` (jsdom unit + Chromium browser suites; `npm ci` first if
    `node_modules` is missing)
  - `npm run test:e2e` (needs a real ComfyUI at `COMFY_URL`, default
    `http://127.0.0.1:8188/`; CI runs it on every push to `main`)
- When a test fails, check whether it also fails on the previous commit
  (`git stash`, rerun, `git stash pop`) before blaming your change. Only
  change a test's expectation when the new behaviour is intentional, and
  say so in a comment next to the assertion.
- This checkout is the owner's live install: no `git pull` is needed. JS/CSS
  changes need Ctrl+F5 (a ComfyUI restart only if `__init__.py` changes).
- The owner is a beginner: explain results in simple Portuguese.

## Map of `super_subgraph.js`

Find sections by their banner comment (`grep -n "^/\* ═" -A1`):

| Section | What it holds |
| --- | --- |
| top | constants (`PROP = "ui_layout"`, `GRID`, `MIN_W`, `PAD`), undo/redo, copy/paste, keyboard shortcuts |
| Inspeção de widgets | `describeWidget`, `usable`, `isHelperWidget`, `isTextDomWidget`, `numDecimals`/`fmtNum` |
| Binding por name | `resolveBind`, `bindKey`, `writeWidget` |
| Auto-populate | `autoLayout` (card built from a node's widgets) |
| Controles | `mkToggle`, `mkSlider`, `mkNumber`, `mkStepNumber`, `mkCombo`, `mkText`, `mkButton`, `mkMediaControl` |
| Exibição de saídas | Image/Video/Audio Output views |
| Arraste entre grupos e zonas | group/segment rendering (`buildSegment`), drag between groups and zones |
| Espelho de interface… | panels: `PANEL_KINDS`, `defaultSizeFor`, `mkSpecialControl`, `mkColor`, `mkCanvasMirror`, `mkDomMount`, `mkPreviewOverride`; then `buildControl` (one loose component) |
| Nó inteiro como widget | `singleCtrlFor`, `wholeNodeItems`, `buildWholeNodeCtrl`, sizing (`sectionRequiredWidth`, `requiredNodeWidth`), component search dialog / Target Picker (`openInspector`) |
| FORM MODE | palette, Object Inspector (`renderObjectInspector`), `buildCard`, zones, tabs, resizers |
| Ciclo de vida | `attach`/`detach`, `state.refresh`, color hooks, `cardHeight` |
| Super Subgraph = subgrafo nativo + cartão | `isSuperNode`, `enterSuper` (native `openSubgraph`), `convertSelectionToSuper` (native `convertToSubgraph` + card), `copyAsSuper` (independent copy of a classic subgraph), `superAutoLayout`, card layout library, node menu (`superMenuOptions`), run feedback (`onRunEvent`) |
| Extensão | `app.registerExtension`: menus, events, test hooks |

## How a widget becomes a control

1. `usable(w)` decides whether the card may offer the widget at all (hidden
   types, helper widgets, object values with no UI are excluded).
2. `describeWidget(w).kind` classifies it. Besides the plain kinds
   (`toggle`, `slider`, `number`, `combo`, `text`, `textarea`, `button`) there
   are:
   - `media` / `video` / `audio` — file inputs (`isMediaKind`);
   - `dom_widget` — the node's own live DOM element, **moved** into the card
     (`mkDomMount`); `preview_override` is the KJ preview variant;
   - `node_ui` / `canvas_widget` — UI drawn on the LiteGraph canvas by the node,
     **mirrored** on a `<canvas>` that calls the node's draw code and forwards
     pointer events (`mkCanvasMirror`);
   - `color` — color picker.
3. `mkSpecialControl` builds the special kinds; the same function is used by
   loose components (`buildControl`), group items (`buildSegment`) and
   `buildBare`. Add new special kinds there, not in each caller.
4. Default sizes come from `defaultSizeFor(kind)`; panel checks use
   `isPanelKind`, 2D checks use `is2DKind`. Don't hardcode sizes per call site.

To check how every installed node is handled, run `npm run scan:widgets`
against a live ComfyUI: it lists widgets that still fall back to a text box.

## Rules learned the hard way

- **Never size things with `getBoundingClientRect()`**: it includes the canvas
  zoom. Use `offsetWidth/offsetHeight/scrollHeight`. To convert pointer
  coordinates to card coordinates divide by `domScale()`.
- A layout object lives in `node.properties.ui_layout`; binds are
  `"widget"` (host) or `"<nodeId>/<widget>"` (a node inside `host.subgraph`).
- ComfyUI auto-promotes some inner widgets to the subgraph node; a promoted
  widget has its own value per instance and is what runs. `resolveBind`
  returns the host's promoted widget for such binds (`promotedHostWidget`) —
  always read/write through `resolveBind`, never the inner widget directly.
- Execution ids of nodes inside a subgraph are `"<hostId>:<innerId>"`.
- Native subgraph definitions are shared between instances. To make an
  independent copy, clone the definition with new node ids (`copyAsSuper`);
  unpacking a second instance breaks the shared definition (ComfyUI bug).
- Every layout change ends in `state.refresh()`, which also records undo.
  Call `pushUndo(host)` *before* mutating when you need an exact undo step.
- Listeners on `window`/`document` created while rendering a control leak on
  every refresh: add them only while a pointer is down (`{ once: true }`) and
  push observers to `state.observers` (disconnected on refresh).
- Query DOM inside the node's own card (`host.__legoHost`), never
  `document.querySelectorAll` — several cards can have components with the
  same name.
- Never write a string into a widget whose value is an object.
- DOM elements moved into the card keep `w.__origParent`; while the canvas
  shows the subgraph they go back to their node (see `mkDomMount`).
- HTML5 drags need `e.dataTransfer.setData(...)` in `dragstart` (Firefox).
  Prefix `backdrop-filter` with `-webkit-` (Safari). Avoid CSS `zoom`.
- Keep the look native: numbers use the widget's precision (`fmtNum`),
  stacked groups show "label left, control right" like a node.

## Tests

- `tests/unit` (jsdom) import the built module `tests/.build/mod.mjs`; add
  any function a test needs to `EXPORTS` in `tests/build-module.mjs`.
- `tests/browser` serve static pages from `tests/browser/*.html` with that
  module. Chromium is found automatically (`CHROME_PATH`, Playwright's cache
  on Linux/macOS/Windows, or system Chrome) — see `tests/lib.mjs`.
- `tests/e2e` drive a real ComfyUI. Test hooks on the extension object:
  `__flatCanvas()` / `__flatNode(node)` (menu items), `__promoteWhole(host,
  node)`, `__classify(widget)`.
- Screenshots go to `tests/.out/` (git-ignored); look at them when changing
  visuals.
