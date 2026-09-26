// Trocar o alvo de UM componente pelo Target Picker: o parâmetro sob o ponteiro
// acende em verde e o clique nele já liga o componente (sem a janela de lista).
import { launch, COMFY_URL } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (fn, arg) => pg.evaluate(fn, arg);

const ids = await E(() => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const n = LG.createNode("KSampler"); n.pos = [0, 0]; app.graph.add(n);
  app.canvas.deselectAll?.(); app.canvas.select(n);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.type === "SuperSubgraph");
  window.__sn = sn;
  const inner = sn.__ssGraph._nodes[0];
  const sec = sn.properties.ui_layout.tabs[0].sections[0];
  if (sec.tabs) { delete sec.tabs; delete sec.activeTab; }
  sec.controls = [{ kind: "number", name: "Stepper1", bind: `${inner.id}/steps`, label: "Steps", x: 16, y: 16, w: 256, h: 32 }];
  sn.__legoState.edit = true; sn.__legoState.refresh();
  app.canvas.ds.offset = [80 - sn.pos[0], 80 - sn.pos[1]]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  return { inner: inner.id };
});
await pg.waitForTimeout(400);
// Abre a troca de alvo do componente (botão direito → Rebind…) e o Target Picker.
await pg.locator('.lego-row[data-name="Stepper1"]').click({ button: "right" });
await pg.waitForTimeout(300);
await pg.locator("text=Rebind").first().click();
await pg.waitForTimeout(400);
await pg.locator(".lego-comfy-target-picker-btn").first().click(); await pg.waitForTimeout(800);

const wpos = (name) => E(({ id, name }) => {
  const c = window.app.canvas; const n = c.graph.getNodeById(id); const r = c.canvas.getBoundingClientRect();
  const w = n.widgets.find(w => w.name === name); const h = w.computedHeight ?? 20;
  return [r.left + (n.pos[0] + n.size[0] / 2 + c.ds.offset[0]) * c.ds.scale, r.top + (n.pos[1] + w.y + h / 2 + c.ds.offset[1]) * c.ds.scale];
}, { id: ids.inner, name });
const [x, y] = await wpos("cfg");
await pg.mouse.move(x, y); await pg.waitForTimeout(250);
t("hovered parameter gets the green highlight", (await pg.locator(".lego-pick-box.widget").count()) === 1);
await pg.mouse.click(x, y); await pg.waitForTimeout(600);
t("no parameter list window", !(await pg.$(".lego-node-picker-popup")));
const bind = await E(() => window.__sn.properties.ui_layout.tabs[0].sections[0].controls[0].bind);
t(`clicking the parameter rebinds the component: ${bind}`, bind === `${ids.inner}/cfg`);
t("picker closed (back on the outer graph)", await E(() => window.app.canvas.graph === window.app.rootGraph && !document.querySelector(".lego-picker-hud")));

t("no page errors " + JSON.stringify(errs), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
