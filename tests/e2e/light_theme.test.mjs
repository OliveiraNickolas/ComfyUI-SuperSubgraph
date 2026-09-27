// Tema claro do ComfyUI: nada do cartão pode sumir. Texto escuro no cartão
// claro; texto claro no nó colorido escuro e nas superfícies escuras (paleta,
// menus). O tema original do usuário é restaurado no fim.
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1500, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };

const orig = await pg.evaluate(() => window.app.ui.settings.getSettingValue("Comfy.ColorPalette"));
let r;
try {
  await pg.evaluate(() => window.app.ui.settings.setSettingValueAsync("Comfy.ColorPalette", "light"));
  await pg.waitForTimeout(600);
  r = await pg.evaluate(async () => {
    const app = window.app; app.graph.clear(); const LG = window.LiteGraph; const g = app.graph;
    const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
    const make = (x, color) => {
      const ks = LG.createNode("KSampler"); ks.pos = [x, 0]; g.add(ks);
      app.canvas.deselectAll(); app.canvas.select(ks);
      ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
      const sn = g.nodes.filter(n => n.isSubgraphNode?.()).pop();
      ext.__promoteWhole(sn, sn.subgraph.nodes[0], "column");
      if (color) sn.setColorOption(LGraphCanvas.node_colors[color]);
      return sn;
    };
    const plain = make(0), red = make(600, "red");
    plain.__legoState.edit = true; plain.__legoState.refresh();
    await new Promise(r => setTimeout(r, 500));
    const lum = (el) => { const m = getComputedStyle(el).color.match(/\d+(\.\d+)?/g).map(Number); return 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]; };
    return {
      plainValue: lum(plain.__legoHost.querySelector(".lego-step-input")),
      redValue: lum(red.__legoHost.querySelector(".lego-step-input")),
      redLabel: lum(red.__legoHost.querySelector(".lego-item-label")),
      paletteChip: lum(plain.__legoHost.querySelector(".lego-pal-item")),
    };
  });
} finally {
  await pg.evaluate((o) => window.app.ui.settings.setSettingValueAsync("Comfy.ColorPalette", o), orig);
}
t("light theme: values are dark on the light card (" + Math.round(r.plainValue) + ")", r.plainValue < 110);
t("light theme: values are light on a dark red node (" + Math.round(r.redValue) + ")", r.redValue > 180);
t("light theme: labels are light on a dark red node (" + Math.round(r.redLabel) + ")", r.redLabel > 120);
t("light theme: palette text is light on its dark background (" + Math.round(r.paletteChip) + ")", r.paletteChip > 150);
t("user's colour palette restored (" + orig + ")", await pg.evaluate((o) => window.app.ui.settings.getSettingValue("Comfy.ColorPalette") === o, orig));
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
