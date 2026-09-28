// O que se monta na edição é o que aparece fora dela: os componentes ficam no
// mesmo lugar dentro da zona e a zona tem a mesma altura nos dois modos
// (zonas lado a lado, com uma aba e com duas abas).
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message));
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };

const r = await pg.evaluate(async () => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph; const g = app.graph;
  const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const ks = LG.createNode("KSampler"); g.add(ks);
  app.canvas.deselectAll(); app.canvas.select(ks);
  ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = g.nodes.find(n => n.isSubgraphNode?.()); const id = sn.subgraph.nodes[0].id;
  const L = sn.properties.ui_layout; const s0 = L.tabs[0].sections[0];
  s0.tabs[0].controls = [{ name: "S0", kind: "number", label: "steps", bind: `${id}/steps`, x: 16, y: 16, w: 256, h: 32 }];
  const mkS = (name, n) => ({ ...JSON.parse(JSON.stringify(s0)), name, tabs: [{ name: "Tab 1", controls: [{ name: n, kind: "number", label: "cfg", bind: `${id}/cfg`, x: 16, y: 16, w: 200, h: 32 }] }] });
  s0.row = 7; s0.width = "33.33%";
  const z2 = mkS("Z2", "S1"); z2.row = 7; z2.width = "33.33%";
  const z3 = mkS("Z3", "S2"); z3.row = 7; z3.width = "33.33%"; z3.tabs.push({ name: "Tab 2", controls: [] });
  L.tabs[0].sections.push(z2, z3);
  sn.size[0] = 900; sn.pos = [50, 50]; app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1;
  const out = {};
  for (const edit of [false, true]) {
    sn.__legoState.edit = edit; sn.__legoState.refresh(); await new Promise(r => setTimeout(r, 500));
    out[edit ? "edit" : "view"] = [...sn.__legoHost.querySelectorAll(".lego-sec")].map(sec => {
      const a = sec.getBoundingClientRect(), row = sec.querySelector(".lego-row").getBoundingClientRect();
      return [Math.round(row.left - a.left), Math.round(row.top - a.top), sec.offsetWidth, sec.offsetHeight];
    });
  }
  return out;
});
["one tab", "one tab", "two tabs"].forEach((k, i) => {
  t(`zone ${i + 1} (${k}): component at the same spot, zone same size — view ${JSON.stringify(r.view[i])} edit ${JSON.stringify(r.edit[i])}`, JSON.stringify(r.view[i]) === JSON.stringify(r.edit[i]));
});
t("no page errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
