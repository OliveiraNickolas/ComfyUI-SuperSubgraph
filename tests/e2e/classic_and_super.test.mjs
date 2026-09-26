// Subgrafo clássico e Super Subgraph convivem: um clássico continua clássico;
// "Turn into SuperSubgraph" põe o cartão nele; "Copy as SuperSubgraph" cria uma
// cópia INDEPENDENTE (mudar dentro de uma não muda a outra); tirar o cartão
// devolve o clássico. Tudo roda com a execução nativa.
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1500, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (fn, arg) => pg.evaluate(fn, arg);

const r = await E(async () => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph; const g = app.graph;
  const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const item = (node, re) => ext.__flatNode(node).find(i => i && re.test(i.content));
  const A = LG.createNode("EmptyImage"); g.add(A);
  A.widgets.find(w => w.name === "width").value = 64; A.widgets.find(w => w.name === "height").value = 64;
  const B = LG.createNode("ImageBlur"); B.pos = [400, 0]; g.add(B);
  const P = LG.createNode("PreviewImage"); P.pos = [800, 0]; g.add(P);
  A.connect(0, B, 0); B.connect(0, P, 0);
  // subgrafo CLÁSSICO, pelo próprio ComfyUI
  const { node: classic } = g.convertToSubgraph(new Set([B]));
  const res = { classicHasCard: !!classic.properties?.ui_layout };
  res.menu = ext.__flatNode(classic).map(i => i.content).filter(Boolean);
  // cópia Super independente
  item(classic, /^Copy as SuperSubgraph/).callback();
  const supers = g.nodes.filter(n => n.isSubgraphNode?.() && n !== classic);
  const copy = supers[0];
  res.copy = { card: !!copy?.properties?.ui_layout, independent: copy?.subgraph !== classic.subgraph, classicStillClassic: !classic.properties?.ui_layout };
  // mudar dentro da cópia não mexe no clássico
  copy.subgraph.nodes.find(n => n.type === "ImageBlur").widgets.find(w => w.name === "blur_radius").value = 9;
  res.classicBlur = classic.subgraph.nodes.find(n => n.type === "ImageBlur").widgets.find(w => w.name === "blur_radius").value;
  // transformar o próprio clássico em Super, e depois voltar
  item(classic, /^Turn into SuperSubgraph/).callback();
  res.turned = !!classic.properties?.ui_layout && !!classic.__legoHost;
  item(classic, /^Turn back into a classic Subgraph/).callback();
  res.back = !classic.properties?.ui_layout && !!classic.subgraph;
  // roda tudo (nativo)
  const p = await app.graphToPrompt(); const q = await window.comfyAPI.api.api.queuePrompt(0, p);
  for (let i = 0; i < 60; i++) { const h = await (await fetch(`/history/${q.prompt_id}`)).json(); const e = h[q.prompt_id]; if (e?.status?.completed) { res.run = "ok"; break; } if (e?.status?.status_str === "error") { res.run = "error"; break; } await new Promise(r => setTimeout(r, 500)); }
  return res;
});
t("a classic subgraph has no card", !r.classicHasCard);
t("classic subgraph menu offers Turn into / Copy as SuperSubgraph: " + r.menu.filter(x => /Super/.test(x)).join("|"), r.menu.some(x => /^Turn into SuperSubgraph/.test(x)) && r.menu.some(x => /^Copy as SuperSubgraph/.test(x)));
t("Copy as SuperSubgraph: card, independent subgraph, original stays classic " + JSON.stringify(r.copy), r.copy.card && r.copy.independent && r.copy.classicStillClassic);
t("changing inside the copy doesn't change the classic (blur_radius " + r.classicBlur + ")", r.classicBlur !== 9);
t("Turn into SuperSubgraph adds the card in place", r.turned);
t("removing the card turns it back into a classic subgraph", r.back);
t("workflow with classic + Super runs natively: " + r.run, r.run === "ok");
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
