import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
for (const k of ["window","document","HTMLElement","Event","MouseEvent","KeyboardEvent","MutationObserver","getComputedStyle","URLSearchParams"]) globalThis[k] = dom.window[k] ?? globalThis[k];
globalThis.PointerEvent = dom.window.MouseEvent;
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.cancelAnimationFrame = (h) => clearTimeout(h);
globalThis.ResizeObserver = class { observe(){} disconnect(){} };
const listeners = {};
globalThis.__app = { canvas: { ds: { scale: 1 }, setDirty(){} }, graph: { _nodes: [], setDirtyCanvas(){} }, nodeOutputs: { "77": { images: [{ filename: "old.png", subfolder: "", type: "output" }] } } };
globalThis.__api = { apiURL: (p) => "/api" + p, fetchApi: async () => ({ ok: false }), addEventListener: (n, f) => (listeners[n] ||= []).push(f) };
const M = await import("../.build/mod.mjs");
await globalThis.__ext.setup();
let ok = 0, fail = 0;
const t = (name, cond) => { cond ? ok++ : fail++; console.log(cond ? "PASS" : "FAIL", name); };
const fire = (node, output) => listeners.executed.forEach((f) => f({ detail: { node, display_node: node, output } }));

// host = subgrafo 10 com PreviewImage(#3), SaveVideo(#4), SaveAudio(#5)
const inner = [
  { id: 3, type: "PreviewImage", widgets: [] },
  { id: 4, type: "VHS_VideoCombine", widgets: [] },
  { id: 5, type: "SaveAudio", widgets: [] },
];
const widgets = [];
const host = { id: 10, title: "Sub", size: [700, 400], properties: {}, widgets, graph: globalThis.__app.graph, flags: {},
  subgraph: { _nodes: inner }, isSubgraphNode: () => true,
  addDOMWidget(name, type, el, opts) { const w = { name, type, element: el, ...opts }; widgets.push(w); document.body.append(el); return w; },
  setSize(s){ this.size = s; }, computeSize(){ return [200,100]; } };
globalThis.__app.graph._nodes.push(host);

const lay = M.autoLayout(host);
const outTab = lay.tabs.find((t) => t.name === "Output");
t("autoLayout adds Output tab with image/video/audio", outTab && outTab.sections[0].controls.map(c => c.kind).join() === "outimage,outvideo,outaudio");
host.properties.ui_layout = lay;
lay.activeTab = lay.tabs.indexOf(outTab);
const st = M.attach(host);
const q = (s) => host.__legoHost.querySelector(s);
t("empty state shown", !!q(".lego-out-box.is-image .lego-out-empty"));

fire("10:3", { images: [{ filename: "a.png", subfolder: "", type: "temp" }, { filename: "b.png", subfolder: "x", type: "temp" }] });
let img = q(".lego-out-box.is-image img");
t("image appears after executed", img && img.getAttribute("src").includes("filename=a.png") && img.getAttribute("src").includes("type=temp"));
t("batch counter 1 / 2", q(".lego-out-box.is-image .lego-out-count").textContent === "1 / 2");
q(".lego-out-box.is-image .lego-out-nav:last-child").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
img = q(".lego-out-box.is-image img");
t("next shows b.png", img.getAttribute("src").includes("filename=b.png") && img.getAttribute("src").includes("subfolder=x"));

fire("10:4", { gifs: [{ filename: "clip.mp4", subfolder: "", type: "output", format: "video/h264-mp4" }] });
t("video plays VHS gifs", q(".lego-out-box.is-video video")?.getAttribute("src").includes("clip.mp4"));
fire("10:5", { audio: [{ filename: "s.flac", subfolder: "audio", type: "output" }] });
t("audio shows", q(".lego-out-box.is-audio audio")?.getAttribute("src").includes("s.flac"));

// saída de fora do subgrafo não deve aparecer no modo auto
fire("99", { images: [{ filename: "other.png", type: "output" }] });
t("auto ignores outside nodes", q(".lego-out-box.is-image img").getAttribute("src").includes("b.png"));

// sem mudança de sig não recria o elemento
const before = q(".lego-out-box.is-image img");
fire("10:5", { audio: [{ filename: "s2.flac", type: "output" }] });
t("image untouched by unrelated update", q(".lego-out-box.is-image img") === before);

// fonte explícita = nó do grafo 99
const imgCtrl = outTab.sections[0].controls[0];
imgCtrl.source = "99"; st.refresh();
t("explicit source shows node 99", q(".lego-out-box.is-image img").getAttribute("src").includes("other.png"));

// XSS no nome do arquivo não vira HTML
fire("99", { images: [{ filename: '"><img src=x onerror=alert(1)>.png', type: "output" }] });
t("filename can't inject", host.__legoHost.querySelectorAll("img").length === 1);

// paleta: soltar Image Output no modo edição
st.edit = true; st.refresh();
const sec = outTab.sections[0];
M.dropArmedTool(host, st, sec, 400, 16, false, "outimage");
const dropped = sec.controls[sec.controls.length - 1];
t("palette drop creates outimage", dropped.kind === "outimage" && dropped.name.startsWith("ImageOut") && dropped.label === "");
t("dropped view renders", !!host.__legoHost.querySelector(`.lego-row[data-name="${dropped.name}"] .lego-out-box`));

// inspetor mostra Source
M.renderObjectInspector(host, st, true);
t("inspector has Source row", [...document.querySelectorAll(".lego-oi-key")].some(k => k.textContent === "Source"));

// grupo vertical com output dentro
const vg = { name: "VGroup1", kind: "vsegment", items: [], x: 16, y: 600, w: 300, h: 300 };
sec.controls.push(vg); st.refresh();
M.addItemToSegment(host, st, vg, { kind: "outvideo", label: "Video Output" });
t("output inside group renders", !!host.__legoHost.querySelector(".lego-segment-item.kind-outvideo video"));

// seed via app.nodeOutputs
t("seeded from app.nodeOutputs", M.OUTPUTS.has("77"));

// busca: filtro Outputs
M.openInspector({ host, layout: host.properties.ui_layout, section: sec, state: st, forFilterKind: "output" });
const rows = [...document.querySelectorAll(".lego-comfy-node-row .lego-comfy-node-title")].map(e => e.textContent);
t("search dialog Outputs filter " + JSON.stringify(rows), rows.join() === "Image Output,Video Output,Audio Output");

console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
