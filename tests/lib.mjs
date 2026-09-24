// Utilitários comuns dos testes de navegador (Chromium via playwright-core).
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Capturas de tela vão para tests/.out (ignorado pelo git).
export const OUT = path.join(HERE, ".out");
fs.mkdirSync(OUT, { recursive: true });

// ComfyUI real usado pelos testes e2e.
export const COMFY_URL = process.env.COMFY_URL || "http://127.0.0.1:8188/";

// Chromium: CHROME_PATH > Chromium pré-instalado do playwright > Chrome do sistema.
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try {
    for (const d of fs.readdirSync(root).filter((d) => d.startsWith("chromium-")).sort().reverse()) {
      const p = path.join(root, d, "chrome-linux", "chrome");
      if (fs.existsSync(p)) return p;
    }
  } catch {}
  return undefined;
}

export function launch() {
  const executablePath = chromePath();
  return chromium.launch(executablePath ? { executablePath } : { channel: "chrome" });
}

// Servidor estático para as páginas de tests/browser; "/mod.mjs" é o módulo gerado.
export function serve(port) {
  return http.createServer((q, r) => {
    const url = q.url.split("?")[0];
    const built = path.join(HERE, ".build", path.basename(url));
    const p = url === "/mod.mjs" || (url.endsWith(".js") && fs.existsSync(built)) ? path.join(HERE, ".build", path.basename(url)) : path.join(HERE, "browser", url);
    if (!p.startsWith(HERE) || !fs.existsSync(p)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { "content-type": /\.m?js$/.test(p) ? "text/javascript" : "text/html" });
    fs.createReadStream(p).pipe(r);
  }).listen(port);
}
