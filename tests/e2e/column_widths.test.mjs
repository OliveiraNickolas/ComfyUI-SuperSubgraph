// Larguras livres das colunas de uma linha: digitar ("30 / 45 / 25") no
// duplo clique do divisor e arrastar para um valor fora das frações comuns.
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1500, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
let answer = "30 / 45 / 25";
pg.on("dialog", (d) => d.accept(answer));
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (fn, arg) => pg.evaluate(fn, arg);

await E(async () => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const n = LG.createNode("EmptyImage"); app.graph.add(n);
  app.canvas.deselectAll?.(); app.canvas.select(n);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph"); window.__sn = sn;
  const z = (h, w, col) => ({ header: h, width: w, col, row: 1, controls: [] });
  sn.properties.ui_layout.tabs[0].sections = [{ header: "TOP", width: "100%", controls: [] }, z("A", "33.3%", 0), z("B", "33.3%", 1), z("C", "33.3%", 2)];
  sn.setSize([1200, 500]);
  sn.__legoState.edit = true; sn.__legoState.refresh();
  app.canvas.ds.offset = [40 - sn.pos[0], 60 - sn.pos[1]]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
});
await pg.waitForTimeout(500);
const widths = () => E(() => {
  const cols = [...window.__sn.__legoHost.querySelectorAll(".lego-cols-row > .lego-col")];
  const total = cols.reduce((a, c) => a + c.getBoundingClientRect().width, 0);
  return cols.map((c) => Math.round((c.getBoundingClientRect().width / total) * 1000) / 10);
});

// 1. Duplo clique no divisor: digita as três larguras.
await pg.locator(".lego-col-divider").first().dblclick(); await pg.waitForTimeout(400);
const saved = await E(() => window.__sn.properties.ui_layout.tabs[0].sections.slice(1).map((s) => s.width).join());
const w1 = await widths();
t(`typed widths are saved: ${saved}`, saved === "30%,45%,25%");
t(`columns render at 30/45/25 of the row: ${w1}`, Math.abs(w1[0] - 30) < 0.6 && Math.abs(w1[1] - 45) < 0.6 && Math.abs(w1[2] - 25) < 0.6);

// 2. Soma diferente de 100: ajusta proporcionalmente.
answer = "1 1 2";
await pg.locator(".lego-col-divider").first().dblclick(); await pg.waitForTimeout(400);
const w2 = await widths();
t(`widths not adding to 100 are scaled: ${w2}`, Math.abs(w2[0] - 25) < 0.6 && Math.abs(w2[2] - 50) < 0.6);

// 3. Arrastar o divisor para um valor livre (não cai em 25/33/50).
const d = await pg.locator(".lego-col-divider").first().boundingBox();
const rowW = await E(() => window.__sn.__legoHost.querySelector(".lego-cols-row").getBoundingClientRect().width - 24);
await pg.mouse.move(d.x + d.width / 2, d.y + 40); await pg.mouse.down();
await pg.mouse.move(d.x + d.width / 2 + rowW * 0.04, d.y + 40, { steps: 10 }); await pg.mouse.up();
await pg.waitForTimeout(400);
const a = parseFloat(await E(() => window.__sn.properties.ui_layout.tabs[0].sections[1].width));
t(`drag gives a free width (${a}%)`, a > 26 && a < 32 && Number.isInteger(a));

t("no page errors " + JSON.stringify(errs), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
