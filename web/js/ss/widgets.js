/* Inspeção de widgets (describeWidget, usable…), binding por nome (resolveBind, writeWidget) e autoLayout. */
// Parte do ComfyUI-SuperSubgraph (ver web/js/super_subgraph.js e CLAUDE.md).
// Só declarações: nada roda ao carregar este arquivo.

import { app } from "../../../../scripts/app.js";
import { GRID, SCHEMA } from "./constants.js";
import { mirrorModeFor } from "./panels.js";
import { makeZone } from "./form.js";
import { ATTACHED } from "./lifecycle.js";
import { innerNodesOf, isSuperNode } from "./native.js";

/* ══════════════════════════════════════════════════════════════════════════
   Inspeção de widgets
   ══════════════════════════════════════════════════════════════════════════ */

const RE_TOGGLE = /^(on_|enable|enabled|active|use_|bypass|mute|solo|force_|do_)/i;
const RE_SEED = /(^|_)seed$/i;
const RE_CANVAS = /^(width|height|length|frames|num_frames|batch_size|resolution|megapixels|scale|scale_by|multiplier|upscale)/i;
const RE_SAMPLER = /^(steps|cfg|denoise|shift|sampler|scheduler|start_at|end_at|strength|guidance|noise|sigma)/i;
const RE_MODEL = /\.(safetensors|sft|ckpt|pt|pth|gguf|bin|onnx)$/i;
const RE_IMAGE = /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i;
const RE_VIDEO = /\.(mp4|webm|mkv|mov|avi|flv|m4v)$/i;
const RE_AUDIO = /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i;

