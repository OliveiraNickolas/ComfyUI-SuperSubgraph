// Salvar/carregar layouts do cartão e o menu agrupado "SuperSubgraph ▸".
import { launch, COMFY_URL, OUT as dir } from "../lib.mjs";
import path from "node:path";
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
const pg = await ctx.newPage();
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
const NAME = "Layout" + Date.now();
pg.on("dialog", (d) => d.type() === "prompt" ? d.accept(NAME) : d.accept());
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (fn, arg) => pg.evaluate(fn, arg);

// dois Super Subgraphs parecidos (ids de dentro diferentes)
const ids = await E(() => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const make = (y, extra) => {
    const mk = (type, x) => { const n = LG.createNode(type); n.pos = [x, y]; app.graph.add(n); return n; };
    const pad = extra ? mk("ImageInvert", 900) : null;   // desalinha os ids
    const A = mk("EmptyImage", 0), S = mk("ImageScale", 350), P = mk("PreviewImage", 700);
    A.connect(0, S, 0); S.connect(0, P, 0);
    app.canvas.deselectAll(); for (const n of [S, P]) app.canvas.select(n);
    ext.__flatCanvas().find(i => i && /Convert Selection/.test(i.content)).callback();
    if (pad) app.graph.remove(pad);
    return app.graph.nodes.filter(n => n.type === "SuperSubgraph").at(-1);
  };
  const s1 = make(0, false), s2 = make(600, true);
  const si1 = s1.__ssGraph.nodes.find(n => n.type === "ImageScale").id;
  s1.properties.ui_layout.tabs[0].sections[0].controls.push({ name: "Stepper1", kind: "number", label: "Width", bind: `${si1}/width`, x: 16, y: 16, w: 256, h: 48, color: "#22c55e" });
  s1.properties.ui_layout.tabs[0].sections[0].header = "MY ZONE";
  s1.__legoState.refresh();
  s1.pos = [200, 100]; s2.pos = [200, 450];
  app.canvas.deselectAll(); app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  return { s1: s1.id, s2: s2.id, si1, si2: s2.__ssGraph.nodes.find(n => n.type === "ImageScale").id };
});
t("the two inner ImageScale nodes have different ids: " + ids.si1 + " vs " + ids.si2, String(ids.si1) !== String(ids.si2));

// menu agrupado: um item só no nó (clique direito de verdade)
const titlePos = await E((sid) => { const n = window.app.graph.getNodeById(sid); const r = window.app.canvas.canvas.getBoundingClientRect(); return [r.left + n.pos[0] + 60, r.top + n.pos[1] - 15]; }, ids.s1);
await pg.mouse.click(titlePos[0], titlePos[1], { button: "right" }); await pg.waitForTimeout(500);
const top = await E(() => [...document.querySelectorAll(".litecontextmenu .litemenu-entry")].map(e => e.textContent.trim()));
t("node menu has one 'SuperSubgraph' entry and no loose SS items: " + top.filter(x => /super/i.test(x)).join("|"), top.filter(x => /super/i.test(x)).join("|") === "SuperSubgraph");
await pg.getByText("SuperSubgraph", { exact: true }).last().click(); await pg.waitForTimeout(400);
const sub = await E(() => [...document.querySelectorAll(".litecontextmenu")].at(-1)?.innerText.split("\n").map(s => s.trim()).filter(Boolean));
t("submenu groups the actions: " + sub.join("|"), !sub.some(x => /^Convert Selection/.test(x)) && ["Open Inside", "Edit Card", "Save Card Layout…", "Save SuperSubgraph to Library…", "Files", "More"].every(x => sub.includes(x)));
await pg.screenshot({ path: path.join(dir, "ss_menu.png") });
await pg.keyboard.press("Escape"); await pg.mouse.click(1400, 950); await pg.waitForTimeout(200);

// salva o layout do 1º e carrega no 2º
const run = (sid, label) => E(async ({ sid, label }) => {
  const ext = window.app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const it = ext.__flatNode(window.app.graph.getNodeById(sid)).find(i => i && i.content === label);
  if (!it) return "missing " + label; await it.callback(); return "ok";
}, { sid, label });
t("Save Card Layout…", (await run(ids.s1, "Save Card Layout…")) === "ok");
await pg.waitForTimeout(600);
const lib = await E(async () => (await window.comfyAPI.api.api.listUserDataFullInfo("supersubgraph/layouts")).map(f => f.path));
t("saved to supersubgraph/layouts: " + NAME, lib.includes(`${NAME}.json`));
await E(async () => { const ext = window.app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph"); ext.__flatCanvas(); await new Promise(r => setTimeout(r, 400)); });
const loaded = await E(async ({ ids, NAME }) => {
  const ext = window.app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const s2 = window.app.graph.getNodeById(ids.s2);
  const it = ext.__flatNode(s2).find(i => i && i.content === "Load Card Layout");
  const o = it?.submenu.options.find(x => x.content === NAME);
  if (!o) return { err: "not listed" };
  await o.callback(); await new Promise(r => setTimeout(r, 300));
  const sec = s2.properties.ui_layout.tabs[0].sections[0];
  return { header: sec.header, bind: sec.controls[0]?.bind, color: sec.controls[0]?.color, row: !!s2.__legoHost.querySelector('.lego-row[data-name="Stepper1"] input.lego-step-input'), missing: !!s2.__legoHost.querySelector(".lego-row.missing") };
}, { ids, NAME });
t("layout loaded on the other SuperSubgraph, bind re-linked to its own ImageScale: " + JSON.stringify(loaded), loaded.header === "MY ZONE" && loaded.bind === `${ids.si2}/width` && loaded.color === "#22c55e" && loaded.row && !loaded.missing);
// exportar e importar arquivo
const [dl] = await Promise.all([pg.waitForEvent("download"), run(ids.s1, "Export Card Layout…")]);
const file = path.join(dir, dl.suggestedFilename()); await dl.saveAs(file);
t("layout exported: " + dl.suggestedFilename(), /\.sslayout\.json$/.test(dl.suggestedFilename()));
await E((sid) => { const n = window.app.graph.getNodeById(sid); n.properties.ui_layout.tabs[0].sections[0].controls = []; n.__legoState.refresh(); }, ids.s2);
const [fc] = await Promise.all([pg.waitForEvent("filechooser"), run(ids.s2, "Import Card Layout…")]);
await fc.setFiles(file); await pg.waitForTimeout(700);
const imp = await E((sid) => window.app.graph.getNodeById(sid).properties.ui_layout.tabs[0].sections[0].controls.map(c => c.bind).join(), ids.s2);
t("layout imported from file: " + imp, imp === `${ids.si2}/width`);
// apaga
await E(async ({ ids, NAME }) => { const ext = window.app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph"); await ext.__flatNode(window.app.graph.getNodeById(ids.s1)).find(i => i && i.content === "Delete a Saved Card Layout").submenu.options.find(o => o.content === NAME).callback(); }, { ids, NAME });
await pg.waitForTimeout(500);
const lib2 = await E(async () => (await window.comfyAPI.api.api.listUserDataFullInfo("supersubgraph/layouts")).map(f => f.path));
t("deleted saved layout", !lib2.includes(`${NAME}.json`));
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
