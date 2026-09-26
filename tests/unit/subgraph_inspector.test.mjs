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
  t("control inspector shows Caption Width row", ctrlRows.includes("Caption Width"));
  t("control inspector has Detach as Label button", [...oi.querySelectorAll("button")].some(b => b.textContent.includes("Detach as Label")));
  t("control inspector does NOT show Header row", !ctrlRows.includes("Header"));

  // ── 3b. TEST BUTTON FORMATTING & GROUP HEADER CENTERING ──
  // Group header centering
  const hGroupCtrl = node.properties.ui_layout.tabs[0].sections[0].controls.find(c => c.name === "HGroup4");
  hGroupCtrl.header = "Parameters Group";
  hGroupCtrl.labelPos = "center";
  st.refresh();
  const segHeaderEl = node.__legoHost.querySelector("[data-name='HGroup4'] .lego-seg-header");
  t("centered group header has textAlign center", segHeaderEl && segHeaderEl.style.textAlign === "center");

  // Button control with full label formatting
  node.properties.ui_layout.tabs[0].sections[0].controls.push({
    name: "BtnAction",
    kind: "button",
    text: "Execute Run",
    bold: true,
    fontSize: 13,
    align: "center",
    fontColor: "#60a5fa",
    x: 20, y: 200, w: 180, h: 32
  });
  st.refresh();
  st.selectedName = "BtnAction";
  st.selectedNames = new Set(["BtnAction"]);
  M.renderObjectInspector(node, st, true);

  const btnRows = [...oi.querySelectorAll(".lego-oi-row .lego-oi-key")].map((k) => k.textContent);
  t("button inspector shows Button Text row", btnRows.includes("Button Text"));
  t("button inspector shows Style row (bold/italic/align)", btnRows.includes("Style"));
  t("button inspector shows Font row", btnRows.includes("Font"));
  t("button inspector shows Font Color row", btnRows.includes("Font Color"));
  t("button inspector does NOT show Caption row", !btnRows.includes("Caption"));
  t("button inspector does NOT show Caption Position row", !btnRows.includes("Caption Position"));
  t("button inspector does NOT show Caption Width row", !btnRows.includes("Caption Width"));

  const btnEl = node.__legoHost.querySelector("[data-name='BtnAction'] button.lego-btn-ctrl");
  t("button rendered with .lego-btn-ctrl", !!btnEl);
  t("button text formatting applied (bold)", btnEl && btnEl.style.fontWeight === "700");
  t("button text formatting applied (font size 13px)", btnEl && btnEl.style.fontSize === "13px");
  t("button text formatting applied (color)", btnEl && btnEl.style.color === "rgb(96, 165, 250)");

  // Test button tactile click animation feedback
  btnEl.dispatchEvent(new globalThis.PointerEvent("pointerdown", { bubbles: true }));
  t("pointerdown adds .lego-btn-clicked class", btnEl.classList.contains("lego-btn-clicked"));
  btnEl.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  t("click retains .lego-btn-clicked transient class", btnEl.classList.contains("lego-btn-clicked"));

  // ── 4. TEST SIDE-BY-SIDE ZONE LAYOUT & WIDTH CONTROLS ──
  node.properties.ui_layout.tabs[0].sections = [
    { header: "ZONE A", width: "50%", controls: [] },
    { header: "ZONE B", width: "50%", controls: [] }
  ];
  st.refresh();

  const secEls = node.__legoHost.querySelectorAll(".lego-sec");
  t("renders two zone elements", secEls.length === 2);

  const colEls = node.__legoHost.querySelectorAll(".lego-col");
  t("renders two column elements in lego-cols-row", colEls.length === 2);
  const colA = colEls[0];
  const colB = colEls[1];
  // A porcentagem é a fatia exata da largura útil (sem o vão de 12px entre colunas).
  const half = (v) => /calc\(\(100% - 12px\) \* 0\.5\)|calc\(0\.5 \* \(100% - 12px\)\)/.test(v);
  t("col A width is its share of the usable row width", half(colA.style.width));
  t("col A flex basis matches the width", half(colA.style.flex));
  // A última coluna preenche o resto da linha (bordas direitas alinhadas).
  t("last column fills the rest of the row", colB.style.flex.startsWith("1 1") && !colB.style.width);
  t("zones inside columns have 100% width", secEls[0].style.width === "100%" && secEls[1].style.width === "100%");

  // Stacking: 2 zones in left column, 1 zone in right column
  node.properties.ui_layout.tabs[0].sections = [
    { header: "LEFT TOP", width: "50%", col: 0, controls: [] },
    { header: "LEFT BOTTOM", width: "50%", col: 0, controls: [] },
    { header: "RIGHT STRETCH", width: "50%", col: 1, controls: [] }
  ];
  st.refresh();

  const stackedSecEls = node.__legoHost.querySelectorAll(".lego-sec");
  t("renders three zones with stacked layout", stackedSecEls.length === 3);
  const stackedCols = node.__legoHost.querySelectorAll(".lego-col");
  t("renders two columns for 3 zones", stackedCols.length === 2);
  t("col 0 contains 2 zones", stackedCols[0].querySelectorAll(".lego-sec").length === 2);
  t("col 1 contains 1 zone", stackedCols[1].querySelectorAll(".lego-sec").length === 1);
  const rightStretchSec = stackedCols[1].querySelector(".lego-sec");
  t("single zone in column has stretch class", rightStretchSec.classList.contains("lego-sec-stretch"));

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
// Max extent 50 + 320 = 370; right margin = left margin (minX 20) + 8 = 398px
t("sectionRequiredWidth uses a right margin equal to the left one", M.sectionRequiredWidth(secWithControls) === 398);