/** Nome cru do widget -> rótulo legível. */
function prettify(name) {
  return String(name || "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * O LiteGraph guarda `options.step` multiplicado por 10 (herança do arrasto).
 * Versões novas trazem o passo real em `step2`.
 */
function realStep(o) {
  if (Number.isFinite(o?.step2)) return o.step2;
  if (Number.isFinite(o?.step)) return o.step / 10;
  return 1;
}

/**
 * INT ou FLOAT. `precision` é o sinal explícito do ComfyUI (0 = inteiro);
 * o passo só entra quando ela não vem.
 */
function isIntWidget(o, step, w) {
  if (w?.type && /int/i.test(w.type)) return true;
  if (Number.isFinite(o?.precision)) return o.precision === 0;
  return Number.isInteger(step) && step >= 1;
}

/** Casas decimais que o ComfyUI mostra para o número (precision, ou as do passo). */
function numDecimals(o, step, isInt) {
  if (isInt) return 0;
  if (Number.isFinite(o?.precision)) return Math.max(0, o.precision);
  return Math.min(4, Math.max(0, (String(step).split(".")[1] || "").length));
}

/** Número como o nó nativo mostra ("8.0", "1.00"), sem resíduo de float. */
function fmtNum(v, dec) {
  const n = Number(v) || 0;
  return dec > 0 ? n.toFixed(dec) : String(Math.round(n));
}

function valuesOf(w, node) {
  const v = w?.options?.values;
  if (Array.isArray(v)) return v;
  if (typeof v === "function") {
    try { return v(w, node) || []; } catch {
      try { return v(w) || []; } catch { return []; }
    }
  }
  return [];
}

function majority(list, re, sample = 24) {
  const s = list.slice(0, sample).filter((x) => typeof x === "string");
  if (!s.length) return false;
  return s.filter((x) => re.test(x)).length > s.length / 2;
}

const isModelCombo = (w) => majority(valuesOf(w), RE_MODEL);
const isImageCombo = (w) => majority(valuesOf(w), RE_IMAGE);
const isVideoCombo = (w) => majority(valuesOf(w), RE_VIDEO);
const isAudioCombo = (w) => majority(valuesOf(w), RE_AUDIO);

/** Classifica um widget vivo num tipo de controle do cartão com máxima compatibilidade com nós normais, Nodes 2.0 e custom nodes. */
function describeWidget(w) {
  const o = w?.options || {};
  const t = String(w?.type || "").toLowerCase();

  if (t === "kj_preview" || (w?.name === "preview" && t.includes("preview"))) return { kind: "preview_override" };
  const mirror = mirrorModeFor(w);
  if (mirror) return { kind: mirror === "node" ? "node_ui" : "canvas_widget" };
  if (t === "color" || t === "colorcode") return { kind: "color" };
  // Widget DOM do próprio nó (editor, lista de LoRAs, player…): o elemento
  // vivo é montado no cartão. Texto com elemento continua campo de texto.
  if (w?.element && !isTextDomWidget(w)) return { kind: "dom_widget" };
  if (w?.element && isTextDomWidget(w)) return { kind: "textarea" };   // prompt com autocompletar, nota
  if (t === "toggle" || typeof w?.value === "boolean") return { kind: "toggle" };
  if (t === "button") return { kind: "button" };
  if (t === "combo" || Array.isArray(o.values) || typeof o.values === "function" || t.includes("combo")) return { kind: "combo" };
  if (t === "number" || t === "slider" || t === "float" || t === "int" || t === "integer" || t === "seed" || typeof w?.value === "number") {
    const bounded = Number.isFinite(o.min) && Number.isFinite(o.max) && (o.max - o.min <= 1e6);
    return { kind: bounded ? "slider" : "number" };
  }
  // `customtext` é o tipo multilinha do ComfyUI e nem sempre traz
  // `options.multiline`; tratá-lo por opção devolvia um input de uma linha.
  if (t === "customtext" || t === "multiline") return { kind: "textarea" };
  if (t === "text" || t === "string") return { kind: o.multiline ? "textarea" : "text" };
  return { kind: "text" };
}

/**
 * Widgets "ajudantes" de interface: não vão para a execução e o componente de
 * mídia do cartão já faz o papel deles (botão de upload, player de áudio,
 * preview "$$..."). Nunca são promovidos.
 */
function isHelperWidget(w) {
  const name = String(w?.name || "");
  const type = String(w?.type || "").toLowerCase();
  if (name.startsWith("$$")) return true;
  if (type === "audioui" || type === "imageupload" || type === "image_upload") return true;
  if (type === "button" && /upload/i.test(name)) return true;
  // Prévia de exibição do próprio nó (ex.: "video-preview" do Load Video): não
  // é salva nem vai para a execução. O preview do KJ é tratado à parte.
  if (type !== "kj_preview" && w?.serialize === false && /preview/i.test(name)) return true;
  return false;
}

/** Widget DOM que é só um campo de texto (textarea do ComfyUI, autocomplete, nota). */
function isTextDomWidget(w) {
  const t = String(w?.type || "").toLowerCase();
  if (typeof w?.value !== "string" && w?.value != null) return false;
  return t === "customtext" || t === "multiline" || t === "markdown" || t.startsWith("autocomplete");
}

/** Widgets que o cartão pode ligar (os demais ele nunca toca). */
function usable(w) {
  if (!w || w.__lego || w.__ssInternal) return false;
  if (isHelperWidget(w)) return false;
  const t = String(w.type || "").toLowerCase();
  // Escondidos pelo próprio nó ("hidden", "easyhidden", "h3frhidden"…): o nó
  // controla por outra interface, o cartão não oferece.
  if (t === "converted-widget" || t === "dummy" || t.includes("hidden") || w.hidden === true) return false;
  if (t === "kj_preview") return true;
  if (t.startsWith("dom")) return false;
  // Valor-objeto sem elemento nem desenho (widgets só do modo Vue): um campo
  // de texto gravaria "[object Object]" no lugar e estragaria o workflow.
  if (w.value !== null && typeof w.value === "object" && !w.element && typeof w.draw !== "function") return false;
  return typeof w.name === "string" && w.name.length > 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   Binding por name (opcionalmente atravessando nós: "6725/steps")
   ══════════════════════════════════════════════════════════════════════════ */

function nodeById(graph, id) {
  if (!graph) return null;
  if (typeof graph.getNodeById === "function") {
    const n = graph.getNodeById(Number(id));
    if (n) return n;
  }
  return (graph._nodes || []).find((n) => String(n.id) === String(id)) || null;
}

function findNodeInHostScope(host, id) {
  const sid = String(id);
  // 1. Procura dentro dos nós internos do subgrafo
  // (subgrafo nativo ou o grafo interno de um Super Subgraph)
  const inner = innerNodesOf(host).find((n) => String(n.id) === sid);
  if (inner) return inner;
  // 2. Procura no grafo pai onde o host reside
  const fromHost = nodeById(host.graph, id);
  if (fromHost) return fromHost;
  // 3. Fallback para app.graph ou grafo ativo no canvas (Nodes 2.0 / Subgrafos)
  const fromApp = nodeById(app.graph, id);
  if (fromApp) return fromApp;
  const currentGraph = app.canvas?.getCurrentGraph?.();
  if (currentGraph && currentGraph !== host.graph && currentGraph !== app.graph) {
    const fromCurrent = nodeById(currentGraph, id);
    if (fromCurrent) return fromCurrent;
  }
  return null;
}

/**
 * Resolve `bind` para { node, widget }, ou null se o widget não existir mais.
 * Suporta referências diretas ("steps") e cruzadas ("6725/steps").
 */
function resolveBind(host, bind) {
  if (typeof bind !== "string" || !bind) return null;
  let target = host;
  let name = bind;

  const slash = bind.indexOf("/");
  if (slash > 0) {
    const id = bind.slice(0, slash);
    const rest = bind.slice(slash + 1);
    const found = findNodeInHostScope(host, id);
    if (!found) return null;
    target = found;
    name = rest;
  }

  const w = (target.widgets || []).find((x) => x && x.name === name);
  if (!w) return null;
  // Parâmetro de dentro PROMOVIDO para o subgrafo nativo: quem vale na
  // execução é o widget promovido do nó (um valor por instância), não o de
  // dentro. O cartão lê e grava nele.
  if (target !== host && target.graph === host.subgraph) {
    const promoted = promotedHostWidget(host, target, name);
    if (promoted) return { node: host, widget: promoted, inner: { node: target, widget: w } };
  }
  return { node: target, widget: w };
}

/**
 * Widget promovido do subgrafo nativo `host` que alimenta o widget `name` do
 * nó de dentro `inner` (entrada de dentro ligada numa entrada do subgrafo),
 * ou null se esse widget não foi promovido.
 */
function promotedHostWidget(host, inner, name) {
  const sg = host?.subgraph;
  const inp = (inner.inputs || []).find((i) => i?.link != null && (i.widget?.name === name || i.name === name));
  if (!sg || !inp) return null;
  const link = sg.getLink?.(inp.link) ?? sg.links?.get?.(inp.link) ?? sg.links?.[inp.link];
  if (!link) return null;
  const ioId = sg.inputNode?.id ?? -10;
  if (!(link.originIsIoNode || String(link.origin_id) === String(ioId))) return null;
  const hostIn = host.inputs?.[link.origin_slot];
  const wname = hostIn?.widget?.name;
  if (!wname || hostIn.link != null) return null;   // ligado por fio lá fora: não há o que editar
  return (host.widgets || []).find((x) => x?.name === wname) || null;
}

function bindKey(host, node, w) {
  return node === host ? w.name : `${node.id}/${w.name}`;
}

let dirtyCanvasRaf = null;
function requestCanvasDirty(graph) {
  if (dirtyCanvasRaf) return;
  dirtyCanvasRaf = requestAnimationFrame(() => {
    dirtyCanvasRaf = null;
    graph?.setDirtyCanvas?.(true, true);
  });
}

/** Escreve no widget real e avisa o grafo. Não mexe em widgets_values. */
function writeWidget(node, w, value) {
  w.value = value;
  // Mantém widgets_values em dia. O índice é o do widget entre os
  // SERIALIZÁVEIS (nota 3 do topo): contar pela posição em `node.widgets`
  // escrevia na casa errada quando havia um widget `serialize: false` antes.
  if (node && Array.isArray(node.widgets_values) && Array.isArray(node.widgets)) {
    const serializable = node.widgets.filter((x) => x && x.serialize !== false && x.options?.serialize !== false);
    const idx = serializable.indexOf(w);
    if (idx >= 0 && idx < node.widgets_values.length) node.widgets_values[idx] = value;
  }
  try { w.callback?.call(w, value, app.canvas, node, [0, 0], {}); } catch (e) { /* widget sem callback */ }
  requestCanvasDirty(node.graph || app.graph);
  node.onWidgetChanged?.(w.name, value, undefined, w);
  app.canvas?.setDirty?.(true, true);
  // O callback pode ter mexido em OUTROS widgets sem chamar o callback deles
  // (Toggle All -> on_1..on_N). Confere agora e de novo no próximo quadro,
  // para o que for aplicado de forma assíncrona.
  syncWatchedWidgets();
  requestAnimationFrame(syncWatchedWidgets);
}

/**
 * Repinta os controles cujo widget mudou de valor por qualquer caminho.
 *
 * Nem toda mudança passa pelo `callback`: outras extensões gravam `w.value`
 * direto — e não dá para interceptar `value` com defineProperty, porque isso o
 * tira do Vue e congela os widgets no Nodes 2.0. Então compara o valor atual
 * com o último desenhado e só repinta o que mudou.
 */
function syncWatchedWidgets() {
  for (const n of ATTACHED) {
    const st = n.__legoState;
    if (!st?.watchers?.size) continue;
    for (const [w, fns] of st.watchers) {
      const v = w.value;
      if (st.seen.has(w) && Object.is(st.seen.get(w), v)) continue;
      st.seen.set(w, v);
      for (const f of fns) { try { f(); } catch { /* controle já descartado */ } }
    }
  }
}

/** Checagem periódica, para mudanças feitas fora do cartão (canvas, scripts). */
const WATCH_POLL_MS = 200;
let watchPollTimer = null;
function startWatchPoll() {
  if (watchPollTimer) return;
  watchPollTimer = setInterval(() => {
    if (!ATTACHED.size) { clearInterval(watchPollTimer); watchPollTimer = null; return; }
    if (document.hidden) return;
    syncWatchedWidgets();
  }, WATCH_POLL_MS);
}

/* ══════════════════════════════════════════════════════════════════════════
   Auto-populate — inspeção real do nó, sem valores fictícios
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Detecta "famílias" de widgets criadas por entradas dinâmicas.
 *
 * Um loader de LoRAs promovido gera `on_1..on_6`, `lora_name, lora_name_1..5`,
 * `strength_model, strength_model_1..5`. Os números NÃO se alinham entre as
 * famílias: `on_` começa em 1, as outras começam sem sufixo. Por isso o
 * agrupamento é pelo ORDINAL dentro da própria família — a 1ª entrada de cada
 * uma vai para a mesma linha, a 2ª para a próxima, e assim por diante.
 */
function detectFamilies(widgets) {
  const fams = new Map();
  for (const w of widgets) {
    const m = /^(.*?)_(\d+)$/.exec(w.name);
    const base = m ? m[1] : w.name;
    const idx = m ? Number(m[2]) : 0;
    if (!base) continue;
    if (!fams.has(base)) fams.set(base, []);
    fams.get(base).push({ w, idx });
  }

  // Só interessa família com mais de um membro.
  const multi = [...fams.entries()]
    .map(([base, list]) => [base, list.sort((a, b) => a.idx - b.idx)])
    .filter(([, list]) => list.length >= 2);
  if (multi.length < 2) return null;

  // Zipa apenas as famílias de mesmo comprimento (o comprimento dominante).
  const counts = {};
  for (const [, list] of multi) counts[list.length] = (counts[list.length] || 0) + 1;
  const size = Number(Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]);
  const zip = multi.filter(([, list]) => list.length === size);
  if (zip.length < 2 || size < 2) return null;

  const rows = [];
  for (let ord = 0; ord < size; ord++) rows.push(zip.map(([, list]) => list[ord].w));
  const bases = zip.map(([base]) => base);
  return { rows, bases, members: new Set(rows.flat()) };
}

/** Ordem de leitura dentro de uma linha agrupada: chave, escolha, texto, número. */
const GROUP_ORDER = { toggle: 0, combo: 1, media: 1, video: 1, audio: 1, text: 2, textarea: 2, slider: 3, number: 3, button: 4 };

function nameFamilies(bases) {
  const j = bases.join(" ").toLowerCase();
  if (j.includes("lora")) return "LoRAs";
  if (j.includes("image") || j.includes("ref")) return "References";
  if (j.includes("model") || j.includes("ckpt")) return "Models";
  return "Blocks";
}

function headerFamilies(bases) {
  const j = bases.join(" ").toLowerCase();
  if (j.includes("lora")) return "LORA STACK (ENABLE · FILE · WEIGHT)";
  if (j.includes("image") || j.includes("ref")) return "VISUAL REFERENCES";
  if (j.includes("model") || j.includes("ckpt")) return "CHECKPOINTS & MODELS";
  return bases.map(prettify).join(" · ").toUpperCase();
}

function autoLayout(node) {
  const all = (node.widgets || []).filter(usable);

  /* — famílias dinâmicas viram uma linha por ordinal — */
  const fam = detectFamilies(all);
  const groups = [];
  if (fam) {
    fam.rows.forEach((ws, i) => {
      const items = ws
        .map((w) => {
          const d = describeWidget(w);
          const kind = d.kind === "combo"
            ? (isVideoCombo(w) ? "video" : isAudioCombo(w) ? "audio" : isImageCombo(w) ? "media" : d.kind)
            : d.kind;
          return { bind: w.name, label: prettify(w.name), kind };
        })
        .sort((a, b) => (GROUP_ORDER[a.kind] ?? 9) - (GROUP_ORDER[b.kind] ?? 9));
      groups.push({ kind: "group", label: String(i + 1), items });
    });
  }

  const bins = {
    canvas: [], sampler: [], toggles: [], models: [], prompts: [], media: [], other: [],
  };

  for (const w of all) {
    if (fam?.members.has(w)) continue;
    const d = describeWidget(w);
    const ctrl = { bind: w.name, label: prettify(w.name), kind: d.kind };
    const n = w.name;

    if (d.kind === "textarea") bins.prompts.push(ctrl);
    else if (d.kind === "combo" && isVideoCombo(w)) bins.media.push({ ...ctrl, kind: "video" });
    else if (d.kind === "combo" && isAudioCombo(w)) bins.media.push({ ...ctrl, kind: "audio" });
    else if (d.kind === "combo" && isImageCombo(w)) bins.media.push({ ...ctrl, kind: "media" });
    else if (d.kind === "combo" && isModelCombo(w)) bins.models.push(ctrl);
    // Pelo nome só vira Toggle o que já tem cara de liga/desliga (combo de 2
    // opções); um INT "force_offload_blocks" continua número.
    else if (d.kind === "toggle" || (RE_TOGGLE.test(n) && d.kind === "combo" && valuesOf(w).length === 2)) bins.toggles.push({ ...ctrl, kind: "toggle" });
    else if (RE_SEED.test(n)) bins.sampler.push({ ...ctrl, seed: true });
    else if (RE_CANVAS.test(n)) bins.canvas.push(ctrl);
    else if (RE_SAMPLER.test(n)) bins.sampler.push(ctrl);
    else bins.other.push(ctrl);
  }

  const tabs = [];
  const sec = (header, controls) => makeZone(header, controls);

  // Uma seção com muitos controles de uma linha lê melhor em duas colunas
  const cols = (list) => (list.length > 6 ? 2 : undefined);

  if (bins.models.length) {
    tabs.push({ name: "Models", sections: [sec("CHECKPOINTS & ENCODERS", bins.models)] });
  }

  if (groups.length) {
    tabs.push({ name: nameFamilies(fam.bases), sections: [sec(headerFamilies(fam.bases), groups)] });
  }

  const main = [];
  if (bins.sampler.length) main.push(sec("SAMPLING & GENERATION", bins.sampler));
  if (bins.canvas.length) main.push(sec("RESOLUTION & DIMENSIONS", bins.canvas));
  if (bins.toggles.length) main.push({ ...sec("SWITCHES & TOGGLES", bins.toggles), cols: cols(bins.toggles) });
  if (bins.other.length) main.push({ ...sec("MISC PARAMETERS", bins.other), cols: cols(bins.other) });
  if (main.length) tabs.push({ name: "Controls", sections: main });

  if (bins.prompts.length) tabs.push({ name: "Prompts", sections: [sec("PROMPTS & TEXT", bins.prompts)] });
  if (bins.media.length) {
    tabs.push({ name: "Media", sections: [makeZone("REFERENCE GRID", bins.media, { grid: 3 })] });
  }
  // Subgrafo com nó de saída (Preview/Save...) ganha a aba Output já montada,
  // em modo automático: mostra o último resultado de cada tipo.
  const outKinds = new Set();
  for (const n of innerNodesOf(node)) {
    const type = String(n.type || "");
    const isOut = n.constructor?.nodeData?.output_node || /(preview|save)|videocombine/i.test(type);
    if (!isOut) continue;
    // Só o que é mídia: SaveLatent, por exemplo, também é nó de saída.
    if (/video|vhs|combine/i.test(type)) outKinds.add("outvideo");
    else if (/audio/i.test(type)) outKinds.add("outaudio");
    else if (/image/i.test(type)) outKinds.add("outimage");
  }
  if (outKinds.size) {
    const outs = ["outimage", "outvideo", "outaudio"].filter((k) => outKinds.has(k)).map((k) => ({
      kind: k, label: "", w: 288, h: k === "outaudio" ? 96 : 256,
    }));
    tabs.push({ name: "Output", sections: [makeZone("OUTPUT", outs)] });
  }

  if (!tabs.length) tabs.push({ name: "Controls", sections: [sec("PARAMETERS", [])] });

  const isSub = isSuperNode(node) || (typeof node.isSubgraphNode === "function" ? node.isSubgraphNode() : !!node.subgraph);

  return {
    schema: SCHEMA,
    title: (node.title || node.type || "Super-Subgraph").toUpperCase(),
    subtitle: isSub ? "Encapsulated subgraph" : "Encapsulated node",
    badge: `${all.length} ctrl`,
    activeTab: 0,
    tabs,
  };
}

export { RE_TOGGLE, RE_SEED, RE_CANVAS, RE_SAMPLER, RE_MODEL, RE_IMAGE, RE_VIDEO, RE_AUDIO, prettify, realStep, isIntWidget, numDecimals, fmtNum, valuesOf, majority, isModelCombo, isImageCombo, isVideoCombo, isAudioCombo, describeWidget, isHelperWidget, isTextDomWidget, usable, nodeById, findNodeInHostScope, resolveBind, promotedHostWidget, bindKey, dirtyCanvasRaf, requestCanvasDirty, writeWidget, syncWatchedWidgets, WATCH_POLL_MS, watchPollTimer, startWatchPoll, detectFamilies, GROUP_ORDER, nameFamilies, headerFamilies, autoLayout };
