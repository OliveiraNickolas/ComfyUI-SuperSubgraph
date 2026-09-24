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
const ids = await E(async () => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const mk = (type, x, y = 0) => { const n = LG.createNode(type); n.pos = [x, y]; app.graph.add(n); return n; };
  const A = mk("EmptyImage", 0), S = mk("ImageScale", 350), B = mk("ImageBlur", 700), P = mk("PreviewImage", 1050);
  A.connect(0, S, 0); S.connect(0, B, 0); B.connect(0, P, 0);
  app.canvas.deselectAll?.(); for (const n of [S, B, P]) app.canvas.select(n);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  app.canvas.ds.offset = [80 - sn.pos[0], 80 - sn.pos[1]]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  return { sn: sn.id, S: S.id, B: B.id };
});
await pg.waitForTimeout(600);
// 1. modo de edição (lápis) e duplo clique na zona vazia do cartão
await pg.locator(".lego-head-tools .lego-iconbtn:not(.lego-ss-enter)").last().click(); await pg.waitForTimeout(300);
await pg.locator(".lego-zone-dropzone").dblclick(); await pg.waitForTimeout(400);
t("double-click on the empty zone opens the selector", await pg.locator(".lego-comfy-dialog").count() === 1);
// 2. Target Picker
await pg.locator(".lego-comfy-target-picker-btn").click(); await pg.waitForTimeout(700);
let st = await E(() => ({ inner: window.app.canvas.graph !== window.app.rootGraph, hud: document.querySelector(".lego-picker-hud")?.innerText || "" }));
t("picker opens the inner graph with Promote/Cancel", st.inner && /Promote/.test(st.hud) && /Cancel/.test(st.hud));
// posições na tela
const pos = (sel) => E(({ id, widget, title }) => {
  const c = window.app.canvas; const n = c.graph.getNodeById(id); const r = c.canvas.getBoundingClientRect(); const T = window.LiteGraph.NODE_TITLE_HEIGHT || 30;
  let x, y;
  if (title) { x = n.pos[0] + 40; y = n.pos[1] - T / 2; }
  else { const w = n.widgets.find(w => w.name === widget); const h = w.computedHeight ?? 20; x = n.pos[0] + n.size[0] / 2; y = n.pos[1] + w.y + h / 2; }
  return [r.left + (x + c.ds.offset[0]) * c.ds.scale, r.top + (y + c.ds.offset[1]) * c.ds.scale];
}, sel);
const click = async (sel) => { const [x, y] = await pos(sel); await pg.mouse.click(x, y); await pg.waitForTimeout(150); };
const boxes = () => E(() => ({ whole: document.querySelectorAll(".lego-pick-box.whole").length, widget: document.querySelectorAll(".lego-pick-box.widget").length, hud: document.querySelector(".lego-picker-promote-btn")?.innerText }));
{ const [x, y] = await pos({ id: ids.B, title: true });
  console.log("DEBUG title", JSON.stringify(await E(([x, y, id]) => { const e = document.elementFromPoint(x, y); const c = window.app.canvas; const n = c.graph.getNodeById(id); const r = c.canvas.getBoundingClientRect(); const cx = (x - r.left) / c.ds.scale - c.ds.offset[0], cy = (y - r.top) / c.ds.scale - c.ds.offset[1]; return { tag: e.tagName, cls: String(e.className).slice(0, 60), isCanvas: e === c.canvas, onPos: c.graph.getNodeOnPos?.(cx, cy)?.id, pos: n.pos, cy, widgetAt: n.getWidgetOnPos?.(cx, cy, true)?.name }; }, [x, y, ids.B]))); }
await click({ id: ids.B, title: true });
let bx = await boxes(); t("click on a title picks the whole node (purple border) " + JSON.stringify(bx), bx.whole === 1 && /Promote \(1\)/.test(bx.hud));
await click({ id: ids.B, widget: "sigma" });
bx = await boxes(); t("click on a parameter of a whole-picked node unpicks just it " + JSON.stringify(bx), bx.whole === 0 && bx.widget === 1);
await click({ id: ids.B, title: true });
bx = await boxes(); t("title again: whole node picked " + JSON.stringify(bx), bx.whole === 1 && bx.widget === 0);
await click({ id: ids.S, widget: "width" });
await click({ id: ids.S, widget: "height" });
bx = await boxes(); t("two single parameters picked (green borders) " + JSON.stringify(bx), bx.widget === 2 && /Promote \(3\)/.test(bx.hud));
await click({ id: ids.S, widget: "height" });
bx = await boxes(); t("clicking a picked parameter again unpicks it " + JSON.stringify(bx), bx.widget === 1 && /Promote \(2\)/.test(bx.hud));
await pg.screenshot({ path: path.join(dir, "promote_picking.png") });
// 3. Promote
await pg.locator(".lego-picker-promote-btn").click(); await pg.waitForTimeout(600);
const res = await E((sid) => {
  const app = window.app; const sn = app.graph.getNodeById(sid);
  const ctrls = sn.properties.ui_layout.tabs[0].sections[0].controls;
  return { root: app.canvas.graph === app.rootGraph, dialog: !!document.querySelector(".lego-comfy-dialog"), ctrls: ctrls.map(c => ({ kind: c.kind, bind: c.bind, header: c.header, items: (c.items || []).filter(i => i.bind).map(i => i.bind) })), selected: [...sn.__legoState.selectedNames] };
}, ids.sn);
console.log("RESULT", JSON.stringify(res));
t("Promote returns to the workflow and closes the selector", res.root && !res.dialog);
t("whole ImageBlur became a whole-node widget", res.ctrls.some(c => c.kind === "segment" && c.items.includes(`${ids.B}/blur_radius`) && c.items.includes(`${ids.B}/sigma`)));
t("ImageScale.width became its own component (height not)", res.ctrls.some(c => c.bind === `${ids.S}/width`) && !res.ctrls.some(c => c.bind === `${ids.S}/height`));
t("promoted items come selected", res.selected.length === 2);
await pg.waitForTimeout(300);
await pg.screenshot({ path: path.join(dir, "promote_result.png") });
// undo desfaz tudo de uma vez
await E(() => document.activeElement?.blur()); await pg.mouse.click(700, 850); await pg.keyboard.press("Escape");
const before = await E((sid) => window.app.graph.getNodeById(sid).properties.ui_layout.tabs[0].sections[0].controls.length, ids.sn);
await E((sid) => { window.__snRef = window.app.graph.getNodeById(sid); }, ids.sn);
await pg.keyboard.press("Control+z"); await pg.waitForTimeout(300);
const after = await E((sid) => window.app.graph.getNodeById(sid).properties.ui_layout.tabs[0].sections[0].controls.length, ids.sn);
t("card undo does not also trigger ComfyUI's workflow undo (graph not reloaded)", await E((sid) => window.app.graph.getNodeById(sid) === window.__snRef, ids.sn));
t(`one undo removes the whole promotion (${before} -> ${after})`, before === 2 && after === 0);
t("no extension errors " + JSON.stringify(errs.slice(0, 4)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
