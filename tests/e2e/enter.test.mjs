// Entrar no Super Subgraph é a navegação nativa do ComfyUI (é um subgrafo
// nativo): botão do cartão, breadcrumb, edição lá dentro, aninhado e execução.
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
const crumb = () => E(() => document.querySelector(".subgraph-breadcrumb")?.innerText.replace(/\s+/g, " ") || "");
const runPrompt = () => E(async () => {
  const app = window.app; const p = await app.graphToPrompt(); const q = await window.comfyAPI.api.api.queuePrompt(0, p);
  for (let i = 0; i < 60; i++) { const h = await (await fetch(`/history/${q.prompt_id}`)).json(); const e = h[q.prompt_id]; if (e?.status?.completed) return { ok: true, types: Object.values(p.output).map(n => n.class_type) }; if (e?.status?.status_str === "error") return { ok: false, msg: JSON.stringify(e.status.messages).slice(-300) }; await new Promise(r => setTimeout(r, 500)); }
  return { ok: false };
});

const sid = await E(() => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const mk = (type, x) => { const n = LG.createNode(type); n.pos = [x, 0]; app.graph.add(n); return n; };
  const A = mk("EmptyImage", 0), S = mk("ImageScale", 350), P = mk("PreviewImage", 700);
  A.widgets.find(w => w.name === "width").value = 64; A.widgets.find(w => w.name === "height").value = 64;
  A.connect(0, S, 0); S.connect(0, P, 0);
  app.canvas.deselectAll?.(); app.canvas.select(S); app.canvas.select(P);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.isSubgraphNode?.());
  app.canvas.ds.offset = [300 - sn.pos[0], 200 - sn.pos[1]]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  return sn.id;
});
await pg.waitForTimeout(600);
t("the SuperSubgraph is a native subgraph with a card", await E((sid) => { const n = window.app.graph.getNodeById(sid); return !!n.subgraph && !!n.properties.ui_layout; }, sid));
t("enter button in the card header", await pg.locator(".lego-ss-enter").count() === 1);
await pg.locator(".lego-ss-enter").click(); await pg.waitForTimeout(800);
const st = await E(() => ({ inside: window.app.canvas.graph !== window.app.rootGraph, types: (window.app.canvas.graph.nodes || []).map(n => n.type).sort().join() }));
t("click enters: canvas shows the inner nodes " + st.types, st.inside && st.types === "ImageScale,PreviewImage");
const c1 = await crumb();
t("native breadcrumb shows the Super Subgraph: " + JSON.stringify(c1), /Super Subgraph/.test(c1));
await pg.screenshot({ path: path.join(dir, "enter_inside.png") });
// edita lá dentro: ImageInvert entre Scale e Preview
await E(() => { const g = window.app.canvas.graph; const LG = window.LiteGraph; const s = g.nodes.find(n => n.type === "ImageScale"); const p = g.nodes.find(n => n.type === "PreviewImage"); const inv = LG.createNode("ImageInvert"); inv.pos = [s.pos[0] + 60, s.pos[1] + 260]; g.add(inv); s.connect(0, inv, 0); inv.connect(0, p, 0); });
await pg.locator(".subgraph-breadcrumb .p-breadcrumb-item-link").first().click(); await pg.waitForTimeout(800);
t("breadcrumb returns to the workflow", await E(() => window.app.canvas.graph === window.app.rootGraph));
const run = await runPrompt();
t("edit made inside is executed natively: " + JSON.stringify(run.types || run.msg), run.ok && run.types.includes("ImageInvert"));
// aninhado: entra, converte o ImageInvert em outro Super Subgraph, entra nele
await E((sid) => { const sn = window.app.graph.getNodeById(sid); window.app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatNode(sn).find(i => i && /^Open Inside$/.test(i.content)).callback(); }, sid);
await pg.waitForTimeout(600);
t("menu 'Open Inside' enters", await E(() => window.app.canvas.graph !== window.app.rootGraph));
await E(() => {
  const app = window.app; const g = app.canvas.graph; const inv = g.nodes.find(n => n.type === "ImageInvert");
  app.canvas.deselectAll?.(); app.canvas.select(inv);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const inner2 = g.nodes.find(n => n.isSubgraphNode?.());
  inner2.title = "Nested SS"; inner2.subgraph.name = "Nested SS";
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatNode(inner2).find(i => i && /^Open Inside$/.test(i.content)).callback();
});
await pg.waitForTimeout(800);
const nested = await E(() => (window.app.canvas.graph.nodes || []).map(n => n.type).join());
const c2 = await crumb();
t("nested SuperSubgraph: breadcrumb has both levels " + JSON.stringify(c2), nested === "ImageInvert" && /Super Subgraph.*Nested SS/.test(c2));
await pg.screenshot({ path: path.join(dir, "enter_nested.png") });
await pg.locator(".subgraph-breadcrumb .p-breadcrumb-item-link").first().click(); await pg.waitForTimeout(800);
t("workflow crumb jumps back to the root", await E(() => window.app.canvas.graph === window.app.rootGraph));
const run2 = await runPrompt();
t("nested SuperSubgraph runs natively: " + JSON.stringify(run2.msg || "ok"), run2.ok && run2.types.includes("ImageInvert"));
t("no extension errors " + JSON.stringify(errs.slice(0, 4)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
