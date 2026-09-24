import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
for (const k of ["window","document","HTMLElement","Event","MouseEvent","KeyboardEvent","MutationObserver","getComputedStyle","URLSearchParams"]) globalThis[k] = dom.window[k] ?? globalThis[k];
globalThis.PointerEvent = dom.window.MouseEvent;
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.cancelAnimationFrame = (h) => clearTimeout(h);
globalThis.ResizeObserver = class { observe(){} disconnect(){} };
globalThis.__app = { canvas: { ds: { scale: 1 }, setDirty(){} }, graph: { _nodes: [], setDirtyCanvas(){} } };
globalThis.__api = { apiURL: p => p, fetchApi: async () => ({ ok: false }), addEventListener(){} };
const M = await import("../.build/mod.mjs");
let ok = 0, fail = 0;
const t = (name, cond) => { cond ? ok++ : fail++; console.log(cond ? "PASS" : "FAIL", name); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// AllmaBypasser simulado, como em web/allma_gate.js: o callback do master grava on_* por atribuição direta
const bw = [{ name: "enabled", type: "toggle", value: true }];
for (let i = 1; i <= 9; i++) bw.push({ name: `on_${i}`, type: "toggle", value: true });
const allma = { id: 6934, type: "AllmaBypasser", title: "Allma Bypasser - LoRas", widgets: bw };
const master = bw[0], toggles = bw.slice(1);
master.callback = function () { const v = master.value !== false; for (const tg of toggles) tg.value = v; };

const widgets = [];
const host = { id: 7027, title: "New Subgraph", size: [800, 600], properties: {}, widgets, graph: globalThis.__app.graph, flags: {}, subgraph: { _nodes: [allma] },
  addDOMWidget(n, ty, el) { const w = { name: n, element: el }; widgets.push(w); document.body.append(el); return w; }, setSize(s){ this.size = s; }, computeSize(){ return [1,1]; } };
globalThis.__app.graph._nodes.push(host);
const ctrls = [{ name: "Switch8", kind: "toggle", label: "Toggle All", bind: "6934/enabled", x: 16, y: 16, w: 160, h: 48 }];
for (let i = 1; i <= 9; i++) ctrls.push({ name: `Switch${100+i}`, kind: "toggle", label: `Image ${i}`, bind: `6934/on_${i}`, x: 16, y: 16 + i * 64, w: 160, h: 48 });
host.properties.ui_layout = { schema: 2, activeTab: 0, tabs: [{ name: "References", sections: [{ header: "VISUAL REFERENCES", controls: ctrls }] }] };
M.attach(host);
const sw = (name) => host.__legoHost.querySelector(`.lego-row[data-name="${name}"] .lego-sw`);
const onCount = () => ctrls.slice(1).filter(c => sw(c.name).classList.contains("on")).length;

t("start: all 9 on", onCount() === 9);
sw("Switch8").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
t("Toggle All OFF updates the 9 switches immediately (" + onCount() + " on)", toggles.every(x => x.value === false) && onCount() === 0);
sw("Switch8").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
t("Toggle All ON updates the 9 switches immediately (" + onCount() + " on)", onCount() === 9);

// mudança feita fora do cartão, sem callback (ex.: poller do Allma / clique no nó)
toggles[2].value = false;
await sleep(350);
t("external direct write shows up within the poll", !sw("Switch103").classList.contains("on"));
master.value = false;
await sleep(350);
t("master switch reflects external write too", !sw("Switch8").classList.contains("on"));
console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
