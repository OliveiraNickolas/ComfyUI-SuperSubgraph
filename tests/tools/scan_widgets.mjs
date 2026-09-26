// Varredura de compatibilidade: cria TODOS os nós instalados num ComfyUI real
// (COMFY_URL) e lista os widgets que o cartão ainda trata mal — um campo de
// texto para algo que não é texto, ou um tipo que ninguém classificou.
// Uso: node tests/tools/scan_widgets.mjs [saida.json]
import fs from "node:fs";
import { launch, COMFY_URL } from "../lib.mjs";

const b = await launch();
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
pg.on("dialog", (d) => d.dismiss());
await pg.goto(COMFY_URL);
await pg.waitForFunction(() => !!window.app?.graph && !!window.app?.extensions?.find((e) => e.name === "ComfyUI.SuperSubgraph"), null, { timeout: 90000 });
await pg.waitForTimeout(2000);
const types = await pg.evaluate(() => Object.keys(window.LiteGraph.registered_node_types));
const rows = [];
for (let i = 0; i < types.length; i += 40) {
  rows.push(...await pg.evaluate(async (chunk) => {
    const app = window.app, LG = window.LiteGraph;
    const ext = app.extensions.find((e) => e.name === "ComfyUI.SuperSubgraph");
    app.graph.clear();
    const made = [];
    for (const t of chunk) { try { const n = LG.createNode(t); if (n) { app.graph.add(n); made.push(n); } } catch {} }
    await new Promise((r) => setTimeout(r, 400));
    const out = [];
    for (const n of made) for (const w of n.widgets || []) {
      const c = ext.__classify(w);
      out.push({ node: n.type, name: w.name, type: String(w.type), value: w.value === null ? "null" : typeof w.value, element: !!w.element, draw: typeof w.draw === "function", ...c });
    }
    return out;
  }, types.slice(i, i + 40)));
}
await b.close();
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(rows, null, 1));

// Suspeitos: promovível e virando campo de texto sem ser texto de verdade.
const TEXT_TYPES = new Set(["text", "string", "customtext", "multiline"]);
const bad = rows.filter((r) => r.usable && r.kind === "text" && (r.value !== "string" || !TEXT_TYPES.has(r.type.toLowerCase())));
const byType = new Map();
for (const r of bad) {
  const k = `${r.type} (${r.value}${r.element ? ", DOM" : ""}${r.draw ? ", draw" : ""})`;
  if (!byType.has(k)) byType.set(k, new Set());
  byType.get(k).add(r.node);
}
console.log(`${types.length} node types, ${rows.length} widgets, ${bad.length} suspicious text fallbacks`);
for (const [k, nodes] of [...byType].sort((a, b) => b[1].size - a[1].size)) {
  console.log(`  ${k}: ${[...nodes].slice(0, 4).join(", ")}${nodes.size > 4 ? ` (+${nodes.size - 4})` : ""}`);
}
