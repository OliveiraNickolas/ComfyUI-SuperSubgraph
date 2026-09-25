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
    this._nodes_by_id = {};
    this.links = {};
    this.last_node_id = 0;
    this.isRootGraph = true;
  }
  configure(data) {
    this.configuredWith = data;
    if (data?.nodes) {
      for (const n of data.nodes) {
        this.add(n);
      }
    }
  }
  add(node) {
    if (!node.id) node.id = ++this.last_node_id;
    this._nodes.push(node);
    this._nodes_by_id[node.id] = node;
    node.graph = this;
    if (!node.connect) {
      node.connect = function(originSlot, targetNode, targetSlot) {
        const linkId = ++this.graph.last_node_id;
        const link = { id: linkId, origin_id: this.id, origin_slot: originSlot, target_id: targetNode.id, target_slot: targetSlot };
        this.graph.links[linkId] = link;
        this.outputs = this.outputs || [];
        while (this.outputs.length <= originSlot) this.outputs.push({ links: [] });
        this.outputs[originSlot].links = this.outputs[originSlot].links || [];
        this.outputs[originSlot].links.push(linkId);
        targetNode.inputs = targetNode.inputs || [];
        while (targetNode.inputs.length <= targetSlot) targetNode.inputs.push({ link: null });
        targetNode.inputs[targetSlot].link = linkId;
        return link;
      };
    }
    return node;
  }
  remove(node) {
    const idx = this._nodes.indexOf(node);
    if (idx >= 0) this._nodes.splice(idx, 1);
    delete this._nodes_by_id[node.id];
    node.graph = null;
  }
  getNodeById(id) {
    return this._nodes_by_id[id] || this._nodes.find((n) => String(n.id) === String(id));
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

// ── 6. TEST NODE REDIRECTION TO INNER ON GRAPH.ADD ──
M.enterSuper(sn);
const activeInner = M.ssInnerGraph(sn);
const addedInnerNode = { id: 777, type: "CLIPTextEncode", pos: [200, 200], inputs: [], outputs: [] };
globalThis.__app.graph.add(addedInnerNode);
t("adding node to app.graph while inside SuperSubgraph redirects to inner", activeInner._nodes.includes(addedInnerNode));
t("redirected node is NOT added to rootGraph", !rootGraph._nodes.includes(addedInnerNode));
M.exitSuper(1);

const addedRootNode = { id: 888, type: "VAEDecode", pos: [300, 300], inputs: [], outputs: [] };
globalThis.__app.graph.add(addedRootNode);
t("adding node to app.graph when outside adds to rootGraph normally", rootGraph._nodes.includes(addedRootNode));

// ── 7. TEST APPLY SUPER SLOTS & BOUNDARY HELPERS ──
const slotNode = {
  id: 303,
  type: "SuperSubgraph",
  inputs: [],
  outputs: [],
  properties: {
    ss_inner: {
      inputs: [{ name: "clip_in", type: "CLIP", targets: [["1", "clip"]] }],
      outputs: [{ name: "latent_out", type: "LATENT", source: ["1", 0] }]
    }
  },
  addInput(name, type) { const s = { name, type, link: null }; this.inputs.push(s); return s; },
  addOutput(name, type) { const s = { name, type, links: [] }; this.outputs.push(s); return s; },
  removeInput(idx) { this.inputs.splice(idx, 1); },
  removeOutput(idx) { this.outputs.splice(idx, 1); }
};
M.applySuperSlots(slotNode);
t("applySuperSlots ensures in_1 slot exists", slotNode.inputs.some((s) => s.name === "in_1"));
t("applySuperSlots sets input label and type", slotNode.inputs[0].label === "clip_in" && slotNode.inputs[0].type === "CLIP");
t("applySuperSlots ensures out_1 slot exists", slotNode.outputs.some((s) => s.name === "out_1"));
t("applySuperSlots sets output label and type", slotNode.outputs[0].label === "latent_out" && slotNode.outputs[0].type === "LATENT");

M.renameBoundaryIO(slotNode, true, 0, "positive_clip");
t("renameBoundaryIO updates input name", slotNode.properties.ss_inner.inputs[0].name === "positive_clip");
t("renameBoundaryIO updates slot label", slotNode.inputs[0].label === "positive_clip");

M.renameBoundaryIO(slotNode, false, 0, "final_latent");
t("renameBoundaryIO updates output name", slotNode.properties.ss_inner.outputs[0].name === "final_latent");
t("renameBoundaryIO updates slot label", slotNode.outputs[0].label === "final_latent");

// ── 8. TEST QUICK OUT (EJECT NODE PRESERVING CONNECTIONS) ──
const hostNode = {
  id: 500,
  type: "SuperSubgraph",
  title: "SuperHost",
  pos: [100, 100],
  size: [300, 200],
  properties: {
    ss_inner: {
      graph: {
        last_node_id: 10,
        nodes: [
          { id: 1, type: "CheckpointLoaderSimple", pos: [10, 10], inputs: [], outputs: [{ name: "MODEL", type: "MODEL", links: [] }] },
          { id: 2, type: "ResolutionMaster", pos: [200, 10], inputs: [{ name: "model", type: "MODEL", link: null }], outputs: [{ name: "latent", type: "LATENT", links: [] }] },
          { id: 3, type: "KSampler", pos: [400, 10], inputs: [{ name: "latent_image", type: "LATENT", link: null }], outputs: [{ name: "LATENT", type: "LATENT", links: [] }] }
        ]
      },
      inputs: [],
      outputs: []
    }
  },
  inputs: [],
  outputs: [],
  addInput(name, type) { const s = { name, type, link: null }; this.inputs.push(s); return s; },
  addOutput(name, type) { const s = { name, type, links: [] }; this.outputs.push(s); return s; },
  removeInput(idx) { this.inputs.splice(idx, 1); },
  removeOutput(idx) { this.outputs.splice(idx, 1); }
};
rootGraph.add(hostNode);

M.enterSuper(hostNode);
const hInner = M.ssInnerGraph(hostNode);
const inner1 = hInner.getNodeById(1);
const inner2 = hInner.getNodeById(2);
const inner3 = hInner.getNodeById(3);

// Wire 1 -> 2 -> 3 inside inner graph
inner1.connect(0, inner2, 0);
inner2.connect(0, inner3, 0);

t("inner connections established", inner2.inputs[0].link != null && inner3.inputs[0].link != null);

// Quick out node 2 ("ResolutionMaster")
M.quickOutNode(inner2);

t("quickOutNode removes ejected node from inner graph", hInner.getNodeById(2) === undefined);
t("quickOutNode adds ejected node to rootGraph", rootGraph.getNodeById(2) === inner2);
t("quickOutNode exits to rootGraph canvas", fakeCanvas.graph === rootGraph);

// Check that wire from inner1 (CheckpointLoader) now outputs through hostNode to inner2 (ResolutionMaster)
t("hostNode exposed output for inner1", hostNode.properties.ss_inner.outputs.length === 1);
t("hostNode output connects to ejected node input", inner2.inputs[0].link != null);

// Check that wire from inner2 to inner3 now inputs into hostNode
t("hostNode exposed input for inner3", hostNode.properties.ss_inner.inputs.length === 1);
t("ejected node output connects to hostNode input", hostNode.inputs[0].link != null);

// ── 9. TEST STABLE MEDIA VIEW URL (NO FLICKERING/RELOAD ON CARD USE) ──
const url1 = M.viewURL("my_image.png");
const url2 = M.viewURL("my_image.png");
t("viewURL is stable across calls", url1 === url2);
t("viewURL does not contain Math.random query param", !url1.includes("rand="));
const urlBust = M.viewURL("my_image.png", true);
t("viewURL supports explicit cache busting on upload/save", urlBust !== url1 && urlBust.includes("&v="));
const urlBustRepeat = M.viewURL("my_image.png");
t("viewURL maintains new version without regenerating random noise", urlBustRepeat === urlBust);

// ── 10. TEST SECTION REQUIRED WIDTH & ZONE MIN-WIDTH CONTAINMENT ──
const emptySec = { header: "EMPTY", controls: [] };
t("empty section requires base minimum 200px", M.sectionRequiredWidth(emptySec) === 200);

const secWithControls = {
  header: "DENSE",
  controls: [
    { name: "C1", x: 20, w: 300, y: 10, h: 40 },
    { name: "C2", x: 50, w: 320, y: 60, h: 40 }
  ]
};
// Max extent is 50 + 320 = 370 + 32 = 402px
t("sectionRequiredWidth calculates based on child control maxX + 32", M.sectionRequiredWidth(secWithControls) === 402);

const secWithSubTabs = {
  header: "SUBTABS",
  tabs: [
    { name: "T1", controls: [{ name: "S1", x: 10, w: 250 }] },
    { name: "T2", controls: [{ name: "S2", x: 30, w: 400 }] }
  ]
};
// Subtab T2 has 30 + 400 = 430 + 32 = 462px
t("sectionRequiredWidth checks sub-tabs controls", M.sectionRequiredWidth(secWithSubTabs) === 462);

// Check DOM minWidth enforcement on buildCard
node.properties.ui_layout.tabs[0].sections = [secWithControls];
st.refresh();
const renderedSec = node.__legoHost.querySelector(".lego-sec");
t("rendered zone has minWidth matching sectionRequiredWidth", renderedSec.style.minWidth === "402px");
const renderedCtrlsBox = renderedSec.querySelector(".lego-sec-controls");
t("rendered zone controls box has minWidth protecting contents", renderedCtrlsBox.style.minWidth === `${402 - 24}px`);

// ── 11. TEST REQUIRED NODE WIDTH & SIDE-BY-SIDE CONTAINMENT ──
const sideBySideTab = {
  sections: [
    { header: "Z1", width: "50%", controls: [{ name: "A", x: 16, w: 256 }] }, // reqW = 16+256+32 = 304
    { header: "Z2", width: "50%", controls: [{ name: "B", x: 16, w: 304 }] }  // reqW = 16+304+32 = 352
  ]
};
const testNode = {
  properties: {
    ui_layout: {
      schema: 2,
      scale: 1,
      tabs: [sideBySideTab]
    }
  }
};
// 304 + 352 + 12 (gap) + 36 (card pad) = 704
const reqW = M.requiredNodeWidth(testNode, null);
t("requiredNodeWidth sums side-by-side zones in row plus gaps and card padding", reqW === 704);

// Test LiteGraph onResize clamping
testNode.widgets = [];
testNode.flags = {};
testNode.size = [800, 400];
testNode.setSize = function(s) { this.size = s; };
testNode.addDOMWidget = (name, type, el, opts) => {
  const w = { name, type, element: el, ...opts };
  testNode.widgets.push(w);
  return w;
};
const testSt = M.attach(testNode);
// Attempt to crush node below requiredNodeWidth
testNode.onResize([400, 300]);
t("onResize clamps node width to requiredNodeWidth (prevents crushing zones)", testNode.size[0] >= 704);

// ── 12. TEST CARD UI SCALE (layout.scale) ──
testNode.properties.ui_layout.scale = 1.3;
testSt.refresh();
const cardEl = testNode.__legoHost.querySelector(".lego-card");
t("card applies layout.scale via CSS zoom", String(cardEl.style.zoom) === "1.3" || parseFloat(cardEl.style.zoom) === 1.3);
t("card applies layout.scale via CSS variable --lego-ui-scale", cardEl.style.getPropertyValue("--lego-ui-scale") === "1.3");
const scaledReqW = M.requiredNodeWidth(testNode, testNode.__legoHost);
t("requiredNodeWidth scales proportionally with layout.scale", scaledReqW === Math.ceil(704 * 1.3));
const scaleBtnEl = testNode.__legoHost.querySelector(".lego-scale-btn");
t("header contains UI Scale button showing 130%", scaleBtnEl && scaleBtnEl.textContent === "130%");

console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
