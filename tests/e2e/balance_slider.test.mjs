// Balance Slider: um slider dividindo um total entre DOIS parâmetros.
// A = valor à esquerda da alça (Link A), B = o resto (Link B); 0–1: A 0.3 → B 0.7.
import path from "node:path";
import { launch, COMFY_URL, OUT as dir } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message));
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (f, a) => pg.evaluate(f, a);

const ids = await E(async () => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph; const g = app.graph;
  const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const k1 = LG.createNode("KSampler"); g.add(k1); const k2 = LG.createNode("KSampler"); k2.pos = [400, 0]; g.add(k2);
  k1.title = "First"; k2.title = "Second";
  app.canvas.deselectAll(); app.canvas.select(k1); app.canvas.select(k2);
  ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = g.nodes.find(n => n.isSubgraphNode?.());
  const [a, c] = sn.subgraph.nodes.filter(n => n.type === "KSampler");
  const list = sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls; list.length = 0;
  list.push({ name: "Balance1", kind: "balance", x: 16, y: 16, w: 320, h: 48, bind: `${a.id}/denoise`, bind2: `${c.id}/denoise`, labelA: "First", labelB: "Second" });
  sn.pos = [60, 60]; app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1;
  sn.__legoState.refresh();
  window.__sn = sn;
  return { a: a.id, c: c.id };
});
await pg.waitForTimeout(400);
const val = () => E((ids) => { const sg = window.__sn.subgraph; const v = (id) => sg.getNodeById(id).widgets.find(w => w.name === "denoise").value; return [v(ids.a), v(ids.c)]; }, ids);
const nums = () => E(() => [...window.__sn.__legoHost.querySelectorAll('.lego-row[data-name="Balance1"] .lego-balance-num')].map(i => i.value));

// arrastar a alça para 30% da trilha
const tr = await pg.locator('.lego-row[data-name="Balance1"] .lego-balance-track').boundingBox();
await pg.mouse.move(tr.x + tr.width * 0.5, tr.y + tr.height / 2); await pg.mouse.down();
await pg.mouse.move(tr.x + tr.width * 0.3, tr.y + tr.height / 2, { steps: 5 }); await pg.mouse.up(); await pg.waitForTimeout(150);
let v = await val();
t("dragging to 30%: A = 0.3 and B = 0.7 " + JSON.stringify(v), v[0] === 0.3 && v[1] === 0.7);
t("the card shows both values " + JSON.stringify(await nums()), JSON.stringify(await nums()) === '["0.30","0.70"]' || JSON.stringify(await nums()) === '["0.3","0.7"]');

// digitar no lado B
await pg.locator('.lego-row[data-name="Balance1"] .lego-balance-num').nth(1).fill("0.25");
await pg.keyboard.press("Enter"); await pg.waitForTimeout(150);
v = await val();
t("typing 0.25 in B sets A = 0.75 " + JSON.stringify(v), v[0] === 0.75 && v[1] === 0.25);

// mudar A direto no nó: o cartão mostra os valores REAIS (A novo, B intocado)
await E(() => document.activeElement?.blur());
await E((ids) => { const w = window.__sn.subgraph.getNodeById(ids.a).widgets.find(w => w.name === "denoise"); w.value = 0.6; }, ids);
await pg.waitForTimeout(700);
const n2 = await nums();
t("changing A on the node: the card shows the real values " + JSON.stringify(n2), parseFloat(n2[0]) === 0.6 && parseFloat(n2[1]) === 0.25);
// e o slider volta a equilibrar os dois
await pg.locator('.lego-row[data-name="Balance1"] .lego-balance-num').first().fill("0.4");
await pg.keyboard.press("Enter"); await pg.waitForTimeout(150);
v = await val();
t("typing 0.4 in A balances again: B = 0.6 " + JSON.stringify(v), v[0] === 0.4 && v[1] === 0.6);

// os dois parâmetros contam como "no cartão" (contorno roxo lá dentro)
const marks = await E(() => window.app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__cardBindsIn(window.__sn.subgraph));
t("both linked parameters count as on the card " + JSON.stringify(marks), marks[String(ids.a)]?.includes("denoise") && marks[String(ids.c)]?.includes("denoise"));
// aparece na paleta de ferramentas
await E(() => { window.__sn.__legoState.edit = true; window.__sn.__legoState.refresh(); });
await pg.waitForTimeout(400);
t("Balance Slider is in the tools palette", await pg.locator(".lego-tool", { hasText: "Balance Slider" }).count() > 0 || await pg.getByText("Balance Slider").count() > 0);
await E(() => { window.__sn.__legoState.edit = false; window.__sn.__legoState.refresh(); });
await pg.waitForTimeout(300);
const bb = await pg.locator('.lego-row[data-name="Balance1"]').boundingBox();
await pg.screenshot({ path: path.join(dir, "balance_slider.png"), clip: { x: bb.x - 20, y: bb.y - 20, width: bb.width + 40, height: bb.height + 40 } });
// recém-saído da paleta: sem elos, mostra "Link A / Link B"; o elo oferece os dois
await E(() => {
  const list = window.__sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls;
  list.push({ name: "Balance2", kind: "balance", x: 16, y: 96, w: 320, h: 48 });
  window.__sn.__legoState.edit = true; window.__sn.__legoState.refresh();
});
await pg.waitForTimeout(400);
const fresh = await E(() => [...window.__sn.__legoHost.querySelectorAll('.lego-row[data-name="Balance2"] .lego-balance-lbl')].map(e => e.textContent));
t("unlinked Balance shows Link A / Link B " + JSON.stringify(fresh), JSON.stringify(fresh) === '["Link A","Link B"]');
await pg.hover('.lego-row[data-name="Balance2"]');
await pg.locator('.lego-row[data-name="Balance2"] .btn-link').click(); await pg.waitForTimeout(250);
const menu = await E(() => [...document.querySelectorAll(".lego-ctx-item")].map(e => e.textContent.trim()));
t("link button offers Link A and Link B " + JSON.stringify(menu), menu.some(m => /Link A/.test(m)) && menu.some(m => /Link B/.test(m)));
await pg.keyboard.press("Escape");
t("no page errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
