// Grupo montado sozinho (nó inteiro promovido) fica na altura do conteúdo:
// nada de sobra vazia embaixo. Depois que o usuário muda a altura, ela é dele.
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1500, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
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
  const sn = g.nodes.find(n => n.isSubgraphNode?.());
  sn.pos = [100, 100]; app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  const grp = ext.__promoteWhole(sn, sn.subgraph.nodes[0], "column");
  await new Promise(r => setTimeout(r, 800));
  const box = sn.__legoHost.querySelector(`.lego-row[data-name="${grp.name}"] .lego-segment-box`);
  const items = [...box.querySelectorAll(":scope > .lego-segment-item")];
  const last = items[items.length - 1];
  const spare = box.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom;
  // editar não muda o tamanho de nada dentro do grupo (rótulo e controle)
  const sizes = () => [...sn.__legoHost.querySelectorAll(`.lego-row[data-name="${grp.name}"] .lego-segment-item .lego-item-label`)].map(l => `${l.offsetWidth}x${l.offsetHeight}|${l.nextElementSibling?.offsetWidth}x${l.nextElementSibling?.offsetHeight}`).join(" ");
  const viewSizes = sizes();
  sn.__legoState.edit = true; sn.__legoState.refresh(); await new Promise(r => setTimeout(r, 300));
  const editSizes = sizes();
  sn.__legoState.edit = false; sn.__legoState.refresh(); await new Promise(r => setTimeout(r, 300));
  // o usuário escolhe outra altura: o ajuste automático não a desfaz
  grp.h = grp.h + 80; sn.__legoState.refresh();
  await new Promise(r => setTimeout(r, 500));
  return { spare, userH: grp.h, estimate: grp.autoH, viewSizes, editSizes };
});
t("auto group has no empty space at the bottom (spare " + Math.round(r.spare) + "px)", r.spare < 20);
t("edit mode doesn't resize labels or controls in the group " + (r.viewSizes === r.editSizes ? "" : JSON.stringify([r.viewSizes, r.editSizes])), r.viewSizes === r.editSizes && r.viewSizes.length > 0);
t("a height the user chose is kept (" + r.userH + ")", r.userH !== r.estimate);
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
