// Borda do Super Subgraph vista de dentro: etiquetas in_N/out_N e
// expor/tirar entradas e saídas pelo menu do nó, sem desfazer.
import { launch, COMFY_URL, OUT as dir } from "../lib.mjs";
import path from "node:path";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (fn, arg) => pg.evaluate(fn, arg);

const ids = await E(() => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const mk = (type, x, y = 0) => { const n = LG.createNode(type); n.pos = [x, y]; app.graph.add(n); return n; };
  const A = mk("EmptyImage", 0), S = mk("ImageScale", 350), P = mk("PreviewImage", 700), D = mk("SaveImage", 1000), N = mk("PrimitiveInt", 0, 400);
  A.widgets.find(w => w.name === "width").value = 64; A.widgets.find(w => w.name === "height").value = 64;
  S.widgets.find(w => w.name === "width").value = 32; S.widgets.find(w => w.name === "height").value = 16;
  N.widgets.find(w => w.name === "value").value = 24;
  A.connect(0, S, 0); S.connect(0, P, 0); S.connect(0, D, 0);
  app.canvas.deselectAll?.(); app.canvas.select(S); app.canvas.select(P);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").getCanvasMenuItems().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  return { sn: sn.id, S: S.id, A: A.id, D: D.id, N: N.id };
});
const hostIO = () => E((id) => { const sn = window.app.rootGraph.getNodeById(id); return {
  ins: sn.inputs.filter(i => /^in_/.test(i.name)).map(i => `${i.name}:${i.label}:${i.link != null}`).join(),
  outs: sn.outputs.map(o => `${o.name}:${o.label}:${(o.links || []).length}`).join(),
  meta: JSON.stringify(sn.properties.ss_inner.inputs.map(i => i.targets)) + JSON.stringify(sn.properties.ss_inner.outputs.map(o => o.source)) }; }, ids.sn);
