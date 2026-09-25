// Groups do ComfyUI viram abas; clique direito no cartão e botão ⋯ abrem o menu.
import { launch, COMFY_URL, OUT as dir } from "../lib.mjs";
import path from "node:path";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (f, a) => pg.evaluate(f, a);

const r = await E(() => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const mk = (type, x, y) => { const n = LG.createNode(type); n.pos = [x, y]; app.graph.add(n); return n; };
  const A = mk("EmptyImage", -500, 0);
  const S = mk("ImageScale", 0, 60), Bl = mk("ImageBlur", 500, 60), I = mk("ImageInvert", 500, 260), P = mk("PreviewImage", 1000, 60);
  A.connect(0, S, 0); S.connect(0, Bl, 0); Bl.connect(0, I, 0); I.connect(0, P, 0);
  const grp = (title, color, x, y, w, h) => { const g = new LG.LGraphGroup(title); g.color = color; app.graph.add(g); g.pos = [x, y]; g.size = [w, h]; return g; };
  grp("Resize", "#3f789e", -40, 0, 420, 260);
  grp("Effects", "#8a3", 460, 0, 420, 420);
  app.canvas.deselectAll();
  for (const g of app.graph._groups || app.graph.groups) app.canvas.select(g);
  app.canvas.select(P);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert Selection/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  const L = sn.properties.ui_layout;
  return { outer: app.graph.nodes.map(n => n.type).sort().join(), outerGroups: (app.graph._groups || app.graph.groups).length,
    innerGroups: (sn.__ssGraph._groups || sn.__ssGraph.groups).map(g => g.title).join(),
    tabs: L.tabs.map(t => t.name).join(), zoneColor: L.tabs[0].sections[0].color, sid: sn.id };
});
t("selecting 2 groups + a node converts their nodes: " + r.outer, r.outer === "EmptyImage,SuperSubgraph");
t("groups go inside the SuperSubgraph and leave the outside: " + r.innerGroups + " / outside " + r.outerGroups, r.innerGroups === "Resize,Effects" && r.outerGroups === 0);
t("one tab per group (+ Other for loose nodes): " + r.tabs, r.tabs === "Resize,Effects,Other");
t("zone takes the group color: " + r.zoneColor, r.zoneColor === "#3f789e");

// Rebuild Card from Widgets: cada aba recebe os nós do seu group
const rb = await E((sid) => {
  const app = window.app; const sn = app.graph.getNodeById(sid);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatNode(sn).find(i => i && i.content === "Rebuild Card from Widgets").callback();
  return sn.properties.ui_layout.tabs.map(t => t.name + ":" + t.sections[0].controls.map(c => c.header || c.kind).join("+")).join(" | ");
}, r.sid);
t("Rebuild fills each group tab with its nodes: " + rb, /Resize:Upscale Image/.test(rb) && /Effects:Blur Image/.test(rb));

// botão direito no meio do cartão abre o menu do nó
await E((sid) => { const sn = window.app.graph.getNodeById(sid); sn.pos = [100, 100]; window.app.canvas.deselectAll(); window.app.canvas.ds.offset = [0, 0]; window.app.canvas.ds.scale = 1; window.app.canvas.setDirty(true, true); }, r.sid);
await pg.waitForTimeout(600);
const zb = await pg.locator(".lego-sec").first().boundingBox();
await pg.mouse.click(zb.x + zb.width - 30, zb.y + zb.height - 10, { button: "right" }); await pg.waitForTimeout(500);
const entries = await E(() => [...document.querySelectorAll(".litecontextmenu .litemenu-entry")].map(e => e.textContent.trim()));
t("right-click inside the card opens the node menu with 'SuperSubgraph': " + entries.length + " entries", entries.includes("SuperSubgraph") && entries.length > 5);
await pg.screenshot({ path: path.join(dir, "card_rightclick.png") });
await pg.keyboard.press("Escape"); await pg.mouse.click(1450, 900); await pg.waitForTimeout(300);
await E(() => document.querySelectorAll(".litecontextmenu").forEach(m => m.remove()));
// botão ⋯
await pg.locator(".lego-head-tools .lego-more-btn").first().click(); await pg.waitForTimeout(400);
const more = await E(() => [...document.querySelectorAll(".litecontextmenu")].at(-1)?.innerText.split("\n").map(s => s.trim()).filter(Boolean) || []);
t("⋯ button opens the SuperSubgraph menu: " + more.join("|"), ["Open Inside", "Edit Card", "Save Card Layout…", "Save SuperSubgraph to Library…", "Files", "More"].every(x => more.includes(x)));
await pg.screenshot({ path: path.join(dir, "more_menu.png") });
// submenu "More" abre ao clicar
await pg.locator(".litecontextmenu .litemenu-entry", { hasText: "More" }).last().click(); await pg.waitForTimeout(300);
const moreSub = await E(() => [...document.querySelectorAll(".litecontextmenu")].at(-1)?.innerText || "");
t("'More' submenu works from the ⋯ menu: " + moreSub.replace(/\n/g, "|"), /Unpack into Regular Nodes/.test(moreSub) && /Rebuild Card from Widgets/.test(moreSub));
await pg.keyboard.press("Escape"); await pg.mouse.click(1450, 900); await E(() => document.querySelectorAll(".litecontextmenu").forEach(m => m.remove()));

// roda e depois desfaz: os groups voltam
const run = await E(async () => {
  const app = window.app; const p = await app.graphToPrompt(); const q = await window.comfyAPI.api.api.queuePrompt(0, p);
  for (let i = 0; i < 60; i++) { const h = await (await fetch(`/history/${q.prompt_id}`)).json(); const e = h[q.prompt_id]; if (e?.status?.completed) return "ok"; if (e?.status?.status_str === "error") return "error"; await new Promise(r => setTimeout(r, 500)); }
  return "timeout";
});
t("still runs with groups inside: " + run, run === "ok");
const un = await E((sid) => {
  const app = window.app; const sn = app.graph.getNodeById(sid);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatNode(sn).find(i => i && i.content === "Unpack into Regular Nodes").callback();
  return { groups: (app.graph._groups || app.graph.groups).map(g => g.title).sort().join(), nodes: app.graph.nodes.map(n => n.type).sort().join() };
}, r.sid);
t("Unpack brings the groups back: " + JSON.stringify(un), un.groups === "Effects,Resize" && un.nodes === "EmptyImage,ImageBlur,ImageInvert,ImageScale,PreviewImage");
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
