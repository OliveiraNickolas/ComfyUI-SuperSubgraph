// Clicar de novo no dropdown aberto fecha a lista (e um terceiro clique abre).
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message));
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };

await pg.evaluate(async () => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph; const g = app.graph;
  const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const ks = LG.createNode("KSampler"); g.add(ks);
  app.canvas.deselectAll(); app.canvas.select(ks);
  ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = g.nodes.find(n => n.isSubgraphNode?.()); const id = sn.subgraph.nodes[0].id;
  const list = sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls; list.length = 0;
  list.push({ name: "Sampler", kind: "combo", label: "sampler", bind: `${id}/sampler_name`, x: 16, y: 16, w: 288, h: 32 });
  sn.pos = [60, 60]; app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1;
  sn.__legoState.refresh();
});
await pg.waitForTimeout(400);
const btn = pg.locator('.lego-row[data-name="Sampler"] .lego-combo-btn');
const open = () => pg.evaluate(() => document.querySelectorAll(".lego-list-pop").length);
await btn.click(); await pg.waitForTimeout(200); const a = await open();
await btn.click(); await pg.waitForTimeout(200); const b2 = await open();
await btn.click(); await pg.waitForTimeout(200); const c = await open();
t("first click opens the list", a === 1);
t("second click on the dropdown closes it", b2 === 0);
t("third click opens it again", c === 1);
await pg.mouse.click(1300, 850); await pg.waitForTimeout(200);
t("click outside closes it", (await open()) === 0);
t("no page errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
