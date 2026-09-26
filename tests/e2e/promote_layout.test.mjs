// Promover vários de uma vez: componentes arrumados em linhas, sem sobreposição.
import { launch, COMFY_URL, OUT as dir } from "../lib.mjs";
import path from "node:path";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (f, a) => pg.evaluate(f, a);
const ids = await E(() => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const mk = (type, x, y) => { const n = LG.createNode(type); n.pos = [x, y]; app.graph.add(n); return n; };
  const A = mk("EmptyImage", -400, 0);
  const S = mk("ImageScale", 0, 0), B = mk("ImageBlur", 400, 0), H = mk("ImageSharpen", 0, 300), P = mk("PreviewImage", 400, 300);
  A.connect(0, S, 0); S.connect(0, B, 0); B.connect(0, H, 0); H.connect(0, P, 0);
  app.canvas.deselectAll(); for (const n of [S, B, H, P]) app.canvas.select(n);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert Selection/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.isSubgraphNode?.());
  sn.pos = [60, 100]; app.canvas.deselectAll();
  app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  return { sn: sn.id, S: S.id, B: B.id, H: H.id };
});
await pg.waitForTimeout(600);
await pg.locator(".lego-promote-cta").click(); await pg.waitForTimeout(800);
const pos = (sel) => E(({ id, widget, title }) => {
  const c = window.app.canvas; const n = c.graph.getNodeById(id); const r = c.canvas.getBoundingClientRect(); const T = window.LiteGraph.NODE_TITLE_HEIGHT || 30;
  let x, y;
  if (title) { x = n.pos[0] + 40; y = n.pos[1] - T / 2; }
  else { const w = n.widgets.find(w => w.name === widget); const h = w.computedHeight ?? 20; x = n.pos[0] + n.size[0] / 2; y = n.pos[1] + w.y + h / 2; }
  return [r.left + (x + c.ds.offset[0]) * c.ds.scale, r.top + (y + c.ds.offset[1]) * c.ds.scale];
}, sel);
const click = async (sel) => { const [x, y] = await pos(sel); await pg.mouse.click(x, y); await pg.waitForTimeout(150); };
// escolhe fora de ordem: Sharpen inteiro, Blur inteiro, 3 parâmetros do Scale
await click({ id: ids.H, title: true });
await click({ id: ids.B, title: true });
await click({ id: ids.S, widget: "width" });
await click({ id: ids.S, widget: "height" });
await click({ id: ids.S, widget: "upscale_method" });
t("5 picks", /Promote \(5\)/.test(await E(() => document.querySelector(".lego-picker-promote-btn")?.innerText || "")));
await pg.locator(".lego-picker-promote-btn").click(); await pg.waitForTimeout(1500);
const r = await E((sid) => {
  const sn = window.app.graph.getNodeById(sid);
  const ctrls = sn.properties.ui_layout.tabs[0].sections[0].controls;
  const box = sn.__legoHost.querySelector(".lego-sec-controls");
  return { zoneW: box.clientWidth, c: ctrls.map(c => ({ n: c.name, k: c.kind, b: c.bind || (c.items || []).find(i => i.bind)?.bind || "", x: c.x, y: c.y, w: c.w, h: c.h })) };
}, ids.sn);
console.log(JSON.stringify(r));
const c = r.c;
const overlap = c.some((a, i) => c.some((o, j) => j > i && a.x < o.x + o.w && a.x + a.w > o.x && a.y < o.y + o.h && a.y + a.h > o.y));
t("5 components, none overlapping, unique names: " + c.map(x => x.n).join(), c.length === 5 && !overlap && new Set(c.map(x => x.n)).size === 5);
t("side by side in rows (not one column)", new Set(c.map(x => x.y)).size < c.length);
t("all inside the zone width and on the 16px grid", c.every(x => x.x + x.w <= r.zoneW && x.x % 16 === 0 && x.y % 16 === 0));
const idOf = (x) => String(x.b).split("/")[0];
t("canvas order: Scale params (top-left) first, Sharpen (bottom) last: " + c.map(idOf).join(","), idOf(c[0]) === String(ids.S) && idOf(c[c.length - 1]) === String(ids.H));
await pg.screenshot({ path: path.join(dir, "promote_layout.png") });
// segunda promoção com a zona já ocupada: vai para baixo do que existe
{ const zb = await pg.locator(".lego-sec-controls").first().boundingBox(); await pg.mouse.dblclick(zb.x + zb.width - 24, zb.y + zb.height - 12); }
await pg.waitForTimeout(500);
const hasDlg = await pg.locator(".lego-comfy-target-picker-btn").count();
if (hasDlg) {
  await pg.locator(".lego-comfy-target-picker-btn").click(); await pg.waitForTimeout(700);
  await click({ id: ids.S, widget: "crop" });
  await pg.locator(".lego-picker-promote-btn").click(); await pg.waitForTimeout(1200);
  const r2 = await E((sid) => window.app.graph.getNodeById(sid).properties.ui_layout.tabs[0].sections[0].controls.map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h })), ids.sn);
  const nw = r2[r2.length - 1];
  const ov = r2.slice(0, -1).some(o => nw.x < o.x + o.w && nw.x + nw.w > o.x && nw.y < o.y + o.h && nw.y + nw.h > o.y);
  t("a second promotion does not cover the existing ones", !ov);
} else t("second promotion dialog opened", false);
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
