// Atalhos de usabilidade: cartão vazio com "Promote parameters", 2 cliques fora
// da edição e componente com parâmetro sumido (Rebind / Remove).
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
for (const k of ["window","document","HTMLElement","Event","MouseEvent","KeyboardEvent","MutationObserver","getComputedStyle","URLSearchParams"]) globalThis[k] = dom.window[k] ?? globalThis[k];
globalThis.PointerEvent = dom.window.MouseEvent;
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.cancelAnimationFrame = (h) => clearTimeout(h);
globalThis.ResizeObserver = class { observe(){} disconnect(){} };
const canvasEl = document.createElement("canvas"); document.body.append(canvasEl);
canvasEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 });
const ks = { id: 5, type: "KSampler", title: "KSampler", pos: [0, 0], size: [300, 200], widgets: [
  { name: "steps", type: "number", value: 20, options: { min: 1, max: 100, step: 10 } } ] };
globalThis.__app = { canvas: { canvas: canvasEl, ds: { scale: 1, offset: [0, 0] }, setDirty(){}, openSubgraph(){}, closeSubgraph(){}, getCurrentGraph: () => ({ _nodes: [ks] }) }, graph: { _nodes: [], setDirtyCanvas(){} } };
globalThis.__api = { apiURL: p => p, fetchApi: async () => ({ ok: false }), addEventListener(){} };
const M = await import("../.build/mod.mjs");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const fire = (e, type) => e.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true }));
const key = (k) => window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mkHost(id, controls) {
  const widgets = [];
  const host = { id, title: "T", size: [800, 400], properties: {}, widgets, graph: globalThis.__app.graph, flags: {}, subgraph: { _nodes: [ks] },
    addDOMWidget(n, ty, el) { const w = { name: n, element: el }; widgets.push(w); document.body.append(el); return w; }, setSize(s){ this.size = s; }, computeSize(){ return [1,1]; } };
  host.properties.ui_layout = { schema: 2, activeTab: 0, tabs: [{ name: "Main", sections: [{ header: "Z", controls }] }] };
  const st = M.attach(host);
  return { host, st, card: host.__legoHost };
}

// 1) cartão vazio fora da edição: botão "Promote parameters"
const A = mkHost(1, []);
const cta = A.card.querySelector(".lego-promote-cta");
t("empty zone in view mode shows 'Promote parameters'", !!cta && !A.st.edit);
fire(cta, "click");
t("clicking it enters edit mode and opens the Target Picker directly",
  A.st.edit && !!document.querySelector(".lego-picker-hud .lego-picker-promote-btn") && document.querySelector(".lego-comfy-backdrop")?.style.display === "none");
key("Escape");
t("Esc on the picker closes everything (no dialog left behind)", !document.querySelector(".lego-picker-hud") && !document.querySelector(".lego-comfy-backdrop"));

// 2) 2 cliques na zona vazia fora da edição
A.st.edit = false; A.st.refresh();
const zone = A.card.querySelector(".lego-sec-controls");
fire(zone, "dblclick");
t("double-click in view mode enters edit mode and opens the component search", A.st.edit && !!document.querySelector(".lego-comfy-backdrop"));
document.querySelector(".lego-comfy-backdrop")?.remove();

// 3) componente com parâmetro sumido
const B = mkHost(2, [
  { name: "Slider1", kind: "slider", label: "Gone", bind: "999/nope", x: 16, y: 16, w: 256, h: 48 },
  { name: "Slider2", kind: "slider", label: "Also gone", bind: "999/nope2", x: 16, y: 80, w: 256, h: 48 } ]);
const row = (n) => B.card.querySelector(`.lego-row[data-name="${n}"]`);
const btns = [...row("Slider1").querySelectorAll(".lego-missing-btn")].map((b) => b.textContent);
t("missing widget row offers Rebind and Remove", row("Slider1").classList.contains("missing") && btns.join() === "Rebind,Remove");
fire(row("Slider1").querySelector(".lego-missing-btn.danger"), "click");
const names = () => B.host.properties.ui_layout.tabs[0].sections[0].controls.map((c) => c.name).join();
t("Remove deletes the component", names() === "Slider2");
fire(row("Slider2").querySelector(".lego-missing-btn"), "click");
t("Rebind opens the parameter search", B.st.edit && !!document.querySelector(".lego-comfy-backdrop"));
document.querySelector(".lego-comfy-backdrop")?.remove();
await sleep(20);

console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
