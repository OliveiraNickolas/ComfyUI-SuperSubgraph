# ComfyUI-SuperSubgraph

ComfyUI extension, **frontend only**. The UI is split in ES modules under
`web/js/ss/` (one per area, see the map below); `web/js/super_subgraph.js` is
the entry point (imports + `app.registerExtension`), its CSS lives in
`web/js/super_subgraph_css.js`. Code comments are in Portuguese; match that.
ComfyUI loads every `.js` under `web/` (subfolders too) as an extension, so the
modules must only declare and export — no code that runs on load.
`__init__.py` only exports `WEB_DIRECTORY` (no Python nodes).

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
  - `for f in web/js/*.js web/js/ss/*.js; do node --check $f; done`
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

## Map of the modules (`web/js/ss/`)

| File | What it holds |
| --- | --- |
| `constants.js` | `EXT`, `PROP = "ui_layout"`, `SCHEMA`, `MIN_W`, `PAD`, `GRID`, `LOG`… (imports nothing) |
| `core.js` | `showLegoToast`, undo/redo, copy/paste, keyboard shortcuts, `injectCSS` |
| `widgets.js` | `describeWidget`, `usable`, `isHelperWidget`, `numDecimals`/`fmtNum`; `resolveBind`, `bindKey`, `writeWidget`; `autoLayout` |
| `controls.js` | `el`, `eatPointer`, glyphs; `mkToggle`, `mkSlider`, `mkNumber`, `mkStepNumber`, `mkCombo`, `mkText`, `mkButton`, `mkMediaControl`; seed mode |
| `outputs.js` | Image/Video/Audio Output views, `recordOutput`, `latestOutputFor` |
| `drag.js` | group rendering (`buildSegment`), drag between groups and zones |
| `panels.js` | `PANEL_KINDS`, `defaultSizeFor`, `mkSpecialControl`, `mkColor`, `mkCanvasMirror`, `mkDomMount`, `mkPreviewOverride`; `buildControl` (one loose component) |
| `whole_node.js` | `singleCtrlFor`, `wholeNodeItems`, `buildWholeNodeCtrl`; zone widths and node size (`sectionRequiredWidth`, `requiredNodeWidth`) |
| `picker.js` | Target Picker, component search dialog (`openInspector`), tab modals and menus |
| `form.js` | colours (`openColorMenu`, `colorDotButton`), palette (FORM MODE), alignment |
| `inspector.js` | Object Inspector (`renderObjectInspector`), tabs/sub-tabs helpers |
| `card.js` | `buildCard` (the whole card: header, tabs, zones, resizers) |
| `lifecycle.js` | `attach`/`detach`, `state.refresh`, sweep, node colour hooks, `cardHeight`, `resize` |
| `native.js` | Super Subgraph = native subgraph + card: `isSuperNode`, `enterSuper`, `convertSelectionToSuper`, `copyAsSuper`, `superAutoLayout`, pasted-copy rebinding, layout library, node menu (`superMenuOptions`), run feedback (`onRunEvent`) |

`web/js/super_subgraph.js`: the architecture notes and `app.registerExtension`
(menus, events, test hooks).

Imports between modules: each file ends with `export { … }` of everything it
declares and starts with `import { … } from "./other.js"` lines. When a
function starts being used from another file, add it to that file's import
line (one line per source module). A new module must also be added to
`ORDER` in `tests/build-module.mjs` (the unit tests join all modules back into
one file) — the build fails if you forget. Never read another module's
variable at load time except from `constants.js` (circular imports).

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
- Promotion model: the card controls inner widgets directly — no wire.
  Native wire promotions (a subgraph input linked to the inner widget) are
  only for values that must come from OUTSIDE: "Expose as node input" /
  "Remove node input" (`exposeAsInput` / `removeWireInput` in `native.js`).
  `convertSelectionToSuper` removes the wires ComfyUI auto-promotes (seed,
  prompt, image…) with `removeUnusedWireInputs`; removing a wire first copies
  the host value (the one that ran) into the inner widget. Inside a subgraph,
  widgets on the card are outlined in purple (`installCardMarks`: canvas
  drawing, plus `data-lego-on-card` for Vue Nodes).
- While a wire promotion exists, the promoted host widget has its own value
  per instance and is what runs. `resolveBind` returns it for such binds
  (`promotedHostWidget`) — always read/write through `resolveBind`, never the
  inner widget directly.
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
  stacked groups show "label left, control right" like a node. Labels are
  `--lego-dim` 11px/500, values `--lego-text` 11px/400, everywhere (loose,
  vertical and horizontal groups).
- Colours come from the theme variables (`--lego-text`, `--lego-dim`,
  `--lego-well`, `--lego-line`…), never hardcoded white: ComfyUI has a light
  theme. Panels that are always dark (palette, menus, Inspector, dialogs)
  get their own light-text set in the CSS; a coloured node picks light or
  dark text from its background (`isDarkColor`). Check changes with
  `tests/e2e/light_theme.test.mjs`.

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
- **Media in tests: only `example.png` (images) and `nothing.mp4` (video).**
  The owner's `input/` folder has private/NSFW files that must never be
  shown, loaded or screenshotted. `launch()` in `tests/lib.mjs` makes every
  new Load Image/Video node start on these files; when you set a media value
  yourself, use `SAFE_IMAGE` / `SAFE_VIDEO` from there. Never list or open
  other files in `input/`.
