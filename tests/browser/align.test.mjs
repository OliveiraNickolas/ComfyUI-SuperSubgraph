// Barra de alinhamento no topo da zona e redimensionamento em grupo.
import { launch, serve, OUT as dir } from "../lib.mjs";
import path from "node:path";
const srv = serve(8775);
const b = await launch();
const pg = await b.newPage({ viewport: { width: 980, height: 800 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message));
await pg.goto("http://localhost:8775/align.html"); await pg.waitForFunction(() => window.__ready); await pg.waitForTimeout(200);
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const C = () => pg.evaluate(() => __C().map(c => [c.name, c.x, c.y, c.w, c.h]));
const pos = (a) => a.map(r => r.slice(1).join(",")).join(" | ");

t("no align bar with nothing selected", await pg.locator(".lego-align-bar").count() === 0);
await pg.locator('.lego-row[data-name="Stepper1"]').click({ position: { x: 8, y: 8 } });
await pg.locator('.lego-row[data-name="Stepper2"]').click({ position: { x: 8, y: 8 }, modifiers: ["Shift"] });
await pg.locator('.lego-row[data-name="Switch1"]').click({ position: { x: 8, y: 8 }, modifiers: ["Shift"] });
await pg.waitForTimeout(100);
t("3 selected: bar shows in the zone header", await pg.locator(".lego-sec-h .lego-align-bar").count() === 1);
await pg.locator(".lego-sec").first().screenshot({ path: path.join(dir, "align_bar.png") });
const click = async (op) => { await pg.locator(`.lego-align-bar .lego-align-btn[data-op="${op}"]`).click(); await pg.waitForTimeout(100); };

await click("left");
let c = await C();
t("align left: " + pos(c), c.every(r => r[1] === 16));
await click("row");
c = await C();
t("arrange in row: " + pos(c), c.every(r => r[2] === 16) && c[0][1] === 16 && c[1][1] === 16 + 224 + 16 && c[2][1] === 16 + 224 + 16 + 256 + 16);
await click("column");
c = await C();
const byY = [...c].sort((a, b) => a[2] - b[2]);
t("arrange in column: " + pos(c), c.every(r => r[1] === 16) && byY[1][2] === byY[0][2] + byY[0][4] + 16 && byY[2][2] === byY[1][2] + byY[1][4] + 16);
await click("samew");
c = await C();
t("same width as last selected (Switch1=192): " + pos(c), c.every(r => r[3] === 192));
// Undo desfaz um passo
await pg.evaluate(() => { document.activeElement?.blur(); });
await pg.keyboard.press("Control+z"); await pg.waitForTimeout(150);
c = await C();
t("undo restores widths: " + pos(c), c.find(r => r[0] === "Stepper1")[3] === 224 && c.find(r => r[0] === "Stepper2")[3] === 256);

// resize em grupo: arrasta o canto do Stepper1 +64 x +32 com os três selecionados
await pg.evaluate(() => { __st.selectedNames = new Set(["Stepper1", "Stepper2", "Switch1"]); __st.selectedName = "Switch1"; __st.refresh(); });
const before = await C();
const h = await pg.locator('.lego-row[data-name="Stepper1"] .lego-resizer-corner').boundingBox();
await pg.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await pg.mouse.down();
await pg.mouse.move(h.x + h.width / 2 + 64, h.y + h.height / 2 + 32, { steps: 8 }); await pg.mouse.up(); await pg.waitForTimeout(150);
const after = await C();
const d = after.map((r, i) => [r[3] - before[i][3], r[4] - before[i][4]]);
t("resize applies the same change to all selected: " + JSON.stringify(d), d.every(([dw, dh]) => dw === d[0][0] && dh === d[0][1]) && d[0][0] > 0 && d[0][1] > 0);

t("no page errors " + JSON.stringify(errs), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
