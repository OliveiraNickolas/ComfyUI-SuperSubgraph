// Cor: o mesmo botão (bolinha) em todo lugar que tem cor — componente solto,
// grupo, item dentro de grupo e Inspetor de Objetos. Antes só grupos e zonas
// tinham o botão; o resto era só pelo botão direito.
import { launch, COMFY_URL, OUT as dir } from "../lib.mjs";
import path from "node:path";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1500, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (fn, arg) => pg.evaluate(fn, arg);

await E(() => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph; const g = app.graph;
  const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const blur = LG.createNode("ImageBlur"); g.add(blur); const lat = LG.createNode("EmptyLatentImage"); lat.pos = [400, 0]; g.add(lat);
  app.canvas.deselectAll(); app.canvas.select(blur); app.canvas.select(lat);
  ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = g.nodes.find(n => n.isSubgraphNode?.());
  const bid = sn.subgraph.nodes.find(n => n.type === "ImageBlur").id;
  ext.__promoteWhole(sn, sn.subgraph.nodes.find(n => n.type === "EmptyLatentImage"), "column");
  const list = sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls;
  const y = Math.max(...list.map(c => c.y + c.h)) + 24;
  list.push({ name: "SigmaStep", kind: "number", label: "Sigma", bind: `${bid}/sigma`, x: 16, y, w: 256, h: 32 });
  sn.pos = [80, 120]; sn.__legoState.edit = true; sn.__legoState.refresh();
  app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  window.__sn = sn;
});
await pg.waitForTimeout(600);
const pick = async (btn, swatch = "Red") => {
  await btn.click({ force: true }); await pg.waitForTimeout(200);
  await pg.locator(`.lego-color-menu .lego-color-swatch[title="${swatch}"]`).click(); await pg.waitForTimeout(300);
};
const ctrl = (name) => E((n) => { let found; const walk = (cs) => cs.forEach(c => { if (c.name === n) found = c; if (c.items) walk(c.items); }); walk(window.__sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls); return found?.color || null; }, name);

// 1. componente solto: bolinha na barra flutuante
const stepRow = pg.locator('.lego-row[data-name="SigmaStep"]');
await stepRow.hover();
t("a loose component has the colour button", await stepRow.locator(".lego-floating-actions .btn-color").count() === 1);
await pick(stepRow.locator(".lego-floating-actions .btn-color"));
t("loose component coloured from its button: " + await ctrl("SigmaStep"), !!(await ctrl("SigmaStep")));

// 2. grupo: continua tendo
const grpName = await E(() => window.__sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls.find(c => c.kind === "vsegment").name);
const grpRow = pg.locator(`.lego-row[data-name="${grpName}"]`);
t("a group has the colour button", await grpRow.locator(":scope > .lego-floating-actions .btn-color").count() === 1);

// 3. item dentro do grupo
const itemName = await E((g) => window.__sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls.find(c => c.name === g).items.find(i => i.kind !== "label").name, grpName);
const item = pg.locator(`.lego-segment-item[data-name="${itemName}"]`);
await item.hover();
t("an item inside a group has the colour button", await item.locator(".lego-item-color-btn").count() === 1);
await pick(item.locator(".lego-item-color-btn"), "Blue");
t("group item coloured from its button: " + await ctrl(itemName), !!(await ctrl(itemName)) && (await ctrl(grpName)) == null);

// 4. Inspetor de Objetos: linha Color
await stepRow.click({ button: "right", position: { x: 20, y: 10 } }); await pg.waitForTimeout(200);
await pg.locator(".lego-ctx-item", { hasText: "Properties" }).click(); await pg.waitForTimeout(400);
const oiBtn = pg.locator(".lego-oi .lego-oi-color-btn");
t("Object Inspector has a Color row", await oiBtn.count() === 1);
await pick(oiBtn, "No color");
t("Inspector clears the colour: " + await ctrl("SigmaStep"), (await ctrl("SigmaStep")) == null);
await pg.screenshot({ path: path.join(dir, "color_picker.png") });
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
