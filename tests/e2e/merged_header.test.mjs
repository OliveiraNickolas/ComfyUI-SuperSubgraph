// Cartão fundido ao nó: sem título repetido nem moldura dupla; botões na 1ª linha.
import { launch, COMFY_URL, OUT as dir } from "../lib.mjs";
import path from "node:path";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (fn, arg) => pg.evaluate(fn, arg);
const sid = await E(() => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const mk = (type, x) => { const n = LG.createNode(type); n.pos = [x, 0]; app.graph.add(n); return n; };
  const A = mk("EmptyImage", 0), S = mk("ImageScale", 350), P = mk("PreviewImage", 700);
  A.connect(0, S, 0); S.connect(0, P, 0);
  app.canvas.deselectAll(); for (const n of [S, P]) app.canvas.select(n);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  sn.title = "MINIMAX H3 IMAGE EDIT"; sn.color = "#233"; sn.bgcolor = "#355";
  const si = sn.__ssGraph.nodes.find(n => n.type === "ImageScale").id;
  sn.properties.ui_layout.tabs[0].sections[0].controls.push({ name: "Stepper1", kind: "number", label: "Width", bind: `${si}/width`, x: 16, y: 16, w: 256, h: 48 });
  sn.pos = [150, 120]; sn.__legoState.refresh();
  app.canvas.deselectAll(); app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  return sn.id;
});
await pg.waitForTimeout(800);
const st = () => E((sid) => {
  const card = window.app.graph.getNodeById(sid).__legoHost.querySelector(".lego-card");
  const cs = getComputedStyle(card);
  return { merged: card.classList.contains("merged"), title: !!card.querySelector(".lego-title"), border: cs.borderTopWidth,
    toolsIn: card.querySelector(".lego-head-tools")?.parentElement?.className || "", enter: !!card.querySelector(".lego-head-tools .lego-ss-enter"), pencil: card.querySelectorAll(".lego-head-tools .lego-iconbtn").length };
}, sid);
let r = await st();
t("view mode: no repeated title, no inner frame, buttons on the zone header: " + JSON.stringify(r), r.merged && !r.title && r.border === "0px" && /lego-sec-h/.test(r.toolsIn) && r.enter && r.pencil === 2);
await pg.screenshot({ path: path.join(dir, "merged_view.png"), clip: { x: 100, y: 80, width: 900, height: 300 } });
await pg.locator(".lego-head-tools .lego-iconbtn:not(.lego-ss-enter)").click(); await pg.waitForTimeout(400);
r = await st();
t("edit button still works; in edit mode the buttons sit on the tab bar: " + JSON.stringify(r), await E((sid) => window.app.graph.getNodeById(sid).__legoState.edit, sid) && /lego-tabs/.test(r.toolsIn));
await pg.screenshot({ path: path.join(dir, "merged_edit.png"), clip: { x: 100, y: 80, width: 900, height: 420 } });
await pg.locator(".lego-head-tools .lego-ss-enter").click(); await pg.waitForTimeout(500);
t("enter button still opens the SuperSubgraph", await E(() => window.app.canvas.graph !== window.app.rootGraph));
await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
