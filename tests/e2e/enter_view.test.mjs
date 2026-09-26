// (Navegação nativa do ComfyUI) Entrar e sair do Super Subgraph mantém as vistas: fora volta exatamente onde
// estava; dentro volta onde parou na última vez (a 1ª entrada enquadra tudo).
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1300, height: 850 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const ds = () => pg.evaluate(() => ({ o: window.app.canvas.ds.offset.map(Math.round), s: +window.app.canvas.ds.scale.toFixed(3), inner: window.app.canvas.graph !== window.app.rootGraph }));
const same = (a, b) => a.o[0] === b.o[0] && a.o[1] === b.o[1] && a.s === b.s && a.inner === b.inner;
const setView = (o, s) => pg.evaluate(([o, s]) => { const c = window.app.canvas; c.ds.offset = o; c.ds.scale = s; c.setDirty(true, true); }, [o, s]);
const enter = async () => { const bx = await pg.locator(".lego-ss-enter").first().boundingBox(); await pg.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); await pg.waitForTimeout(1200); };

const pos = await pg.evaluate(() => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const a = LG.createNode("EmptyImage"); a.pos = [2000, 1500]; app.graph.add(a);
  const c = LG.createNode("ImageBlur"); c.pos = [2400, 1500]; app.graph.add(c);
  app.canvas.deselectAll?.(); app.canvas.select(a); app.canvas.select(c);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  return app.graph.nodes.find(n => n.isSubgraphNode?.()).pos.slice();
});

// 1ª ida: dentro enquadra; ao sair, fora volta exatamente onde estava.
await setView([300 - pos[0], 200 - pos[1]], 0.7); await pg.waitForTimeout(300);
const out1 = await ds();
await enter();
t("first entry shows the inside graph", (await ds()).inner);
// Navegação nativa: o breadcrumb do ComfyUI mostra o Super Subgraph, sem a barra "SS" própria.
const crumb = await pg.evaluate(() => document.querySelector(".subgraph-breadcrumb")?.innerText.replace(/\s+/g, " ") || "");
t(`native breadcrumb lists the Super Subgraph: "${crumb}"`, /Super Subgraph/.test(crumb));
t("no custom SS nav bar", !(await pg.$(".lego-ss-nav")));
await setView([-100, -50], 1.5); await pg.waitForTimeout(700);
await pg.keyboard.press("Escape"); await pg.waitForTimeout(1500);
const back1 = await ds();
t(`exit (Esc) returns to the same outside view ${JSON.stringify(back1)}`, same(back1, out1));

// 2ª ida: dentro volta onde parou (sem enquadrar de novo).
await setView([350 - pos[0], 200 - pos[1]], 0.9); await pg.waitForTimeout(300);
const out2 = await ds();
await enter();
const in2 = await ds();
t(`second entry restores the last inside view ${JSON.stringify(in2)}`, same(in2, { o: [-100, -50], s: 1.5, inner: true }));

// Saída pelo breadcrumb nativo (clique no nome do workflow): volta para a vista de fora.
await setView([-40, -20], 1.1); await pg.waitForTimeout(700);
// Um nó novo criado lá dentro precisa sobreviver à saída pelo breadcrumb.
await pg.evaluate(() => { const n = window.LiteGraph.createNode("ImageInvert"); n.pos = [100, 100]; window.app.canvas.graph.add(n); });
await pg.locator(".subgraph-breadcrumb .p-breadcrumb-item-link").first().click();
await pg.waitForTimeout(1500);
const back2 = await ds();
t(`breadcrumb exit returns to the same outside view ${JSON.stringify(back2)}`, same(back2, out2));
t("inside changes live in the native subgraph", await pg.evaluate(() => window.app.graph.nodes.find((n) => n.isSubgraphNode?.()).subgraph.nodes.some((n) => n.type === "ImageInvert")));
t("breadcrumb no longer lists the Super Subgraph", !/Super Subgraph/.test(await pg.evaluate(() => document.querySelector(".subgraph-breadcrumb")?.innerText || "")));
await enter();
t(`inside view remembered after a native exit ${JSON.stringify(await ds())}`, same(await ds(), { o: [-40, -20], s: 1.1, inner: true }));

t("no page errors " + JSON.stringify(errs), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
