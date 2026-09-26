// Campos numéricos (stepper e slider): ".2" + Enter vira 0.2 no widget E no campo.
import { launch, serve } from "../lib.mjs";
const srv = serve(8776);
const b = await launch();
const pg = await b.newPage();
const errs = []; pg.on("pageerror", e => errs.push(e.message));
await pg.goto("http://localhost:8776/number_input.html"); await pg.waitForFunction(() => window.__ready); await pg.waitForTimeout(150);
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const typeIn = async (row, text) => {
  const inp = pg.locator(`.lego-row[data-name="${row}"] input[type=text]`).first();
  await inp.click(); await pg.keyboard.press("Control+a"); await pg.keyboard.type(text);
  await pg.keyboard.press("Enter"); await pg.waitForTimeout(120);
  return inp.inputValue();
};
const wv = (n) => pg.evaluate((n) => __w(n).value, n);
let f = await typeIn("Stepper1", ".2");
t(`stepper: ".2" + Enter -> field ${f}, widget ${await wv("denoise")}`, f === "0.20" && (await wv("denoise")) === 0.2);
f = await typeIn("Slider1", ".5");
t(`slider: ".5" + Enter -> field ${f}, widget ${await wv("cfg")}`, f === "0.50" && (await wv("cfg")) === 0.5);
f = await typeIn("Slider2", ".25");
t(`slider (0.01 step): ".25" -> field ${f}`, f === "0.25" && (await wv("denoise")) === 0.25);
f = await typeIn("Stepper1", "5");
t(`clamped to max: "5" -> field ${f}`, f === "1.00" && (await wv("denoise")) === 1);
f = await typeIn("Stepper2", "12.7");
t(`integer widget rounds: "12.7" -> field ${f}`, f === "13" && (await wv("steps")) === 13);
f = await typeIn("Stepper1", "abc");
t(`invalid text restores the value: -> field ${f}`, f === "1.00");
// Clicar seleciona o valor inteiro: digitar direto substitui (sem Ctrl+A).
for (const row of ["Stepper2", "Slider1"]) {
  const inp = pg.locator(`.lego-row[data-name="${row}"] input[type=text]`).first();
  await inp.click(); await pg.keyboard.type("7"); await pg.keyboard.press("Enter"); await pg.waitForTimeout(120);
  const v = await inp.inputValue();
  t(`${row}: click + type replaces the value -> field ${v}`, parseFloat(v) === 7);
}
t("no page errors " + JSON.stringify(errs), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
