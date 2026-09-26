// Execução vista no cartão (progresso, erro) e modo da seed nos nós de dentro.
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

const ids = await E(() => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const mk = (type, x, y = 0) => { const n = LG.createNode(type); n.pos = [x, y]; app.graph.add(n); return n; };
  const L = mk("LoadImage", 0), S = mk("ImageScale", 350), P = mk("PreviewImage", 700), N = mk("PrimitiveInt", 350, 400);
  L.connect(0, S, 0); S.connect(0, P, 0);
  app.canvas.deselectAll(); for (const n of [L, S, P, N]) app.canvas.select(n);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.isSubgraphNode?.());
  const inner = sn.subgraph.nodes;
  const li = inner.find(n => n.type === "LoadImage"), si = inner.find(n => n.type === "ImageScale"), ni = inner.find(n => n.type === "PrimitiveInt");
  ni.widgets.find(w => w.name === "value").value = 100;
  sn.properties.ui_layout.tabs[0].sections[0].controls.push({ name: "Stepper1", kind: "number", label: "Seed", bind: `${ni.id}/value`, x: 16, y: 16, w: 288, h: 48 });
  sn.pos = [300, 250]; sn.__legoState.refresh();
  app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  return { sn: sn.id, li: li.id, si: si.id, ni: ni.id };
});
await pg.waitForTimeout(400);

// modo da seed
const mode0 = await E(() => document.querySelector('.lego-row[data-name="Stepper1"] .lego-seed-mode')?.dataset.mode);
t("stepper bound to a value with control_after_generate shows the seed mode: " + mode0, mode0 === "fixed");
await pg.locator('.lego-row[data-name="Stepper1"] .lego-seed-mode').click(); await pg.waitForTimeout(150);
const mode1 = await E((ids) => ({ btn: document.querySelector('.lego-row[data-name="Stepper1"] .lego-seed-mode')?.textContent, w: window.app.graph.getNodeById(ids.sn).subgraph.getNodeById(ids.ni).widgets.find(w => w.options?.values?.includes?.("randomize")).value }), ids);
t("click switches the inner control widget to increment: " + JSON.stringify(mode1), mode1.w === "increment" && mode1.btn === "+1");

// executa: o erro do LoadImage aparece no cartão, e a seed de dentro anda +1
await E((ids) => { window.app.graph.getNodeById(ids.sn).subgraph.getNodeById(ids.li).widgets[0].value = "missing_" + Date.now() + ".png"; }, ids);
await E(async () => { await window.app.queuePrompt(0, 1); });
await pg.waitForTimeout(1500);
// Erro de um nó de dentro, no formato de id do subgrafo nativo ("<host>:<dentro>").
await E((ids) => window.comfyAPI.api.api.dispatchCustomEvent("execution_error", { prompt_id: "x", node_id: `${ids.sn}:${ids.li}`, exception_message: "[Errno 2] No such file or directory: 'missing.png'" }), ids);
await pg.waitForTimeout(200);
const err = await E(() => document.querySelector(".lego-run-error")?.textContent || "");
t("error banner names the inner node: " + err.slice(0, 80), /^Error in Load Image: .*No such file/.test(err));
await pg.screenshot({ path: path.join(dir, "run_error.png") });
const seed = await E((ids) => window.app.graph.getNodeById(ids.sn).subgraph.getNodeById(ids.ni).widgets.find(w => w.name === "value").value, ids);
t("control after generate runs on the inner node (100 -> " + seed + ")", seed === 101);
const shown = await E(() => document.querySelector('.lego-row[data-name="Stepper1"] input')?.value);
t("card shows the new seed: " + shown, shown === "101");

// progresso (eventos sintéticos: o CPU é rápido demais para ver a barra)
const bar = await E((ids) => {
  const api = window.comfyAPI.api.api;
  api.dispatchCustomEvent("execution_start", { prompt_id: "x" });
  const a = !!document.querySelector(".lego-run-error");
  api.dispatchCustomEvent("progress_state", { prompt_id: "x", nodes: { [`${ids.sn}:${ids.si}`]: { node_id: `${ids.sn}:${ids.si}`, state: "running", value: 3, max: 10 } } });
  const run = document.querySelector(".lego-run");
  const res = { errCleared: !a, label: run?.querySelector(".lego-run-label")?.textContent, width: run?.querySelector(".lego-run-fill")?.style.width };
  api.dispatchCustomEvent("executing", null);
  res.gone = !document.querySelector(".lego-run");
  return res;
}, ids);
t("new run clears the old error", bar.errCleared);
t("progress bar shows the running inner node: " + JSON.stringify(bar), bar.label === "Running · Upscale Image 3/10" && parseFloat(bar.width) > 0);
t("bar hides when the run ends", bar.gone);
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
