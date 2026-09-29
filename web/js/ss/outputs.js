/* Exibição de saídas (Image / Video / Audio Output) e o registro dos outputs executados. */
// Parte do ComfyUI-SuperSubgraph (ver web/js/super_subgraph.js e CLAUDE.md).
// Só declarações: nada roda ao carregar este arquivo.

import { app } from "../../../../scripts/app.js";
import { api } from "../../../../scripts/api.js";
import { LOG, PROP } from "./constants.js";
import { pushUndo } from "./core.js";
import { RE_AUDIO, RE_IMAGE, RE_VIDEO, findNodeInHostScope } from "./widgets.js";
import { eatPointer, el, glyph, glyphEl, sameUrl } from "./controls.js";
import { is2DKind, isMediaKind } from "./drag.js";
import { isPanelKind } from "./panels.js";
import { listBindableTargets, outputKindOfNode } from "./whole_node.js";
import { openInspector } from "./picker.js";
import { toolByKind } from "./form.js";
import { ensureComponentName, renderObjectInspector } from "./inspector.js";
import { ATTACHED } from "./lifecycle.js";
import { execPathsOf, hasInnerGraph, innerNodesOf } from "./native.js";

/* ══════════════════════════════════════════════════════════════════════════
   Exibição de saídas (Image / Video / Audio Output)

   Não ligam a um widget, e sim a um NÓ: mostram o que ele gerou na última
   execução. O servidor avisa pelo evento `executed` do websocket, cujo
   `detail.node` é o id de execução — dentro de um subgrafo ele vem prefixado
   pelo caminho ("12:5" = nó 5 dentro do subgrafo 12). `ctrl.source` guarda o
   id do nó escolhido; vazio é o modo automático: o output mais recente do tipo
   pedido que saiu de dentro do subgrafo (ou do próprio nó, se não for um).
   ══════════════════════════════════════════════════════════════════════════ */

const OUTPUT_KINDS = { outimage: "image", outvideo: "video", outaudio: "audio" };
const isOutputKind = (k) => Object.prototype.hasOwnProperty.call(OUTPUT_KINDS, k);

/** Último output de cada id de execução, com a ordem de chegada. */
const OUTPUTS = new Map();
let OUTPUT_SEQ = 0;

function recordOutput(key, output) {
  if (key == null || !output || typeof output !== "object") return;
  OUTPUTS.set(String(key), { output, seq: ++OUTPUT_SEQ });
}

/** Avisa todos os cartões para repintarem as áreas de output. */
function notifyOutputViews() {
  for (const n of ATTACHED) {
    for (const v of n.__legoState?.outputViews || []) {
      try { v.update(); } catch (e) { console.warn(LOG, "output view update failed", e); }
    }
  }
}

/** Arquivos de um output do ComfyUI, com o tipo de mídia de cada um. */
function outputFiles(output) {
  const files = [];
  const add = (list, hint) => {
    for (const it of Array.isArray(list) ? list : []) {
      if (it && typeof it.filename === "string") files.push({ ...it, hint });
    }
  };
  add(output.images, "image");   // PreviewImage / SaveImage / SaveVideo (animated)
  add(output.gifs, "video");     // VideoHelperSuite
  add(output.video, "video");
  add(output.videos, "video");
  add(output.audio, "audio");    // PreviewAudio / SaveAudio
  add(output.audios, "audio");
  for (const f of files) {
    const fmt = String(f.format || "");
    if (RE_AUDIO.test(f.filename) || fmt.startsWith("audio/")) f.media = "audio";
    else if (RE_VIDEO.test(f.filename) || fmt.startsWith("video/")) f.media = "video";
    else if (RE_IMAGE.test(f.filename) || fmt.startsWith("image/")) f.media = "image";
    else f.media = f.hint;
  }
  return files;
}

function outputURL(file, seq) {
  const q = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder || "",
    type: file.type || "output",
  });
  if (file.format) q.set("format", file.format);
  q.set("rand", String(seq));
  return api.apiURL(`/view?${q.toString()}`);
}

/** O nó de origem está dentro do subgrafo deste host? */
function isInsideHost(host, id) {
  return innerNodesOf(host).some((n) => String(n.id) === String(id));
}

