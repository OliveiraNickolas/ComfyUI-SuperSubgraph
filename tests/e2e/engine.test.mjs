import { chromium } from "playwright-core";
import path from "node:path";
import { launch, COMFY_URL, OUT as dir } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; pg.on("pageerror", e => errs.push("PAGEERROR " + e.message));
pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push("CONSOLE " + m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.LiteGraph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(2000);
await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (fn, arg) => pg.evaluate(fn, arg);

// monta o grafo
const ids = await E(async () => {
  const app = window.app;
  app.graph.clear();
  const LG = window.LiteGraph;
  const mk = (type, x, y) => { const n = LG.createNode(type); n.pos = [x, y]; app.graph.add(n); return n; };
  const A = mk("EmptyImage", 0, 0); A.widgets.find(w => w.name === "width").value = 64; A.widgets.find(w => w.name === "height").value = 64;
  const S = mk("ImageScale", 350, 0);
  S.widgets.find(w => w.name === "width").value = 32; S.widgets.find(w => w.name === "height").value = 32;
  const I = mk("ImageInvert", 700, 0);
  const P = mk("PreviewImage", 1000, 0);
  const D = mk("SaveImage", 1000, 400);
  A.connect(0, S, 0); S.connect(0, I, 0); I.connect(0, P, 0); I.connect(0, D, 0);
  return { A: A.id, S: S.id, I: I.id, P: P.id, D: D.id };
});
// seleciona S, I, P e converte pelo menu da extensão
const conv = await E(async (ids) => {
  const app = window.app;
  const sel = [ids.S, ids.I, ids.P].map(id => app.graph.getNodeById(id));
  app.canvas.deselectAll?.(); for (const n of sel) app.canvas.select?.(n);
  const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const item = ext.getCanvasMenuItems().find(i => i && /Convert Selection/.test(i.content));
  item.callback();
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  // O cartão nasce vazio (nada promovido); o teste monta o layout pelo menu.
  if (sn) ext.getNodeMenuItems(sn).find(i => i && /Recreate Layout/.test(i.content)).callback();
  return sn ? {
    id: sn.id, nodes: app.graph.nodes.map(n => n.type),
    ins: sn.inputs.filter(i => /^in_/.test(i.name)).map(i => [i.name, i.label, i.type, i.link != null]),
    outs: sn.outputs.map(o => [o.name, o.label, o.type, (o.links || []).length]),
    inner: sn.__ssGraph?.nodes?.map(n => n.type),
    card: !!sn.__legoHost,
  } : null;
}, ids);
console.log("CONVERT", JSON.stringify(conv));
t("super node created; S/I/P removed from the main graph", conv && conv.nodes.sort().join() === ["EmptyImage", "SaveImage", "SuperSubgraph"].sort().join());
t("1 input (image) linked and 1 output linked to SaveImage", conv && conv.ins.length === 1 && conv.ins[0][3] && conv.outs.length === 1 && conv.outs[0][3] === 1);
t("inner graph holds ImageScale, ImageInvert, PreviewImage", conv && conv.inner.sort().join() === "ImageInvert,ImageScale,PreviewImage");
t("card attached", conv?.card);

// cartão: widget do ImageScale (largura) — muda pelo stepper do cartão
const layoutInfo = await E(async (sid) => {
  const app = window.app;
  const sn = app.graph.getNodeById(sid);
  const L = sn.properties.ui_layout;
  const groups = []; for (const t of L.tabs) for (const s of t.sections) for (const c of s.controls || []) groups.push({ tab: t.name, kind: c.kind, header: c.header, binds: (c.items || []).filter(i => i.bind).map(i => i.bind) });
  return groups;
}, conv.id);
console.log("LAYOUT", JSON.stringify(layoutInfo));
t("card has the ImageScale whole-node widget bound to inner widgets", layoutInfo.some(g => g.header === "Image Scale" || (g.binds.some(b => b.endsWith("/width")))));
await E(async ({ sid }) => {
  const app = window.app;
  const sn = app.graph.getNodeById(sid);
  app.canvas.ds.offset = [60 - sn.pos[0], 40 - sn.pos[1]]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
}, { sid: conv.id });
await pg.waitForTimeout(600);
// escreve 16 na largura pelo input do stepper do cartão
const setW = await E(async (sid) => {
  const app = window.app;
  const sn = app.graph.getNodeById(sid);
  const items = [...sn.__legoHost.querySelectorAll(".lego-segment-item")];
  const wItem = items.find(el => { const nm = el.dataset.name; const L = sn.properties.ui_layout; let bind = null; for (const t of L.tabs) for (const s of t.sections) for (const c of s.controls || []) for (const i of c.items || []) if (i.name === nm) bind = i.bind; return bind && bind.endsWith("/width"); });
  const inp = wItem?.querySelector("input");
  if (!inp) return "no input";
  inp.value = "16"; inp.dispatchEvent(new Event("change"));
  const inner = sn.__ssGraph.nodes.find(n => n.type === "ImageScale");
  return inner.widgets.find(w => w.name === "width").value;
}, conv.id);
t("card stepper writes the inner ImageScale.width: " + setW, setW === 16);
await pg.screenshot({ path: path.join(dir, "real_card.png") });

// executa de verdade
const runQueue = async (label) => {
  const res = await E(async () => {
    const app = window.app;
    const api = window.comfyAPI.api.api;
    const p = await app.graphToPrompt();
    const r = await api.queuePrompt(0, p);
    return { id: r.prompt_id, err: r.error || null, prompt: p.output };
  });
  if (!res.id) { console.log(label, "QUEUE FAILED", JSON.stringify(res.err)); return null; }
  for (let i = 0; i < 120; i++) {
    const h = await E(async (pid) => (await fetch(`/history/${pid}`)).json(), res.id);
    const st = h[res.id]?.status;
    if (st?.completed) return { ...h[res.id], prompt: res.prompt };
    if (st && st.status_str === "error") { console.log(label, "EXEC ERROR", JSON.stringify(st.messages).slice(0, 1500)); return null; }
    await pg.waitForTimeout(500);
  }
  console.log(label, "TIMEOUT"); return null;
};
let h = await runQueue("run1");
t("queued prompt runs through the Super Subgraph", !!h);
if (h) {
  const ssPrompt = Object.values(h.prompt).find(n => n.class_type === "SuperSubgraph");
  const g = JSON.parse(ssPrompt.inputs.ss_graph);
  t("ss_graph built by graphToPrompt (inner width=16)", Object.values(g.nodes).some(n => n.class_type === "ImageScale" && n.inputs.width === 16));
  const save = Object.entries(h.outputs).find(([k]) => k === String(ids.D));
  const size = save ? await E(async (f) => { const img = new Image(); img.src = `/view?filename=${encodeURIComponent(f.filename)}&type=output&subfolder=${encodeURIComponent(f.subfolder)}`; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return [img.width, img.height, [...x.getImageData(1, 1, 1, 1).data].slice(0, 3)]; }, save[1].images[0]) : null;
  t("outer SaveImage got 16x32 inverted (white): " + JSON.stringify(size), size && size[0] === 16 && size[1] === 32 && size[2][0] === 255);
  t("inner PreviewImage executed as " + Object.keys(h.outputs).join(","), Object.keys(h.outputs).some(k => k.startsWith(`${conv.id}.`)));
}
await pg.waitForTimeout(800);
t("card Output tab got the preview image", await E(async (sid) => { const app = window.app; const sn = app.graph.getNodeById(sid); const L = sn.properties.ui_layout; const oi = L.tabs.findIndex(t => t.name === "Output"); if (oi < 0) return false; L.activeTab = oi; sn.__legoState.refresh(); await new Promise(r => setTimeout(r, 300)); return !!sn.__legoHost.querySelector(".lego-out-box.is-image img"); }, conv.id));
await pg.screenshot({ path: path.join(dir, "real_output.png") });

// salvar e recarregar
const reload = await E(async () => {
  const app = window.app;
  const wf = JSON.parse(JSON.stringify(app.graph.serialize()));
  await app.loadGraphData(wf);
  await new Promise(r => setTimeout(r, 800));
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  const inner = sn && sn.properties.ss_inner?.graph?.nodes?.find(n => n.type === "ImageScale");
  return { has: !!sn, card: !!sn?.__legoHost, width: inner?.widgets_values?.[1], ins: sn?.inputs.filter(i => /^in_/.test(i.name)).length, outs: sn?.outputs.length };
});
console.log("RELOAD", JSON.stringify(reload));
t("workflow save/reload keeps the Super Subgraph, its card, its I/O and the inner value", reload.has && reload.card && reload.width === 16 && reload.ins === 1 && reload.outs === 1);
h = await runQueue("run2");
t("runs again after reload", !!h);

// unpack
const un = await E(async () => {
  const app = window.app;
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  ext.getNodeMenuItems(sn).find(i => i && /Unpack/.test(i.content)).callback();
  return { types: app.graph.nodes.map(n => n.type).sort(), links: [...(app.graph.links.values ? app.graph.links.values() : Object.values(app.graph.links))].length };
});
console.log("UNPACK", JSON.stringify(un));
t("unpack restores the 5 nodes and 4 links", un.types.join() === "EmptyImage,ImageInvert,ImageScale,PreviewImage,SaveImage" && un.links === 4);
h = await runQueue("run3");
t("unpacked graph runs", !!h);
t("no extension errors " + JSON.stringify(errs.slice(0, 5)), errs.length === 0);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
