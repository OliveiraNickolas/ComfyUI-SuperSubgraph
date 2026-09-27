// Super Subgraph dentro de outro Super Subgraph: os ids de execução dos nós
// de dentro ficam "<fora>:<dentro>:<nó>". O cartão do SS de dentro precisa
// mostrar a saída, o erro e o progresso dele mesmo assim.
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
  const conv = (graph, nodes) => { app.canvas.deselectAll(); for (const n of nodes) app.canvas.select(n); ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback(); return graph.nodes.find(n => n.isSubgraphNode?.() && !nodes.includes(n)); };
  const mk = (t, x) => { const n = LG.createNode(t); n.pos = [x, 0]; g.add(n); return n; };
  const a = mk("EmptyImage", 0), inv = mk("ImageInvert", 350), p = mk("PreviewImage", 700);
  a.widgets[0].value = 64; a.widgets[1].value = 64;
  a.connect(0, inv, 0); inv.connect(0, p, 0);
  const outer = conv(g, [inv, p]);
  // entra no SS de fora e compacta o Invert + Preview num SS de dentro
  app.canvas.openSubgraph(outer.subgraph, outer);
  await new Promise(r => setTimeout(r, 300));
  const sg = outer.subgraph;
  const inner = conv(sg, sg.nodes.filter(n => n.type === "ImageInvert" || n.type === "PreviewImage"));
  inner.title = "Inner SS";
  ext.__flatNode(inner).find(i => i && /Rebuild Card/.test(i.content)).callback();
  const L = inner.properties.ui_layout; L.activeTab = L.tabs.findIndex(t => t.name === "Output"); inner.__legoState.refresh();
  const invId = inner.subgraph.nodes.find(n => n.type === "ImageInvert").id;
  app.canvas.setGraph(app.rootGraph);
  await new Promise(r => setTimeout(r, 300));
  const pr = await app.graphToPrompt();
  const ids = Object.keys(pr.output);
  await app.queuePrompt(0, 1);
  let img = null;
  for (let i = 0; i < 40 && !img; i++) { await new Promise(r => setTimeout(r, 500)); img = inner.__legoHost.querySelector(".lego-out-box img")?.src || null; }
  // progresso e erro de um nó do SS de dentro (eventos sintéticos, com o id aninhado)
  const api = window.comfyAPI.api.api;
  const nid = `${outer.id}:${inner.id}:${invId}`;
  api.dispatchCustomEvent("execution_start", { prompt_id: "x" });
  api.dispatchCustomEvent("progress_state", { prompt_id: "x", nodes: { [nid]: { node_id: nid, state: "running", value: 2, max: 4 } } });
  const label = inner.__legoHost.querySelector(".lego-run-label")?.textContent || "";
  api.dispatchCustomEvent("execution_error", { prompt_id: "x", node_id: nid, exception_message: "boom" });
  const err = inner.__legoHost.querySelector(".lego-run-error")?.textContent || "";
  const outerErr = outer.__legoHost.querySelector(".lego-run-error")?.textContent || "";
  return { ids, img, label, err, outerErr };
});
t("prompt ids are nested " + JSON.stringify(r.ids), r.ids.some(id => id.split(":").length === 3));
t("inner Super Subgraph shows its own output: " + (r.img || "").slice(0, 80), !!r.img && /filename=/.test(r.img));
t("inner card shows progress of its node: " + r.label, /Invert/.test(r.label) && /2\/4/.test(r.label));
t("inner card names the failing node: " + r.err, /^Error in Invert Image/.test(r.err));
t("outer card also sees the error (it runs inside it): " + r.outerErr, /^Error in Inner SS/.test(r.outerErr));
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