/** Output mais recente com arquivos do tipo `media` para o controle. */
function latestOutputFor(host, ctrl, media) {
  const src = ctrl.source != null && ctrl.source !== "" ? String(ctrl.source) : "";
  let match;
  // Ids de execução: o subgrafo nativo prefixa os nós de dentro com "<host>:".
  // (Host dentro de outro subgrafo: "<pai>:<host>:" — ver execPathsOf.)
  const paths = execPathsOf(host);
  if (!src) {
    match = host.subgraph ? (k) => paths.some((p) => k.startsWith(`${p}:`)) : (k) => paths.includes(k);
  } else {
    const bases = isInsideHost(host, src) ? paths.map((p) => `${p}:${src}`) : [src];
    match = (k) => bases.some((base) => k === base || k.startsWith(`${base}:`));
  }

  // Automático com um nó de saída final dentro (Save Image, Save Video…): as
  // prévias (Preview Image) não entram — só o resultado final. Sem nó final
  // (só Preview), a prévia é o que há para mostrar.
  if (!src) {
    const inner = innerNodesOf(host);
    const cls = (n) => String(n.comfyClass || n.type || "");
    const isPreview = (n) => /preview/i.test(cls(n));
    // Nó final do MESMO tipo de mídia (Save Image para imagem, Save Video
    // para vídeo…): um Save Audio não esconde a prévia de uma imagem.
    const isFinal = (n) => n.mode !== 2 && n.mode !== 4 && !isPreview(n)
      && OUTPUT_KINDS[outputKindOfNode(n)] === media;
    if (inner.some(isFinal)) {
      const previewIds = new Set(inner.filter(isPreview).map((n) => String(n.id)));
      const base = match;
      match = (k) => base(k) && !previewIds.has(k.split(":").pop());
    }
  }

  let best = null;
  const scan = (test) => {
    for (const [key, rec] of OUTPUTS) {
      if (!test(key) || (best && rec.seq <= best.seq)) continue;
      const files = outputFiles(rec.output).filter((f) => f.media === media);
      if (files.length) best = { key, seq: rec.seq, files };
    }
  };
  scan(match);
  // Fonte explícita que não bateu pelo caminho (grafo aberto dentro de outro
  // subgrafo, por exemplo): aceita qualquer id de execução que termine nela.
  if (!best && src) scan((k) => k.endsWith(`:${src}`));
  return best;
}

/** Nós que podem servir de fonte: os do subgrafo primeiro, depois os do grafo. */
function listOutputSources(host) {
  const out = [];
  const seen = new Set();
  const isOutputNode = (n) => !!(n.constructor?.nodeData?.output_node
    || /(preview|save).*(image|video|audio)|videocombine|(image|video|audio).*(preview|save)/i.test(String(n.type || "")));
  const push = (n, scope) => {
    if (!n || n === host || seen.has(`${scope}:${n.id}`)) return;
    seen.add(`${scope}:${n.id}`);
    out.push({ id: String(n.id), node: n, scope, isOutput: isOutputNode(n) });
  };
  for (const n of innerNodesOf(host)) push(n, "sub");
  for (const n of host.graph?._nodes || host.graph?.nodes || []) push(n, "graph");
  // Nós de saída primeiro; o resto fica disponível para nós customizados.
  out.sort((a, b) => (b.isOutput - a.isOutput) || (a.scope === b.scope ? 0 : a.scope === "sub" ? -1 : 1));
  return out;
}

function outputSourceLabel(host, ctrl) {
  const src = ctrl.source != null && ctrl.source !== "" ? String(ctrl.source) : "";
  if (!src) return hasInnerGraph(host) ? "Auto — latest inside this subgraph" : "Auto — this node";
  const n = findNodeInHostScope(host, src);
  return n ? `#${n.id} ${n.title || n.type}` : `#${src} (missing)`;
}

/**
 * Alvos da janela de busca quando ela escolhe a ORIGEM de um output: o modo
 * automático e os nós do escopo, no mesmo formato de `listBindableTargets`,
 * para a janela funcionar igual à dos outros elementos.
 */
function listOutputSourceTargets(host, ctrl) {
  const media = OUTPUT_KINDS[ctrl.kind] || "image";
  const kind = media === "image" ? "media" : media;
  const autoLabel = hasInnerGraph(host) ? "Auto — latest inside this subgraph" : "Auto — this node";
  return [
    {
      bind: "",
      name: autoLabel,
      label: autoLabel,
      kind,
      node: host,
      scope: "Automatic",
      detail: `Latest ${media} output`,
    },
    ...listOutputSources(host).map((s) => {
      const title = s.node.title || s.node.type || `Node #${s.id}`;
      return {
        bind: s.id,
        name: title,
        label: title,
        kind,
        node: s.node,
        scope: `${s.scope === "sub" ? "Subgraph" : "Graph"} #${s.id} (${s.node.type})`,
        detail: `#${s.id} ${title}${s.isOutput ? "" : " (no output flag)"}`,
      };
    }),
  ];
}

