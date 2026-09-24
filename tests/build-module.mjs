// Gera tests/.build/mod.mjs: o super_subgraph.js sem os imports do ComfyUI
// (app/api vêm de globalThis.__app/__api) e com as funções internas exportadas.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "web", "js", "super_subgraph.js");
const EXPORTS = [
  "esc", "removeControlsByName", "renameClone", "walkControls", "attach", "pasteComponents",
  "copySelectedComponents", "doUndo", "openTabContextMenu", "renderObjectInspector", "ATTACHED",
  "writeWidget", "autoLayout", "dropArmedTool", "addItemToSegment", "OUTPUTS", "openInspector",
];

let src = fs.readFileSync(SRC, "utf8");
const swap = (re, to) => {
  if (!re.test(src)) throw new Error(`build-module: pattern not found: ${re}`);
  src = src.replace(re, to);
};
swap(/^import \{ app \} from .*$/m, "const app = globalThis.__app;");
swap(/^import \{ api \} from .*$/m, "const api = globalThis.__api;");
swap(/^app\.registerExtension\(/m, "globalThis.__ext = (");
src += `\nexport { ${EXPORTS.join(", ")} };\n`;

fs.mkdirSync(path.join(HERE, ".build"), { recursive: true });
fs.writeFileSync(path.join(HERE, ".build", "mod.mjs"), src);
// Módulos irmãos importados pelo principal ("./super_subgraph_css.js") vão junto.
for (const f of fs.readdirSync(path.dirname(SRC))) {
  if (f.endsWith(".js") && f !== path.basename(SRC)) fs.copyFileSync(path.join(path.dirname(SRC), f), path.join(HERE, ".build", f));
}
console.log("built tests/.build/mod.mjs");
