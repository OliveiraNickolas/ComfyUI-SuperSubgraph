// Gera tests/.build/mod.mjs: o super_subgraph.js e seus módulos (web/js/ss/)
// juntos num arquivo só, sem os imports (app/api vêm de globalThis.__app/__api),
// e com as funções internas exportadas.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "web", "js", "super_subgraph.js");
const EXPORTS = [
  "esc", "removeControlsByName", "renameClone", "walkControls", "attach", "pasteComponents",
  "copySelectedComponents", "doUndo", "openTabContextMenu", "renderObjectInspector", "ATTACHED",
  "writeWidget", "autoLayout", "dropArmedTool", "addItemToSegment", "OUTPUTS", "openInspector",
  "alignInspectorToTarget", "enterSuper", "getContiguousRow",
  "widthForCount", "createNewZone", "viewURL",
  "sectionRequiredWidth", "requiredNodeWidth", "groupSectionsLayout", "addZoneBelow", "addZoneBeside",
  "sameUrl", "MEDIA_ELEMENT_CACHE", "OUTPUT_VIEW_CACHE", "renderZoneGuides", "clearZoneGuides",
  "describeWidget", "cardHeight", "usable", "fmtNum", "numDecimals", "balanceRange", "balanceSplit", ];

// Ordem dos módulos = ordem do código original (constants primeiro).
const SS = path.join(path.dirname(SRC), "ss");
const ORDER = ["constants", "core", "widgets", "controls", "outputs", "drag", "panels", "whole_node",
  "picker", "form", "inspector", "card", "lifecycle", "native"];
const onDisk = fs.readdirSync(SS).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)).sort();
const missing = onDisk.filter((m) => !ORDER.includes(m));
if (missing.length) throw new Error(`build-module: add ${missing.join(", ")} to ORDER`);
// Tira imports (uma linha cada) e o `export { … };` final de cada módulo.
const bare = (file) => fs.readFileSync(file, "utf8")
  .replace(/^import \{[^}]*\} from "[^"]+";\n/gm, "")
  .replace(/^export \{[^}]*\};\n?/gm, "");
let src = [
  "const app = globalThis.__app;",
  "const api = globalThis.__api;",
  'import { CSS, CSS_FORM, CSS_OUTPUT, CSS_DRAG, CSS_CAPTION_ALIGN } from "./super_subgraph_css.js";',
  ...ORDER.map((m) => bare(path.join(SS, `${m}.js`))),
  bare(SRC),
].join("\n");
const swap = (re, to) => {
  if (!re.test(src)) throw new Error(`build-module: pattern not found: ${re}`);
  src = src.replace(re, to);
};
swap(/^app\.registerExtension\(/m, "globalThis.__ext = (");
src += `\nexport { ${EXPORTS.join(", ")} };\n`;

fs.mkdirSync(path.join(HERE, ".build"), { recursive: true });
fs.writeFileSync(path.join(HERE, ".build", "mod.mjs"), src);
// Módulos irmãos importados pelo principal ("./super_subgraph_css.js") vão junto.
for (const f of fs.readdirSync(path.dirname(SRC))) {
  if (f.endsWith(".js") && f !== path.basename(SRC)) fs.copyFileSync(path.join(path.dirname(SRC), f), path.join(HERE, ".build", f));
}
console.log("built tests/.build/mod.mjs");
