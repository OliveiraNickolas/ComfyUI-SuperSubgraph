import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
for (const k of ["window","document","HTMLElement","Event","MouseEvent","KeyboardEvent","MutationObserver","getComputedStyle","URLSearchParams"]) globalThis[k] = dom.window[k] ?? globalThis[k];
globalThis.PointerEvent = dom.window.MouseEvent;
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.cancelAnimationFrame = (h) => clearTimeout(h);
globalThis.ResizeObserver = class { observe(){} disconnect(){} };
const listeners = {};
const canvasEl = document.createElement("canvas"); document.body.append(canvasEl);
canvasEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 });
globalThis.__app = { canvas: { canvas: canvasEl, ds: { scale: 1, offset: [0, 0] }, setDirty(){}, openSubgraph(){}, closeSubgraph(){} }, graph: { _nodes: [], setDirtyCanvas(){} } };
globalThis.__api = { apiURL: (p) => p, fetchApi: async () => ({ ok: false }), addEventListener: (n, f) => (listeners[n] ||= []).push(f) };
const M = await import("../.build/mod.mjs");
await globalThis.__ext.setup();
let ok = 0, fail = 0;
const t = (name, cond) => { cond ? ok++ : fail++; console.log(cond ? "PASS" : "FAIL", name); };
const click = (e) => e.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

const inner = [{ id: 3, type: "PreviewImage", title: "Preview A", widgets: [], pos: [100, 100], size: [200, 200] },
               { id: 4, type: "SaveImage", title: "Save B", widgets: [], pos: [400, 100], size: [200, 200] }];
const widgets = [];
const host = { id: 10, type: "Sub", title: "Sub", size: [700, 400], properties: {}, widgets, graph: globalThis.__app.graph, flags: {}, subgraph: { _nodes: inner },
  addDOMWidget(n, ty, el) { const w = { name: n, element: el }; widgets.push(w); document.body.append(el); return w; }, setSize(s){ this.size = s; }, computeSize(){ return [1,1]; } };
globalThis.__app.graph._nodes.push(host);
host.properties.ui_layout = { schema: 2, activeTab: 0, tabs: [{ name: "O", sections: [{ header: "O", controls: [{ name: "ImageOut1", kind: "outimage", label: "", x: 16, y: 16, w: 256, h: 224 }] }] }] };
const st = M.attach(host); st.edit = true; st.refresh();
const ctrl = host.properties.ui_layout.tabs[0].sections[0].controls[0];

// botão de link igual ao dos outros elementos
const link = host.__legoHost.querySelector(".lego-row.is-output .lego-floating-actions .btn-link");
t("link button has same classes as others", link && link.classList.contains("lego-iconbtn") && link.classList.contains("is-bound"));
click(link);
const dlg = document.querySelector(".lego-comfy-dialog");
t("link opens the shared search dialog", !!dlg && !document.querySelector(".lego-list-pop"));
const titles = [...dlg.querySelectorAll(".lego-comfy-node-row .lego-comfy-node-title")].map(e => e.textContent);
t("dialog lists auto + nodes " + JSON.stringify(titles), titles[0].startsWith("Auto") && titles.includes("Preview A") && titles.includes("Save B"));
t("dialog has Target Picker", !!dlg.querySelector(".lego-comfy-target-picker-btn"));
const rowB = [...dlg.querySelectorAll(".lego-comfy-node-row")].find(r => r.textContent.includes("Save B"));
rowB.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
t("picking node sets source", ctrl.source === "4" && !document.querySelector(".lego-comfy-dialog"));

// voltar para Auto pelo inspetor (linha Events com o mesmo botão de função)
st.selectedName = "ImageOut1"; st.selectedNames = new Set(["ImageOut1"]);
M.renderObjectInspector(host, st, true);
const fn = document.querySelector(".lego-oi .lego-oi-fn");
t("inspector uses the same function button", fn && fn.classList.contains("bound") && fn.textContent.includes("Save B"));
click(fn);
const autoRow = [...document.querySelectorAll(".lego-comfy-dialog .lego-comfy-node-row")][0];
autoRow.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
t("choosing Auto clears source", ctrl.source === undefined);

// Target Picker no canvas: clicar no nó escolhe o nó
click(host.__legoHost.querySelector(".lego-row.is-output .btn-link"));
click(document.querySelector(".lego-comfy-target-picker-btn"));
t("picker hud says output", document.querySelector(".lego-picker-hud").textContent.includes("output"));
globalThis.__app.canvas.getCurrentGraph = () => ({ _nodes: inner });
canvasEl.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, clientX: 150, clientY: 150 }));
t("canvas click picks the node directly", ctrl.source === "3" && !document.querySelector(".lego-node-picker-popup"));

// undo volta a fonte anterior
M.doUndo(host, st);
t("undo restores previous source", host.properties.ui_layout.tabs[0].sections[0].controls[0].source === undefined);

console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
