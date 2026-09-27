// Apagar lá dentro um nó que o cartão usa: ao voltar para o workflow, o
// cartão avisa quantos componentes perderam o nó (uma vez só).
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1500, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (fn, arg) => pg.evaluate(fn, arg);
const toast = () => E(() => { const el = document.getElementById("lego-action-toast"); return el?.classList.contains("visible") ? el.textContent : ""; });

await E(() => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph; const g = app.graph;
  const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const a = LG.createNode("ImageBlur"); g.add(a); const c = LG.createNode("ImageInvert"); c.pos = [400, 0]; g.add(c);
  app.canvas.deselectAll(); app.canvas.select(a); app.canvas.select(c);
  ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = g.nodes.find(n => n.isSubgraphNode?.());
  sn.title = "My SS";
  ext.__promoteWhole(sn, sn.subgraph.nodes.find(n => n.type === "ImageBlur"), "column");
  window.__sn = sn;
});
await pg.waitForTimeout(400);
// entra e volta sem mudar nada: sem aviso
await E(() => window.app.canvas.openSubgraph(window.__sn.subgraph, window.__sn)); await pg.waitForTimeout(500);
await pg.locator(".subgraph-breadcrumb .p-breadcrumb-item-link").first().click(); await pg.waitForTimeout(400);
t("no warning when nothing changed inside", !/lost/.test(await toast()));
// entra, apaga o ImageBlur, volta
await E(() => window.app.canvas.openSubgraph(window.__sn.subgraph, window.__sn)); await pg.waitForTimeout(500);
await E(() => { const g = window.app.canvas.graph; g.remove(g.nodes.find(n => n.type === "ImageBlur")); });
await pg.locator(".subgraph-breadcrumb .p-breadcrumb-item-link").first().click(); await pg.waitForTimeout(400);
const msg = await toast();
t("warning after deleting a node the card uses: " + msg, /My SS: 2 components lost their node/.test(msg));
await pg.waitForTimeout(5500);
await E(() => window.app.canvas.openSubgraph(window.__sn.subgraph, window.__sn)); await pg.waitForTimeout(500);
await pg.locator(".subgraph-breadcrumb .p-breadcrumb-item-link").first().click(); await pg.waitForTimeout(400);
t("the same loss is not warned again", !/lost/.test(await toast()));
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
