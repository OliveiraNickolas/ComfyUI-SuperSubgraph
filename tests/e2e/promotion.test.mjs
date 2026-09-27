// Promoção no Super Subgraph: o cartão controla o parâmetro de dentro SEM fio.
// 1. Converter para SS não deixa as promoções automáticas (fios) do ComfyUI.
// 2. Lá dentro, o que está no cartão tem contorno roxo (e o Target Picker não duplica).
// 3. "Expose as node input" cria o fio nativo; "Remove node input" tira e guarda o valor.
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1500, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (fn, arg) => pg.evaluate(fn, arg);

// 1. converter
const r1 = await E(async () => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph; const g = app.graph;
  const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const m = (t, x, y = 0) => { const n = LG.createNode(t); n.pos = [x, y]; g.add(n); return n; };
  const ck = m("CheckpointLoaderSimple", 0), pos = m("CLIPTextEncode", 400), ks = m("KSampler", 800), lat = m("EmptyLatentImage", 400, 300);
  ck.connect(1, pos, 0); ck.connect(0, ks, 0); pos.connect(0, ks, 1); pos.connect(0, ks, 2); lat.connect(0, ks, 3);
  pos.widgets.find(w => w.name === "text").value = "a red fox";
  ks.widgets.find(w => w.name === "seed").value = 1234;
  app.canvas.deselectAll(); for (const n of [pos, ks, lat]) app.canvas.select(n);
  ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = g.nodes.find(n => n.isSubgraphNode?.());
  window.__sn = sn;
  const inner = (t) => sn.subgraph.nodes.find(n => n.type === t);
  return {
    inputs: sn.inputs.map(i => (i.widget ? "W:" : "") + i.name),
    text: inner("CLIPTextEncode").widgets.find(w => w.name === "text").value,
    seed: inner("KSampler").widgets.find(w => w.name === "seed").value,
  };
});
t("converting to SS keeps only the data inputs (no automatic widget wires): " + r1.inputs.join(","), !r1.inputs.some(i => i.startsWith("W:")) && r1.inputs.includes("clip") && r1.inputs.includes("model"));
t("inner values kept: " + JSON.stringify([r1.text, r1.seed]), r1.text === "a red fox" && r1.seed === 1234);

// card controls the inner node directly
const r2 = await E(async () => {
  const sn = window.__sn; const ext = window.app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const ksI = sn.subgraph.nodes.find(n => n.type === "KSampler");
  const grp = ext.__promoteWhole(sn, ksI, "column");
  await new Promise(r => setTimeout(r, 300));
  const stepsItem = grp.items.find(i => i.bind?.endsWith("/steps"));
  const row = sn.__legoHost.querySelector(`.lego-segment-item[data-name="${stepsItem.name}"]`);
  row.querySelectorAll(".lego-step-btn")[1].click();
  return { steps: ksI.widgets.find(w => w.name === "steps").value, bind: stepsItem.bind, name: stepsItem.name };
});
t("card changes the inner node directly (steps 20 -> " + r2.steps + ")", r2.steps === 21);

// 2. marca roxa lá dentro
await E(() => { window.app.canvas.openSubgraph(window.__sn.subgraph, window.__sn); });
await pg.waitForTimeout(600);
const mark = await E(async () => {
  const c = window.app.canvas; const ksI = window.__sn.subgraph.nodes.find(n => n.type === "KSampler");
  c.ds.scale = 1; c.ds.offset = [200 - ksI.pos[0], 200 - ksI.pos[1]]; c.setDirty(true, true); c.draw(true, true);
  await new Promise(r => setTimeout(r, 200));
  const w = ksI.widgets.find(x => x.name === "steps");
  const dpr = window.devicePixelRatio || 1;
  const ctx = c.canvas.getContext("2d");
  // borda esquerda do contorno: x = pos.x + 4 (±1), ao longo da altura do widget
  const gx = (ksI.pos[0] + 4 + c.ds.offset[0]) * c.ds.scale, gy = (ksI.pos[1] + w.y + 6 + c.ds.offset[1]) * c.ds.scale;
  let purple = 0;
  for (let dx = -2; dx <= 2; dx++) {
    const d = ctx.getImageData(Math.round((gx + dx) * dpr), Math.round(gy * dpr), 1, 1).data;
    if (d[0] > 120 && d[2] > 180 && d[1] < 130) purple++;
  }
  return { purple };
});
t("inside the subgraph, a parameter on the card has the purple outline", mark.purple > 0);
await pg.locator(".subgraph-breadcrumb .p-breadcrumb-item-link").first().click(); await pg.waitForTimeout(500);

// 3. expor como entrada (fio) e tirar
const r3 = await E(async (bind) => {
  const sn = window.__sn; const ext = window.app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const ksI = sn.subgraph.nodes.find(n => n.type === "KSampler");
  const out = {};
  out.exposed = ext.__exposeAsInput(sn, bind);
  await new Promise(r => setTimeout(r, 300));
  const hin = sn.inputs.find(i => i.widget?.name?.startsWith("steps"));
  out.hostInput = !!hin;
  const hw = sn.widgets.find(w => w.name === hin?.widget?.name);
  out.seeded = hw?.value;
  hw.value = 44;   // o valor que vale agora é o do nó de fora
  out.removed = ext.__removeWireInput(sn, bind);
  await new Promise(r => setTimeout(r, 300));
  out.hostInputAfter = sn.inputs.some(i => i.widget?.name?.startsWith("steps"));
  out.innerAfter = ksI.widgets.find(w => w.name === "steps").value;
  return out;
}, r2.bind);
t("Expose as node input creates the native input with the current value: " + JSON.stringify([r3.exposed, r3.hostInput, r3.seeded]), r3.exposed && r3.hostInput && r3.seeded === 21);
t("Remove node input keeps the value that was in use (44): " + JSON.stringify([r3.removed, r3.hostInputAfter, r3.innerAfter]), r3.removed && !r3.hostInputAfter && r3.innerAfter === 44);

// o fio aparece no Inspetor (item de grupo) e no menu do botão direito (componente solto)
await E((bind) => {
  const sn = window.__sn;
  const list = sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls;
  const y = Math.max(...list.map(c => c.y + c.h)) + 24;
  list.push({ name: "CfgStep", kind: "number", label: "Cfg", bind: bind.replace("/steps", "/cfg"), x: 16, y, w: 256, h: 32 });
  sn.__legoState.edit = true; sn.__legoState.refresh();
}, r2.bind);
await pg.waitForTimeout(300);
await pg.locator(`.lego-segment-item[data-name="${r2.name}"]`).click({ button: "right" }); await pg.waitForTimeout(400);
const oiKeys = await E(() => [...document.querySelectorAll(".lego-oi .lego-oi-key")].map(e => e.textContent.trim()));
t("Object Inspector of a group item has the 'Node Input' switch", oiKeys.includes("Node Input"));
await pg.locator('.lego-row[data-name="CfgStep"]').click({ button: "right", position: { x: 20, y: 10 } }); await pg.waitForTimeout(300);
const items = await E(() => [...document.querySelectorAll(".lego-ctx-item")].map(e => e.textContent.trim()));
t("component menu offers 'Expose as node input (wire)'", items.some(x => /Expose as node input/.test(x)));
await pg.keyboard.press("Escape");
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
