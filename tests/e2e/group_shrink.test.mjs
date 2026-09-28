// 1. Grupo horizontal com um item de largura escolhida (combo) pode ficar mais
//    estreito: o item encolhe, o grupo não volta a crescer fora da edição.
// 2. "Distribute vertically" deixa espaços iguais (sem arredondar para a grade).
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1300, height: 1000 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message));
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };

const r1 = await pg.evaluate(async () => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph; const g = app.graph;
  const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const ll = LG.createNode("LoraLoader"); g.add(ll);
  ll.widgets.find(w => w.name === "lora_name").value = "a_very_long_lora_file_name_used_only_for_testing.safetensors";
  app.canvas.deselectAll(); app.canvas.select(ll);
  ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = g.nodes.find(n => n.isSubgraphNode?.()); const id = sn.subgraph.nodes[0].id;
  window.__sn = sn; window.__id = id;
  const list = sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls; list.length = 0;
  list.push({ kind: "segment", name: "GB", header: "LoRA", label: "LoRA", x: 16, y: 16, w: 640, h: 57, items: [
    { kind: "combo", name: "GBC", bind: `${id}/lora_name`, labelPos: "none", w: 288 },
    { kind: "number", name: "GBN", bind: `${id}/strength_model`, label: "Strength Model" } ] });
  sn.pos = [100, 60]; app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1;
  const st = sn.__legoState;
  st.edit = true; st.refresh(); await new Promise(r => setTimeout(r, 400));
  list[0].w = 400; st.refresh(); await new Promise(r => setTimeout(r, 400));
  st.edit = false; st.refresh(); await new Promise(r => setTimeout(r, 600));
  const combo = sn.__legoHost.querySelector('.lego-segment-item[data-name="GBC"]');
  return { w: list[0].w, combo: combo.offsetWidth };
});
t(`narrowed group keeps its width out of edit mode (400 -> ${r1.w}), combo shrank to ${r1.combo}`, r1.w === 400 && r1.combo < 288);

await pg.evaluate(async () => {
  const sn = window.__sn, id = window.__id;
  const list = sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls; list.length = 0;
  [16, 60, 150, 190, 290, 330, 470].forEach((y, i) => list.push({ kind: "segment", name: "G" + i, header: "LoRA " + i, label: "LoRA " + i, x: 16, y, w: 460, h: 57, items: [
    { kind: "combo", name: "G" + i + "C", bind: `${id}/lora_name`, labelPos: "none", w: 200 },
    { kind: "number", name: "G" + i + "N", bind: `${id}/strength_model`, label: "Strength Model" } ] }));
  const st = sn.__legoState; st.edit = true; st.refresh(); await new Promise(r => setTimeout(r, 400));
  st.selectedNames = new Set(list.map(c => c.name)); st.selectedName = "G6"; st.refresh();
});
await pg.waitForTimeout(400);
await pg.locator('.lego-align-btn[data-op="vdist"]').first().click();
await pg.waitForTimeout(500);
const gaps = () => pg.evaluate(() => { const rows = [...window.__sn.__legoHost.querySelectorAll(".lego-sec-controls > .lego-row")].sort((a, b) => a.offsetTop - b.offsetTop); return rows.slice(1).map((r, i) => r.offsetTop - (rows[i].offsetTop + rows[i].offsetHeight)); });
const g1 = await gaps();
t("Distribute vertically: equal gaps (±1px) " + JSON.stringify(g1), g1.length === 6 && Math.max(...g1) - Math.min(...g1) <= 1);
await pg.evaluate(async () => { const st = window.__sn.__legoState; st.edit = false; st.refresh(); await new Promise(r => setTimeout(r, 500)); });
const g2 = await gaps();
t("…and the same out of edit mode " + JSON.stringify(g2), JSON.stringify(g1) === JSON.stringify(g2));
t("no page errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