/**
 * Escolhe o nó de origem de um output pela MESMA janela de busca que dá função
 * aos outros elementos (lista, categorias, prévia do nó e Target Picker).
 */
function openOutputSourceDialog(host, ctrl, state, list) {
  openInspector({
    host,
    layout: host.properties[PROP],
    section: { controls: list || [] },
    ctrl,
    state,
    sourceFor: ctrl,
    targetCallback: (target) => {
      if (!target || target.isRaw) return;
      if (target.bind) ctrl.source = String(target.bind);
      else delete ctrl.source;
      state.refresh();
    },
  });
}

const OUTPUT_VIEW_CACHE = new Map();

/** A área que mostra o output: imagem, vídeo ou áudio, com navegação no lote. */
function mkOutputView(host, ctrl, state) {
  const media = OUTPUT_KINDS[ctrl.kind] || "image";
  const box = el("div", `lego-out-box is-${media}`);
  const stage = el("div", "lego-out-stage");
  const bar = el("div", "lego-out-bar");
  const prev = el("button", "lego-out-nav", "‹");
  const count = el("span", "lego-out-count");
  const next = el("button", "lego-out-nav", "›");
  prev.title = "Previous";
  next.title = "Next";
  bar.append(prev, count, next);
  box.append(stage, bar);

  const outKey = `${host?.id || "h"}:${ctrl?.name || ctrl?.id || ctrl?.kind || "out"}`;
  const cachedOut = OUTPUT_VIEW_CACHE.get(outKey);
  let files = cachedOut?.files || [];
  let seq = cachedOut?.seq || 0;
  let idx = cachedOut?.idx || 0;
  let sig = cachedOut?.sig ?? null;
  let cachedEl = cachedOut?.el || null;

  const render = () => {
    stage.replaceChildren();
    bar.style.display = files.length > 1 ? "" : "none";
    if (!files.length) {
      cachedEl = null;
      if (OUTPUT_VIEW_CACHE.has(outKey)) OUTPUT_VIEW_CACHE.delete(outKey);
      const empty = el("div", "lego-out-empty");
      empty.append(glyphEl(media === "image" ? "media" : media, 26));
      empty.append(el("span", null, `No ${media} output yet — run the workflow`));
      stage.append(empty);
      return;
    }
    idx = Math.min(Math.max(0, idx), files.length - 1);
    count.textContent = `${idx + 1} / ${files.length}`;
    const f = files[idx];
    const url = outputURL(f, seq);
    stage.title = f.filename;
    if (media === "video") {
      let v = cachedEl;
      if (!v || v.tagName?.toLowerCase() !== "video" || !sameUrl(v.src, url)) {
        v = el("video");
        v.src = url;
        v.controls = true;
        v.loop = true;
        v.muted = true;
        v.autoplay = true;
        v.playsInline = true;
        cachedEl = v;
      }
      stage.append(v);
    } else if (media === "audio") {
      let a = cachedEl;
      if (!a || a.tagName?.toLowerCase() !== "audio" || !sameUrl(a.src, url)) {
        a = el("audio");
        a.src = url;
        a.controls = true;
        a.preload = "metadata";
        cachedEl = a;
      }
      stage.append(el("div", "lego-out-audio-name", f.filename), a);
    } else {
      let img = cachedEl;
      if (!img || img.tagName?.toLowerCase() !== "img" || !sameUrl(img.src, url)) {
        img = el("img");
        img.src = url;
        img.alt = f.filename;
        img.draggable = false;
        img.addEventListener("click", () => { if (!state.edit) window.open(url, "_blank"); });
        cachedEl = img;
      }
      stage.append(img);
    }
    if (media !== "audio") {
      const censorOverlay = el("div", "lego-out-censor-overlay");
      censorOverlay.innerHTML = `<span class="lego-censor-icon">${glyph("eyeSlash", 22)}</span><span class="lego-censor-label">Preview hidden</span>`;

      const hideBtn = el("button", "lego-out-hide-btn");
      hideBtn.type = "button";

      const updateOutCensor = () => {
        const censored = !!ctrl.hidePreview;
        stage.classList.toggle("is-censored", censored);
        hideBtn.innerHTML = glyph(censored ? "eyeSlash" : "eye", 12);
        hideBtn.title = censored ? "Show preview" : "Hide / Censor preview";
      };

      hideBtn.addEventListener("pointerdown", eatPointer);
      hideBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        ctrl.hidePreview = !ctrl.hidePreview;
        host.graph?.setDirtyCanvas?.(true, true);
        app.canvas?.setDirty?.(true, true);
        updateOutCensor();
      });

      updateOutCensor();
      stage.append(censorOverlay, hideBtn);
    }
    OUTPUT_VIEW_CACHE.set(outKey, { files, seq, idx, sig, el: cachedEl });
  };

  const update = () => {
    const res = latestOutputFor(host, ctrl, media);
    const nextSig = res ? `${res.key}#${res.seq}` : "";
    if (nextSig === sig && cachedEl && files.length) {
      render();
      return;
    }
    sig = nextSig;
    files = res ? res.files : [];
    seq = res ? res.seq : 0;
    idx = 0;
    render();
  };

  for (const b of [prev, next]) b.addEventListener("pointerdown", eatPointer);
  prev.addEventListener("click", (e) => { e.stopPropagation(); idx = (idx - 1 + files.length) % files.length; render(); });
  next.addEventListener("click", (e) => { e.stopPropagation(); idx = (idx + 1) % files.length; render(); });
  // Controles nativos de vídeo/áudio: o clique não pode virar arraste do nó.
  stage.addEventListener("pointerdown", eatPointer);

  update();
  if (state) (state.outputViews || (state.outputViews = [])).push({ update });
  return box;
}

