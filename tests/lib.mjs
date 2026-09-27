// Utilitários comuns dos testes de navegador (Chromium via playwright-core).
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Capturas de tela vão para tests/.out (ignorado pelo git).
export const OUT = path.join(HERE, ".out");
fs.mkdirSync(OUT, { recursive: true });

// ComfyUI real usado pelos testes e2e.
export const COMFY_URL = process.env.COMFY_URL || "http://127.0.0.1:8188/";

// Chromium: CHROME_PATH > Chromium do playwright (PLAYWRIGHT_BROWSERS_PATH,
// /opt/pw-browsers ou o cache padrão de cada sistema) > Chrome do sistema.
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const home = os.homedir();
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    "/opt/pw-browsers",
    path.join(home, ".cache", "ms-playwright"),                  // Linux
    path.join(home, "Library", "Caches", "ms-playwright"),       // macOS
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "ms-playwright"),   // Windows
  ].filter(Boolean);
  const exes = [
    ["chrome-linux", "chrome"], ["chrome-linux64", "chrome"],
    ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"],
    ["chrome-win", "chrome.exe"], ["chrome-win64", "chrome.exe"],
  ];
  for (const root of roots) {
    let dirs = [];
    try { dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse(); } catch { continue; }
    for (const d of dirs) for (const e of exes) {
      const p = path.join(root, d, ...e);
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

// Arquivos de mídia neutros do ComfyUI. A pasta input do usuário pode ter
// qualquer coisa: os testes nunca mostram (nem fotografam) o que está lá.
export const SAFE_IMAGE = "example.png";
export const SAFE_VIDEO = "nothing.mp4";

// Roda em toda página antes do ComfyUI: nó novo de carregar imagem/vídeo
// começa em SAFE_IMAGE/SAFE_VIDEO, nunca no 1º arquivo da pasta input.
function safeMediaInit([img, vid]) {
  const IMG = /\.(png|jpe?g|webp|gif|bmp|tiff?)(\s*\[\w+\])?$/i;
  const VID = /\.(mp4|webm|mov|mkv|avi|m4v)(\s*\[\w+\])?$/i;
  const fix = (node) => {
    for (const w of node?.widgets || []) {
      if (typeof w.value !== "string" || w.value === img || w.value === vid) continue;
      if (IMG.test(w.value)) w.value = img;
      else if (VID.test(w.value)) w.value = vid;
    }
    return node;
  };
  const wrap = () => {
    const LG = window.LiteGraph;
    if (!LG?.createNode || LG.createNode.__safeMedia) return !!LG?.createNode;
    const orig = LG.createNode;
    LG.createNode = function (...a) { return fix(orig.apply(this, a)); };
    LG.createNode.__safeMedia = true;
    return true;
  };
  const t = setInterval(() => { if (wrap()) clearInterval(t); }, 5);
}

export async function launch() {
  const executablePath = chromePath();
  const browser = await chromium.launch(executablePath ? { executablePath } : { channel: "chrome" });
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...a) => {
    const pg = await newPage(...a);
    await pg.addInitScript(safeMediaInit, [SAFE_IMAGE, SAFE_VIDEO]);
    return pg;
  };
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...a) => {
    const ctx = await newContext(...a);
    await ctx.addInitScript(safeMediaInit, [SAFE_IMAGE, SAFE_VIDEO]);
    return ctx;
  };
  return browser;
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
