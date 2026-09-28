// Nó de saída (Preview Image) no cartão: escolher o nó no Target Picker (ou
// promover o nó inteiro) cria um Image Output ligado a ele, que mostra a imagem
// depois de rodar. Save Image entra como grupo: parâmetro + imagem (não roda:
// o teste não grava arquivos na pasta output).
// Imagem do teste: EmptyImage (preta, gerada) — nada da pasta input.
import path from "node:path";
import { launch, COMFY_URL, OUT as dir } from "../lib.mjs";
const b = await launch();
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => { if (m.type() === "error" && /SuperSubgraph|lego/i.test(m.text())) errs.push(m.text()); });
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find(e => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(1500); await pg.keyboard.press("Escape");
let ok = 0, fail = 0; const t = (n, c) => { c ? ok++ : fail++; console.log(c ? "PASS" : "FAIL", n); };
const E = (f, a) => pg.evaluate(f, a);

const ids = await E(async () => {
  const app = window.app; app.graph.clear(); const LG = window.LiteGraph;
  const mk = (type, x, y = 0) => { const n = LG.createNode(type); n.pos = [x, y]; app.graph.add(n); return n; };
  const A = mk("EmptyImage", 0), P = mk("PreviewImage", 400), S = mk("SaveImage", 400, 400);
  A.widgets.find(w => w.name === "width").value = 64; A.widgets.find(w => w.name === "height").value = 64;
  A.connect(0, P, 0); A.connect(0, S, 0);
  app.canvas.deselectAll?.(); for (const n of [A, P, S]) app.canvas.select(n);
  app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph").__flatCanvas().find(i => i && /Convert/.test(i.content)).callback();
  const sn = app.graph.nodes.find(n => n.isSubgraphNode?.());
  // cartão vazio para o teste (a conversão já monta uma aba Output sozinha)
  sn.properties.ui_layout.tabs = [sn.properties.ui_layout.tabs[0]];
  sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls = [];
  sn.__legoState.refresh();
  app.canvas.ds.offset = [80 - sn.pos[0], 80 - sn.pos[1]]; app.canvas.ds.scale = 1; app.canvas.setDirty(true, true);
  window.__sn = sn;
  return { sn: sn.id, P: P.id, S: S.id };
});
await pg.waitForTimeout(600);

// 1. Target Picker: clicar no título do Preview Image marca o nó inteiro
await pg.locator(".lego-head .lego-iconbtn:not(.lego-ss-enter):not(.lego-more-btn)").last().click(); await pg.waitForTimeout(300);
await pg.locator(".lego-zone-dropzone").dblclick(); await pg.waitForTimeout(400);
await pg.locator(".lego-comfy-target-picker-btn").click(); await pg.waitForTimeout(700);
const [x, y] = await E((id) => {
  const c = window.app.canvas; const n = c.graph.getNodeById(id); const r = c.canvas.getBoundingClientRect(); const T = window.LiteGraph.NODE_TITLE_HEIGHT || 30;
  return [r.left + (n.pos[0] + 40 + c.ds.offset[0]) * c.ds.scale, r.top + (n.pos[1] - T / 2 + c.ds.offset[1]) * c.ds.scale];
}, ids.P);
await pg.mouse.click(x, y); await pg.waitForTimeout(200);
const hud = await E(() => ({ whole: document.querySelectorAll(".lego-pick-box.whole").length, btn: document.querySelector(".lego-picker-promote-btn")?.innerText, toast: document.querySelector(".lego-toast")?.innerText || "" }));
t("Preview Image (no parameters) can be picked " + JSON.stringify(hud), hud.whole === 1 && /Promote \(1\)/.test(hud.btn));
await pg.locator(".lego-picker-promote-btn").click(); await pg.waitForTimeout(700);
const c1 = await E(() => window.__sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls.map(c => ({ kind: c.kind, source: c.source, label: c.label })));
t("…and becomes an Image Output bound to it " + JSON.stringify(c1), c1.length === 1 && c1[0].kind === "outimage" && c1[0].source === String(ids.P));

// 2. Save Image inteiro: grupo com o parâmetro e a imagem
const c2 = await E((id) => {
  const sn = window.__sn; const S = sn.subgraph.getNodeById(id);
  const ext = window.app.extensions.find(e => e.name === "ComfyUI.SuperSubgraph");
  const g = ext.__promoteWhole(sn, S);
  return { kind: g.kind, items: (g.items || []).map(i => i.kind + (i.source ? ":" + i.source : "")) };
}, ids.S);
t("Save Image as a whole node: its parameter plus the image " + JSON.stringify(c2), /segment/.test(c2.kind) && c2.items.includes(`outimage:${ids.S}`) && c2.items.includes("text"));

// 3. roda: a imagem aparece no Image Output do Preview Image. O Save Image fica
// desligado (bypass) para o teste não gravar arquivos na pasta output.
await E(async (id) => { const sn = window.__sn; sn.subgraph.getNodeById(id).mode = 4; const st = sn.__legoState; st.edit = false; st.refresh(); await window.app.queuePrompt(0, 1); }, ids.S);
await pg.waitForFunction(() => document.querySelectorAll(".lego-out-stage img").length >= 1, null, { timeout: 60000 }).catch(() => {});
const imgs = await E(() => [...document.querySelectorAll(".lego-out-stage img")].map(i => i.src.includes("/view?") && i.src.includes("type=temp")));
t("after running, the Preview Image output shows the image " + JSON.stringify(imgs), imgs.length === 1 && imgs[0]);
await pg.screenshot({ path: path.join(dir, "preview_output.png") });

// 4. Image Output automático (sem origem escolhida): com um Save Image dentro,
// mostra só o resultado final, não a prévia. Eventos simulados (nada é gravado).
const auto = await E(async (ids) => {
  const sn = window.__sn; const api = window.comfyAPI.api.api;
  const S = sn.subgraph.getNodeById(ids.S); S.mode = 0;
  const list = sn.properties.ui_layout.tabs[0].sections[0].tabs[0].controls;
  list.length = 0; list.push({ name: "AutoOut", kind: "outimage", x: 16, y: 16, w: 256, h: 224 });
  sn.__legoState.refresh();
  const fire = (id, filename, type) => api.dispatchCustomEvent("executed", { node: `${sn.id}:${id}`, prompt_id: "t", output: { images: [{ filename, subfolder: "", type }] } });
  const shown = () => document.querySelector('.lego-row[data-name="AutoOut"] .lego-out-stage img')?.src || "";
  const out = {};
  fire(ids.S, "final_result.png", "output"); await new Promise(r => setTimeout(r, 200));
  fire(ids.P, "just_a_preview.png", "temp"); await new Promise(r => setTimeout(r, 200));
  out.withSave = shown();
  S.mode = 4;   // Save Image desligado: a prévia volta a valer
  fire(ids.P, "just_a_preview.png", "temp"); await new Promise(r => setTimeout(r, 200));
  out.saveBypassed = shown();
  return out;
}, ids);
t("auto Image Output shows the final Save Image result, not the preview", /final_result\.png/.test(auto.withSave));
t("with Save Image bypassed, it falls back to the preview", /just_a_preview\.png/.test(auto.saveBypassed));
t("no extension errors " + JSON.stringify(errs.slice(0, 3)), !errs.length);
console.log(`\n${ok} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
