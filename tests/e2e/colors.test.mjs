// Cores por zona/componente, biblioteca e exportar/importar SuperSubgraph.
import { launch, COMFY_URL, OUT as dir } from "../lib.mjs";
import path from "node:path";
import fs from "node:fs";
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const pg = await ctx.newPage();
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
const NAME = "TestBlock" + Date.now();
pg.on("dialog", (d) => d.type() === "prompt" ? d.accept(NAME) : d.accept());
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (fn, arg) => pg.evaluate(fn, arg);
const ext = `window.app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph")`;

const sid = await E(() => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const mk = (type, x) => { const n = LG.createNode(type); n.pos = [x, 0]; app.graph.add(n); return n; };
  const A = mk("EmptyImage", 0), S = mk("ImageScale", 350), P = mk("PreviewImage", 700);
  A.widgets.find(w => w.name === "width").value = 64; A.widgets.find(w => w.name === "height").value = 64;
  A.connect(0, S, 0); S.connect(0, P, 0);
  app.canvas.deselectAll(); for (const n of [A, S, P]) app.canvas.select(n);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.isSubgraphNode?.());
  sn.title = "Scaler";
  const si = sn.subgraph.nodes.find(n => n.type === "ImageScale").id;
  sn.properties.ui_layout.tabs[0].sections[0].controls.push({ name: "Stepper1", kind: "number", label: "Width", bind: `${si}/width`, x: 16, y: 16, w: 256, h: 48 });
  sn.pos = [300, 250]; sn.__legoState.edit = true; sn.__legoState.refresh();
  app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  return sn.id;
});
await pg.waitForTimeout(400);
// cor da zona
await pg.locator(".lego-color-dot-btn").first().click(); await pg.waitForTimeout(150);
await pg.locator('.lego-color-swatch[title="Blue"]').click(); await pg.waitForTimeout(200);
// cor do componente pelo menu
await pg.locator('.lego-row[data-name="Stepper1"]').click({ button: "right", position: { x: 20, y: 10 } }); await pg.waitForTimeout(150);
await pg.locator(".lego-ctx-item", { hasText: "Color…" }).click(); await pg.waitForTimeout(150);
await pg.locator('.lego-color-swatch[title="Red"]').click(); await pg.waitForTimeout(200);
const col = await E((sid) => { const sn = window.app.graph.getNodeById(sid); const sec = sn.properties.ui_layout.tabs[0].sections[0];
  return { zone: sec.color, ctrl: sec.controls[0].color, secTinted: !!sn.__legoHost.querySelector(".lego-sec.tinted"), rowTinted: !!sn.__legoHost.querySelector('.lego-row.tinted[data-name="Stepper1"]') }; }, sid);
t("zone and component colors set and shown: " + JSON.stringify(col), col.zone === "#3b82f6" && col.ctrl === "#ef4444" && col.secTinted && col.rowTinted);
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
