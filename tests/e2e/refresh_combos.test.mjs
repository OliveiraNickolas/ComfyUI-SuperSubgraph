// Tecla R (Refresh Node Definitions) atualiza os combos dos nós de dentro do
// Super Subgraph; Caption Align centraliza o caption.
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch(); const pg = await b.newPage({ viewport: { width: 1200, height: 800 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message));
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
const before = await pg.evaluate(async () => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const n = LG.createNode("LoraLoader"); app.graph.add(n);
  app.canvas.deselectAll?.(); app.canvas.select(n);
  const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  const sec = sn.properties.ui_layout.tabs[0].sections[0]; if (sec.tabs) { delete sec.tabs; delete sec.activeTab; } sec.controls = [];
  ext.__promoteWhole(sn, sn.__ssGraph._nodes[0], "column");
  const w = sn.__ssGraph._nodes[0].widgets[0];
  const real = w.options.values.length;
  w.options.values = ["stale.safetensors"];   // lista "velha", como antes de um arquivo novo aparecer
  window.__w = w;
  // Caption centralizado
  const g = sec.controls[0]; g.items[0].labelAlign = "center"; sn.__legoState.refresh();
  app.canvas.ds.offset = [40 - sn.pos[0], 60 - sn.pos[1]]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  return { real, stale: w.options.values.length };
});
await pg.locator("canvas#graph-canvas").click({ position: { x: 900, y: 600 } });
await pg.keyboard.press("r");
await pg.waitForFunction(() => window.__w.options.values.length > 1, null, { timeout: 20000 }).catch(() => {});
const after = await pg.evaluate(() => window.__w.options.values.length);
const lbl = await pg.evaluate(() => { const e = document.querySelector(".lego-segment-item.lbl-align-center .lego-item-label"); return e && getComputedStyle(e).textAlign; });
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
t(`R refreshes combo lists inside the Super Subgraph (${before.stale} -> ${after}, real ${before.real})`, after === before.real && before.real > 1);
t(`Caption Align center applies (${lbl})`, lbl === "center");
t("no page errors " + JSON.stringify(errs), !errs.length);
console.log(`
${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
