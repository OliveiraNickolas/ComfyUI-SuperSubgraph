// Cores por zona/componente, biblioteca e exportar/importar SuperSubgraph.
import { launch, COMFY_URL, OUT as dir } from "../lib.mjs";
import path from "node:path";
import fs from "node:fs";
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const pg = await ctx.newPage();
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
const NAME = "TestBlock" + Date.now();
pg.on("dialog", (d) => d.type() === "prompt" ? d.accept(NAME) : d.accept());
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (fn, arg) => pg.evaluate(fn, arg);
const ext = `window.app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph")`;

const sid = await E(() => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const mk = (type, x) => { const n = LG.createNode(type); n.pos = [x, 0]; app.graph.add(n); return n; };
  const A = mk("EmptyImage", 0), S = mk("ImageScale", 350), P = mk("PreviewImage", 700);
  A.widgets.find(w => w.name === "width").value = 64; A.widgets.find(w => w.name === "height").value = 64;
  A.connect(0, S, 0); S.connect(0, P, 0);
  app.canvas.deselectAll(); for (const n of [A, S, P]) app.canvas.select(n);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  sn.title = "Scaler";
  const si = sn.__ssGraph.nodes.find(n => n.type === "ImageScale").id;
  sn.properties.ui_layout.tabs[0].sections[0].controls.push({ name: "Stepper1", kind: "number", label: "Width", bind: `${si}/width`, x: 16, y: 16, w: 256, h: 48 });
  sn.pos = [300, 250]; sn.__legoState.edit = true; sn.__legoState.refresh();
  app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  return sn.id;
});
await pg.waitForTimeout(400);
// cor da zona
await pg.locator(".lego-color-dot-btn").first().click(); await pg.waitForTimeout(150);
await pg.locator('.lego-color-swatch[title="Blue"]').click(); await pg.waitForTimeout(200);
// cor do componente pelo menu
await pg.locator('.lego-row[data-name="Stepper1"]').click({ button: "right", position: { x: 20, y: 10 } }); await pg.waitForTimeout(150);
await pg.locator(".lego-ctx-item", { hasText: "Color…" }).click(); await pg.waitForTimeout(150);
await pg.locator('.lego-color-swatch[title="Red"]').click(); await pg.waitForTimeout(200);
const col = await E((sid) => { const sn = window.app.graph.getNodeById(sid); const sec = sn.properties.ui_layout.tabs[0].sections[0];
  return { zone: sec.color, ctrl: sec.controls[0].color, secTinted: !!sn.__legoHost.querySelector(".lego-sec.tinted"), rowTinted: !!sn.__legoHost.querySelector('.lego-row.tinted[data-name="Stepper1"]') }; }, sid);
t("zone and component colors set and shown: " + JSON.stringify(col), col.zone === "#3b82f6" && col.ctrl === "#ef4444" && col.secTinted && col.rowTinted);
await pg.screenshot({ path: path.join(dir, "colors.png") });

// biblioteca
await E(async ({ sid, ext }) => { const e = eval(ext); await e.__flatNode(window.app.graph.getNodeById(sid)).find(i => i && /^Save to Library/.test(i.content)).callback(); }, { sid, ext });
await pg.waitForTimeout(500);
const lib = await E(async () => (await window.comfyAPI.api.api.listUserDataFullInfo("supersubgraph")).map(f => f.path));
t("saved to the library (userdata): " + NAME, lib.includes(`${NAME}.json`));
// exporta para arquivo
const [dl] = await Promise.all([pg.waitForEvent("download"), E(({ sid, ext }) => { const e = eval(ext); e.__flatNode(window.app.graph.getNodeById(sid)).find(i => i && /^Export to File/.test(i.content)).callback(); }, { sid, ext })]);
const file = path.join(dir, dl.suggestedFilename()); await dl.saveAs(file);
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
t("export downloads a package: " + dl.suggestedFilename(), dl.suggestedFilename() === "Scaler.supersubgraph.json" && pkg.type === "ComfyUI-SuperSubgraph" && pkg.properties.ss_inner.graph.nodes.length === 3);

// novo workflow: adiciona da biblioteca e importa do arquivo
await E(() => window.app.graph.clear());
const added = await E(async ({ ext, NAME }) => {
  const e = eval(ext); const items = e.__flatCanvas();
  const sub = items.find(i => i && i.content === "Add from Library");
  const it = sub?.submenu.options.find(o => o.content === NAME);
  if (!it) return { err: "not listed: " + JSON.stringify(sub?.submenu.options.map(o => o.content)) };
  it.callback(); await new Promise(r => setTimeout(r, 600));
  const sn = window.app.graph.nodes.find(n => n.type === "SuperSubgraph");
  return { title: sn?.title, inner: sn?.__ssGraph?.nodes.length, zone: sn?.properties.ui_layout.tabs[0].sections[0].color, card: !!sn?.__legoHost?.querySelector('.lego-row[data-name="Stepper1"]') };
}, { ext, NAME });
t("added from the library with card and colors: " + JSON.stringify(added), added.title === NAME && added.inner === 3 && added.zone === "#3b82f6" && added.card);
const [fc] = await Promise.all([pg.waitForEvent("filechooser"), E(({ ext }) => { const e = eval(ext); e.__flatCanvas().find(i => i && /^Import from File/.test(i.content)).callback(); }, { ext })]);
await fc.setFiles(file); await pg.waitForTimeout(800);
const imported = await E(() => window.app.graph.nodes.filter(n => n.type === "SuperSubgraph").map(n => n.title).sort().join());
t("imported from file: " + imported, imported === [NAME, "Scaler"].sort().join());
// os dois rodam
const run = await E(async () => {
  const app = window.app; const p = await app.graphToPrompt(); const q = await window.comfyAPI.api.api.queuePrompt(0, p);
  for (let i = 0; i < 60; i++) { const h = await (await fetch(`/history/${q.prompt_id}`)).json(); const e = h[q.prompt_id]; if (e?.status?.completed) return Object.keys(e.outputs).length; if (e?.status?.status_str === "error") return -1; await new Promise(r => setTimeout(r, 500)); }
  return 0;
});
t("both copies run (2 inner previews): " + run, run === 2);
// apaga da biblioteca
await E(async ({ ext, NAME }) => { const e = eval(ext); await e.__flatCanvas().find(i => i && i.content === "Delete from Library").submenu.options.find(o => o.content === NAME).callback(); }, { ext, NAME });
await pg.waitForTimeout(500);
const lib2 = await E(async () => (await window.comfyAPI.api.api.listUserDataFullInfo("supersubgraph")).map(f => f.path));
t("deleted from the library", !lib2.includes(`${NAME}.json`));
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