const secWithSubTabs = {
  header: "SUBTABS",
  tabs: [
    { name: "T1", controls: [{ name: "S1", x: 10, w: 250 }] },
    { name: "T2", controls: [{ name: "S2", x: 30, w: 400 }] }
  ]
};
// Subtab T2 has 30 + 400 = 430, + minX 10 + 8 = 448px
t("sectionRequiredWidth checks sub-tabs controls", M.sectionRequiredWidth(secWithSubTabs) === 448);

// Check top pivot and adaptive containment
node.properties.ui_layout.tabs[0].sections = [
  { header: "PIVOT", width: "100%", controls: secWithControls.controls },
  { header: "SUB", width: "50%", controls: [{ name: "S1", x: 10, w: 50 }] }
];
st.refresh();
t("top pivot sets requiredNodeWidth baseline", M.requiredNodeWidth(node, node) >= 398);
const renderedCtrlsBox = node.__legoHost.querySelector(".lego-sec-controls");
t("controls box has safe containment without rigid minWidth", renderedCtrlsBox.style.minWidth === "0px" || renderedCtrlsBox.style.minWidth === "0");

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
// 296 + 344 + 12 (gap) + 36 (card pad) = 688
const reqW = M.requiredNodeWidth(testNode, null);
t("requiredNodeWidth sums side-by-side zones in row plus gaps and card padding", reqW === 688);

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

// ── 13. TEST TOP PIVOT, COLUMN GROUPING & STACKING ──
const complexSections = [
  { header: "MEDIA PIVOT", width: "100%", controls: [{ name: "P", x: 20, w: 500 }] },
  { header: "COL 1 TOP", width: "50%", col: 0, controls: [] },
  { header: "COL 1 BOTTOM", width: "50%", col: 0, controls: [] },
  { header: "COL 2 STRETCH", width: "50%", col: 1, controls: [] }
];
const groups = M.groupSectionsLayout(complexSections);
t("groupSectionsLayout creates full and column groups", groups.length === 2);
t("group 0 is full width pivot", groups[0].type === "full" && groups[0].sec.header === "MEDIA PIVOT");
t("group 1 is columns row", groups[1].type === "columns" && groups[1].columns.length === 2);
t("column 0 has 2 stacked entries", groups[1].columns[0].entries.length === 2);
t("column 1 has 1 entry", groups[1].columns[1].entries.length === 1);

