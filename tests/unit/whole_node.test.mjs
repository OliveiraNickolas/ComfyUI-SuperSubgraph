import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
for (const k of ["window","document","HTMLElement","Event","MouseEvent","KeyboardEvent","MutationObserver","getComputedStyle","URLSearchParams"]) globalThis[k] = dom.window[k] ?? globalThis[k];
globalThis.PointerEvent = dom.window.MouseEvent;
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.cancelAnimationFrame = (h) => clearTimeout(h);
globalThis.ResizeObserver = class { observe(){} disconnect(){} };
const canvasEl = document.createElement("canvas"); document.body.append(canvasEl);
canvasEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 });
const lora = { id: 12, type: "LoraLoader", title: "Load LoRA", pos: [100, 100], size: [300, 120], widgets: [
  { name: "lora_name", type: "combo", value: "a.safetensors", options: { values: ["a.safetensors"] } },
  { name: "strength_model", type: "number", value: 1, options: { min: -100, max: 100, step: 0.1 } },
  { name: "strength_clip", type: "number", value: 1, options: { min: -100, max: 100, step: 0.1 } } ] };
globalThis.__app = { canvas: { canvas: canvasEl, ds: { scale: 1, offset: [0, 0] }, setDirty(){}, openSubgraph(){}, closeSubgraph(){}, getCurrentGraph: () => ({ _nodes: [lora] }) }, graph: { _nodes: [], setDirtyCanvas(){} } };
globalThis.__api = { apiURL: p => p, fetchApi: async () => ({ ok: false }), addEventListener(){} };
const M = await import("../.build/mod.mjs");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const click = (e) => e.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
const widgets = [];
const host = { id: 1, title: "T", size: [1240, 400], properties: {}, widgets, graph: globalThis.__app.graph, flags: {}, subgraph: { _nodes: [lora] },
  addDOMWidget(n, ty, el) { const w = { name: n, element: el }; widgets.push(w); document.body.append(el); return w; }, setSize(s){ this.size = s; }, computeSize(){ return [1,1]; } };
host.properties.ui_layout = { schema: 2, activeTab: 0, tabs: [{ name: "A", sections: [{ header: "Z", controls: [
  { name: "HGroup1", kind: "segment", x: 16, y: 300, w: 400, h: 48, items: [] } ] }] }] };
const st = M.attach(host); st.edit = true; st.refresh();
const sec = host.properties.ui_layout.tabs[0].sections[0];

// 1) duplo clique na zona -> Target Picker -> nó -> Whole node (Row)
M.openInspector({ host, layout: host.properties.ui_layout, section: sec, state: st, initialPos: { x: 32, y: 32 } });
click(document.querySelector(".lego-comfy-target-picker-btn"));
canvasEl.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, clientX: 150, clientY: 150 }));
// fluxo novo: o clique marca o nó inteiro e o Promote cria tudo
t("picker is multi-select: click picks the node, Promote (1) enabled", document.querySelector(".lego-picker-promote-btn") && !document.querySelector(".lego-picker-promote-btn").disabled && /Promote \(1\)/.test(document.querySelector(".lego-picker-promote-btn").textContent));
click(document.querySelector(".lego-picker-promote-btn"));
const g = sec.controls.find(c => c.label === "Load LoRA");
t("whole node row inserted from picker: " + g?.items.map(i => i.kind).join(), g && g.kind === "segment" && g.items.map(i => i.kind).join() === "label,combo,label,number,label,number");
t("placed near the double-click spot", g && g.x === 32 && g.y === 32);
t("dialog and popup closed", !document.querySelector(".lego-comfy-dialog") && !document.querySelector(".lego-node-picker-popup"));

// 2) dentro de um grupo existente (+ Add do grupo): entram os itens, sem grupo aninhado
const hg = sec.controls.find(c => c.name === "HGroup1");
M.openInspector({ host, layout: host.properties.ui_layout, section: sec, state: st, segmentCtrl: hg });
click(document.querySelector(".lego-comfy-target-picker-btn"));
canvasEl.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, clientX: 150, clientY: 150 }));
click(document.querySelector(".lego-picker-promote-btn"));
t("in a group, whole node adds its items (no nested group): " + hg.items.map(i => i.kind).join(), hg.items.length === 6 && !hg.items.some(i => i.kind === "segment" || i.kind === "vsegment"));

// 3) ligando um componente existente: sem opção de nó inteiro
M.openInspector({ host, layout: host.properties.ui_layout, section: sec, state: st, ctrl: { kind: "combo", bind: "" }, targetCallback: () => {} });
click(document.querySelector(".lego-comfy-target-picker-btn"));
canvasEl.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, clientX: 150, clientY: 150 }));
t("rebinding a single component keeps the single-pick popup (no Promote)", !!document.querySelector(".lego-node-picker-popup") && !document.querySelector(".lego-picker-promote-btn"));

// 4) desfazer
M.doUndo(host, st);
t("undo removes the items added to the group", host.properties.ui_layout.tabs[0].sections[0].controls.find(c => c.name === "HGroup1").items.length === 0);
console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
