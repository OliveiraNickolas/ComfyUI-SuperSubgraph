// Copiar/colar um Super Subgraph: a cópia chega com o cartão, e o cartão
// aponta para os nós de dentro DA CÓPIA (o ComfyUI dá ids novos a eles).
// De quebra: imagem promovida pelo ComfyUI leva o título do nó de dentro.
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
  const mk = (t, x, y = 0) => { const n = LG.createNode(t); n.pos = [x, y]; g.add(n); return n; };
  const li = mk("LoadImage", 0), s = mk("ImageBlur", 400), p = mk("PreviewImage", 800);
  li.connect(0, s, 0); s.connect(0, p, 0);
  app.canvas.deselectAll(); app.canvas.select(li); app.canvas.select(s);
  ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = g.nodes.find(n => n.isSubgraphNode?.());
  const innerLi = sn.subgraph.nodes.find(n => n.type === "LoadImage");
  const img = ext.__promoteWhole(sn, innerLi);
  ext.__promoteWhole(sn, sn.subgraph.nodes.find(n => n.type === "ImageBlur"));
  await new Promise(r => setTimeout(r, 300));
  const res = { imgLabel: img.label, imgHead: sn.__legoHost.querySelector(`.lego-row[data-name="${img.name}"] .lego-lbl`)?.textContent };
  // Ctrl+C / Ctrl+V
  app.canvas.deselectAll(); app.canvas.select(sn); app.canvas.copyToClipboard(); app.canvas.pasteFromClipboard();
  await new Promise(r => setTimeout(r, 800));
  const copy = g.nodes.find(n => n.isSubgraphNode?.() && n !== sn);
  const binds = []; JSON.stringify(copy?.properties?.ui_layout || {}, (k, v) => { if (k === "bind" && v) binds.push(v); return v; });
  const innerIds = new Set((copy?.subgraph?.nodes || []).map(n => String(n.id)));
  res.copyCard = !!copy?.__legoHost;
  res.bindsInside = binds.filter(b => b.includes("/")).every(b => innerIds.has(b.split("/")[0]));
  res.binds = binds;
  // mexe no Stepper (+) do Blur da cópia: muda a cópia, não o original
  const blur = (n) => n.subgraph.nodes.find(x => x.type === "ImageBlur").widgets.find(w => w.name === "blur_radius");
  res.shared = copy.subgraph === sn.subgraph;
  const before = blur(sn).value;
  const plus = [...copy.__legoHost.querySelectorAll(".lego-step-number")][0]?.querySelectorAll(".lego-step-btn")[1];
  plus?.click();
  res.copyBlur = blur(copy).value; res.origBlur = blur(sn).value; res.before = before;
  return res;
});
// O ComfyUI promoveu o "image": o rótulo tem que ser o do nó de dentro, não o do subgrafo.
t("promoted image keeps the inner node's label: " + JSON.stringify([r.imgLabel, r.imgHead]), r.imgLabel !== "Super Subgraph" && r.imgHead !== "Super Subgraph");
t("pasted Super Subgraph gets its card", r.copyCard);
t("pasted card binds point at the copy's inner nodes " + JSON.stringify(r.binds), r.bindsInside);
t("changing the copy's card changes the copy only " + JSON.stringify([r.before, r.copyBlur, r.origBlur]), r.copyBlur === r.before + 1 && r.origBlur === r.before && !r.shared);
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
