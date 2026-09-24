import { chromium } from "playwright-core";
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message));
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const r = await pg.evaluate(async () => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const mk = (type, x) => { const n = LG.createNode(type); n.pos = [x, 0]; app.graph.add(n); return n; };
  const A = mk("EmptyImage", 0), S = mk("ImageScale", 350), P = mk("PreviewImage", 700), D = mk("SaveImage", 1000);
  A.widgets.find(w => w.name === "width").value = 64; A.widgets.find(w => w.name === "height").value = 64;
  A.connect(0, S, 0); S.connect(0, P, 0); S.connect(0, D, 0);
  app.canvas.deselectAll?.(); app.canvas.select(S); app.canvas.select(P);
  const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  ext.getCanvasMenuItems().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  const L = sn.properties.ui_layout;
  const count = L.tabs.reduce((a, t) => a + t.sections.reduce((b, s) => b + (s.controls || []).length, 0), 0);
  const res = { tabs: L.tabs.map(t => t.name), count, ins: sn.inputs.filter(i => /^in_/.test(i.name) && i.link != null).length, outs: sn.outputs.filter(o => o.links?.length).length };
  // executa
  const p = await app.graphToPrompt(); const q = await window.comfyAPI.api.api.queuePrompt(0, p);
  let done = false;
  for (let i = 0; i < 60 && !done; i++) { const h = await (await fetch(`/history/${q.prompt_id}`)).json(); done = !!h[q.prompt_id]?.status?.completed; if (!done) await new Promise(r => setTimeout(r, 500)); }
  res.ran = done;
  return res;
});
// botão "Promote parameters" do cartão vazio abre o picker direto no grafo de dentro
await pg.waitForTimeout(400);
t("empty card shows 'Promote parameters'", await pg.locator(".lego-promote-cta").count() === 1);
await pg.locator(".lego-promote-cta").click(); await pg.waitForTimeout(500);
const pick = await pg.evaluate(() => ({ hud: !!document.querySelector(".lego-picker-hud .lego-picker-promote-btn"), inner: (window.app.canvas.graph.nodes || []).map(n => n.type).sort().join() }));
t("CTA opens the multi-select picker inside the SuperSubgraph: " + pick.inner, pick.hud && pick.inner === "ImageScale,PreviewImage");
await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);
t("Esc cancels back to the workflow with no dialog left", await pg.evaluate(() => window.app.canvas.graph === window.app.rootGraph && !document.querySelector(".lego-picker-hud, .lego-comfy-backdrop")));
r.recreated = await pg.evaluate(() => {
  // layout automático só sob pedido
  const app = window.app; const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").getNodeMenuItems(sn).find(i => i && /Recreate Layout/.test(i.content)).callback();
  return sn.properties.ui_layout.tabs.flatMap(t => t.sections.flatMap(s => (s.controls || []).map(c => c.kind))).join();
});
console.log(JSON.stringify(r));
t("card starts empty: only Controls tab, zero controls", r.tabs.join() === "Controls" && r.count === 0);
t("inputs/outputs still created and linked", r.ins === 1 && r.outs === 1);
t("workflow still runs", r.ran);
t("auto layout only on demand (Recreate Layout): " + r.recreated, /segment/.test(r.recreated) && /outimage/.test(r.recreated));
t("no page errors " + JSON.stringify(errs), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