function getComponentMinDimensions(ctrl) {
  const k = ctrl?.kind || "";
  if (isPanelKind(k)) return { minW: 180, minH: 120 };
  if (isOutputKind(k)) return { minW: 120, minH: k === "outaudio" ? 64 : 96 };
  if (k === "hdivider") return { minW: 16, minH: 16 };
  if (k === "vdivider") return { minW: 16, minH: 16 };
  if (k === "label") return { minW: 32, minH: 16 };
  if (isMediaKind(k)) return { minW: 140, minH: 64 };
  if (k === "textarea") return { minW: 80, minH: 48 };
  if (k === "slider") return { minW: 72, minH: 28 };
  if (k === "balance") return { minW: 160, minH: 44 };
  if (k === "toggle") return { minW: 36, minH: 24 };
  if (k === "number") return { minW: 64, minH: 24 };
  if (k === "combo") return { minW: 64, minH: 24 };
  return { minW: 48, minH: 24 };
}

/**
 * Adiciona um item/sub-controle dentro de um segmento (Horizontal ou Vertical Group).
 */
function addItemToSegment(host, state, segmentCtrl, itemDef) {
  if (!segmentCtrl) return null;
  if (itemDef.kind === "segment" || itemDef.kind === "vsegment" || itemDef.kind === "group") return null;
  pushUndo(host);
  if (!Array.isArray(segmentCtrl.items)) segmentCtrl.items = [];
  const layout = host.properties[PROP];
  const tool = toolByKind(itemDef.kind);
  const is2D = is2DKind(itemDef.kind);
  const newItem = {
    kind: itemDef.kind,
    label: itemDef.label || itemDef.name || tool.label,
    bind: itemDef.bind || "",
    w: itemDef.w ?? (itemDef.kind === "vdivider" ? 24 : (itemDef.kind === "hdivider" ? 160 : tool.w)),
    h: itemDef.h ?? (is2D ? tool.h : (itemDef.kind === "hdivider" ? 16 : (itemDef.kind === "vdivider" ? 24 : undefined))),
  };
  if (isOutputKind(itemDef.kind)) {
    newItem.label = "";   // a mídia já se identifica; rótulo só se o usuário quiser
  } else if (itemDef.kind === "label") {
    newItem.text = itemDef.text || "Label";
    newItem.label = itemDef.label || "Label";
  } else if (itemDef.kind === "text" || itemDef.kind === "textarea") {
    newItem.value = itemDef.value ?? "";
  }
  ensureComponentName(layout, newItem);
  segmentCtrl.items.push(newItem);
  state.selectedName = newItem.name;
  if (!state.selectedNames) state.selectedNames = new Set();
  state.selectedNames.clear();
  state.selectedNames.add(newItem.name);
  state.refresh();
  renderObjectInspector(host, state, false);
  return newItem;
}

export { OUTPUT_KINDS, isOutputKind, OUTPUTS, OUTPUT_SEQ, recordOutput, notifyOutputViews, outputFiles, outputURL, isInsideHost, latestOutputFor, listOutputSources, outputSourceLabel, listOutputSourceTargets, openOutputSourceDialog, OUTPUT_VIEW_CACHE, mkOutputView, getComponentMinDimensions, addItemToSegment };
