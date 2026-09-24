// Roda as suítes: node tests/run.mjs [unit] [browser] [e2e]  (padrão: unit + browser)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const groups = process.argv.slice(2).length ? process.argv.slice(2) : ["unit", "browser"];

const build = spawnSync(process.execPath, [path.join(HERE, "build-module.mjs")], { stdio: "inherit" });
if (build.status) process.exit(build.status);

const failed = [];
for (const g of groups) {
  const dir = path.join(HERE, g);
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".test.mjs")).sort()) {
    console.log(`\n=== ${g}/${f}`);
    const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: "inherit", cwd: dir, timeout: 300000 });
    if (r.status !== 0) failed.push(`${g}/${f}`);
  }
}
console.log(failed.length ? `\nFAILED: ${failed.join(", ")}` : "\nALL SUITES PASSED");
process.exit(failed.length ? 1 : 0);
