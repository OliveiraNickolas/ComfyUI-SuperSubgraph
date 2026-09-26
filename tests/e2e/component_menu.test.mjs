// Menu de botão direito e Ctrl+G no ComfyUI real (sem disparar os atalhos nativos).
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

const sid = await E(async () => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const mk = (type, x) => { const n = LG.createNode(type); n.pos = [x, 0]; app.graph.add(n); return n; };
  const A = mk("EmptyImage", 0), S = mk("ImageScale", 350), P = mk("PreviewImage", 700);
  A.connect(0, S, 0); S.connect(0, P, 0);
  app.canvas.deselectAll(); app.canvas.select(S); app.canvas.select(P);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.isSubgraphNode?.());
  const si = sn.subgraph.nodes.find(n => n.type === "ImageScale").id;
  sn.properties.ui_layout.tabs[0].sections[0].controls.push(
    { name: "Stepper1", kind: "number", label: "Width", bind: `${si}/width`, x: 16, y: 16, w: 224, h: 48 },
    { name: "Stepper2", kind: "number", label: "Height", bind: `${si}/height`, x: 16, y: 80, w: 224, h: 48 });
  sn.pos = [300, 250];
  sn.__legoState.edit = true; sn.__legoState.refresh();
  app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  return sn.id;
});
await pg.waitForTimeout(500);
// botão direito no componente
await pg.locator('.lego-row[data-name="Stepper1"]').click({ button: "right", position: { x: 20, y: 10 } });
await pg.waitForTimeout(200);
const labels = await E(() => [...document.querySelectorAll(".lego-ctx-menu .lego-ctx-label")].map(e => e.textContent));
t("right-click shows the component menu: " + labels.join("|"), labels.includes("Properties") && labels.includes("Group") && labels.includes("Change to Slider"));
await pg.screenshot({ path: path.join(dir, "component_menu.png") });
await pg.keyboard.press("Escape"); await pg.mouse.click(1400, 900);
// seleciona os dois e Ctrl+G
await E((sid) => { const st = window.app.graph.getNodeById(sid).__legoState; st.selectedNames = new Set(["Stepper1", "Stepper2"]); st.selectedName = "Stepper2"; }, sid);
const groupsBefore = await E(() => (window.app.graph.groups || window.app.graph._groups || []).length);
await pg.keyboard.press("Control+g"); await pg.waitForTimeout(400);
const r = await E((sid) => { const sn = window.app.graph.getNodeById(sid); const c = sn.properties.ui_layout.tabs[0].sections[0].controls; return { kinds: c.map(x => x.kind).join(), items: (c.find(x => x.kind === "segment")?.items || []).map(i => i.name).join(), groups: (window.app.graph.groups || window.app.graph._groups || []).length }; }, sid);
t("Ctrl+G grouped the two steppers: " + JSON.stringify(r), r.kinds === "segment" && r.items === "Stepper1,Stepper2");
t("ComfyUI's own Ctrl+G did not create a canvas group", r.groups === groupsBefore);
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
