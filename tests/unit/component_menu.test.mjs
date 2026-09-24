// Menu de botão direito dos componentes e Ctrl+G (agrupar seleção).
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
for (const k of ["window","document","HTMLElement","Event","MouseEvent","KeyboardEvent","MutationObserver","getComputedStyle","URLSearchParams"]) globalThis[k] = dom.window[k] ?? globalThis[k];
globalThis.PointerEvent = dom.window.MouseEvent;
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.cancelAnimationFrame = (h) => clearTimeout(h);
globalThis.ResizeObserver = class { observe(){} disconnect(){} };
globalThis.__app = { canvas: { ds: { scale: 1, offset: [0, 0] }, setDirty(){} }, graph: { _nodes: [], setDirtyCanvas(){} } };
globalThis.__api = { apiURL: p => p, fetchApi: async () => ({ ok: false }), addEventListener(){} };
const M = await import("../.build/mod.mjs");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const fire = (e, type, opts = {}) => e.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 50, clientY: 50, ...opts }));
const key = (k, opts = {}) => window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));

const widgets = [
  { name: "steps", type: "number", value: 20, options: { min: 1, max: 100, step: 1 } },
  { name: "cfg", type: "number", value: 7, options: { min: 0, max: 30, step: 0.5 } },
  { name: "flag", type: "toggle", value: true },
];
const host = { id: 1, title: "T", size: [900, 500], properties: {}, widgets, graph: globalThis.__app.graph, flags: {},
  addDOMWidget(n, ty, el) { widgets.push({ name: n, element: el }); document.body.append(el); return widgets.at(-1); }, setSize(s){ this.size = s; }, computeSize(){ return [1,1]; } };
globalThis.__app.graph._nodes.push(host);
host.properties.ui_layout = { schema: 2, activeTab: 0, tabs: [{ name: "Main", sections: [{ header: "Z", controls: [
  { name: "Slider1", kind: "slider", label: "Steps", bind: "steps", x: 16, y: 16, w: 256, h: 48 },
  { name: "Stepper1", kind: "number", label: "CFG", bind: "cfg", x: 16, y: 80, w: 256, h: 48 },
  { name: "Switch1", kind: "toggle", label: "Flag", bind: "flag", x: 320, y: 16, w: 160, h: 48 } ] }] }] };
const st = M.attach(host); st.edit = true; st.refresh();
const ctrls = () => host.properties.ui_layout.tabs[0].sections[0].controls;
const row = (n) => host.__legoHost.querySelector(`.lego-row[data-name="${n}"]`);
const menuLabels = () => [...document.querySelectorAll(".lego-ctx-menu .lego-ctx-label")].map((e) => e.textContent);
const clickMenu = (label) => { const b = [...document.querySelectorAll(".lego-ctx-menu .lego-ctx-item")].find((x) => x.querySelector(".lego-ctx-label")?.textContent === label); if (b) fire(b, "click"); return !!b; };

fire(row("Slider1"), "contextmenu");
let labels = menuLabels();
t("right-click opens the component menu: " + labels.join("|"), ["Properties", "Duplicate", "Group", "Change to Stepper", "Rebind…", "Remove"].every((l) => labels.includes(l)));
t("Change to Stepper keeps the bind", clickMenu("Change to Stepper") && ctrls()[0].kind === "number" && ctrls()[0].bind === "steps");

// seleciona dois e agrupa com Ctrl+G
st.selectedNames = new Set(["Stepper1", "Slider1"]); st.selectedName = "Slider1";
key("g", { ctrlKey: true });
let c = ctrls();
t("Ctrl+G groups the selection into one HGroup: " + c.map((x) => x.name + ":" + x.kind).join(), c.length === 2 && c.some((x) => x.kind === "segment" && x.items.map((i) => i.bind).join() === "steps,cfg"));
const g = c.find((x) => x.kind === "segment");
t("new group comes selected", st.selectedNames.has(g.name) && st.selectedNames.size === 1);

// Ungroup pelo menu
fire(row(g.name), "contextmenu");
t("group menu offers Ungroup", menuLabels().includes("Ungroup") && clickMenu("Ungroup"));
c = ctrls();
t("Ungroup puts the items back as loose components: " + c.map((x) => x.kind).join(), c.length === 3 && !c.some((x) => x.kind === "segment") && c.every((x) => typeof x.x === "number" && x.w > 0));

// Duplicar e remover pelo menu
fire(row("Switch1"), "contextmenu");
clickMenu("Duplicate");
t("Duplicate adds a copy", ctrls().filter((x) => x.bind === "flag").length === 2);
fire(row("Switch1"), "contextmenu");
clickMenu("Remove");
t("Remove deletes it", !ctrls().some((x) => x.name === "Switch1") && ctrls().filter((x) => x.bind === "flag").length === 1);
// undo desfaz a remoção
M.doUndo(host, st);
t("undo brings it back", ctrls().some((x) => x.name === "Switch1"));

console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
