// Nodes 2.0 (Comfy.VueNodes.Enabled): o cartão continua aparecendo e funcionando.
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
const setting = (v) => E((v) => window.app.extensionManager.setting.set("Comfy.VueNodes.Enabled", v), v);
const before = await E(() => window.app.extensionManager.setting.get("Comfy.VueNodes.Enabled"));
try {
  await setting(true); await pg.waitForTimeout(800);
  t("CSS module loaded", await E(() => (document.getElementById("lego-style")?.textContent || "").includes(".lego-card")));
  const ids = await E(() => {
    const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
    const mk = (type, x) => { const n = LG.createNode(type); n.pos = [x, 0]; app.graph.add(n); return n; };
    const A = mk("EmptyImage", 0), S = mk("ImageScale", 350), P = mk("PreviewImage", 700);
    A.connect(0, S, 0); S.connect(0, P, 0);
    app.canvas.deselectAll(); for (const n of [S, P]) app.canvas.select(n);
    app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").getCanvasMenuItems().find(i => i && /Convert/.test(i.content)).callback();
    const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
    const si = sn.__ssGraph.nodes.find(n => n.type === "ImageScale").id;
    sn.properties.ui_layout.tabs[0].sections[0].controls.push({ name: "Stepper1", kind: "number", label: "Width", bind: `${si}/width`, x: 16, y: 16, w: 256, h: 48 });
    sn.pos = [300, 200]; sn.__legoState.refresh();
    app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
    return { sn: sn.id, si };
  });
  await pg.waitForTimeout(1200);
  const vis = await E(() => { const c = [...document.querySelectorAll(".lego-card")].map(e => e.getBoundingClientRect()).find(r => r.width > 0 && r.height > 0); return c ? [Math.round(c.width), Math.round(c.height)] : null; });
  t("card is visible with Nodes 2.0: " + JSON.stringify(vis), !!vis && vis[0] > 200 && vis[1] > 80);
  await pg.screenshot({ path: path.join(dir, "vue_nodes.png") });
  const plus = pg.locator('.lego-row[data-name="Stepper1"] .lego-step-btn', { hasText: "+" });
  let wv = null;
  if (await plus.count()) {
    await plus.click();
    await pg.waitForTimeout(200);
    wv = await E((ids) => window.app.graph.getNodeById(ids.sn).__ssGraph.getNodeById(ids.si).widgets.find(w => w.name === "width").value, ids);
  }
  t("stepper still writes the inner widget: " + wv, typeof wv === "number" && wv > 512);
  await pg.locator(".lego-ss-enter").first().click(); await pg.waitForTimeout(600);
  const inside = await E(() => window.app.canvas.graph !== window.app.rootGraph && !!document.querySelector(".lego-ss-nav"));
  t("enter button opens the SuperSubgraph", inside);
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);
  t("Esc returns", await E(() => window.app.canvas.graph === window.app.rootGraph));
} finally {
  await setting(before ?? false);
}
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
