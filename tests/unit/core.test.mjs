import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
for (const k of ["window","document","HTMLElement","Event","MouseEvent","PointerEvent","KeyboardEvent","MutationObserver","getComputedStyle"]) globalThis[k] = dom.window[k] ?? globalThis[k];
globalThis.PointerEvent ??= dom.window.MouseEvent;
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.cancelAnimationFrame = (h) => clearTimeout(h);
globalThis.ResizeObserver = class { observe(){} disconnect(){} };
globalThis.__app = { registerExtension(){}, canvas: { ds: { scale: 1 }, setDirty(){} }, graph: { _nodes: [], setDirtyCanvas(){} } };
globalThis.__api = { apiURL: (p) => p, fetchApi: async () => ({ ok: false }) };
const M = await import("../.build/mod.mjs");
let ok = 0, fail = 0;
const t = (name, cond) => { cond ? ok++ : fail++; console.log(cond ? "PASS" : "FAIL", name); };

t("esc", M.esc(`<img src=x onerror="a">&'`) === "&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;");

const lay = { tabs: [{ sections: [{ controls: [{name:"S1",kind:"slider"},{name:"S2",kind:"slider"},{name:"S3",kind:"slider"}] }] }] };
t("remove adjacent", M.removeControlsByName(lay, new Set(["S1","S2"])) === 2 && lay.tabs[0].sections[0].controls.map(c=>c.name).join() === "S3");

const lay2 = { tabs: [{ sections: [{ controls: [{name:"HGroup1",kind:"segment",items:[{name:"Slider1",kind:"slider",label:"Slider1"},{name:"Slider2",kind:"slider"}]}] }] }] };
const cl = M.renameClone(lay2, JSON.parse(JSON.stringify(lay2.tabs[0].sections[0].controls[0])));
t("unique clone names", new Set([cl.name, ...cl.items.map(i=>i.name)]).size === 3 && cl.items[0].label === cl.items[0].name);

// nó falso
function mkNode(id) {
  const widgets = [{ name: "steps", type: "number", value: 20, options: { min: 1, max: 100, step: 10 } }];
  const node = { id, title: "N"+id, size: [700, 400], properties: {}, widgets, graph: globalThis.__app.graph, flags: {},
    addDOMWidget(name, type, el, opts) { const w = { name, type, element: el, ...opts }; widgets.push(w); document.body.append(el); return w; },
    setSize(s){ this.size = s; }, computeSize(){ return [200,100]; } };
  globalThis.__app.graph._nodes.push(node);
  return node;
}
const n = mkNode(1);
n.properties.ui_layout = { schema: 2, title: "T", activeTab: 1, tabs: [
  { name: "A", sections: [{ header: "A", controls: [{ name: "Slider1", kind: "slider", bind: "steps", x: 16, y: 16, w: 256, h: 48 }] }] },
  { name: "B", sections: [{ header: "B", controls: [{ name: "HGroup1", kind: "segment", items: [], x: 16, y: 16, w: 256, h: 48 }] }] },
]};
let st; try { st = M.attach(n); t("attach+buildCard", !!st); } catch (e) { t("attach+buildCard: " + e, false); }
st.edit = true; st.refresh();

// Ctrl+D com grupo selecionado na aba B (ativa)
st.selectedName = "HGroup1"; st.selectedNames = new Set(["HGroup1"]);
M.copySelectedComponents(n, st); M.pasteComponents(n, st);
const B = n.properties.ui_layout.tabs[1].sections[0].controls, A = n.properties.ui_layout.tabs[0].sections[0].controls;
t("paste goes to active tab", B.length === 2 && A.length === 1);
t("group not nested in itself", B[0].items.length === 0);

// undo automático
const before = B.length;
B.push({ name: "Label9", kind: "label", text: "x", x: 200, y: 200, w: 160, h: 32 });
st.refresh();
M.doUndo(n, st);
t("auto-undo reverts", n.properties.ui_layout.tabs[1].sections[0].controls.length === before);

// XSS no inspetor
n.properties.ui_layout.tabs[1].sections[0].controls[0].name = "<img/src=x>";
st.selectedName = "<img/src=x>"; st.selectedNames = new Set([st.selectedName]);
M.renderObjectInspector(n, st, true);
const oi = document.querySelector(".lego-oi");
t("inspector escapes name", oi && !oi.querySelector("img") && oi.textContent.includes("<img/src=x>"));

// menu de contexto
let added = 0;
const ev = new dom.window.MouseEvent("contextmenu", { clientX: 10, clientY: 10 });
M.openTabContextMenu(ev, { tab: {name:"A"}, tabs: [{},{}], tabIndex: 0, onUpdate(){}, onDelete(){}, onAdd(){ added++; } });
await new Promise(r => setTimeout(r, 30));
const items = document.querySelectorAll(".lego-ctx-item");
const addItem = [...items].find(b => b.textContent.includes("New tab"));
addItem.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true }));
addItem.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
t("ctx menu item works", added === 1);

// drop no fundo do corpo (GRID)
const body = n.__legoHost.querySelector(".lego-body");
st.draggingComponent = { kind: "slider" };
let threw = null;
const drop = new dom.window.Event("drop", { bubbles: true, cancelable: true });
const onErr = (e) => { threw = e.error || e.message; e.preventDefault(); };
dom.window.addEventListener("error", onErr);
try { body.dispatchEvent(drop); } catch (e) { threw = e; }
t("body drop no ReferenceError" + (threw ? ": " + threw : ""), !threw);

// watchers entre cartões
const ext = { id: 99, title: "Ext", widgets: [{ name: "cfg", type: "number", value: 7, options: { min: 0, max: 30 } }], graph: globalThis.__app.graph };
globalThis.__app.graph._nodes.push(ext);
const mk2 = (id) => { const x = mkNode(id); x.properties.ui_layout = { schema: 2, activeTab: 0, tabs: [{ name: "A", sections: [{ header: "A", controls: [{ name: "Slider1", kind: "number", bind: "99/cfg", x: 16, y: 16, w: 256, h: 48 }] }] }] }; M.attach(x); return x; };
const c1 = mk2(2), c2 = mk2(3);
ext.widgets[0].value = 12; ext.widgets[0].callback(12);
const vals = [c1, c2].map(x => x.__legoHost.querySelector("input.lego-step-input, input.lego-in")?.value);
t("both cards see external change " + JSON.stringify(vals), vals.every(v => v === "12"));

// writeWidget com widget não-serializável antes
const wn = { widgets: [{ name: "prev", serialize: false }, { name: "a" }, { name: "b" }], widgets_values: [1, 2], graph: null };
M.writeWidget(wn, wn.widgets[2], 9);
t("widgets_values index", wn.widgets_values[1] === 9 && wn.widgets_values[0] === 1);

console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
