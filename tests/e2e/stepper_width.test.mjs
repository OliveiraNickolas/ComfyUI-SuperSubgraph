// Stepper num grupo com largura escolhida ocupa essa largura (como dropdown e
// texto); sem largura escolhida continua compacto.
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message));
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };

const r = await pg.evaluate(async () => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph; const g = app.graph;
  const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const E = LG.createNode("EmptyImage"); g.add(E);
  app.canvas.deselectAll(); app.canvas.select(E);
  ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = g.nodes.find(n => n.isSubgraphNode?.()); const id = sn.subgraph.nodes[0].id;
  const list = sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls; list.length = 0;
  list.push({ kind: "vsegment", name: "G", header: "Size", label: "Size", x: 16, y: 16, w: 320, h: 160, items: [
    { kind: "label", name: "LW", text: "width", label: "width" }, { kind: "number", name: "W", bind: `${id}/width`, label: "width", labelPos: "none", w: 240 },
    { kind: "label", name: "LH", text: "height", label: "height" }, { kind: "number", name: "H", bind: `${id}/height`, label: "height", labelPos: "none" } ] });
  sn.pos = [60, 60]; app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1;
  sn.__legoState.refresh(); await new Promise(r => setTimeout(r, 400));
  const m = (n) => { const it = sn.__legoHost.querySelector(`.lego-segment-item[data-name="${n}"]`); return { item: it.offsetWidth, stepper: it.querySelector(".lego-step-number").offsetWidth }; };
  return { W: m("W"), H: m("H") };
});
t("stepper with a chosen width fills it " + JSON.stringify(r.W), r.W.item >= 238 && r.W.stepper >= r.W.item - 4);
t("stepper without a chosen width stays compact " + JSON.stringify(r.H), r.H.stepper < 120);
t("no page errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
