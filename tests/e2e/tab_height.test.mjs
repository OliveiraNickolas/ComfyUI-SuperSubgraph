// Abas da mesma zona têm a mesma altura: trocar de aba não muda a altura da
// zona nem do nó (a aba mais alta define a altura; aba vazia acompanha).
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
  const ks = LG.createNode("KSampler"); g.add(ks);
  app.canvas.deselectAll(); app.canvas.select(ks);
  ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = g.nodes.find(n => n.isSubgraphNode?.()); const id = sn.subgraph.nodes[0].id;
  const sec = sn.properties.ui_layout.tabs[0].sections[0];
  const mk = (n, w, y) => ({ name: n, kind: "number", label: w, bind: `${id}/${w}`, x: 16, y, w: 256, h: 32 });
  // aba 1: 1 controle; aba 2: 4 controles (mais alta); aba 3: vazia
  sec.tabs[0].controls = [mk("A0", "steps", 16)];
  sec.tabs.push({ name: "Tab 2", controls: ["steps", "cfg", "denoise", "seed"].map((w, i) => mk("B" + i, w, 16 + i * 48)) });
  sec.tabs.push({ name: "Tab 3", controls: [] });
  sn.pos = [200, 200];
  app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1;
  const out = {};
  for (const edit of [false, true]) {
    sn.__legoState.edit = edit;
    const hs = [];
    for (const i of [0, 1, 2, 0]) {
      sec.activeTab = i; sn.__legoState.refresh();
      await new Promise(r => setTimeout(r, 300));
      const el = sn.__legoHost.querySelector(".lego-sec");
      hs.push([el.offsetHeight, Math.round(sn.size[1])]);
    }
    out[edit ? "edit" : "view"] = hs;
  }
  return out;
});
for (const mode of ["view", "edit"]) {
  const hs = r[mode];
  t(`${mode}: same zone height on every tab ${JSON.stringify(hs.map(h => h[0]))}`, hs.every(h => h[0] === hs[0][0]));
  t(`${mode}: same node height on every tab ${JSON.stringify(hs.map(h => h[1]))}`, hs.every(h => h[1] === hs[0][1]));
}
t("no page errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
