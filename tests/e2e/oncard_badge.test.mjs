// Nodes 2.0: o selo "on card" fica dentro da linha do cabeçalho, logo depois
// do título, e não cobre botões que outras extensões põem no fim da linha
// (o wireless do AllmaNodes, por exemplo). O ajuste Comfy.VueNodes.Enabled é
// o do usuário: volta ao que era no fim.
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message));
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (f, a) => pg.evaluate(f, a);
const before = await E(() => window.app.extensionManager.setting.get("Comfy.VueNodes.Enabled"));
try {
  await E(() => window.app.extensionManager.setting.set("Comfy.VueNodes.Enabled", true));
  await pg.waitForTimeout(800);
  const ids = await E(async () => {
    const app = window.app; app.graph.clear(); const LG = window.LiteGraph; const g = app.graph;
    const ext = app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
    const ks = LG.createNode("KSampler"); g.add(ks);
    app.canvas.deselectAll(); app.canvas.select(ks);
    ext.__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
    const sn = g.nodes.find(n => n.isSubgraphNode?.()); const inner = sn.subgraph.nodes[0];
    sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls = [{ name: "Steps", kind: "number", label: "steps", bind: `${inner.id}/steps`, x: 16, y: 16, w: 256, h: 32 }];
    sn.__legoState.refresh();
    app.canvas.openSubgraph(sn.subgraph, sn);
    await new Promise(r => setTimeout(r, 600));
    inner.pos = [200, 200]; app.canvas.ds.offset = [0, 0]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
    return { inner: inner.id };
  });
  await pg.waitForTimeout(1200);
  const r = await E((id) => {
    const row = document.querySelector(`[data-testid="node-header-${id}"]`)?.firstElementChild;
    const badge = row?.querySelector(":scope > .lego-oncard-badge");
    // um botão no fim da linha, como o do AllmaNodes
    const btn = document.createElement("button"); btn.textContent = "W"; btn.style.cssText = "flex:none;width:26px;height:18px"; row?.append(btn);
    const a = badge?.getBoundingClientRect(), c = btn.getBoundingClientRect();
    const overlap = a && !(a.right <= c.left || c.right <= a.left || a.bottom <= c.top || c.bottom <= a.top);
    const title = row?.querySelector('[data-testid="node-title"]')?.getBoundingClientRect();
    return { inRow: !!badge, afterTitle: !!(title && a && a.left >= title.left), overlap: !!overlap, noAfter: getComputedStyle(document.querySelector(`.lg-node[data-node-id="${id}"]`), "::after").content };
  }, ids.inner);
  t("badge is inside the header row " + JSON.stringify(r), r.inRow && r.afterTitle);
  t("a button at the end of the header is not covered by the badge", r.overlap === false);
  t("no old floating badge (::after) " + r.noAfter, r.noAfter === "none" || r.noAfter === "normal");
} finally {
  await E((v) => window.app.extensionManager.setting.set("Comfy.VueNodes.Enabled", v), before);
}
t("Vue Nodes setting restored", (await E(() => window.app.extensionManager.setting.get("Comfy.VueNodes.Enabled"))) === before);
t("no page errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
