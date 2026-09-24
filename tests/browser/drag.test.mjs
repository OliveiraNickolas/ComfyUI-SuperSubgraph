import { chromium } from "playwright-core";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { launch, serve, OUT as dir } from "../lib.mjs";
const srv = serve(8770);
const b = await launch();
const pg = await b.newPage({ viewport: { width: 820, height: 1600 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message));
await pg.goto("http://localhost:8770/drag.html"); await pg.waitForFunction(() => window.__ready); await pg.waitForTimeout(200);
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const names = (sel) => pg.evaluate((s) => eval(s), sel);
const center = async (sel, dx = 0.5, dy = 0.5) => { const bx = await pg.locator(sel).first().boundingBox(); return [bx.x + bx.width * dx, bx.y + bx.height * dy]; };
const drag = async (from, to, midShot) => {
  await pg.mouse.move(...from); await pg.mouse.down();
  await pg.mouse.move(from[0] + 6, from[1] + 6, { steps: 3 });
  await pg.mouse.move(...to, { steps: 12 }); await pg.waitForTimeout(80);
  const fb = await pg.evaluate(() => ({ into: !!document.querySelector(".lego-segment-box.drop-into"), line: !!document.querySelector(".lego-drop-line"), out: !!document.querySelector(".lego-sec-controls.drop-out"), ghost: !!document.querySelector(".lego-drag-ghost") }));
  if (midShot) await pg.screenshot({ path: path.join(dir, midShot) });
  await pg.mouse.up(); await pg.waitForTimeout(150);
  return fb;
};
const H = 'document.querySelector(\'.lego-row[data-name="HGroup1"]\')';
const hItems = () => names(`__L()[0].controls.find(c=>c.name==="HGroup1").items.map(i=>i.name).join()`);

// + Add fora do grupo
t("+ Add is in the floating bar, not inside the group", await pg.evaluate(() => !!document.querySelector('.lego-row[data-name="HGroup1"] .lego-floating-actions .btn-add') && !document.querySelector(".lego-seg-quick-btn")));

// 1. reordenar: Dropdown1 para antes de Stepper1
let fb = await drag(await center('.lego-segment-item[data-name="Dropdown1"]', 0.3, 0.5), await center('.lego-segment-item[data-name="Stepper1"]', 0.15, 0.5), "drag_reorder.png");
t("reorder shows group highlight + insertion line + ghost", fb.into && fb.line && fb.ghost);
t("reorder inside group: " + await hItems(), (await hItems()) === "Dropdown1,Stepper1,Switch1");

// 2. item para outro grupo
fb = await drag(await center('.lego-segment-item[data-name="Switch1"]', 0.3, 0.5), await center('.lego-row[data-name="VGroup1"] .lego-segment-box', 0.5, 0.85));
const vItems = await names(`__L()[0].controls.find(c=>c.name==="VGroup1").items.map(i=>i.name).join()`);
t("move item H→V group: V=" + vItems, vItems === "Label1,Switch1" && !(await hItems()).includes("Switch1"));

// 3. item para fora (zona)
fb = await drag(await center('.lego-segment-item[data-name="Stepper1"]', 0.3, 0.5), await center('.lego-row[data-name="Switch2"]', 0.5, 3.2), "drag_out.png");
t("leaving group highlights the zone (drop-out)", fb.out && !fb.into);
const st1 = await names(`JSON.stringify(__L()[0].controls.find(c=>c.name==="Stepper1")||null)`);
t("item became top-level with x/y/w/h: " + st1, /"x":\d+/.test(st1) && /"w":\d+/.test(st1) && !(await hItems()).includes("Stepper1"));

// 4. componente solto para dentro do grupo
fb = await drag(await center('.lego-row[data-name="Switch2"]', 0.3, 0.5), await center('.lego-row[data-name="HGroup1"] .lego-segment-box', 0.95, 0.5), "drag_in.png");
t("entering a group shows highlight + line", fb.into && fb.line);
t("top-level became group item: " + await hItems(), (await hItems()).endsWith("Switch2") && !(await names(`__L()[0].controls.some(c=>c.name==="Switch2")`)));
const sw2 = await names(`JSON.stringify(__L()[0].controls.find(c=>c.name==="HGroup1").items.find(i=>i.name==="Switch2"))`);
t("entered item lost x/y: " + sw2, !/"x":/.test(sw2));

// 5. sub-abas: reordenar Gamma para o começo (HTML5 DnD)
await pg.dragAndDrop('.lego-subtab:has-text("Gamma")', '.lego-subtab:has-text("Alpha")', { targetPosition: { x: 3, y: 8 } }); await pg.waitForTimeout(150);
const bTabs = await names(`__L()[1].tabs.map(t=>t.name).join()`);
t("reorder sub-tabs: " + bTabs, bTabs === "Gamma,Alpha,Beta");
// 6. sub-aba Beta para a zona C (sem abas)
await pg.dragAndDrop('.lego-subtab:has-text("Beta")', '.lego-sec:has-text("ZONE C") .lego-sec-h'); await pg.waitForTimeout(150);
const cz = await names(`JSON.stringify(__L()[2].tabs?.map(t=>t.name))`);
t("move sub-tab to plain zone converts it: C=" + cz + " B=" + await names(`__L()[1].tabs.map(t=>t.name).join()`), cz === '["Tab 1","Beta"]' && (await names(`__L()[1].tabs.length`)) === 2);
// 7. undo desfaz a última
await pg.evaluate(() => { document.activeElement?.blur(); });
await pg.keyboard.press("Control+z"); await pg.waitForTimeout(150);
t("undo restores sub-tab move", (await names(`__L()[1].tabs.map(t=>t.name).join()`)) === "Gamma,Alpha,Beta" && !(await names(`__L()[2].tabs`)));
t("no page errors " + JSON.stringify(errs), errs.length === 0);
await pg.screenshot({ path: path.join(dir, "drag_final.png") });
console.log(`\n${ok} passed, ${fail} failed`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
