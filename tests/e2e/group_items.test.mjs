// Itens dentro de um grupo: seleção múltipla, guias ao redimensionar e altura compacta.
import { launch, COMFY_URL, OUT as dir } from "../lib.mjs";
import path from "node:path";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1200, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (fn, arg) => pg.evaluate(fn, arg);

await E(async () => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const n = LG.createNode("CLIPLoader"); app.graph.add(n);
  app.canvas.deselectAll?.(); app.canvas.select(n);
  const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  window.__sn = sn;
  const sec = sn.properties.ui_layout.tabs[0].sections[0];
  if (sec.tabs) { delete sec.tabs; delete sec.activeTab; }
  const id = sn.__ssGraph._nodes[0].id;
  // Grupo vertical no estilo "Label + controle", nascendo baixo demais (h: 60).
  sec.controls = [{ kind: "vsegment", name: "G1", header: "Load CLIP", label: "Load CLIP", x: 16, y: 16, w: 400, h: 60, items: [
    { kind: "label", name: "L1", text: "Clip Name", label: "Clip Name" }, { kind: "combo", name: "C1", bind: `${id}/clip_name`, labelPos: "none", w: 240 },
    { kind: "label", name: "L2", text: "Type", label: "Type" }, { kind: "combo", name: "C2", bind: `${id}/type`, labelPos: "none" } ] }];
  sn.__legoState.edit = true; sn.__legoState.refresh();
  app.canvas.ds.offset = [40 - sn.pos[0], 60 - sn.pos[1]]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
});
await pg.waitForTimeout(500);

// 1. Altura compacta: o grupo cresce só o necessário para os 4 itens.
const h = await E(() => window.__sn.properties.ui_layout.tabs[0].sections[0].controls[0].h);
t(`group fits its items compactly (h=${h})`, h > 60 && h <= 130);

// 2. Ctrl+clique soma itens à seleção (mesmo clicando em cima do dropdown) e não abre a lista.
const box = async (n) => pg.locator(`.lego-segment-item[data-name="${n}"]`).boundingBox();
const b1 = await box("C1"), b2 = await box("C2");
await pg.keyboard.down("Control");
await pg.mouse.click(b1.x + b1.width / 2, b1.y + b1.height / 2);
await pg.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2);
await pg.keyboard.up("Control");
await pg.waitForTimeout(150);
const sel = await E(() => [...window.__sn.__legoState.selectedNames].sort().join());
t(`ctrl+click multi-selects group items: ${sel}`, sel === "C1,C2");
t("ctrl+click does not open the dropdown", !(await pg.$(".lego-list-pop")));

// 3. Redimensionar perto da largura de outro item encaixa nela, com guia.
await pg.keyboard.press("Escape"); await pg.keyboard.press("Escape"); await pg.waitForTimeout(150);
const rz = pg.locator('.lego-segment-item[data-name="C2"] > .lego-resizer-corner');
const rb = await rz.boundingBox(); const c2 = await box("C2");
await pg.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2); await pg.mouse.down();
await pg.mouse.move(rb.x + rb.width / 2 + 243 - c2.width, rb.y + rb.height / 2, { steps: 8 });
const guides = await pg.locator(".lego-segment-box .lego-align-guide").count();
await pg.screenshot({ path: path.join(dir, "group_item_guides.png") });
await pg.mouse.up(); await pg.waitForTimeout(200);
const ws = await E(() => window.__sn.properties.ui_layout.tabs[0].sections[0].controls[0].items.filter(i => i.kind === "combo").map(i => i.w).join());
t(`resize shows a guide while snapping (${guides})`, guides >= 1);
t(`width snaps to the other item's width: ${ws}`, ws === "240,240");
t("guides are removed after the resize", (await pg.locator(".lego-align-guide").count()) === 0);

// 4. Com os dois selecionados, redimensionar um leva o outro junto.
await pg.keyboard.press("Escape"); await pg.waitForTimeout(100);
await pg.keyboard.down("Control");
for (const n of ["C1", "C2"]) { const bb = await box(n); await pg.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
await pg.keyboard.up("Control");
const rb2 = await rz.boundingBox();
await pg.mouse.move(rb2.x + rb2.width / 2, rb2.y + rb2.height / 2); await pg.mouse.down();
await pg.mouse.move(rb2.x + rb2.width / 2 - 64, rb2.y + rb2.height / 2, { steps: 6 }); await pg.mouse.up();
await pg.waitForTimeout(200);
const ws2 = await E(() => window.__sn.properties.ui_layout.tabs[0].sections[0].controls[0].items.filter(i => i.kind === "combo").map(i => i.w));
t(`selected items resize together: ${ws2}`, ws2[0] === ws2[1] && ws2[0] < 240);

// 5. Altura estável entre edição e modo normal (antes engordava a cada troca),
//    e grupo de uma linha que já tinha engordado volta à altura do conteúdo.
const hs = await E(async () => {
  const sn = window.__sn; const id = sn.__ssGraph._nodes[0].id;
  const list = sn.properties.ui_layout.tabs[0].sections[0].controls;
  list.push({ kind: "segment", name: "H1", header: "Row", label: "Row", x: 16, y: 300, w: 420, h: 96, items: [
    { kind: "combo", name: "HC", bind: `${id}/type`, labelPos: "none", w: 200 }, { kind: "label", name: "HL", text: "Device", label: "Device" } ] });
  const out = [];
  for (const edit of [true, false, true, false]) {
    sn.__legoState.edit = edit; sn.__legoState.refresh();
    await new Promise((r) => setTimeout(r, 250));
    out.push(list.find((c) => c.name === "H1").h);
  }
  return out;
});
t(`one-row group keeps the same compact height in both modes: ${hs}`, hs.every((h) => h === hs[0]) && hs[0] < 96);

t("no page errors " + JSON.stringify(errs), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
