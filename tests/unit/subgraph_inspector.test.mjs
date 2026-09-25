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

let openedEventFired = false;
fakeCanvas.canvas.addEventListener("subgraph-opened", (e) => {
  openedEventFired = true;
});

let closedEventFired = false;
fakeCanvas.canvas.addEventListener("subgraph-closed", (e) => {
  closedEventFired = true;
});

M.enterSuper(sn);

const inner = M.ssInnerGraph(sn);
t("enterSuper sets inner.isRootGraph = false", inner && inner.isRootGraph === false);
t("enterSuper sets canvas.subgraph = inner", fakeCanvas.subgraph === inner);
t("enterSuper sets canvas.graph = inner", fakeCanvas.graph === inner);
t("enterSuper fires subgraph-opened event", openedEventFired);
t("enterSuper calls updateActiveGraph", activeGraphUpdated);

activeGraphUpdated = false;
M.exitSuper(1);

t("exitSuper restores root graph", fakeCanvas.graph === globalThis.__app.graph);
t("exitSuper clears canvas.subgraph", fakeCanvas.subgraph === undefined);
t("exitSuper fires subgraph-closed event", closedEventFired);
t("exitSuper calls updateActiveGraph", activeGraphUpdated);

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
}

console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
