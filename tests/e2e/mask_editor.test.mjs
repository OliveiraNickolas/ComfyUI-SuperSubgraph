// Mask Editor aberto pelo cartão para um Load Image de dentro do Super Subgraph.
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
  const mk = (type, x) => { const n = LG.createNode(type); n.pos = [x, 0]; app.graph.add(n); return n; };
  const L = mk("LoadImage", 0), M = mk("MaskToImage", 400), P = mk("PreviewImage", 800);
  L.widgets.find(w => w.name === "image").value = "example.png";
  L.connect(1, M, 0); M.connect(0, P, 0);
  app.canvas.deselectAll(); for (const n of [L, M, P]) app.canvas.select(n);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.isSubgraphNode?.());
  const li = sn.subgraph.nodes.find(n => n.type === "LoadImage");
  sn.properties.ui_layout.tabs[0].sections[0].controls.push({ name: "Image1", kind: "media", label: "", bind: `${li.id}/image`, x: 16, y: 16, w: 288, h: 224 });
  sn.pos = [200, 150]; sn.__legoState.refresh();
  app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  return { sn: sn.id, li: li.id };
});
await pg.waitForTimeout(800);
t("image component has a Mask Editor button", await pg.locator(".lego-media-mask-btn").count() === 1);
await pg.locator(".lego-media-mask-btn").click();
await pg.waitForSelector("#maskEditorCanvasContainer", { timeout: 15000 }).catch(() => {});
await pg.waitForTimeout(1200);
t("Mask Editor opens for the inner Load Image", await pg.locator("#maskEditorCanvasContainer").count() > 0);
// pinta um traço no meio da imagem
const r = await pg.locator("#maskEditorCanvasContainer").boundingBox();
const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
await pg.mouse.move(cx - 80, cy); await pg.mouse.down();
for (let i = 0; i <= 16; i++) await pg.mouse.move(cx - 80 + i * 10, cy + (i % 2) * 6);
await pg.mouse.up(); await pg.waitForTimeout(300);
await pg.screenshot({ path: path.join(dir, "mask_editor.png") });
await pg.locator("#global-mask-editor button", { hasText: "Save" }).first().click();
await pg.waitForFunction(() => !document.querySelector("#maskEditorCanvasContainer"), null, { timeout: 20000 }).catch(() => {});
await pg.waitForTimeout(1500);
const after = await E((ids) => {
  const sn = window.app.graph.getNodeById(ids.sn);
  // "image" foi promovido pelo ComfyUI ao converter: o valor que vale é o do nó.
  const v = (sn.widgets.find(w => w.name === "image") || sn.subgraph.getNodeById(ids.li).widgets.find(w => w.name === "image")).value;
  const thumb = sn.__legoHost.querySelector('.lego-row[data-name="Image1"] img');
  return { v, thumb: thumb?.src || "" };
}, ids);
t("Save writes the masked image into the (promoted) image widget: " + after.v, /clipspace/.test(after.v) && after.v !== "example.png");
t("card thumbnail follows the new image: " + after.thumb.slice(0, 120), /clipspace/.test(decodeURIComponent(after.thumb)) && !/%5Binput%5D|\[input\]/.test(after.thumb));
// executa: a máscara pintada chega ao MaskToImage de dentro (imagem não toda preta)
const run = await E(async () => {
  const app = window.app; const p = await app.graphToPrompt(); const q = await window.comfyAPI.api.api.queuePrompt(0, p);
  for (let i = 0; i < 80; i++) {
    const h = await (await fetch(`/history/${q.prompt_id}`)).json(); const e = h[q.prompt_id];
    if (e?.status?.status_str === "error") return { err: JSON.stringify(e.status.messages).slice(0, 300) };
    if (e?.status?.completed) {
      const img = Object.values(e.outputs).flatMap(o => o.images || [])[0];
      const im = new Image(); im.src = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`;
      await im.decode();
      const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
      const g = c.getContext("2d"); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let white = 0;
      for (let k = 0; k < d.length; k += 4) if (d[k] > 128) white++;
      return { white };
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return { err: "timeout" };
});
t("run uses the painted mask (mask has painted pixels): " + JSON.stringify(run), run.white > 0);
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