// Test addZoneBelow on a column zone
const origPrompt = globalThis.prompt;
globalThis.prompt = () => "NEW STACKED ZONE";
const curTabObj = { sections: [...complexSections] };
const addedBelow = M.addZoneBelow({ host: testNode, curTab: curTabObj, section: curTabObj.sections[3] });
t("addZoneBelow stacks in same column", addedBelow.col === 1 && addedBelow.width === "50%");
t("addZoneBelow inserts directly after target", curTabObj.sections[4].header === "NEW STACKED ZONE");

// Test addZoneBeside on a column zone
globalThis.prompt = () => "NEW COLUMN ZONE";
const addedBeside = M.addZoneBeside({ host: testNode, curTab: curTabObj, section: curTabObj.sections[1] });
t("addZoneBeside creates adjacent column", addedBeside.col === 1);
t("addZoneBeside rebalances column widths to 33.3%", addedBeside.width === "33.3%");
globalThis.prompt = origPrompt;

// Test requiredNodeWidth pivots on first row only
const pivotOnlyNode = {
  properties: {
    ui_layout: {
      schema: 2,
      scale: 1,
      tabs: [{
        sections: [
          { header: "TOP PIVOT", width: "100%", controls: [{ name: "P", x: 20, w: 650 }] }, // 650 + 20 + 32 = 702 (> MIN_W 600)
          { header: "HUGE SUB 1", width: "50%", col: 0, controls: [{ name: "S1", x: 20, w: 800 }] },
          { header: "HUGE SUB 2", width: "50%", col: 1, controls: [{ name: "S2", x: 20, w: 800 }] }
        ]
      }]
    }
  }
};
const pReqW = M.requiredNodeWidth(pivotOnlyNode, null);
t("requiredNodeWidth pivots strictly on first row without sub-row inflation", pReqW === 698 + 36);

// Test sameUrl normalization
const urlA = "/api/view?filename=nothing.png&type=input&subfolder=";
const urlB = "http://127.0.0.1:8188/api/view?filename=nothing.png&type=input&subfolder=";
t("sameUrl identifies relative and absolute ComfyUI URLs as identical", M.sameUrl(urlA, urlB));
t("sameUrl returns true for empty/null comparisons", M.sameUrl("", null) && M.sameUrl(null, null));
t("sameUrl returns false for genuinely different URLs", !M.sameUrl(urlA, "/api/view?filename=other.png"));

// Test MEDIA_ELEMENT_CACHE and persistent DOM element reuse across card refreshes
const mediaHostNode = {
  id: 42,
  title: "MediaHost",
  size: [700, 400],
  properties: {
    ui_layout: {
      schema: 2,
      tabs: [{
        name: "Tab 1",
        sections: [{
          header: "IMAGE SECTION",
          width: "100%",
          controls: [{
            name: "ImageCtrl1",
            kind: "media",
            bind: "w_img",
            w: 200,
            h: 120
          }]
        }]
      }]
    }
  },
  widgets: [{
    name: "w_img",
    type: "combo",
    value: "test_image.png",
    options: { values: ["test_image.png"] }
  }],
  addDOMWidget(name, type, element) {
    this.domElement = element;
    return { name, type, element };
  },
  setSize() {},
  computeSize() { return [700, 400]; }
};

const mediaState = M.attach(mediaHostNode);
const firstImgEl = mediaHostNode.domElement.querySelector(".lego-media-thumb img");
const firstPhEl = mediaHostNode.domElement.querySelector(".lego-media-thumb div");
t("media control renders img element", !!firstImgEl);
t("initial img element has display block (no initial flash)", firstImgEl?.style?.display === "block");
t("initial placeholder has display none when image is present", firstPhEl?.style?.display === "none");

// Now trigger state.refresh() as happens on every switch/tab interaction
mediaState.refresh();
const refreshedImgEl = mediaHostNode.domElement.querySelector(".lego-media-thumb img");
t("MEDIA_ELEMENT_CACHE reuses the exact same img DOM element across card refreshes", refreshedImgEl === firstImgEl);
t("reused img element maintains display block without placeholder flash", refreshedImgEl?.style?.display === "block");

