// O nó alarga sozinho para os componentes caberem na zona (sem vazar à direita).
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
  const A = mk("EmptyImage", 0), S = mk("ImageScale", 350), P = mk("PreviewImage", 700);
  A.connect(0, S, 0); S.connect(0, P, 0);
  app.canvas.deselectAll(); for (const n of [S, P]) app.canvas.select(n);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  const si = sn.__ssGraph.nodes.find(n => n.type === "ImageScale").id;
  sn.pos = [100, 100];
  sn.setSize([600, 300]);
  sn.properties.ui_layout.tabs[0].sections[0].controls.push(
    { name: "Stepper1", kind: "number", label: "W", bind: `${si}/width`, x: 16, y: 16, w: 256, h: 48 },
    { name: "Stepper2", kind: "number", label: "H", bind: `${si}/height`, x: 720, y: 96, w: 288, h: 48 });
  sn.__legoState.refresh();
  app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 0.8; app.canvas.setDirty(true, true);
  return sn.id;
});
await pg.waitForTimeout(1500);
const fit = () => E((sid) => {
  const sn = window.app.graph.getNodeById(sid);
  const box = sn.__legoHost.querySelector(".lego-sec-controls").getBoundingClientRect();
  const row = sn.__legoHost.querySelector('.lego-row[data-name="Stepper2"]').getBoundingClientRect();
  return { nodeW: Math.round(sn.size[0]), inside: row.right <= box.right + 0.5, rowRight: Math.round(row.right), boxRight: Math.round(box.right) };
}, sid);
let r = await fit();
t("node grew so the far component fits: " + JSON.stringify(r), r.nodeW > 600 && r.inside);
await pg.screenshot({ path: path.join(dir, "fit_width.png") });
// arrasta (via layout) mais para a direita: cresce de novo; e fica estável
await E((sid) => { const sn = window.app.graph.getNodeById(sid); sn.properties.ui_layout.tabs[0].sections[0].controls[1].x = 1024; sn.__legoState.refresh(); }, sid);
await pg.waitForTimeout(1500);
r = await fit();
const w1 = r.nodeW;
t("grows again when a component moves further right: " + JSON.stringify(r), r.inside && w1 > 1024);
await pg.waitForTimeout(1500);
r = await fit();
t("stable (no runaway growth): " + w1 + " -> " + r.nodeW, r.nodeW === w1);
// modo de edição (paleta de ferramentas) também cabe
await E((sid) => { const st = window.app.graph.getNodeById(sid).__legoState; st.edit = true; st.refresh(); }, sid);
await pg.waitForTimeout(1200);
r = await fit();
t("still fits in edit mode: " + JSON.stringify(r), r.inside);
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
