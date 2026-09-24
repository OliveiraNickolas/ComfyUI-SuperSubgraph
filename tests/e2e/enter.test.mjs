import { chromium } from "playwright-core";
import path from "node:path";
import { launch, COMFY_URL, OUT as dir } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (f, a) => pg.evaluate(f, a);
const sid = await E(async () => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const mk = (type, x, y = 0) => { const n = LG.createNode(type); n.pos = [x, y]; app.graph.add(n); return n; };
  const A = mk("EmptyImage", 0), S = mk("ImageScale", 350), P = mk("PreviewImage", 700), D = mk("SaveImage", 1000);
  A.widgets.find(w => w.name === "width").value = 64; A.widgets.find(w => w.name === "height").value = 64;
  A.connect(0, S, 0); S.connect(0, P, 0); S.connect(0, D, 0);
  app.canvas.deselectAll?.(); app.canvas.select(S); app.canvas.select(P);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").getCanvasMenuItems().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  app.canvas.ds.offset = [80 - sn.pos[0], 80 - sn.pos[1]]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  return sn.id;
});
await pg.waitForTimeout(600);
t("enter button in the card header", await pg.locator(".lego-ss-enter").count() === 1);
await pg.locator(".lego-ss-enter").click(); await pg.waitForTimeout(600);
let st = await E(() => ({ inside: window.app.canvas.graph !== window.app.rootGraph, types: (window.app.canvas.graph.nodes || []).map(n => n.type).sort().join(), bar: document.querySelector(".lego-ss-nav")?.innerText }));
t("click enters: canvas shows the inner nodes " + st.types, st.inside && st.types === "ImageScale,PreviewImage");
t("navigation bar with Back + breadcrumb: " + JSON.stringify(st.bar), /Back/.test(st.bar || "") && /Workflow/.test(st.bar || "") && /Super Subgraph/.test(st.bar || ""));
await pg.screenshot({ path: path.join(dir, "enter_inside.png") });
// edita lá dentro: adiciona ImageInvert entre Scale e Preview
await E(() => { const g = window.app.canvas.graph; const LG = window.LiteGraph; const s = g.nodes.find(n => n.type === "ImageScale"); const p = g.nodes.find(n => n.type === "PreviewImage"); const inv = LG.createNode("ImageInvert"); inv.pos = [s.pos[0] + 60, s.pos[1] + 260]; g.add(inv); s.connect(0, inv, 0); inv.connect(0, p, 0); });
await pg.locator(".lego-ss-nav-back").click(); await pg.waitForTimeout(500);
st = await E(() => ({ root: window.app.canvas.graph === window.app.rootGraph, bar: !!document.querySelector(".lego-ss-nav") }));
t("Back returns to the workflow and hides the bar", st.root && !st.bar);
// roda: o preview de dentro agora vem invertido
const run = await E(async () => {
  const app = window.app; const p = await app.graphToPrompt(); const q = await window.comfyAPI.api.api.queuePrompt(0, p);
  for (let i = 0; i < 60; i++) { const h = await (await fetch(`/history/${q.prompt_id}`)).json(); const e = h[q.prompt_id]; if (e?.status?.completed) return { ok: true, outs: Object.keys(e.outputs), types: Object.values(JSON.parse(Object.values(p.output).find(n => n.class_type === "SuperSubgraph").inputs.ss_graph).nodes).map(n => n.class_type) }; if (e?.status?.status_str === "error") return { ok: false }; await new Promise(r => setTimeout(r, 500)); }
  return { ok: false };
});
t("edit made inside is executed: " + JSON.stringify(run.types), run.ok && run.types.includes("ImageInvert"));
// aninhado: entra, converte o ImageInvert em outro SuperSubgraph, entra nele
await E((sid) => { const sn = window.app.graph.getNodeById(sid); window.app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").getNodeMenuItems(sn).find(i => i && /Open SuperSubgraph/.test(i.content)).callback(); }, sid);
await pg.waitForTimeout(400);
t("context menu 'Open SuperSubgraph' enters", await E(() => window.app.canvas.graph !== window.app.rootGraph));
const nested = await E(async () => {
  const app = window.app; const g = app.canvas.graph; const inv = g.nodes.find(n => n.type === "ImageInvert");
  app.canvas.deselectAll?.(); app.canvas.select(inv);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").getCanvasMenuItems().find(i => i && /Convert/.test(i.content)).callback();
  const inner2 = g.nodes.find(n => n.type === "SuperSubgraph");
  inner2.title = "Nested SS";
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").getNodeMenuItems(inner2).find(i => i && /Open SuperSubgraph/.test(i.content)).callback();
  await new Promise(r => setTimeout(r, 400));
  return { types: app.canvas.graph.nodes.map(n => n.type).join(), bar: document.querySelector(".lego-ss-nav")?.innerText };
});
t("nested SuperSubgraph: 2-level breadcrumb " + JSON.stringify(nested.bar), nested.types === "ImageInvert" && /Nested SS/.test(nested.bar) && /Super Subgraph/.test(nested.bar));
await pg.screenshot({ path: path.join(dir, "enter_nested.png") });
await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);
const esc = await E(() => ({ types: (window.app.canvas.graph.nodes || []).map(n => n.type).sort().join(), bar: document.querySelector(".lego-ss-nav")?.innerText || "" }));
t("Esc goes up one level: " + esc.types, esc.types.includes("ImageScale") && /Esc/.test(esc.bar) && !/Nested SS/.test(esc.bar));
await pg.locator(".lego-ss-nav-crumb", { hasText: "Workflow" }).click(); await pg.waitForTimeout(400);
t("'Workflow' crumb jumps back to the root", await E(() => window.app.canvas.graph === window.app.rootGraph && !document.querySelector(".lego-ss-nav")));
const run2 = await E(async () => {
  const app = window.app; const p = await app.graphToPrompt(); const q = await window.comfyAPI.api.api.queuePrompt(0, p);
  for (let i = 0; i < 60; i++) { const h = await (await fetch(`/history/${q.prompt_id}`)).json(); const e = h[q.prompt_id]; if (e?.status?.completed) return { ok: true, outs: Object.keys(e.outputs) }; if (e?.status?.status_str === "error") return { ok: false, msg: JSON.stringify(e.status.messages).slice(-600) }; await new Promise(r => setTimeout(r, 500)); }
  return { ok: false };
});
t("nested SuperSubgraph runs: outputs " + JSON.stringify(run2.outs || run2.msg), run2.ok);
t("no extension errors " + JSON.stringify(errs.slice(0, 4)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
