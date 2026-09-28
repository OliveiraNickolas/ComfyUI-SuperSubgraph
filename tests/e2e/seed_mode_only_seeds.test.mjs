// O botão FIX/+1/−1/dado aparece por padrão só em seed (ou onde o nó declara
// control_after_generate). O Primitive node dá esse combo a TODO número —
// ligado a um width, o stepper do cartão não mostra o botão por padrão.
// Mas o usuário pode ligar em qualquer stepper (e desligar na seed); sem o
// combo do ComfyUI, o cartão aplica o modo depois de cada Run.
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
  const mk = (type, x, y = 0) => { const n = LG.createNode(type); n.pos = [x, y]; g.add(n); return n; };
  const E = mk("EmptyImage", 400), P = mk("PrimitiveNode", 0), K = mk("KSampler", 400, 300);
  P.connect(0, E, E.inputs.findIndex(i => i.name === "width"));
  await new Promise(r => setTimeout(r, 200));
  const out = { primWidgets: (P.widgets || []).map(w => w.name) };
  app.canvas.deselectAll(); for (const n of [E, P, K]) app.canvas.select(n);
  ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = g.nodes.find(n => n.isSubgraphNode?.());
  const inner = (t) => sn.subgraph.nodes.find(n => n.type === t);
  const list = sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls; list.length = 0;
  list.push({ name: "Width", kind: "number", label: "Width", bind: `${inner("PrimitiveNode").id}/value`, x: 16, y: 16, w: 288, h: 32 });
  list.push({ name: "Height", kind: "number", label: "Height", bind: `${inner("EmptyImage").id}/height`, x: 16, y: 64, w: 288, h: 32 });
  list.push({ name: "Seed", kind: "number", label: "Seed", bind: `${inner("KSampler").id}/seed`, x: 16, y: 112, w: 288, h: 32 });
  sn.__legoState.refresh(); await new Promise(r => setTimeout(r, 300));
  const has = (n) => !!sn.__legoHost.querySelector(`.lego-row[data-name="${n}"] .lego-seed-mode`);
  return { ...out, width: has("Width"), height: has("Height"), seed: has("Seed") };
});
t("the Primitive node really has a control combo (the case being tested) " + JSON.stringify(r.primWidgets), r.primWidgets.length > 1);
t("width from a Primitive node: no FIX button", r.width === false);
t("plain height: no FIX button", r.height === false);
t("KSampler seed keeps the FIX button", r.seed === true);
// liga no Height (sem o combo do ComfyUI), escolhe +1 e simula um Run
const r2 = await pg.evaluate(async () => {
  const sn = window.app.graph.nodes.find(n => n.isSubgraphNode?.());
  const list = sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls;
  const E = sn.subgraph.nodes.find(n => n.type === "EmptyImage"); const hw = E.widgets.find(w => w.name === "height");
  list.find(c => c.name === "Height").seedMode = true;
  list.find(c => c.name === "Seed").seedMode = false;
  sn.__legoState.refresh(); await new Promise(r => setTimeout(r, 300));
  const btn = () => sn.__legoHost.querySelector('.lego-row[data-name="Height"] .lego-seed-mode');
  const out = { shown: !!btn(), seedHidden: !sn.__legoHost.querySelector('.lego-row[data-name="Seed"] .lego-seed-mode') };
  btn().click(); await new Promise(r => setTimeout(r, 100));
  out.mode = btn().dataset.mode; out.saved = list.find(c => c.name === "Height").runMode;
  hw.value = 512;
  window.comfyAPI.api.api.dispatchCustomEvent("promptQueued", { number: 1, batchCount: 1 });
  await new Promise(r => setTimeout(r, 200));
  out.after = hw.value;
  out.shownValue = sn.__legoHost.querySelector('.lego-row[data-name="Height"] input')?.value;
  return out;
});
t("run mode turned on for a plain stepper shows the button " + JSON.stringify(r2), r2.shown);
t("…and turned off on the seed hides it", r2.seedHidden);
t("click picks +1, saved on the component", r2.mode === "increment" && r2.saved === "increment");
t("after a run the value moves one step (512 -> " + r2.after + "), and the card shows it", r2.after > 512 && Number(r2.shownValue) === r2.after);
t("no page errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
