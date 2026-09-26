// Grupos: crescem até caber os itens, viram H<->V e ganham cor.
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

const sid = await E(() => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const mk = (type, x) => { const n = LG.createNode(type); n.pos = [x, 0]; app.graph.add(n); return n; };
  const C = mk("CLIPLoader", 0), T = mk("CLIPTextEncode", 400);
  C.connect(0, T, 0);
  app.canvas.deselectAll(); for (const n of [C, T]) app.canvas.select(n);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert Selection/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.isSubgraphNode?.());
  const ci = sn.subgraph.nodes.find(n => n.type === "CLIPLoader").id;
  sn.properties.ui_layout.tabs[0].sections[0].controls.push({ name: "HGroup1", kind: "segment", header: "Load CLIP", x: 16, y: 16, w: 320, h: 64, items: [
    { name: "Label1", kind: "label", text: "Clip Name", label: "Clip Name" }, { name: "Dropdown1", kind: "combo", bind: `${ci}/clip_name`, label: "Clip Name", w: 320 },
    { name: "Label2", kind: "label", text: "Type", label: "Type" }, { name: "Dropdown2", kind: "combo", bind: `${ci}/type`, label: "Type", w: 240 },
    { name: "Label3", kind: "label", text: "Device", label: "Device" }, { name: "Dropdown3", kind: "combo", bind: `${ci}/device`, label: "Device", w: 240 } ] });
  sn.pos = [60, 120]; sn.__legoState.edit = true; sn.__legoState.refresh(); sn.__legoUndoStack = [];
  app.canvas.deselectAll(); app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  return sn.id;
});
await pg.waitForTimeout(1200);
const g = () => E((sid) => {
  const sn = window.app.graph.getNodeById(sid);
  const c = sn.properties.ui_layout.tabs[0].sections[0].controls[0];
  const row = [...sn.__legoHost.querySelectorAll(".lego-row")].find(r => r.dataset.name === c.name);
  const box = row.querySelector(".lego-segment-box");
  return { kind: c.kind, w: c.w, h: c.h, color: c.color, overW: box.scrollWidth - box.clientWidth, overH: box.scrollHeight - box.clientHeight, undo: (sn.__legoUndoStack || []).length };
}, sid);
let r = await g();
const hW = r.w;
t("group grew to fit its items (no overflow): " + JSON.stringify(r), r.w > 320 && r.overW <= 1 && r.overH <= 1);
t("auto-fit is not an undo step", r.undo === 0);
await pg.screenshot({ path: path.join(dir, "group_fit.png") });
// virar para vertical pelo botão da barra flutuante
await pg.locator('.lego-row[data-name="HGroup1"]').hover();
await pg.locator('.lego-row[data-name="HGroup1"] .lego-floating-actions .btn-flip').click(); await pg.waitForTimeout(1000);
r = await g();
t("flip to vertical: narrower and taller, still no overflow: " + JSON.stringify(r), r.kind === "vsegment" && r.w < hW && r.h > 150 && r.overW <= 1 && r.overH <= 1);
await pg.screenshot({ path: path.join(dir, "group_vertical.png") });
// e de volta pelo menu
await pg.locator('.lego-row[data-name="HGroup1"]').click({ button: "right", position: { x: 6, y: 6 } }); await pg.waitForTimeout(200);
await pg.locator(".lego-ctx-item", { hasText: "Make Horizontal" }).click(); await pg.waitForTimeout(1000);
r = await g();
t("menu 'Make Horizontal' flips back to about the same size as before: " + JSON.stringify(r), r.kind === "segment" && Math.abs(r.w - hW) <= 64 && r.h <= 96 && r.overW <= 1);
const labelsOk = await E(() => [...document.querySelectorAll('.lego-row[data-name="HGroup1"] .lego-segment-item.is-label')].every(l => l.scrollWidth <= l.clientWidth + 1));
t("labels are not squeezed after flipping back", labelsOk);
// cor pelo botão
await pg.locator('.lego-row[data-name="HGroup1"]').hover();
await pg.locator('.lego-row[data-name="HGroup1"] .lego-floating-actions .btn-color').click(); await pg.waitForTimeout(150);
await pg.locator('.lego-color-swatch[title="Orange"]').click(); await pg.waitForTimeout(300);
r = await g();
const tinted = await E(() => !!document.querySelector('.lego-row.tinted[data-name="HGroup1"]'));
t("group color set from its action bar: " + r.color, r.color === "#f97316" && tinted);
await pg.screenshot({ path: path.join(dir, "group_color.png") });
// Ctrl+Z desfaz a cor
await E(() => document.activeElement?.blur()); await pg.mouse.click(1500, 950);
await E((sid) => { const st = window.app.graph.getNodeById(sid).__legoState; st.selectedNames = new Set(["HGroup1"]); }, sid);
await pg.keyboard.press("Control+z"); await pg.waitForTimeout(300);
r = await g();
t("undo removes the color", !r.color);
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