// Testes de feedback visual em tempo real, arestas e linhas de nível
const testBody = document.createElement("div");
testBody.className = "lego-body";
document.body.append(testBody);

M.renderZoneGuides(testBody, {
  vLine: { x: 300, snap: true, badgeText: "⚡ 50% / 50% (Alinhado)", badgeY: 40 },
  hLine: { y: 220, snap: false, badgeText: "↕ 220px", badgeX: 150 }
});

const guideOverlay = testBody.querySelector(".lego-guide-overlay");
t("renderZoneGuides creates .lego-guide-overlay", !!guideOverlay);
const vLineEl = guideOverlay?.querySelector(".lego-level-line-v");
t("renderZoneGuides renders vertical level line", !!vLineEl && vLineEl.style.left === "300px");
t("vertical level line has snap class", vLineEl?.classList?.contains("snap"));
const hLineEl = guideOverlay?.querySelector(".lego-level-line-h");
t("renderZoneGuides renders horizontal level line", !!hLineEl && hLineEl.style.top === "220px");
t("horizontal level line does not have snap class when snap is false", !hLineEl?.classList?.contains("snap"));

const badges = guideOverlay?.querySelectorAll(".lego-guide-badge");
t("renderZoneGuides renders badges for lines", badges?.length === 2);
t("badge text matches snap feedback", badges?.[0]?.textContent === "⚡ 50% / 50% (Alinhado)");

M.clearZoneGuides(testBody);
t("clearZoneGuides removes the overlay", !testBody.querySelector(".lego-guide-overlay"));

// Teste de divisores de coluna (lego-col-divider) em modo de edição
const colNode = {
  id: "node_col_test",
  properties: {
    ui_layout: {
      schema: 2,
      tabs: [{
        name: "Tab 1",
        sections: [
          { header: "ZONE A", width: "50%", col: 0, controls: [] },
          { header: "ZONE B", width: "50%", col: 1, controls: [] }
        ]
      }]
    }
  },
  widgets: [],
  addDOMWidget(name, type, element) {
    this.domElement = element;
    return { name, type, element };
  },
  setSize() {},
  computeSize() { return [700, 400]; }
};

const colState = M.attach(colNode);
colState.edit = true;
colState.refresh();

const colDivider = colNode.domElement.querySelector(".lego-col-divider");
t("edit mode renders .lego-col-divider between columns", !!colDivider);
const secResizerW = colNode.domElement.querySelector(".lego-sec-resizer");
t("section renders width edge resizer in edit mode", !!secResizerW);
const secResizerH = colNode.domElement.querySelector(".lego-sec-resizer-bottom");
t("section renders height edge resizer in edit mode", !!secResizerH);

const colEls = colNode.domElement.querySelectorAll(".lego-col");
t("colEl has __colEntries attached", !!colEls[0]?.__colEntries && colEls[0].__colEntries.length === 1);
t("colEl has correct section in __colEntries", colEls[0]?.__colEntries?.[0]?.sec?.header === "ZONE A");

// ── 15. TEST MEDIA CENSORSHIP & HIDE PREVIEW ──
const censorTestNode = {
  id: 301,
  title: "MediaNode",
  size: [400, 300],
  properties: {
    ui_layout: {
      schema: 2,
      activeTab: 0,
      tabs: [{
        sections: [{
          header: "INPUTS",
          controls: [{
            name: "ImageCtrl",
            kind: "media",
            bind: "image_input",
            hidePreview: true,
            w: 180,
            h: 120
          }]
        }]
      }]
    }
  },
  widgets: [{
    name: "image_input",
    type: "combo",
    value: "test.png",
    options: { values: ["test.png", "other.png"] }
  }],
  flags: {},
  setSize() {},
  addDOMWidget(name, type, el, opts) {
    this.domElement = el;
    const w = { name, type, element: el, ...opts };
    this.widgets.push(w);
    return w;
  }
};

const censorTestState = M.attach(censorTestNode);
censorTestState.refresh();

