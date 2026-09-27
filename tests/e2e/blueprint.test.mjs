// Blueprint (Publish Subgraph → biblioteca do ComfyUI): o Super Subgraph
// inserido pela busca de nós chega com o cartão, ligado aos nós dele.
// O blueprint de teste é apagado no fim (fica na pasta do usuário).
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1500, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const NAME = "ss_e2e_blueprint_tmp";
let nodes = [];
try {
  await pg.evaluate(async (NAME) => {
    const app = window.app; app.graph.clear(); const LG = window.LiteGraph; const g = app.graph;
    const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
    const blur = LG.createNode("ImageBlur"); g.add(blur);
    app.canvas.deselectAll(); app.canvas.select(blur);
    ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
    const sn = g.nodes.find(n => n.isSubgraphNode?.());
    ext.__promoteWhole(sn, sn.subgraph.nodes[0], "column");
    await new Promise(r => setTimeout(r, 300));
    app.canvas.deselectAll(); app.canvas.select(sn);
    await app.extensionManager.command.execute("Comfy.PublishSubgraph", { metadata: { name: NAME } });
    await new Promise(r => setTimeout(r, 1500));
  }, NAME);
  // insere pela busca de nós, como o usuário
  // A biblioteca carrega o blueprint novo sozinha; espera ele aparecer na busca.
  let found = false;
  for (let i = 0; i < 4 && !found; i++) {
    await pg.keyboard.press("Escape");
    await pg.mouse.dblclick(1100, 650);
    await pg.waitForSelector("input[type=text]:focus, input:focus", { timeout: 5000 }).catch(() => {});
    await pg.keyboard.type(NAME, { delay: 20 });
    found = await pg.waitForFunction((n) => [...document.querySelectorAll("li, [role=option]")].some(e => e.offsetParent && e.textContent.includes(n)), NAME, { timeout: 4000 }).then(() => true, () => false);
  }
  await pg.keyboard.press("Enter"); await pg.waitForTimeout(1500);
  nodes = await pg.evaluate(() => window.app.graph.nodes.filter(x => x.subgraph).map(x => ({
    card: !!x.__legoHost,
    bindsInside: (JSON.stringify(x.properties?.ui_layout || {}).match(/"bind":"(\d+)\//g) || []).every(m => x.subgraph.nodes.some(n => `"bind":"${n.id}/` === m)),
    values: x.__legoHost ? [...x.__legoHost.querySelectorAll(".lego-step-input")].map(i => i.value) : [],
  })));
} finally {
  await pg.evaluate((NAME) => window.comfyAPI.api.api.deleteUserData(`subgraphs/${NAME}.json`), NAME);
}
const ins = nodes[1];
t("blueprint inserted from the node search", nodes.length === 2);
t("inserted Super Subgraph has its card", !!ins?.card);
t("its card is bound to its own inner nodes, with values " + JSON.stringify(ins?.values), !!ins?.bindsInside && ins.values.length === 2);
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
