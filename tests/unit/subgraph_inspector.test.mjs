import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
for (const k of ["window", "document", "HTMLElement", "Event", "CustomEvent", "MouseEvent", "PointerEvent", "KeyboardEvent", "MutationObserver", "getComputedStyle"]) {
  globalThis[k] = dom.window[k] ?? globalThis[k];
}
globalThis.PointerEvent ??= dom.window.MouseEvent;
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.cancelAnimationFrame = (h) => clearTimeout(h);
globalThis.ResizeObserver = class { observe(){} disconnect(){} };

const dispatchedEvents = [];
const fakeCanvas = {
  ds: { scale: 1, offset: [0, 0] },
  graph: null,
  subgraph: undefined,
  canvas: dom.window.document.createElement("canvas"),
  deselectAll() {},
  setGraph(g) { this.graph = g; },
  setDirty() {},
  dispatch(type, detail) {
    dispatchedEvents.push({ type, detail });
    this.canvas.dispatchEvent(new dom.window.CustomEvent(type, { bubbles: true, detail }));
  }
};

class FakeGraph {
  constructor() {
    this._nodes = [];
    this.isRootGraph = true;
  }
  configure(data) {
    this.configuredWith = data;
  }
  setDirtyCanvas() {}
}

const rootGraph = new FakeGraph();
let activeGraphUpdated = false;
globalThis.__app = {
  registerExtension() {},
  canvas: fakeCanvas,
  graph: rootGraph,
  rootGraph: rootGraph,
  extensionManager: {
    workflow: {
      updateActiveGraph() { activeGraphUpdated = true; }
    }
  }
};
fakeCanvas.graph = rootGraph;
globalThis.__api = { apiURL: (p) => p, fetchApi: async () => ({ ok: false }) };

const M = await import("../.build/mod.mjs");
let ok = 0, fail = 0;
const t = (name, cond) => { cond ? ok++ : fail++; console.log(cond ? "PASS" : "FAIL", name); };

// ── 1. TEST ENTER & EXIT SUPER SUBGRAPH ──
const sn = {
  id: 101,
  type: "SuperSubgraph",
  title: "Super1",
  properties: {
    ss_inner: {
      graph: {
        last_node_id: 1,
        nodes: [{ id: 1, type: "KSampler", pos: [100, 100], size: [200, 100] }],
        links: []
      }
    },
    ui_layout: { schema: 2, tabs: [{ sections: [{ controls: [] }] }] }
  },
  flags: {},
  widgets: [],
  setSize() {},
  addDOMWidget(name, type, el, opts) {
    const w = { name, type, element: el, ...opts };
    this.widgets.push(w);
    document.body.append(el);
    return w;
  }
};

M.attach(sn);

M.enterSuper(sn);

const inner = M.ssInnerGraph(sn);
t("enterSuper sets canvas.graph = inner", fakeCanvas.graph === inner);
t("enterSuper does not attach sn.subgraph (prevents ComfyUI link loss)", sn.subgraph === undefined);
t("enterSuper does not set canvas.subgraph (prevents native subgraph link rewrite)", fakeCanvas.subgraph === undefined);

M.exitSuper(1);

t("exitSuper restores root graph", fakeCanvas.graph === globalThis.__app.graph);
t("exitSuper ensures sn.subgraph is clean", sn.subgraph === undefined);

// ── 2. TEST OBJECT INSPECTOR ALIGNMENT ──
const node = {
  id: 202,
  title: "TestNode",
  size: [500, 300],
  properties: {
    ui_layout: {
      schema: 2,
      activeTab: 0,
      tabs: [{
        sections: [{
          header: "MAIN",
          controls: [{
            name: "HGroup4",
            kind: "segment",
            items: [],
            x: 20,
            y: 40,
            w: 400,
            h: 80
          }]
        }]
      }]
    }
  },
  widgets: [],
  flags: {},
  setSize() {},
  addDOMWidget(name, type, el, opts) {
    const w = { name, type, element: el, ...opts };
    this.widgets.push(w);
    document.body.append(el);
    return w;
  }
};

const st = M.attach(node);
st.edit = true;
st.refresh();

// Mock getBoundingClientRect for target element
const groupRow = node.__legoHost.querySelector('[data-name="HGroup4"]');
t("group element exists in card", !!groupRow);