const thumbEl = censorTestNode.domElement.querySelector(".lego-media-thumb");
t("censored media control has is-censored class", thumbEl?.classList.contains("is-censored"));
const censorOverlay = censorTestNode.domElement.querySelector(".lego-media-censor-overlay");
t("censored media control renders censor overlay", !!censorOverlay);
const hideBtn = censorTestNode.domElement.querySelector(".lego-media-hide-btn");
t("media control renders hide toggle button", !!hideBtn);

// Click hide toggle button
hideBtn.click();
t("clicking hide toggle unhides preview", !thumbEl.classList.contains("is-censored"));

// ── 16. TEST MODEL PREVIEW OVERRIDE KJ & NATIVE SUBGRAPH ENTRY ──
const kjWidget = {
  name: "preview",
  type: "kj_preview",
  element: dom.window.document.createElement("div")
};
const descKJ = M.describeWidget(kjWidget);
t("describeWidget maps kj_preview to preview_override", descKJ.kind === "preview_override");

// Test that cardHeight does not fluctuate with canvas zoom (getBoundingClientRect scale)
const mockHost = {
  properties: { ui_layout: { scale: 1 } },
  firstElementChild: {
    scrollHeight: 400,
    offsetHeight: 400,
    getBoundingClientRect: () => ({ height: 800 }) // simulated 2x canvas zoom
  }
};
const hZoom2x = M.cardHeight(mockHost);
mockHost.firstElementChild.getBoundingClientRect = () => ({ height: 200 }); // simulated 0.5x zoom
const hZoomHalf = M.cardHeight(mockHost);
t("cardHeight is zoom-independent (does not scale with getBoundingClientRect)", hZoom2x === 400 && hZoomHalf === 400);

// Test ModelPreviewOverrideKJ rendering on SuperSubgraph card
const kjRoot = dom.window.document.createElement("div");
kjRoot.className = "kj-pov-root";
const kjTestNode = {
  id: 302,
  title: "SuperSubgraph",
  type: "SuperSubgraph",
  size: [500, 600],
  properties: {
    ui_layout: {
      schema: 2,
      activeTab: 0,
      tabs: [{
        sections: [{
          header: "PREVIEW",
          controls: [{
            name: "Input1",
            kind: "preview_override",
            bind: "preview",
            w: 320,
            h: 240
          }]
        }]
      }]
    }
  },
  widgets: [{
    name: "preview",
    type: "kj_preview",
    element: kjRoot
  }],
  flags: {},
  setSize() {},
  addDOMWidget(name, type, el, opts) {
    this.domElement = el;
    const w = { name, type, element: el, ...opts };
    this.widgets.push(w);
    return w;
  }
};
const kjTestState = M.attach(kjTestNode);
kjTestState.refresh();

const povBox = kjTestNode.domElement.querySelector(".lego-preview-override-box");
t("preview_override renders .lego-preview-override-box", !!povBox);
t("preview_override mounts w.element", povBox?.contains(kjRoot));
t("preview_override does not render text input", !kjTestNode.domElement.querySelector(".lego-row.is-preview-override input.lego-in"));

// Interface desenhada no canvas (botões do AllmaGenerate, painel do Resolution Master)
const drawn = { name: "preset_actions", type: "allma_button_row", value: "", serialize: false, draw() {}, mouse() {}, computeSize: (w) => [w, 26] };
const rmPanel = { name: "resolution_master_ui", type: "resolution_master_ui", value: null, serialize: false, draw() {} };
t("describeWidget maps custom canvas widget to canvas_widget", M.describeWidget(drawn).kind === "canvas_widget");
t("describeWidget maps resolution_master_ui to node_ui", M.describeWidget(rmPanel).kind === "node_ui");
t("standard combo with draw() is not mirrored", M.describeWidget({ name: "c", type: "combo", value: "a", options: { values: ["a"] }, draw() {} }).kind === "combo");

