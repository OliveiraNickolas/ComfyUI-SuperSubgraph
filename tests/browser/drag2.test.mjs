import { chromium } from "playwright-core";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { launch, serve, OUT as dir } from "../lib.mjs";
const srv = serve(8774);
const b = await launch();
const pg = await b.newPage({ viewport: { width: 820, height: 1700 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message));
await pg.goto("http://localhost:8774/drag2.html"); await pg.waitForFunction(() => window.__ready); await pg.waitForTimeout(200);
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const ev = (s, a) => pg.evaluate(s, a);
const center = async (sel, dx = 0.5, dy = 0.5) => { const bx = await pg.locator(sel).first().boundingBox(); return [bx.x + bx.width * dx, bx.y + bx.height * dy]; };
const drag = async (from, to, shot) => {
  await pg.mouse.move(...from); await pg.mouse.down();
  await pg.mouse.move(from[0] + 6, from[1] + 6, { steps: 3 });
  await pg.mouse.move(...to, { steps: 14 }); await pg.waitForTimeout(80);
  const fb = await ev(() => ({ out: !!document.querySelector(".lego-sec-controls.drop-out"), tab: !!document.querySelector(".lego-tab.drop-into, .lego-subtab.drop-into") }));
  if (shot) await pg.screenshot({ path: path.join(dir, shot) });
  await pg.mouse.up(); await pg.waitForTimeout(180);
  return fb;
};

// 1. Stepper sai do grupo e continua Stepper
await drag(await center('.lego-segment-item[data-name="Stepper1"]', 0.1, 0.5), await center('.lego-row[data-name="Switch2"]', 0.5, 3.2));
const st = await ev(() => JSON.stringify(__L()[0].controls.find(c => c.name === "Stepper1")));
t("stepper out of group keeps kind=number: " + st, /"kind":"number"/.test(st));
t("free stepper renders as stepper (− value +), not slider", await ev(() => !!document.querySelector('.lego-row[data-name="Stepper1"] .lego-step-number') && !document.querySelector('.lego-row[data-name="Stepper1"] .lego-track')));

// 2. grupo inteiro para outra zona (ZONE C)
let fb = await drag(await center('.lego-row[data-name="HGroup1"]', 0.02, 0.5), await center('.lego-sec:has-text("ZONE C") .lego-sec-controls', 0.3, 0.5), "move_group_zone.png");
t("dragging a group over another zone highlights it", fb.out);
t("group moved to ZONE C with its items", await ev(() => { const g = __L()[2].controls.find(c => c.name === "HGroup1"); return !!g && g.items.length >= 1 && !__L()[0].controls.some(c => c.name === "HGroup1"); }));

// 3. componente solto numa aba do cartão
fb = await drag(await center('.lego-row[data-name="Switch2"]', 0.2, 0.5), await center('.lego-tab:has-text("Second")'), "drop_on_tab.png");
t("hovering a card tab highlights it", fb.tab);
t("component moved to tab 'Second' and that tab opened", await ev(() => __T(1)[0].controls.some(c => c.name === "Switch2") && !__L()[0].controls.some(c => c.name === "Switch2") && __host.properties.ui_layout.activeTab === 1));

// 4. volta para a aba Main e leva um item de grupo para uma sub-aba (ZONE B / Beta)
await pg.click('.lego-tab-title:has-text("Main")'); await pg.waitForTimeout(150);
const itemName = await ev(() => __L()[2].controls.find(c => c.name === "HGroup1").items[0].name);
fb = await drag(await center(`.lego-segment-item[data-name="${itemName}"]`, 0.1, 0.5), await center('.lego-subtab:has-text("Beta")'));
t("hovering a sub-tab highlights it", fb.tab);
t("group item moved into sub-tab Beta and it opened", await ev((n) => { const z = __L()[1]; return z.tabs[1].controls.some(c => c.name === n) && z.activeTab === 1; }, itemName));

// 5. undo
await ev(() => document.activeElement?.blur());
await pg.keyboard.press("Control+z"); await pg.waitForTimeout(150);
t("undo brings the item back into the group", await ev((n) => __L()[2].controls.find(c => c.name === "HGroup1").items.some(i => i.name === n), itemName));
t("no page errors " + JSON.stringify(errs), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