if (groupRow) {
  groupRow.getBoundingClientRect = () => ({
    left: 100,
    top: 200,
    right: 500,
    bottom: 280,
    width: 400,
    height: 80
  });

  st.selectedName = "HGroup4";
  st.selectedNames = new Set(["HGroup4"]);

  M.renderObjectInspector(node, st, true);

  const oi = document.querySelector(".lego-oi");
  t("inspector element created", !!oi);
  t("inspector aligned to right of element (500 + 14 = 514px)", oi.style.left === "514px");
  t("inspector aligned to top of element (200px)", oi.style.top === "200px");

  // ── 3. TEST CAPTION VS HEADER DISAMBIGUATION ──
  const oiRows = [...oi.querySelectorAll(".lego-oi-row .lego-oi-key")].map((k) => k.textContent);
  t("group inspector shows Header row", oiRows.includes("Header"));
  t("group inspector shows Header Position row", oiRows.includes("Header Position"));
  t("group inspector does NOT show Caption row", !oiRows.includes("Caption"));
  t("group inspector does NOT show Caption Position row", !oiRows.includes("Caption Position"));

  // Regular control in same card
  node.properties.ui_layout.tabs[0].sections[0].controls.push({
    name: "Slider1",
    kind: "slider",
    label: "CFG",
    x: 20, y: 140, w: 200, h: 48
  });
  st.refresh();
  st.selectedName = "Slider1";
  st.selectedNames = new Set(["Slider1"]);
  M.renderObjectInspector(node, st, true);

  const ctrlRows = [...oi.querySelectorAll(".lego-oi-row .lego-oi-key")].map((k) => k.textContent);
  t("control inspector shows Caption row", ctrlRows.includes("Caption"));
  t("control inspector shows Caption Position row", ctrlRows.includes("Caption Position"));
  t("control inspector does NOT show Header row", !ctrlRows.includes("Header"));

  // ── 4. TEST SIDE-BY-SIDE ZONE LAYOUT & WIDTH CONTROLS ──
  node.properties.ui_layout.tabs[0].sections = [
    { header: "ZONE A", width: "50%", controls: [] },
    { header: "ZONE B", width: "50%", controls: [] }
  ];
  st.refresh();

  const secEls = node.__legoHost.querySelectorAll(".lego-sec");
  t("renders two zone elements", secEls.length === 2);

  const secA = secEls[0];
  const secB = secEls[1];
  t("zone A has width calc with gap offset", secA.style.width.includes("calc(50%"));
  t("zone A flex basis matches calc", secA.style.flex.includes("calc(50%"));
  t("zone A has maxWidth matching calc", secA.style.maxWidth.includes("calc(50%"));
  t("zone B has width calc with gap offset", secB.style.width.includes("calc(50%"));

  // Check card width action button (removed per user directive: fluid modular drag & snap instead of rigid percentages)
  const widthBtns = node.__legoHost.querySelectorAll(".lego-sec-actions button[title*='Card width']");
  t("no rigid Card Width percentage buttons in edit mode", widthBtns.length === 0);

  // ── 5. TEST FLUID ROW REBALANCING & SUB-TABS ZONE CREATION ──
  t("widthForCount(1) is 100%", M.widthForCount(1) === "100%");
  t("widthForCount(2) is 50%", M.widthForCount(2) === "50%");
  t("widthForCount(3) is 33.3%", M.widthForCount(3) === "33.3%");
  t("widthForCount(4) is 25%", M.widthForCount(4) === "25%");

  const testSecs = [
    { header: "Z1", width: "50%" },
    { header: "Z2", width: "50%" },
    { header: "Z3", width: "100%" }
  ];
  const rowZ1 = M.getContiguousRow(testSecs, 0);
  t("getContiguousRow detects side-by-side row of 2 zones", rowZ1.length === 2 && rowZ1[0].header === "Z1" && rowZ1[1].header === "Z2");
  const rowZ3 = M.getContiguousRow(testSecs, 2);
  t("getContiguousRow detects standalone 100% zone", rowZ3.length === 1 && rowZ3[0].header === "Z3");

  // Test createNewZone structure
  const curTab = { sections: [] };
  const origPrompt = globalThis.prompt;
  globalThis.prompt = () => "CUSTOM ZONE";
  M.createNewZone({ host: node, curTab, state: st });
  globalThis.prompt = origPrompt;

  t("createNewZone created a zone in curTab", curTab.sections.length === 1);
  const createdSec = curTab.sections[0];
  t("new zone header is upper case", createdSec.header === "CUSTOM ZONE");
  t("new zone defaults to 100% full width", createdSec.width === "100%");
  t("new zone defaults to internal sub-tabs structure", Array.isArray(createdSec.tabs) && createdSec.tabs.length === 2);
  t("new zone has Tab 1 and Tab 2", createdSec.tabs[0].name === "Tab 1" && createdSec.tabs[1].name === "Tab 2");
  t("new zone has activeTab 0", createdSec.activeTab === 0);
}

console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