// menu do nó de dentro: acha o item (com submenu) e chama
const menu = (label, sub) => E(({ S, label, sub }) => {
  const app = window.app; const n = app.canvas.graph.getNodeById(S);
  const it = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").getNodeMenuItems(n).find(i => i && i.content === label);
  if (!it) return "no item " + label;
  const s = it.submenu.options.find(o => o.content.startsWith(sub));
  if (!s) return "no sub " + sub + " in " + it.submenu.options.map(o => o.content).join("|");
  s.callback(); return "ok";
}, { S: ids.S, label, sub });
const run = () => E(async () => {
  const app = window.app; const p = await app.graphToPrompt(); const q = await window.comfyAPI.api.api.queuePrompt(0, p);
  for (let i = 0; i < 80; i++) {
    const h = await (await fetch(`/history/${q.prompt_id}`)).json(); const e = h[q.prompt_id];
    if (e?.status?.status_str === "error") return { ok: false, err: JSON.stringify(e.status.messages).slice(0, 400) };
    if (e?.status?.completed) {
      const img = Object.values(e.outputs).flatMap(o => o.images || []).find(im => im.type === "output");
      if (!img) return { ok: true, w: 0 };
      const im = new Image(); im.src = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=output`;
      await im.decode(); return { ok: true, w: im.naturalWidth, h: im.naturalHeight };
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return { ok: false, err: "timeout" };
});

let io = await hostIO();
t("start: in_1 (image) and out_1 linked " + io.ins + " / " + io.outs, /^in_1:image:true$/.test(io.ins) && /^out_1:IMAGE:1$/.test(io.outs));

await E((id) => window.app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").getNodeMenuItems(window.app.rootGraph.getNodeById(id)).find(i => i && /Open SuperSubgraph/.test(i.content)).callback(), ids.sn);
await pg.waitForTimeout(500);
let tags = await E(() => [...document.querySelectorAll(".lego-ss-io")].map(e => e.textContent).sort().join("|"));
t("inside: boundary tags on the inner node: " + tags, tags === "in_1 →|→ out_1");
await pg.screenshot({ path: path.join(dir, "boundary_inside.png") });

// expõe a largura (widget) do ImageScale como in_2
t("Expose Input > width", (await menu("Expose Input to SuperSubgraph", "width")) === "ok");
await pg.waitForTimeout(300);
tags = await E(() => [...document.querySelectorAll(".lego-ss-io")].map(e => e.textContent).sort().join("|"));
t("tag for in_2 appears: " + tags, tags === "in_1 →|in_2 →|→ out_1");
// tira e põe a saída de volta
t("Unexpose Output > out_1", (await menu("Unexpose Output", "out_1")) === "ok");
io = await hostIO();
t("output gone and its outside link dropped: '" + io.outs + "'", io.outs === "");
t("Expose Output > IMAGE", (await menu("Expose Output from SuperSubgraph", "IMAGE")) === "ok");
// tira a entrada de imagem (in_1): in_2 vira in_1
t("Unexpose Input > in_1", (await menu("Unexpose Input", "in_1")) === "ok");
t("Expose Input > image again", (await menu("Expose Input to SuperSubgraph", "image")) === "ok");
await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);
io = await hostIO();
t("renumbered: in_1 = width, in_2 = image; out_1 back " + io.ins + " / " + io.outs + " " + io.meta,
  io.ins === "in_1:width:false,in_2:image:false" && io.outs === "out_1:IMAGE:0" && io.meta === `[[["${ids.S}","width"]],[["${ids.S}","image"]]][["${ids.S}",0]]`);

// liga por fora: PrimitiveInt -> in_1 (largura), EmptyImage -> in_2, out_1 -> SaveImage
await E((ids) => {
  const g = window.app.rootGraph; const sn = g.getNodeById(ids.sn);
  const slot = (n) => sn.inputs.findIndex(i => i.name === n);
  g.getNodeById(ids.N).connect(0, sn, slot("in_1"));
  g.getNodeById(ids.A).connect(0, sn, slot("in_2"));
  sn.connect(0, g.getNodeById(ids.D), 0);
}, ids);
const r = await run();
t("runs, and the outside number drives the inner width: " + JSON.stringify(r), r.ok && r.w === 24 && r.h === 16);

// nó de dentro apagado: a saída exposta dele sai junto ao voltar
await E((id) => window.app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").getNodeMenuItems(window.app.rootGraph.getNodeById(id)).find(i => i && /Open SuperSubgraph/.test(i.content)).callback(), ids.sn);
await pg.waitForTimeout(400);
const invId = await E(() => { const g = window.app.canvas.graph; const inv = window.LiteGraph.createNode("ImageInvert"); inv.pos = [0, 400]; g.add(inv); return inv.id; });
const exp = await E((invId) => { const app = window.app; const n = app.canvas.graph.getNodeById(invId);
  const it = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").getNodeMenuItems(n).find(i => i && i.content === "Expose Output from SuperSubgraph");
  it.submenu.options[0].callback(); return window.app.rootGraph.nodes.find(n => n.type === "SuperSubgraph").outputs.map(o => o.name).join(); }, invId);
t("new inner node output exposed as out_2: " + exp, exp === "out_1,out_2");
await E((invId) => { const g = window.app.canvas.graph; g.remove(g.getNodeById(invId)); }, invId);
await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);
io = await hostIO();
t("deleting it inside drops out_2 on the way out, out_1 keeps its link: " + io.outs, io.outs === "out_1:IMAGE:1");

// salva e recarrega: a borda continua
const re = await E(async (sid) => {
  const app = window.app; const wf = JSON.parse(JSON.stringify(app.graph.serialize()));
  await app.loadGraphData(wf); await new Promise(r => setTimeout(r, 600));
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  return sn.inputs.filter(i => /^in_/.test(i.name)).map(i => `${i.name}:${i.label}:${i.link != null}`).join();
}, ids.sn);
t("survives save/reload: " + re, re === "in_1:width:true,in_2:image:true");
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
