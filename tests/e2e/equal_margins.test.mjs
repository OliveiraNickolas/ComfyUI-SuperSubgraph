// Redimensionar um componente até perto da borda direita da zona encaixa com
// a MESMA margem da esquerda (antes a largura ia para a grade de 16 e a margem
// direita ficava maior). E a largura não volta para a grade ao redesenhar.
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
  list.push({ name: "Steps", kind: "number", label: "steps", bind: `${id}/steps`, x: 16, y: 16, w: 256, h: 32 });
  sn.size[0] = 707;   // largura que não é múltipla de 16
  sn.pos = [60, 60]; app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1;
  sn.__legoState.edit = true; sn.__legoState.refresh();
  window.__sn = sn;
});
await pg.waitForTimeout(500);
const geo = await pg.evaluate(() => {
  const host = window.__sn.__legoHost;
  const box = host.querySelector(".lego-sec-controls"), row = host.querySelector('.lego-row[data-name="Steps"]');
  const corner = row.querySelector(".lego-resizer-corner").getBoundingClientRect(), br = box.getBoundingClientRect();
  return { boxW: box.clientWidth, cx: corner.left + corner.width / 2, cy: corner.top + corner.height / 2, boxRight: br.left + box.clientLeft + box.clientWidth };
});
await pg.hover('.lego-row[data-name="Steps"]');
await pg.mouse.move(geo.cx, geo.cy); await pg.mouse.down();
// solta a 5px da posição de margem igual (16 da borda direita)
const target = geo.boxRight - 16 - 5;
for (let i = 1; i <= 10; i++) { await pg.mouse.move(geo.cx + (target - geo.cx) * i / 10, geo.cy); await pg.waitForTimeout(20); }
await pg.mouse.up(); await pg.waitForTimeout(400);
const r = await pg.evaluate(async () => {
  const c = window.__sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls[0];
  const box = window.__sn.__legoHost.querySelector(".lego-sec-controls");
  const a = { x: c.x, w: c.w, right: box.clientWidth - (c.x + c.w) };
  window.__sn.__legoState.edit = false; window.__sn.__legoState.refresh(); await new Promise(r => setTimeout(r, 400));
  const box2 = window.__sn.__legoHost.querySelector(".lego-sec-controls");
  return { ...a, afterRefreshRight: box2.clientWidth - (c.x + c.w), boxW: box.clientWidth };
});
t(`resize near the right edge snaps to the same margin as the left: left ${r.x}, right ${r.right}`, r.right === r.x);
t(`…and stays so out of edit mode (right ${r.afterRefreshRight})`, r.afterRefreshRight === r.x);
t("no page errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