const mirrorNode = {
  id: 303, title: "SuperSubgraph", type: "SuperSubgraph", size: [500, 700], flags: {},
  properties: { ui_layout: { schema: 2, activeTab: 0, tabs: [{ sections: [{ header: "M", controls: [
    // promoções antigas caíam em "text": o cartão deve migrar para o espelho
    { name: "Btns", kind: "text", bind: "preset_actions", label: "preset", x: 16, y: 16, w: 320, h: 32 },
    { name: "Panel", kind: "text", bind: "resolution_master_ui", label: "rm", x: 16, y: 64, w: 200, h: 32 },
  ] }] }] } },
  widgets: [drawn, rmPanel],
  setSize() {},
  addDOMWidget(name, type, el, opts) { this.domElement = el; const w = { name, type, element: el, ...opts }; this.widgets.push(w); return w; },
};
M.attach(mirrorNode).refresh();
const mirrorCtrls = mirrorNode.properties.ui_layout.tabs[0].sections[0].controls;
t("canvas widget renders as a mirror (no text input)", mirrorNode.domElement.querySelectorAll(".lego-canvas-mirror.is-widget canvas").length === 1 && !mirrorNode.domElement.querySelector("input.lego-in"));
t("node panel renders as a node mirror", mirrorNode.domElement.querySelectorAll(".lego-canvas-mirror.is-node canvas").length === 1);
t("old text promotions migrate to mirror kinds", mirrorCtrls[0].kind === "canvas_widget" && mirrorCtrls[1].kind === "node_ui" && mirrorCtrls[1].h >= 320);

// Classificação de widgets de extensões (varredura de todos os nós instalados)
const domEl = dom.window.document.createElement("div");
t("DOM widget panel maps to dom_widget", M.describeWidget({ name: "loras", type: "custom", value: [], element: domEl, draw() {} }).kind === "dom_widget");
t("DOM textarea stays textarea", M.describeWidget({ name: "text", type: "customtext", value: "", element: dom.window.document.createElement("textarea"), draw() {} }).kind === "textarea");
t("colorcode maps to color", M.describeWidget({ name: "c", type: "COLORCODE", value: "#fff", draw() {}, mouse() {} }).kind === "color");
t("VHS annotated number stays a number (not mirrored)", ["number", "slider"].includes(M.describeWidget({ name: "n", type: "VHS.ANNOTATED", value: 3, options: {}, draw() {}, mouse() {} }).kind));
t("hidden-type widgets are not promotable", !M.usable({ name: "x", type: "easyhidden", value: 1 }) && !M.usable({ name: "y", type: "h3frhidden", value: 1 }) && !M.usable({ name: "z", type: "number", value: 1, hidden: true }));
t("object widget without UI is not promotable", !M.usable({ name: "crop", type: "imagecrop", value: { x: 1 } }));
t("numbers show the widget precision like native", M.fmtNum(8, M.numDecimals({ precision: 1 }, 0.1, false)) === "8.0" && M.fmtNum(1, M.numDecimals({}, 0.01, false)) === "1.00" && M.fmtNum(20.4, 0) === "20");

// Ligação quebrada no grafo de dentro (entrada aponta para link inexistente)
{
  const g = { links: new Map([[5, { id: 5, origin_id: 1, origin_slot: 0, target_id: 2, target_slot: 0 }]]),
    _nodes: [
      { id: 1, outputs: [{ links: [5, 99] }] },
      { id: 2, inputs: [{ name: "images", link: 5 }, { name: "mask", link: 20131 }] },
    ] };
  g.getNodeById = (id) => g._nodes.find((n) => String(n.id) === String(id));
  const fixed = M.repairInnerLinks(g, { title: "T" });
  t("repairInnerLinks drops dangling input/output links and keeps good ones",
    fixed === 2 && g._nodes[1].inputs[1].link === null && g._nodes[1].inputs[0].link === 5 && g._nodes[0].outputs[0].links.join() === "5");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

M.enterSuper(sn);
t("enterSuper sets inner graph on canvas", fakeCanvas.graph === M.ssInnerGraph(sn));
t("inner graph id is a valid UUID", UUID_RE.test(fakeCanvas.graph?.id));
t("canvas.subgraph is kept undefined to prevent native arrange crash", fakeCanvas.subgraph === undefined);

M.exitSuper(1);

console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
