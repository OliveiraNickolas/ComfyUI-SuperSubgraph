// Subgrafo nativo -> Super Subgraph: fios de fora, cartão e binds preservados.
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };

const r = await pg.evaluate(async () => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const mk = (type, x) => { const n = LG.createNode(type); n.pos = [x, 0]; app.graph.add(n); return n; };
  const A = mk("EmptyImage", 0), S = mk("ImageScale", 350), P = mk("PreviewImage", 700), D = mk("SaveImage", 1000);
  A.widgets.find(w => w.name === "width").value = 64; A.widgets.find(w => w.name === "height").value = 64;
  S.widgets.find(w => w.name === "width").value = 40; S.widgets.find(w => w.name === "height").value = 20;
  A.connect(0, S, 0); S.connect(0, P, 0); S.connect(0, D, 0);
  const nat = app.graph.convertToSubgraph(new Set([S, P])).node;
  nat.title = "My Blend";
  const innerS = nat.subgraph.nodes.find(n => n.type === "ImageScale");
  const innerP = nat.subgraph.nodes.find(n => n.type === "PreviewImage");
  nat.properties.ui_layout = { schema: 2, title: "MY BLEND", activeTab: 0, tabs: [{ name: "Main", sections: [{ header: "Z", controls: [
    { name: "Stepper1", kind: "number", label: "Width", bind: `${innerS.id}/width`, x: 16, y: 16, w: 224, h: 48 },
    { name: "ImageOutput1", kind: "outimage", label: "", source: String(innerP.id), x: 16, y: 80, w: 288, h: 144 } ] }] }] };
  const item = ext.__flatNode(nat).find(i => i && i.content === "Convert This Subgraph");
  if (!item) return { err: "no menu item" };
  item.callback();
  await new Promise(r => setTimeout(r, 300));
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  if (!sn) return { err: "no SS" };
  const inner = sn.__ssGraph.nodes;
  const L = sn.properties.ui_layout.tabs[0].sections[0].controls;
  const [bid, bname] = L[0].bind.split("/");
  const bound = inner.find(n => String(n.id) === bid);
  const res = {
    types: app.graph.nodes.map(n => n.type).sort().join(),
    title: sn.title,
    inner: inner.map(n => n.type).sort().join(),
    ins: sn.inputs.filter(i => /^in_/.test(i.name) && i.link != null).length,
    outs: sn.outputs.filter(o => o.links?.length).length,
    bindOk: bound?.type === "ImageScale" && bname === "width" && bound.widgets.find(w => w.name === "width").value === 40,
    srcOk: inner.find(n => String(n.id) === String(L[1].source))?.type === "PreviewImage",
    stepper: !!sn.__legoHost?.querySelector('.lego-row[data-name="Stepper1"] input.lego-step-input'),
  };
  const p = await app.graphToPrompt(); const q = await window.comfyAPI.api.api.queuePrompt(0, p);
  for (let i = 0; i < 80; i++) {
    const h = await (await fetch(`/history/${q.prompt_id}`)).json(); const e = h[q.prompt_id];
    if (e?.status?.status_str === "error") { res.run = "error"; break; }
    if (e?.status?.completed) {
      const img = Object.values(e.outputs).flatMap(o => o.images || []).find(im => im.type === "output");
      const im = new Image(); im.src = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=output`;
      await im.decode(); res.run = [im.naturalWidth, im.naturalHeight]; break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return res;
});
console.log(JSON.stringify(r));
t("native subgraph replaced by a SuperSubgraph: " + r.types, r.types === "EmptyImage,SaveImage,SuperSubgraph");
t("title and inner nodes kept: " + r.title + " / " + r.inner, r.title === "My Blend" && r.inner === "ImageScale,PreviewImage");
t("outside links kept (1 in, 1 out)", r.ins === 1 && r.outs === 1);
t("card came along; bind remapped to the new inner ImageScale", r.bindOk && r.stepper);
t("output component source remapped to the inner PreviewImage", r.srcOk);
t("runs with the inner values: " + JSON.stringify(r.run), JSON.stringify(r.run) === "[40,20]");
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
