/* Painéis e espelhos de interface do nó (canvas, DOM, Preview Override, cor), tamanhos padrão e buildControl (um componente solto). */
// Parte do ComfyUI-SuperSubgraph (ver web/js/super_subgraph.js e CLAUDE.md).
// Só declarações: nada roda ao carregar este arquivo.

import { app } from "../../../../scripts/app.js";
import { GRID, LOG, PROP } from "./constants.js";
import { duplicateComponent, pushUndo, pushUndoSnapshot } from "./core.js";
import { RE_AUDIO, RE_VIDEO, describeWidget, findNodeInHostScope, isAudioCombo, isImageCombo, isVideoCombo, prettify, resolveBind, writeWidget } from "./widgets.js";
import { eatPointer, el, glyph, glyphBtn, mkBalance, mkButton, mkCombo, mkMediaControl, mkNumber, mkSlider, mkStepNumber, mkText, mkToggle } from "./controls.js";
import { getComponentMinDimensions, isOutputKind, mkOutputView, openOutputSourceDialog, outputSourceLabel } from "./outputs.js";
import { buildSegment, clearDropFeedback, domScale, groupDropTargetAt, isMediaKind, placeInList, showGroupDrop, tabDropTargetAt, zoneCtrlToItem, zoneDropTargetAt } from "./drag.js";
import { promotedLabel, widgetLabel } from "./whole_node.js";
import { openInspector, openLegoContextMenu } from "./picker.js";
import { MIN_CTRL_W, axH, axW, colorDotButton, fitGroupToContent, openComponentContextMenu, removeControlsByName, setComponentColor, toggleGroupOrientation } from "./form.js";
import { ensureComponentName, renderObjectInspector, selectComponent } from "./inspector.js";
import { resize } from "./lifecycle.js";
import { enterSuper, liteGraph } from "./native.js";

/** Tipos de controle que o componente escolhe e que o desenho respeita. */
const CONTROL_KINDS = new Set(["toggle", "slider", "number", "combo", "text", "textarea", "button", "media", "video", "audio", "preview_override", "node_ui", "canvas_widget", "dom_widget", "color"]);
function controlKindFor(ctrl, w) {
  return CONTROL_KINDS.has(ctrl?.kind) ? ctrl.kind : null;
}

/**
 * "Painéis": a interface do próprio nó dentro do cartão — elemento DOM montado
 * (dom_widget, preview_override) ou desenho do canvas espelhado (node_ui).
 * Grandes e 2D, sem rótulo na frente.
 */
const PANEL_KINDS = new Set(["preview_override", "dom_widget", "node_ui"]);
const isPanelKind = (k) => PANEL_KINDS.has(k);

/** Tamanho inicial de um componente solto, por tipo. Fonte única para os padrões. */
function defaultSizeFor(kind) {
  if (kind === "node_ui") return { w: 336, h: 320 };
  if (isPanelKind(kind)) return { w: 320, h: 240 };
  if (kind === "canvas_widget") return { w: 320, h: 32 };
  if (isMediaKind(kind)) return { w: 288, h: 144 };
  if (isOutputKind(kind)) return { w: 320, h: 240 };
  if (kind === "balance") return { w: 320, h: 48 };
  if (kind === "textarea") return { w: 320, h: 96 };
  return { w: 256, h: 32 };
}

/**
 * Controle "especial" de um widget (painel, espelho, cor) ou null para os
 * controles comuns. Um lugar só para cartão, grupo e buildBare.
 */
function mkSpecialControl(node, w, ctrl, state) {
  const k = describeWidget(w).kind;
  if (k === "preview_override") return mkPreviewOverride(node, w, ctrl, state);
  if (k === "dom_widget") return mkDomMount(node, w);
  const mirror = mirrorModeFor(w);
  if (mirror) return mkCanvasMirror(node, w, ctrl, state, mirror);
  if (k === "color") return mkColor(node, w, state);
  return null;
}

/** Seletor de cor (widgets "color"/"colorcode"): amostra + código hex. */
function mkColor(node, w, state) {
  const wrap = el("div", "lego-color-ctrl");
  const pick = el("input", "lego-color-pick");
  pick.type = "color";
  const txt = el("input", "lego-in");
  txt.type = "text";
  const toHex = (v) => {
    const s = String(v ?? "").trim();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s;
    if (/^#[0-9a-f]{3}$/i.test(s)) return "#" + s.slice(1).split("").map((c) => c + c).join("");
    return "#000000";
  };
  const paint = () => {
    if (document.activeElement !== txt) txt.value = w.value ?? "";
    pick.value = toHex(w.value);
  };
  paint();
  for (const x of [pick, txt]) {
    x.addEventListener("pointerdown", eatPointer);
    x.addEventListener("keydown", (e) => e.stopPropagation());
  }
  pick.addEventListener("input", () => { txt.value = pick.value; });
  pick.addEventListener("change", () => writeWidget(node, w, pick.value));
  txt.addEventListener("change", () => { if (txt.value !== String(w.value ?? "")) writeWidget(node, w, txt.value); paint(); });
  wrap.append(pick, txt);
  state.watch(w, paint);
  return wrap;
}

/* ══════════════════════════════════════════════════════════════════════════
   Espelho de interface desenhada no canvas

   Alguns nós não usam widgets comuns: desenham a própria interface no canvas
   do LiteGraph (a fileira de botões New/Save/Reload/Delete do AllmaGenerate,
   o painel inteiro do Resolution Master). O cartão não tem como recriar isso
   em HTML, então espelha: um <canvas> no cartão chama o MESMO código de
   desenho do nó e repassa os cliques para os handlers dele, convertidos para
   as coordenadas locais do nó. O nó continua vivo dentro do Super Subgraph.
   ══════════════════════════════════════════════════════════════════════════ */

/** Widget de canvas que na verdade é o painel do nó inteiro (desenhado no onDrawForeground). */
const NODE_UI_WIDGET_TYPES = new Set(["resolution_master_ui"]);
/** Tipos que o cartão já sabe desenhar em HTML: nunca espelhar. */
const STANDARD_WIDGET_TYPES = new Set([
  "toggle", "boolean", "button", "combo", "number", "slider", "float", "int", "integer", "seed",
  "text", "string", "customtext", "multiline", "hidden", "converted-widget",
]);

/** Widget desenhado pelo próprio nó no canvas (tem `draw` e não é DOM nem tipo padrão). */
function isCanvasWidget(w) {
  const t = String(w?.type || "").toLowerCase();
  return typeof w?.draw === "function" && !w.element && !STANDARD_WIDGET_TYPES.has(t);
}

/** Como espelhar o widget: "node" (painel do nó inteiro), "widget" (só ele) ou null (widget comum). */
function mirrorModeFor(w) {
  if (!w) return null;
  const t = String(w.type || "").toLowerCase();
  if (NODE_UI_WIDGET_TYPES.has(t)) return "node";
  if (!isCanvasWidget(w)) return null;
  // Valor simples que o cartão já sabe editar (número do VHS, caminho, cor):
  // controle nativo do cartão, no mesmo estilo dos outros.
  if (typeof w.value === "number" || typeof w.value === "boolean") return null;
  if (t === "color" || t === "colorcode") return null;
  // Texto com desenho próprio do VHS (caminho com autocompletar): campo de texto.
  if (typeof w.value === "string" && t.startsWith("vhs.")) return null;
  return "widget";
}

/** Espelhos vivos: um laço só redesenha todos, e cada um some quando sai da página. */
const CANVAS_MIRRORS = new Set();
let mirrorLoop = 0;
function runMirrorLoop() {
  if (mirrorLoop) return;
  const tick = (now) => {
    for (const m of CANVAS_MIRRORS) {
      if (!m.canvas.isConnected) { if (now - m.born > 2000) CANVAS_MIRRORS.delete(m); continue; }
      // Com o ponteiro em cima (ou logo depois de um clique): todo quadro. Fora
      // disso, algumas vezes por segundo para pegar mudanças vindas de fora.
      const hot = m.pressed || m.hover || now - m.lastInput < 1500;
      if (hot || now - m.lastDraw > 400) { m.lastDraw = now; try { m.draw(); } catch (err) { console.warn(LOG, "mirror draw", err); } }
    }
    mirrorLoop = CANVAS_MIRRORS.size ? requestAnimationFrame(tick) : 0;
  };
  mirrorLoop = requestAnimationFrame(tick);
}

/**
 * `mode`: "widget" desenha só o widget (altura dele, largura do componente);
 * "node" desenha o painel do nó inteiro, em escala para caber no componente.
 */
function mkCanvasMirror(node, w, ctrl, state, mode) {
  const box = el("div", `lego-canvas-mirror ${mode === "node" ? "is-node" : "is-widget"}`);
  const cv = el("canvas");
  box.append(cv);
  const LG = liteGraph();
  const isVue = () => LG?.vueNodesMode === true;
  // Canvas mínimo para quem espera um LGraphCanvas (captura de ponteiro, grafo).
  const fakeCanvas = { graph: node.graph, node_capturing_input: null, ds: { scale: 1, offset: [0, 0] }, setDirty() {}, low_quality: false };

  const m = { canvas: cv, born: performance.now(), lastDraw: 0, lastInput: 0, pressed: false, hover: false, scale: 1, offX: 0 };

  const widgetH = () => {
    const width = box.clientWidth || 256;
    return Math.max(16, Math.round(w.computeSize?.(width)?.[1] ?? w.computedHeight ?? LG?.NODE_WIDGET_HEIGHT ?? 20));
  };

  m.draw = () => {
    const cssW = box.clientWidth, cssH = box.clientHeight;
    if (!cssW) return;
    let drawW, drawH, scale = 1, offX = 0;
    if (mode === "node") {
      // O painel tem o tamanho do nó; cabe inteiro no componente.
      const nw = Math.max(1, node.size?.[0] || 330), nh = Math.max(1, node.size?.[1] || 300);
      scale = Math.min(cssW / nw, (cssH || nh) / nh);
      drawW = nw * scale; drawH = nh * scale;
      offX = Math.max(0, (cssW - drawW) / 2);
    } else {
      drawW = cssW; drawH = widgetH();
    }
    m.scale = scale; m.offX = offX;
    const ratio = (window.devicePixelRatio || 1) * (app?.canvas?.ds?.scale || 1);
    const bw = Math.max(1, Math.round(cssW * ratio)), bh = Math.max(1, Math.round(drawH * ratio));
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    cv.style.height = `${drawH}px`;
    const ctx = cv.getContext?.("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssW, drawH);
    ctx.save();
    if (mode === "node") {
      ctx.translate(offX, 0);
      ctx.scale(scale, scale);
      ctx.fillStyle = node.bgcolor || LG?.NODE_DEFAULT_BGCOLOR || "#353535";
      ctx.fillRect(0, 0, node.size[0], node.size[1]);
      ctx.beginPath(); ctx.rect(0, 0, node.size[0], node.size[1]); ctx.clip();
      if (isVue()) w.draw?.(ctx, node, node.size[0], 0, node.size[1]);
      else node.onDrawForeground?.(ctx, fakeCanvas, cv);
    } else {
      w.last_y = 0;
      w.draw(ctx, node, cssW, 0, drawH);
    }
    ctx.restore();
  };

  /** Ponto do evento em coordenadas locais do nó (ou do widget). */
  const localPos = (e) => {
    const r = cv.getBoundingClientRect();
    const k = r.width ? (cv.clientWidth || r.width) / r.width : 1;   // zoom do canvas do ComfyUI
    const x = ((e.clientX - r.left) * k - m.offX) / m.scale;
    const y = ((e.clientY - r.top) * k) / m.scale;
    return [x, y];
  };
  const inEdit = () => !!box.closest(".lego-sec-controls.in-edit");
  const forward = (e) => {
    const [x, y] = localPos(e);
    e.canvasX = (node.pos?.[0] || 0) + x;
    e.canvasY = (node.pos?.[1] || 0) + y;
    const t = e.type;
    if (mode === "widget") return w.mouse?.(e, [x, y], node);
    if (t === "pointerdown") return node.onMouseDown?.(e, [x, y], fakeCanvas);
    // Arrastando: pos nulo faz o Resolution Master processar o movimento aqui
    // (com pos ele espera os callbacks do ponteiro do canvas do ComfyUI).
    if (t === "pointermove") return node.onMouseMove?.(e, m.pressed ? null : [x, y], fakeCanvas);
    if (t === "pointerup" || t === "pointercancel") return node.onMouseUp?.(e, [x, y], fakeCanvas);
  };

  cv.addEventListener("pointerdown", (e) => {
    if (inEdit() || e.button !== 0) return;   // editando: o clique move o componente
    e.stopPropagation();
    e.preventDefault();
    m.pressed = true; m.lastInput = performance.now();
    try { cv.setPointerCapture(e.pointerId); } catch {}
    try { forward(e); } catch (err) { console.warn(LOG, "mirror pointerdown", err); }
    m.draw();
  });
  cv.addEventListener("pointermove", (e) => {
    if (inEdit()) return;
    m.hover = true; m.lastInput = performance.now();
    if (m.pressed) e.stopPropagation();
    try { forward(e); } catch {}
  });
  const end = (e) => {
    if (!m.pressed) return;
    m.pressed = false; m.lastInput = performance.now();
    try { cv.releasePointerCapture(e.pointerId); } catch {}
    e.stopPropagation();
    try { forward(e); } catch (err) { console.warn(LOG, "mirror pointerup", err); }
    m.draw();
  };
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);
  cv.addEventListener("pointerleave", () => { m.hover = false; });
  cv.addEventListener("dblclick", (e) => { if (!inEdit()) e.stopPropagation(); });

  CANVAS_MIRRORS.add(m);
  runMirrorLoop();
  requestAnimationFrame(() => { try { m.draw(); } catch (err) { console.warn(LOG, "mirror draw", err); } });
  return box;
}

/**
 * Monta o elemento DOM vivo do widget (w.element) no cartão. O elemento é um
 * só: `__origParent` guarda a casa dele no canvas para devolvê-lo ao nó
 * enquanto se navega dentro do Super Subgraph.
 */
function mkDomMount(node, w, cls = "lego-dom-mount", placeholder = "Loading…") {
  const box = el("div", `lego-panel-box ${cls}`);
  const mount = () => {
    const cur = w.element.parentElement;
    // "Casa" original = o container do nó no canvas, nunca o cartão de um
    // desenho anterior (senão o enterSuper devolveria o elemento para lá).
    if (cur && !cur.closest(".lego-card")) w.__origParent = cur;
    box.prepend(w.element);
    w.element.style.width = "100%";
    w.element.style.height = "100%";
    w.element.style.minHeight = "0";
    // Posição/tamanho vindos do layout do canvas não valem no cartão.
    w.element.style.position = "relative";
    w.element.style.left = w.element.style.top = "";
    w.element.style.transform = "";
    w.element.style.display = "";
    w.element.hidden = false;
  };
  // O frontend (camada de DOM widgets, Vue) pode pegar o elemento de volta
  // para o container dele logo depois. Enquanto o cartão estiver na página e o
  // nó não estiver aberto no canvas, o cartão o recoloca aqui.
  let born = 0;
  const guard = setInterval(() => {
    born++;
    if (!box.isConnected) { if (born > 20) clearInterval(guard); return; }
    const el0 = w?.element;
    if (!el0) return;
    // Navegando dentro do subgrafo: o elemento volta para o nó (no canvas).
    if (app.canvas?.graph && app.canvas.graph === node.graph) {
      if (box.contains(el0) && w.__origParent?.isConnected) w.__origParent.append(el0);
      return;
    }
    if (!box.contains(el0)) mount();
  }, 300);
  if (w?.element) {
    mount();
  } else {
    // Alguns nós criam o elemento depois: espera um pouco, mas para se este
    // cartão já foi redesenhado (a caixa saiu da página).
    const ph = el("div", "lego-empty", placeholder);
    box.append(ph);
    let tries = 0;
    const checkTimer = setInterval(() => {
      tries++;
      if (tries > 40 || (tries > 2 && !box.isConnected)) return clearInterval(checkTimer);
      if (!w?.element) return;
      clearInterval(checkTimer);
      ph.remove();
      mount();
    }, 100);
  }
  return box;
}

function mkPreviewOverride(node, w, ctrl, state) {
  const box = mkDomMount(node, w, "lego-preview-override-box", "Preview Override (KJ)");
  if (ctrl?.hidePreview) {
    box.classList.add("is-censored");
    const overlay = el("div", "lego-media-censor-overlay");
    overlay.innerHTML = `<span class="lego-censor-icon">${glyph("eyeSlash", 20)}</span><span class="lego-censor-label">Preview hidden</span>`;
    box.append(overlay);
  }
  const hideBtn = el("button", "lego-iconbtn lego-out-hide-btn");
  hideBtn.type = "button";
  hideBtn.title = ctrl?.hidePreview ? "Show preview" : "Hide preview";
  hideBtn.innerHTML = glyph(ctrl?.hidePreview ? "eyeSlash" : "eye", 12);
  hideBtn.addEventListener("pointerdown", eatPointer);
  hideBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    ctrl.hidePreview = !ctrl.hidePreview;
    state?.refresh?.();
  });
  box.append(hideBtn);
  return box;
}

/** Constrói o controle nu de um bind, sem a linha ao redor. Null se sumiu. */
function buildBare(host, ctrl, state) {
  const hit = resolveBind(host, ctrl.bind);
  if (!hit) return null;
  const { node, widget: w } = hit;
  const kind = (ctrl.kind === "video" || ctrl.kind === "audio" || ctrl.kind === "media")
    ? ctrl.kind
    : (isVideoCombo(w) ? "video" : isAudioCombo(w) ? "audio" : isImageCombo(w) ? "media" : describeWidget(w).kind);
  const special = mkSpecialControl(node, w, ctrl, state);
  if (special) return special;
  if (kind === "toggle") return mkToggle(node, w, ctrl, state);
  if (kind === "slider") return mkSlider(node, w, ctrl, state);
  if (kind === "number") return mkNumber(node, w, ctrl, state);
  if (kind === "combo") return mkCombo(node, w, ctrl, state);
  if (isMediaKind(kind)) return mkMediaControl(node, w, ctrl, state, null, kind);
  if (kind === "textarea") return mkText(node, w, ctrl, state, true);
  if (kind === "button") return mkButton(node, w, ctrl);
  return mkText(node, w, ctrl, state, false);
}

/**
 * Linha de uma família dinâmica: a chave, o combo largo e o número na mesma
 * altura, do jeito que um stack de LoRAs quer ser lido.
 */
function buildGroup(host, ctrl, state, sectionCtrls) {
  const row = el("div", "lego-row grp");
  // O rótulo do grupo obedece à mesma propriedade dos controles simples.
  const labelPos = ctrl.labelPos || "left";
  const lbl = labelPos === "none" ? null : el("div", "lego-lbl grp-n", ctrl.label || "");
  if (lbl && labelPos === "left") row.append(lbl);
  if (labelPos === "none") row.classList.add("lbl-none");
  if (labelPos === "right") row.classList.add("lbl-right");

  const box = el("div", "lego-grp");
  let alive = 0;
  for (const item of ctrl.items || []) {
    const c = buildBare(host, item, state);
    if (!c) continue;
    alive++;
    const cell = el("div", `lego-cell k-${item.kind}`);
    if (typeof item.w === "number") {
      cell.style.flex = "none";
      cell.style.width = `${Math.max(MIN_CTRL_W, item.w)}px`;
    }
    cell.title = item.bind;
    cell.append(c);
    box.append(cell);
  }
  if (!alive) {
    row.classList.add("missing");
    box.append(el("div", "lego-empty", "widgets missing"));
  }
  row.append(box);
  if (lbl && labelPos === "right") row.append(lbl);

  // Sem botão próprio de remover: quem monta a linha é o buildControl, e ele
  // já acrescenta a barra flutuante de ajustes e remoção no modo de edição.
  return row;
}


/**
 * Aparência do componente ainda sem função — inerte, mas com a cara do tipo.
 * No Delphi um TButton acabado de soltar já parece um botão; aqui é igual.
 */
function applyLabelStyle(span, ctrl) {
  if (ctrl.bold) span.style.fontWeight = "700";
  if (ctrl.italic) span.style.fontStyle = "italic";
  if (ctrl.fontSize) span.style.fontSize = `${ctrl.fontSize}px`;
  if (ctrl.align) {
    span.style.justifyContent = ctrl.align === "center" ? "center" : ctrl.align === "right" ? "flex-end" : "flex-start";
    span.style.textAlign = ctrl.align;
  }
  const deco = [ctrl.underline && "underline", ctrl.strike && "line-through"].filter(Boolean).join(" ");
  if (deco) span.style.textDecoration = deco;
  if (ctrl.fontFamily) span.style.fontFamily = ctrl.fontFamily;
  if (ctrl.fontColor) span.style.color = ctrl.fontColor;
}
function ghostControl(kind, ctrl) {
  const box = el("div", "lego-ghost");
  if (kind === "hdivider") {
    box.append(el("div", "lego-divider h"));
  } else if (kind === "vdivider") {
    box.append(el("div", "lego-divider v"));
  } else if (kind === "label") {
    const gLbl = el("div", "lego-canvas-label", ctrl?.text || ctrl?.label || "Label");
    if (ctrl) applyLabelStyle(gLbl, ctrl);
    box.append(gLbl);
  } else if (kind === "button") {
    const text = ctrl?.text || ctrl?.label || "Button";
    const b = el("button", "lego-in lego-btn-ctrl", text);
    b.type = "button";
    b.style.cursor = "pointer";
    b.style.width = "100%";
    b.style.height = "100%";
    b.style.boxSizing = "border-box";
    b.style.justifyContent = ctrl?.align === "left" ? "flex-start" : ctrl?.align === "right" ? "flex-end" : "center";
    b.style.textAlign = ctrl?.align || "center";
    if (ctrl) applyLabelStyle(b, ctrl);
    b.addEventListener("pointerdown", (e) => {
      eatPointer(e);
      b.classList.add("lego-btn-clicked");
      // Só enquanto pressionado: um listener fixo na window vazava a cada redesenho.
      window.addEventListener("pointerup", () => b.classList.remove("lego-btn-clicked"), { once: true });
    });
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      b.classList.remove("lego-btn-clicked");
      void b.offsetWidth;
      b.classList.add("lego-btn-clicked");
      setTimeout(() => b.classList.remove("lego-btn-clicked"), 160);
    });
    box.style.width = "100%";
    box.style.height = "100%";
    box.append(b);
  } else if (kind === "toggle") {
    box.append(el("div", "lego-ghost-sw"));
    box.classList.add("shrink");
  } else if (kind === "slider") {
    const tr = el("div", "lego-ghost-track");
    tr.append(el("div", "lego-ghost-knob"));
    box.append(tr);
  } else if (kind === "combo") {
    const b = el("div", "lego-ghost-field");
    const ch = el("span", "lego-glyph-wrap");
    ch.innerHTML = glyph("chevron", 12);
    b.append(el("span", "lego-ghost-fill"), ch);
    box.append(b);
  } else if (isMediaKind(kind)) {
    const isVideo = kind === "video";
    const isAudio = kind === "audio";
    const mediaTypeName = isVideo ? "video" : isAudio ? "audio" : "image";
    const mediaBox = el("div", `lego-media-box tall is-${mediaTypeName}`);
    mediaBox.style.width = "100%";
    mediaBox.style.height = "100%";
    mediaBox.style.minHeight = "64px";

    const thumb = el("div", "lego-media-thumb");
    thumb.style.flex = "1";
    thumb.style.width = "100%";
    thumb.style.minHeight = "44px";
    thumb.style.position = "relative";
    thumb.style.overflow = "hidden";

    if (isAudio) {
      const audioWrap = el("div", "lego-audio-player");
      audioWrap.style.display = "flex";
      audioWrap.style.position = "absolute";
      audioWrap.style.inset = "0";
      audioWrap.style.width = "100%";
      audioWrap.style.height = "100%";

      const vis = el("div", "lego-audio-visualizer");
      const barHeights = [20, 35, 60, 45, 75, 30, 55, 65, 25, 50, 70, 40, 60, 80, 45, 30, 55, 35, 60, 25, 40, 65, 30, 50];
      barHeights.forEach((h) => {
        const b = el("div", "lego-audio-vbar");
        b.style.height = `${Math.round(h * 0.16)}px`;
        vis.append(b);
      });

      const ctrlRow = el("div", "lego-audio-controls");
      const playBtn = el("div", "lego-audio-play-btn");
      playBtn.innerHTML = glyph("play", 13);

      const timeline = el("div", "lego-audio-timeline");
      const rail = el("div", "lego-audio-rail");
      const prog = el("div", "lego-audio-progress");
      rail.append(prog);
      const knob = el("div", "lego-audio-knob");
      timeline.append(rail, knob);

      const timeLabel = el("div", "lego-audio-time", "0:00 / 0:00");
      ctrlRow.append(playBtn, timeline, timeLabel);
      audioWrap.append(vis, ctrlRow);
      thumb.append(audioWrap);
    } else {
      const ph = el("div");
      ph.style.display = "flex";
      ph.style.flexDirection = "column";
      ph.style.alignItems = "center";
      ph.style.justifyContent = "center";
      ph.innerHTML = `<span class="lego-glyph-wrap" style="opacity:0.4;">${glyph(kind, 28)}</span><span class="lego-media-ph-hint" style="font-size:11px;opacity:0.6;margin-top:4px;font-weight:500;">Drop or click to load ${mediaTypeName}</span>`;
      thumb.append(ph);
    }

    const bar = el("div", "lego-media-bar");
    const sel = el("div", "lego-media-select lego-combo-btn");
    sel.innerHTML = `<span class="lego-combo-label">—</span><span class="lego-combo-chevron">${glyph("chevron", 12)}</span>`;
    const uploadBtn = el("div", "lego-media-upload-btn");
    uploadBtn.innerHTML = glyph("folderSearch", 15);
    bar.append(sel, uploadBtn);

    mediaBox.append(thumb, bar);
    box.style.width = "100%";
    box.style.height = "100%";
    box.style.alignItems = "stretch";
    box.append(mediaBox);
  } else if (kind === "text") {
    box.style.width = "100%";
    box.style.height = "100%";
    box.style.display = "flex";
    box.style.alignItems = "center";
    const inp = el("input", "lego-in");
    inp.type = "text";
    inp.placeholder = ctrl?.placeholder || "Text Input...";
    inp.value = ctrl?.value ?? "";
    inp.style.flex = "1";
    inp.style.width = "100%";
    inp.style.boxSizing = "border-box";
    inp.addEventListener("pointerdown", eatPointer);
    inp.addEventListener("keydown", (e) => e.stopPropagation());
    inp.addEventListener("input", (e) => { if (ctrl) ctrl.value = e.target.value; });
    inp.addEventListener("change", (e) => { if (ctrl) ctrl.value = e.target.value; });
    box.append(inp);
  } else if (kind === "textarea") {
    box.style.height = "100%";
    box.style.width = "100%";
    box.style.alignItems = "stretch";
    const ta = el("textarea", "lego-in");
    ta.placeholder = ctrl?.placeholder || "Text Multiline / Prompt...";
    ta.value = ctrl?.value ?? "";
    ta.style.flex = "1";
    ta.style.width = "100%";
    ta.style.height = "100%";
    ta.style.minHeight = "64px";
    ta.style.boxSizing = "border-box";
    ta.style.resize = "none";
    ta.addEventListener("pointerdown", eatPointer);
    ta.addEventListener("keydown", (e) => e.stopPropagation());
    ta.addEventListener("input", (e) => { if (ctrl) ctrl.value = e.target.value; });
    ta.addEventListener("change", (e) => { if (ctrl) ctrl.value = e.target.value; });
    box.append(ta);
  } else {
    box.append(el("div", "lego-ghost-field"));
  }
  return box;
}

/**
 * Escolhe o parâmetro de um dos lados do Balance Slider (`which`: "bind" = A,
 * à esquerda; "bind2" = B, à direita) pela janela de busca de sempre.
 */
function pickBalanceLink(host, ctrl, state, sectionCtrls, which) {
  openInspector({
    host,
    layout: host.properties[PROP],
    section: { controls: sectionCtrls || [] },
    ctrl,
    state,
    forFilterKind: "inputs",
    targetCallback: (target) => {
      if (!target || target.isRaw) return;
      pushUndo(host);
      ctrl[which] = target.bind;
      state.refresh();
    },
  });
}
/** Itens de menu dos dois elos do Balance Slider. */
function balanceLinkEntries(host, ctrl, state, sectionCtrls) {
  const name = (b) => {
    const hit = b ? resolveBind(host, b) : null;
    return hit ? `${hit.node.title || hit.node.type} \u203a ${prettify(hit.widget.label || hit.widget.name)}` : "not linked";
  };
  return [
    { icon: "link", label: `Link A (left): ${name(ctrl.bind)}`, action: () => pickBalanceLink(host, ctrl, state, sectionCtrls, "bind") },
    { icon: "link", label: `Link B (right): ${name(ctrl.bind2)}`, action: () => pickBalanceLink(host, ctrl, state, sectionCtrls, "bind2") },
  ];
}

function buildControl(host, ctrl, state, sectionCtrls, parentContainer, updateBoundsFn) {
  // Grupos (famílias dinâmicas: image+upload, on+lora+strength...) montam o
  // próprio conteúdo, mas daqui para baixo seguem o MESMO caminho dos demais:
  // posicionamento 2D, arraste, redimensionamento e alças. Antes havia um
  // `return` aqui em cima e eles escapavam de tudo isso — ficavam empilhados,
  // ignorando x/y, sem poder ser movidos no modo de edição.
  const isSegmentLike = ctrl.kind === "segment" || ctrl.kind === "vsegment";
  const isDivider = ctrl.kind === "hdivider" || ctrl.kind === "vdivider";
  const isLabel = ctrl.kind === "label";
  const isCosmetic = isDivider || isLabel;
  const isGroup = ctrl.kind === "group" || isSegmentLike;
  const isOutput = isOutputKind(ctrl.kind);
  // Balance Slider: DOIS parâmetros (bind e bind2), monta o próprio conteúdo.
  const isBalance = ctrl.kind === "balance";
  const hit = (isGroup || isCosmetic || isOutput || isBalance) ? null : resolveBind(host, ctrl.bind);
  const isMediaLike = (k) => isMediaKind(k) || isPanelKind(k);
  const isHitMedia = isImageCombo(hit?.widget) || isVideoCombo(hit?.widget) || isAudioCombo(hit?.widget) || (hit && isPanelKind(describeWidget(hit.widget).kind));
  const isMedia = isMediaLike(ctrl.kind) || isHitMedia;
  const wide = !isGroup && !isCosmetic && (ctrl.kind === "textarea" || isMedia);
  let row;
  if (isDivider) {
    row = el("div", `lego-row is-divider kind-${ctrl.kind}`);
    const line = el("div", `lego-divider ${ctrl.kind === "vdivider" ? "v" : "h"}`);
    row.append(line);
  } else if (isLabel) {
    row = el("div", "lego-row is-label");
    const lblSpan = el("div", "lego-canvas-label", ctrl.text || ctrl.label || "Label");
    applyLabelStyle(lblSpan, ctrl);
    if (state.edit) {
      lblSpan.title = "Double-click to edit text";
      row.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const v = prompt("Edit label text:", ctrl.text || ctrl.label || "Label");
        if (v !== null) {
          ctrl.text = v;
          ctrl.label = v;
          state.refresh();
        }
      });
    }
    row.append(lblSpan);
  } else if (isSegmentLike) {
    row = el("div", `lego-row is-segment ${ctrl.kind === "vsegment" ? "vertical" : "horizontal"}`);
    const groupHeader = ctrl.header || ctrl.label;
    if (groupHeader && ctrl.labelPos !== "none") {
      row.classList.add("has-header");
      const head = el("div", "lego-seg-header", groupHeader);
      head.style.width = "100%";
      head.style.boxSizing = "border-box";
      if (ctrl.labelPos === "right") head.style.textAlign = "right";
      else if (ctrl.labelPos === "center") head.style.textAlign = "center";
      else head.style.textAlign = "left";
      if (state.edit) {
        head.title = "Double-click to rename";
        head.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          const v = prompt("Group header:", ctrl.header || ctrl.label || "");
          if (v != null) {
            pushUndo(host);
            const t = v.trim();
            if (t) {
              ctrl.header = t;
              ctrl.label = t;
            } else {
              delete ctrl.header;
              delete ctrl.label;
            }
            state.refresh();
          }
        });
      }
      row.append(head);
    }
    const innerBox = buildSegment(host, ctrl, state, sectionCtrls);
    row.append(innerBox);
  } else if (isOutput) {
    // Output liga a um NÓ, não a widget: nunca passa pelo caminho do bind.
    row = el("div", "lego-row is-output");
    if (ctrl.label && ctrl.label !== ctrl.name && ctrl.labelPos !== "none") {
      const cap = el("div", "lego-out-caption", ctrl.label);
      if (ctrl.labelPos === "right") cap.style.textAlign = "right";
      row.append(cap);
    }
    row.title = `${ctrl.name || ctrl.kind} — ${outputSourceLabel(host, ctrl)}`;
    row.append(mkOutputView(host, ctrl, state));
  } else if (isBalance) {
    row = el("div", "lego-row is-balance");
    const bound = [ctrl.bind, ctrl.bind2].filter((b) => b && resolveBind(host, b)).length;
    if (bound < 2) row.classList.add("unbound");
    row.append(mkBalance(host, ctrl, state));
  } else if (isGroup) {
    row = buildGroup(host, ctrl, state, sectionCtrls);
  } else {
    row = el("div", `lego-row${wide ? " wide" : ""}${isMedia ? " is-media" : ""}${ctrl.kind === "button" ? " is-btn-row" : ""}`);
  }
  if (isGroup && (ctrl.items || []).some((i) => isMediaLike(i.kind))) {
    // Mosaico de referência: numa coluna de grade não cabe miniatura, combo e
    // botão lado a lado — empilha.
    row.classList.add("grp-media");
  }

  const groupHasMedia = isGroup && (ctrl.items || []).some((i) => isMediaLike(i.kind));
  const hasMediaItem = isMedia || groupHasMedia;
  const isSlider = !isGroup && !isCosmetic && !isOutput && !!hit
    && (controlKindFor(ctrl, hit.widget) || describeWidget(hit.widget).kind) === "slider";
  const { minW: ctrlMinW, minH: ctrlMinH } = getComponentMinDimensions(ctrl);

  // ── 1. POSICIONAMENTO 2D ABSOLUTO COM SNAP TO GRID (CANVAS DA ZONA) ──
  const curX = typeof ctrl.x === "number" ? ctrl.x : 16;
  const curY = typeof ctrl.y === "number" ? ctrl.y : 16;
  const curW = typeof ctrl.w === "number"
    ? ctrl.w
    : (ctrl.kind === "vdivider" ? 16 : (ctrl.kind === "hdivider" ? 256 : (ctrl.kind === "vsegment" ? 240 : (ctrl.kind === "label" ? 160 : (hasMediaItem ? 288 : 256)))));
  const curH = typeof ctrl.h === "number"
    ? ctrl.h
    : (ctrl.kind === "hdivider" ? 16 : (ctrl.kind === "vdivider" ? 160 : (ctrl.kind === "vsegment" ? 160 : (ctrl.kind === "label" ? 24 : (hasMediaItem ? 144 : (ctrl.kind === "textarea" ? 96 : 32))))));

  // Posição só em pixel inteiro: arrastar já encaixa na grade, e o alinhamento
  // "em linha/coluna" pode usar um espaço menor que ela (gap de 4, 8…), que o
  // arredondamento para a grade aqui desfazia.
  ctrl.x = Math.max(0, Math.round(curX));
  ctrl.y = Math.max(0, Math.round(curY));
  // Largura em pixel inteiro: o redimensionar já encaixa na grade, e o ímã
  // (borda de outro componente, margem igual à da esquerda) cai fora dela.
  ctrl.w = Math.max(ctrlMinW, Math.round(curW));
  // Grupo tem a altura exata do conteúdo (fitGroupToContent): arredondar para
  // a grade aqui o engordava um pouco a cada redesenho (57 → 64…).
  ctrl.h = isGroup ? Math.max(ctrlMinH, Math.round(curH)) : Math.max(ctrlMinH, Math.round(curH / GRID) * GRID);

  ensureComponentName(host.properties[PROP], ctrl);
  row.dataset.name = ctrl.name;
  if (!state.selectedNames) state.selectedNames = new Set();
  if (state.edit && ((state.selectedName && state.selectedName === ctrl.name) || state.selectedNames.has(ctrl.name))) {
    row.classList.add("selected");
    state.selectedNames.add(ctrl.name);
  }

  if (ctrl.color) {
    row.classList.add(ctrl.color === "#000000" ? "tinted-solid" : "tinted");
    row.style.setProperty("--lego-c", ctrl.color);
  }

  row.style.position = "absolute";
  row.style.left = `${ctrl.x}px`;
  row.style.top = `${ctrl.y}px`;
  row.style.width = `${ctrl.w}px`;
  row.style.height = `${ctrl.h}px`;

  let applySliderResponsiveLayout = null;

  if (!isGroup && !isDivider && !isLabel && !isOutput && !isBalance) {

  if (!hit) {
    // Nó de dentro pode existir mas ainda não ter widgets populados (o subgrafo
    // nativo cria widgets assíncronamente na primeira entrada). Se o nó existe
    // sem widgets, agenda um refresh em vez de mostrar "widget missing".
    let bindLoading = false;
    if (ctrl.bind && ctrl.bind.includes("/")) {
      const nodeId = ctrl.bind.slice(0, ctrl.bind.indexOf("/"));
      const innerNode = findNodeInHostScope(host, nodeId);
      if (innerNode && !(innerNode.widgets?.length)) {
        // Nó existe mas sem widgets ainda — retry depois de configurar.
        if (!host.__legoBindRetry) host.__legoBindRetry = 0;
        if (host.__legoBindRetry < 5) {
          host.__legoBindRetry++;
          bindLoading = true;
          setTimeout(() => { host.__legoBindRetry = 0; state.refresh(); }, 300);
          row.classList.add("loading");
          row.title = `${ctrl.bind} — loading…`;
          row.append(el("div", "lego-lbl", ctrl.label || ctrl.bind || "Loading…"));
        }
      }
    }
    if (bindLoading) {
      // Nada: já marcou "loading", cai até o final sem montar missing.
    } else if (ctrl.bind === "" || !ctrl.bind) {
      // Componente recém-solto: ainda não tem função. Não é defeito — é o
      // estado normal de quem acabou de sair da paleta. Mostra a cara do tipo
      // e só espera o clique que vai lhe dar o parâmetro.
      // Sem rótulo e sem recheio: aparece só o componente. A moldura tracejada
      // âmbar e o elo no canto é toda a identificação de que ainda não tem
      // função — o nome fica no title e no Inspetor de Objetos.
      row.classList.add("unbound");
      row.title = `${ctrl.name || ctrl.kind} — unbound`;
      row.append(ghostControl(ctrl.kind, ctrl));

      if (state.edit) {
        row.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          e.preventDefault();
          openInspector({
            host,
            layout: host.properties[PROP],
            section: { controls: sectionCtrls },
            ctrl,
            state,
            forFilterKind: ctrl.kind === "text" ? "" : ctrl.kind,
            targetCallback: (target) => {
              if (!target || target.isRaw) return;
              ctrl.bind = target.bind;
              if (!ctrl.label || ctrl.label === ctrl.name) ctrl.label = target.label || target.name;
              ctrl.kind = target.kind || ctrl.kind;
              state.refresh();
            }
          });
        });
      }
    } else {
      row.classList.add("missing");
      row.title = `${ctrl.bind} — the parameter no longer exists`;
      row.append(el("div", "lego-lbl", ctrl.label || ctrl.bind || ctrl.kind || "Element"));
      const miss = el("div", "lego-in lego-missing-box");
      const missTxt = el("span", "lego-missing-txt", "widget missing");
      // Parâmetro sumiu (nó apagado, renomeado...): em vez de um aviso morto,
      // oferece religar a outro parâmetro ou tirar o componente.
      const rebindBtn = el("button", "lego-missing-btn", "Rebind");
      rebindBtn.title = "Link this component to another parameter";
      const removeBtn = el("button", "lego-missing-btn danger", "Remove");
      removeBtn.title = "Remove this component";
      for (const b of [rebindBtn, removeBtn]) b.addEventListener("pointerdown", (e) => e.stopPropagation());
      rebindBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!state.edit) { state.edit = true; state.refresh(); }
        openInspector({
          host,
          layout: host.properties[PROP],
          section: { controls: sectionCtrls },
          ctrl,
          state,
          forFilterKind: ctrl.kind === "text" ? "" : ctrl.kind,
          targetCallback: (target) => {
            if (!target || target.isRaw) return;
            ctrl.bind = target.bind;
            ctrl.label = target.label || target.name || ctrl.label;
            ctrl.kind = target.kind || ctrl.kind;
            state.refresh();
          }
        });
      });
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const i = sectionCtrls.indexOf(ctrl);
        if (i < 0) return;
        pushUndo(host);
        sectionCtrls.splice(i, 1);
        state.selectedNames?.delete(ctrl.name);
        if (state.selectedName === ctrl.name) state.selectedName = null;
        state.refresh();
      });
      miss.append(missTxt, rebindBtn, removeBtn);
      row.append(miss);
    }

    // NÃO retorna aqui — deixa cair até a barra de ações e arraste
  } else {

  const { node, widget: w } = hit;
  const isVideo = ctrl.kind === "video" || isVideoCombo(w) || (w.name && /video/i.test(w.name) && typeof w.value === "string" && RE_VIDEO.test(w.value));
  const isAudio = ctrl.kind === "audio" || isAudioCombo(w) || (w.name && /(audio|sound)/i.test(w.name) && typeof w.value === "string" && RE_AUDIO.test(w.value));
  const isMedia = ctrl.kind === "media" || isImageCombo(w) || (w.name && w.name.toLowerCase().includes("image") && typeof w.value === "string" && (w.value.endsWith(".png") || w.value.endsWith(".jpg") || w.value.endsWith(".webp")));
  // O tipo escolhido para o componente manda: um Stepper continua Stepper ao
  // sair de um grupo, mesmo ligado a um número com mínimo e máximo (que a
  // detecção automática desenharia como Slider). Só componente sem tipo
  // conhecido cai na detecção pelo widget.
  const kind = controlKindFor(ctrl, w) || (isVideo ? "video" : isAudio ? "audio" : isMedia ? "media" : describeWidget(w).kind);

  let control;
  const natural = describeWidget(w).kind;
  const specialKind = isPanelKind(natural) || natural === "canvas_widget" || natural === "color";
  if (specialKind && ctrl.kind !== natural) {
    // Promovido antes de o cartão saber desenhar este widget (caía num campo
    // de texto): passa a ser o controle certo; painel e espelho sem rótulo.
    ctrl.kind = natural;
    if (natural !== "color") ctrl.labelPos = "none";
    const d = defaultSizeFor(natural);
    if (isPanelKind(natural)) { ctrl.w = Math.max(ctrl.w || 0, d.w); ctrl.h = Math.max(ctrl.h || 0, d.h); }
  }
  const special = specialKind ? mkSpecialControl(node, w, ctrl, state) : null;
  if (special) {
    control = special;
  }
  else if (isMediaKind(kind)) {
    control = mkMediaControl(node, w, ctrl, state, row, kind);
    row.style.minHeight = "64px";
  }
  else if (kind === "toggle") control = mkToggle(node, w, ctrl, state);
  else if (kind === "slider") control = mkSlider(node, w, ctrl, state);
  // "number" é o Stepper da paleta (− valor +); a semente mantém o dado.
  else if (kind === "number") control = ctrl.seed ? mkNumber(node, w, ctrl, state) : mkStepNumber(node, w, ctrl, state);
  else if (kind === "combo") control = mkCombo(node, w, ctrl, state);
  else if (kind === "textarea") {
    control = mkText(node, w, ctrl, state, true);
    control.style.flex = "1";
    control.style.height = "100%";
    control.style.boxSizing = "border-box";
  }
  else if (kind === "button") {
    row.classList.add("is-btn-row");
    control = mkButton(node, w, ctrl);
  }
  else control = mkText(node, w, ctrl, state, false);

  // Mídia promovida antes com o rótulo automático ("Image"): passa a usar o
  // título dado ao nó ("Load Image 2").
  // (Widget promovido: o título é o do nó de DENTRO, não o do subgrafo.)
  if (isMediaKind(kind) && (!ctrl.label || ctrl.label === widgetLabel(w))) {
    const better = promotedLabel(hit.inner?.node || node, hit.inner?.widget || w, kind);
    if (better !== ctrl.label) ctrl.label = better;
  }
  // ── Estrutura Visual 100% IDENTICA em Modo Fixo e Modo Edição ──
  const lbl = el("div", "lego-lbl", ctrl.label || prettify(w.name));
  const src = hit.inner?.node || node;
  lbl.title = src === host ? w.name : `${src.title || src.type} #${src.id} → ${w.name}`;
  if (ctrl.labelAlign === "center" || ctrl.labelAlign === "right") row.classList.add(`lbl-align-${ctrl.labelAlign}`);
  if (typeof ctrl.labelW === "number" && ctrl.labelW > 0) {
    lbl.style.flex = "0 0 auto";
    lbl.style.width = `${ctrl.labelW}px`;
    lbl.style.maxWidth = "none";
  }
  if (state.edit) {
    lbl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const v = prompt("Label:", ctrl.label || w.name);
      if (v != null) { ctrl.label = v; state.refresh(); }
    });
    if ((kind === "button" || ctrl.kind === "button") && control) {
      control.title = "Double-click to edit button text";
      control.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const v = prompt("Button text:", ctrl.text || ctrl.label || prettify(w?.name || "Button"));
        if (v != null) {
          ctrl.text = v;
          ctrl.label = v;
          state.refresh();
        }
      });
    }
  }

  // Posição do rótulo: à esquerda (padrão), à direita, ou escondido. Escondido
  // é só não desenhar — o nome continua no `title` e no Inspetor de Objetos.
  // Botões não têm rótulo externo por padrão (o texto fica dentro do botão).
  const labelPos = ctrl.labelPos || (kind === "button" ? "none" : "left");

  applySliderResponsiveLayout = (targetW, targetH) => {
    if (!isSlider || !control || !control.track || !control.num) return;
    const effW = targetW ?? ctrl.w;
    const effH = targetH ?? ctrl.h;
    const shouldStack = effH >= 40 || (effW < 180 && labelPos !== "none");

    if (shouldStack) {
      row.classList.add("slider-stacked");
      let topBar = row.querySelector(".lego-row-top");
      if (!topBar) {
        topBar = el("div", "lego-row-top");
        row.prepend(topBar);
      }
      topBar.replaceChildren();
      if (labelPos !== "none") topBar.append(lbl);
      else {
        const sp = el("div");
        sp.style.flex = "1";
        topBar.append(sp);
      }
      topBar.append(control.num);

      if (!control.contains(control.track)) {
        control.replaceChildren(control.track);
      } else if (control.contains(control.num)) {
        control.num.remove();
      }
      if (!row.contains(control)) row.append(control);
    } else {
      row.classList.remove("slider-stacked");
      const topBar = row.querySelector(".lego-row-top");
      if (topBar) topBar.remove();

      if (control.numResizer) {
        control.replaceChildren(control.track, control.numResizer, control.num);
      } else {
        control.replaceChildren(control.track, control.num);
      }
      row.replaceChildren();
      if (labelPos === "none") {
        row.classList.add("lbl-none");
        row.append(control);
      } else if (labelPos === "right") {
        row.classList.add("lbl-right");
        row.append(control, lbl);
      } else {
        row.classList.remove("lbl-none", "lbl-right");
        row.append(lbl, control);
      }
    }
  };

  if (isSlider) {
    row.classList.add("is-slider");
    applySliderResponsiveLayout(ctrl.w, ctrl.h);
  } else if (isPanelKind(natural)) {
    row.classList.add("is-preview-override");
    row.replaceChildren();
    if (ctrl.label && labelPos !== "none") {
      const topBar = el("div", "lego-row-top");
      topBar.append(lbl);
      row.append(topBar);
    }
    row.append(control);
  } else if (labelPos === "none") {
    if (kind === "toggle") row.classList.add("is-toggle");
    row.classList.add("lbl-none");
    row.append(control);
  } else if (wide) {
    const topBar = el("div", "lego-row-top");
    if (labelPos === "right") topBar.classList.add("to-right");
    topBar.append(lbl);
    row.append(topBar, control);
  } else if (labelPos === "right") {
    row.classList.add("lbl-right");
    row.append(control, lbl);
  } else {
    row.append(lbl, control);
  }

  }  // fim do else (!hit)

  }  // fim do miolo exclusivo de controles simples

  // ── 2. BARRA DE AÇÕES FLUTUANTE (AJUSTES E REMOVER) NO MODO EDIÇÃO ──
  // Flutua no topo direito sobre o widget sem alterar altura nem largura
  if (state.edit) {
    const floatingActions = el("div", "lego-floating-actions");

    // Configurar propriedades
    const editBtn = el("button", "lego-iconbtn btn-cfg");
    editBtn.innerHTML = glyph("settings", 10);
    editBtn.title = "Configure component properties";
    editBtn.addEventListener("pointerdown", eatPointer);
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // O seletor de parâmetros liga a widgets; grupos, divisores, labels e outputs se configuram no Inspetor.
      if (isOutput || isGroup || isSegmentLike || isDivider || isLabel) selectComponent(host, state, ctrl, sectionCtrls, true);
      else openInspector({ host, layout: host.properties[PROP], section: { controls: sectionCtrls }, ctrl, state });
    });
    floatingActions.append(editBtn);

    // Grupo: "+ Add" na mesma barra de configurar/duplicar/remover.
    if (isSegmentLike) {
      const addBtn = glyphBtn("lego-iconbtn btn-add", "plus", 10);
      addBtn.title = `Add element to ${ctrl.kind === "vsegment" ? "vertical" : "horizontal"} group`;
      addBtn.addEventListener("pointerdown", eatPointer);
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openInspector({ host, layout: host.properties[PROP], section: { controls: sectionCtrls }, state, segmentCtrl: ctrl });
      });
      floatingActions.append(addBtn);

      // Virar o grupo: horizontal <-> vertical.
      const flipBtn = glyphBtn("lego-iconbtn btn-flip", ctrl.kind === "vsegment" ? "hgroup" : "vgroup", 10);
      flipBtn.title = ctrl.kind === "vsegment" ? "Make horizontal" : "Make vertical";
      flipBtn.addEventListener("pointerdown", eatPointer);
      flipBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleGroupOrientation(host, state, ctrl);
      });
      floatingActions.append(flipBtn);
    }

    // Cor: em todo componente (antes só grupos; os demais só pelo botão direito).
    floatingActions.append(colorDotButton("lego-iconbtn btn-color", ctrl.color, isSegmentLike ? "Group color" : "Color",
      (color) => setComponentColor(host, state, ctrl, color)));

    // Botão de duplicar / copiar em componentes não linkados (ou cosméticos)
    const isUnboundOrCosmetic = !hit || !ctrl.bind || isDivider || isGroup || isLabel;
    if (isUnboundOrCosmetic) {
      const dupBtn = glyphBtn("lego-iconbtn btn-dup", "copy", 10);
      dupBtn.title = "Duplicate component (Ctrl+C, Ctrl+V, Ctrl+D)";
      dupBtn.addEventListener("pointerdown", eatPointer);
      dupBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        duplicateComponent(host, state, ctrl, sectionCtrls);
      });
      floatingActions.append(dupBtn);
    }

    // Ícone de corrente (link / bind) imediatamente à esquerda do 'x'
    // Grupos verticais, horizontais, divisores e labels não recebem link (não linkam em nada)
    if (isOutput) {
      // No output o elo escolhe o NÓ de origem (ou o modo automático).
      const srcOk = !ctrl.source || !!findNodeInHostScope(host, ctrl.source);
      const srcBtn = glyphBtn(`lego-iconbtn btn-link ${srcOk ? "is-bound" : "is-unbound"}`, "link", 10);
      srcBtn.title = `Source: ${outputSourceLabel(host, ctrl)} (click to change)`;
      srcBtn.addEventListener("pointerdown", eatPointer);
      srcBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openOutputSourceDialog(host, ctrl, state, sectionCtrls);
      });
      floatingActions.append(srcBtn);
    } else if (isBalance) {
      // Dois elos: o menu escolhe qual (A = esquerda, B = direita).
      const ok = [ctrl.bind, ctrl.bind2].every((b) => b && resolveBind(host, b));
      const linkBtn = glyphBtn(`lego-iconbtn btn-link ${ok ? "is-bound" : "is-unbound"}`, "link", 10);
      linkBtn.title = `Link A: ${ctrl.bind || "none"} · Link B: ${ctrl.bind2 || "none"} (click to change)`;
      linkBtn.addEventListener("pointerdown", eatPointer);
      linkBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openLegoContextMenu(e, balanceLinkEntries(host, ctrl, state, sectionCtrls));
      });
      floatingActions.append(linkBtn);
    } else if (!isDivider && !isGroup && !isLabel) {
      const isBound = !!hit;
      const linkBtn = glyphBtn(
        `lego-iconbtn btn-link ${isBound ? "is-bound" : "is-unbound"}`,
        "link",
        10
      );
      linkBtn.title = isBound
        ? `Linked to: ${ctrl.bind || hit?.widget?.name || "bound"} (click to change target)`
        : "Unbound — click to pick a workflow parameter";
      linkBtn.addEventListener("pointerdown", eatPointer);
      linkBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openInspector({
          host,
          layout: host.properties[PROP],
          section: { controls: sectionCtrls },
          ctrl,
          state,
          forFilterKind: ctrl.kind === "text" ? "" : ctrl.kind,
          targetCallback: (target) => {
            if (!target || target.isRaw) return;
            ctrl.bind = target.bind;
            if (!ctrl.label || ctrl.label === ctrl.name) ctrl.label = target.label || target.name;
            ctrl.kind = target.kind || ctrl.kind;
            state.refresh();
          }
        });
      });
      floatingActions.append(linkBtn);
    }

    // Excluir componente (X vermelhinho)
    const del = glyphBtn("lego-iconbtn btn-del", "close", 10);
    del.title = "Remove component from zone (Delete)";
    del.addEventListener("pointerdown", eatPointer);
    del.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      pushUndo(host);
      if (state.selectedNames && state.selectedNames.has(ctrl.name) && state.selectedNames.size > 1) {
        removeControlsByName(host.properties[PROP], state.selectedNames);
        state.selectedNames.clear();
        state.selectedName = null;
        state.refresh();
      } else {
        const i = sectionCtrls.indexOf(ctrl);
        if (i >= 0) {
          sectionCtrls.splice(i, 1);
          state.selectedNames?.delete(ctrl.name);
          if (state.selectedName === ctrl.name) state.selectedName = null;
          state.refresh();
        }
      }
    });
    floatingActions.append(del);

    row.append(floatingActions);

    const marcar = (multi = false) => {
      if (!state.selectedNames) state.selectedNames = new Set();
      if (multi) {
        if (state.selectedNames.has(ctrl.name)) {
          state.selectedNames.delete(ctrl.name);
          row.classList.remove("selected");
        } else {
          state.selectedNames.add(ctrl.name);
          row.classList.add("selected");
        }
        state.selectedName = state.selectedNames.has(ctrl.name) ? ctrl.name : (Array.from(state.selectedNames).pop() || null);
      } else {
        document.querySelectorAll(".lego-row.selected").forEach((r) => r.classList.remove("selected"));
        document.querySelectorAll(".lego-segment-item.selected").forEach((r) => r.classList.remove("selected"));
        state.selectedNames.clear();
        state.selectedNames.add(ctrl.name);
        state.selectedName = ctrl.name;
        row.classList.add("selected");
      }
    };

    let wasDragged = false;

    // Clique esquerdo marca ou alterna seleção múltipla com Ctrl/Shift
    row.addEventListener("click", (e) => {
      if (wasDragged) {
        wasDragged = false;
        return;
      }
      if (e.target.closest(".lego-segment-item") || e.target.closest("button") || e.target.closest("input") || e.target.closest("textarea") || e.target.closest("select")) return;
      e.stopPropagation();
      const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
      marcar(isMulti);
      selectComponent(host, state, ctrl, sectionCtrls, false, isMulti);
    });

    // Botão direito: menu do componente (Propriedades, Duplicar, Agrupar...).
    // Com Ctrl/Shift continua só somando à seleção.
    row.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".lego-segment-item")) return;
      e.preventDefault();
      e.stopPropagation();
      const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
      if (isMulti) {
        marcar(true);
        selectComponent(host, state, ctrl, sectionCtrls, false, true);
        return;
      }
      openComponentContextMenu(e, host, state, ctrl, sectionCtrls);
    });

    // ── 3. ARRASTE LIVRE 2D COM SMART GUIDES ESTILO FIGMA E MULTI-SELEÇÃO ──
    row.style.cursor = "grab";
    // Impede o drag-and-drop nativo de imagens, textos e mídias do HTML5 que cancela eventos de ponteiro
    row.ondragstart = (e) => e.preventDefault();

    row.addEventListener("pointerdown", (e) => {
      if (!state.edit) return;
      // Permite arrastar clicando em qualquer lugar do elemento (inclusive dentro de grupos ou campos),
      // exceto se o clique for explicitamente na alça de redimensionamento ou nos botões de ação flutuantes.
      if (
        e.target.closest(".lego-resizer-corner") ||
        e.target.closest(".lego-slider-num-resizer") ||
        e.target.closest(".lego-floating-actions") ||
        e.target.closest(".lego-item-actions") ||
        e.target.closest(".lego-item-del-btn") ||
        e.target.closest(".lego-item-link-btn") ||
        e.target.closest(".lego-item-cfg-btn") ||
        e.target.closest(".lego-seg-quick-btn") ||
        e.target.closest(".lego-item-dup-btn")
      ) {
        return;
      }
      if (state.armedTool && isSegmentLike) {
        // Deixa o clique passar para o box do segmento soltar a ferramenta nele
        return;
      }
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault(); // ESSENCIAL: impede text-selection e dragstart nativo do HTML5 que disparavam pointercancel e travavam o arraste!

      const clickedInteractiveTarget = (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") ? e.target : null;
      const rowStartRect = row.getBoundingClientRect();

      try {
        row.setPointerCapture(e.pointerId);
      } catch {}

      const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
      if (!state.selectedNames) state.selectedNames = new Set();

      // Se não for clique com tecla modificadora e o item não pertencer à seleção atual,
      // passa a selecionar apenas este item para arrasto solo.
      if (!isMulti && !state.selectedNames.has(ctrl.name)) {
        state.selectedNames.clear();
        state.selectedNames.add(ctrl.name);
        state.selectedName = ctrl.name;
        document.querySelectorAll(".lego-row.selected").forEach((r) => r.classList.remove("selected"));
        document.querySelectorAll(".lego-segment-item.selected").forEach((r) => r.classList.remove("selected"));
        row.classList.add("selected");
        renderObjectInspector(host, state, false);
      }

      const container = parentContainer || row.parentElement || document.querySelector(".lego-sec-controls") || document.body;
      const containerMinH0 = container.style.minHeight;
      const containerH0 = container.style.height;
      const undoSnapshot = JSON.stringify(host.properties[PROP] || {});
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const curScale = domScale();
      let isDragging = false;
      wasDragged = false;

      // Todos os itens selecionados nesta seção que se moverão juntos
      const movingItems = sectionCtrls
        .filter((c) => state.selectedNames.has(c.name))
        .map((c) => {
          const rEl = (c === ctrl ? row : null) || Array.from(container.querySelectorAll(".lego-row")).find((r) => r.dataset.name === c.name) || null;
          return {
            ctrl: c,
            el: rEl,
            origX: typeof c.x === "number" ? c.x : 0,
            origY: typeof c.y === "number" ? c.y : 0,
            curX: typeof c.x === "number" ? c.x : 0,
            curY: typeof c.y === "number" ? c.y : 0
          };
        });

      if (!movingItems.some((m) => m.ctrl === ctrl)) {
        movingItems.push({
          ctrl,
          el: row,
          origX: typeof ctrl.x === "number" ? ctrl.x : 0,
          origY: typeof ctrl.y === "number" ? ctrl.y : 0,
          curX: typeof ctrl.x === "number" ? ctrl.x : 0,
          curY: typeof ctrl.y === "number" ? ctrl.y : 0
        });
      }

      // Alvos de alinhamento para as guias inteligentes (todos os outros elementos do canvas)
      const movingSet = new Set(movingItems.map((m) => m.ctrl));
      const targetCtrls = (sectionCtrls || []).filter((c) => {
        return !movingSet.has(c) && typeof c.x === "number" && typeof c.y === "number";
      });

      let activeGuides = [];
      const clearGuides = () => {
        activeGuides.forEach((g) => g.remove());
        activeGuides = [];
      };

      // Um componente sozinho (não-grupo) pode ser solto DENTRO de um grupo.
      const canEnterGroup = movingItems.length === 1;
      let groupTarget = null;
      // Fora da própria zona: outra zona ou uma aba ({ type, zone|tabEl }).
      let foreign = null;
      const movingEls = () => movingItems.map((m) => m.el).filter(Boolean);

      const onMove = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();

        const rawDx = (ev.clientX - startClientX) / curScale;
        const rawDy = (ev.clientY - startClientY) / curScale;

        if (!isDragging) {
          if (Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) < 3) return;
          isDragging = true;
          wasDragged = true;
          row.style.cursor = "grabbing";
          movingItems.forEach((m) => {
            if (m.el) {
              m.el.style.zIndex = "9999";
              m.el.classList.add("dragging");
            }
          });
        }

        const refItem = movingItems.find((m) => m.ctrl === ctrl) || movingItems[0];
        const refW = refItem.ctrl.w || 256;
        const refH = refItem.ctrl.h || 46;
        const rawRefX = refItem.origX + rawDx;
        const rawRefY = refItem.origY + rawDy;

        clearGuides();

        // ── FIGMA SMART ALIGNMENT GUIDES & MAGNETIC SNAP ──
        const SNAP_TOLERANCE = 8; // tolerância para magnetismo às guias
        let snappedRefX = null;
        let snappedRefY = null;
        let matchedGuideX = [];
        let matchedGuideY = [];

        // EIXO X (Guia Vertical: Esquerda, Centro, Direita)
        const refXPoints = [
          { val: rawRefX, offset: 0, kind: "left" },
          { val: rawRefX + refW / 2, offset: refW / 2, kind: "center" },
          { val: rawRefX + refW, offset: refW, kind: "right" }
        ];

        let minDiffX = SNAP_TOLERANCE + 1;
        let bestTargetValX = null;
        let bestRefPointX = null;

        for (const t of targetCtrls) {
          const tW = t.w || 256;
          const tH = t.h || 46;
          const targetXPoints = [
            { val: t.x, target: t, tH, kind: "left" },
            { val: t.x + tW / 2, target: t, tH, kind: "center" },
            { val: t.x + tW, target: t, tH, kind: "right" }
          ];

          for (const rp of refXPoints) {
            for (const tp of targetXPoints) {
              const diff = Math.abs(rp.val - tp.val);
              if (diff <= SNAP_TOLERANCE && diff < minDiffX) {
                minDiffX = diff;
                bestTargetValX = tp.val;
                bestRefPointX = rp;
              }
            }
          }
        }

        if (bestRefPointX !== null) {
          snappedRefX = Math.max(0, Math.round(bestTargetValX - bestRefPointX.offset));
          for (const t of targetCtrls) {
            const tW = t.w || 256;
            const tH = t.h || 46;
            const points = [t.x, t.x + tW / 2, t.x + tW];
            if (points.some((p) => Math.abs(p - bestTargetValX) < 1.5)) {
              matchedGuideX.push({ x: bestTargetValX, tY: t.y, tH });
            }
          }
        } else {
          snappedRefX = Math.max(0, Math.round(rawRefX / GRID) * GRID);
        }

        // EIXO Y (Guia Horizontal: Topo, Centro, Base)
        const refYPoints = [
          { val: rawRefY, offset: 0, kind: "top" },
          { val: rawRefY + refH / 2, offset: refH / 2, kind: "center" },
          { val: rawRefY + refH, offset: refH, kind: "bottom" }
        ];

        let minDiffY = SNAP_TOLERANCE + 1;
        let bestTargetValY = null;
        let bestRefPointY = null;

        for (const t of targetCtrls) {
          const tW = t.w || 256;
          const tH = t.h || 46;
          const targetYPoints = [
            { val: t.y, target: t, tW, kind: "top" },
            { val: t.y + tH / 2, target: t, tW, kind: "center" },
            { val: t.y + tH, target: t, tW, kind: "bottom" }
          ];

          for (const rp of refYPoints) {
            for (const tp of targetYPoints) {
              const diff = Math.abs(rp.val - tp.val);
              if (diff <= SNAP_TOLERANCE && diff < minDiffY) {
                minDiffY = diff;
                bestTargetValY = tp.val;
                bestRefPointY = rp;
              }
            }
          }
        }

        if (bestRefPointY !== null) {
          snappedRefY = Math.max(0, Math.round(bestTargetValY - bestRefPointY.offset));
          for (const t of targetCtrls) {
            const tW = t.w || 256;
            const tH = t.h || 46;
            const points = [t.y, t.y + tH / 2, t.y + tH];
            if (points.some((p) => Math.abs(p - bestTargetValY) < 1.5)) {
              matchedGuideY.push({ y: bestTargetValY, tX: t.x, tW });
            }
          }
        } else {
          snappedRefY = Math.max(0, Math.round(rawRefY / GRID) * GRID);
        }

        // Desenha as linhas guia de nivelamento no container
        if (isDragging && matchedGuideX.length > 0) {
          let minY = snappedRefY;
          let maxY = snappedRefY + refH;
          matchedGuideX.forEach((m) => {
            minY = Math.min(minY, m.tY);
            maxY = Math.max(maxY, m.tY + m.tH);
          });
          const gEl = el("div", "lego-align-guide v");
          gEl.style.left = `${bestTargetValX}px`;
          gEl.style.top = `${minY - 8}px`;
          gEl.style.height = `${(maxY - minY) + 16}px`;
          container.append(gEl);
          activeGuides.push(gEl);
        }

        if (isDragging && matchedGuideY.length > 0) {
          let minX = snappedRefX;
          let maxX = snappedRefX + refW;
          matchedGuideY.forEach((m) => {
            minX = Math.min(minX, m.tX);
            maxX = Math.max(maxX, m.tX + m.tW);
          });
          const gEl = el("div", "lego-align-guide h");
          gEl.style.top = `${bestTargetValY}px`;
          gEl.style.left = `${minX - 8}px`;
          gEl.style.width = `${(maxX - minX) + 16}px`;
          container.append(gEl);
          activeGuides.push(gEl);
        }

        const snappedDx = snappedRefX - refItem.origX;
        const snappedDy = snappedRefY - refItem.origY;

        for (const item of movingItems) {
          const nx = Math.max(0, item.origX + snappedDx);
          const ny = Math.max(0, item.origY + snappedDy);
          item.curX = nx;
          item.curY = ny;
          if (item.el) {
            item.el.style.left = `${nx}px`;
            item.el.style.top = `${ny}px`;
          }
        }

        // Sobre um grupo: realça o grupo, mostra onde entra e esmaece o
        // componente, que ali vira item do grupo em vez de mudar de lugar.
        const g = canEnterGroup ? groupDropTargetAt(ev.clientX, ev.clientY, row) : null;
        const tabEl = g ? null : tabDropTargetAt(ev.clientX, ev.clientY);
        const zoneEl = (g || tabEl) ? null : zoneDropTargetAt(ev.clientX, ev.clientY, movingEls());
        const otherZone = zoneEl && zoneEl !== container ? zoneEl : null;
        clearDropFeedback();
        groupTarget = g;
        foreign = tabEl ? { type: "tab", tabEl } : otherZone ? { type: "zone", zone: otherZone } : null;
        row.classList.toggle("entering-group", !!(g || foreign));
        if (g) {
          clearGuides();   // guias de alinhamento não valem dentro do grupo
          showGroupDrop(g);
        } else if (tabEl) {
          clearGuides();
          tabEl.classList.add("drop-into");
        } else if (otherZone) {
          clearGuides();
          otherZone.classList.add("drop-out");
        }

        // A zona só cresce enquanto o PONTEIRO está nela. Crescendo atrás de
        // um ponteiro que já saiu, ela empurrava as zonas de baixo para longe
        // e nunca dava para chegar nelas.
        const cr = container.getBoundingClientRect();
        const pointerInside = ev.clientY >= cr.top && ev.clientY <= cr.bottom && ev.clientX >= cr.left && ev.clientX <= cr.right;
        if (updateBoundsFn && !foreign && !g && pointerInside) {
          const maxMovingBottom = Math.max(...movingItems.map(m => m.curY + (m.ctrl.h || 46) + 16));
          const curMinH = parseFloat(container.style.minHeight) || 70;
          if (maxMovingBottom > curMinH) {
            container.style.minHeight = `${maxMovingBottom}px`;
            container.style.height = `${maxMovingBottom}px`;
          }
        } else if (!pointerInside) {
          // Ponteiro saiu: desfaz o crescimento provisório, senão as zonas de
          // baixo ficam deslocadas e fogem do ponteiro que vai até elas.
          container.style.minHeight = containerMinH0;
          container.style.height = containerH0;
        }
      };

      const onUp = (ev) => {
        try {
          row.releasePointerCapture(e.pointerId);
        } catch {}

        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onUp, true);
        window.removeEventListener("mousemove", onMove, true);
        window.removeEventListener("mouseup", onUp, true);

        clearGuides();
        clearDropFeedback();
        row.classList.remove("entering-group");
        row.style.cursor = "grab";

        if (!isDragging) {
          // Se clicou em um campo interativo (input, textarea), dá foco diretamente para permitir digitação!
          if (clickedInteractiveTarget) {
            clickedInteractiveTarget.focus();
          }

          // Se foi clique simples em item de grupo, seleciona o item interno no Object Properties
          const segItem = e.target.closest(".lego-segment-item");
          if (segItem && ctrl.items) {
            const itName = segItem.dataset.itemName || segItem.dataset.name;
            const targetItem = ctrl.items.find((i) => i.name === itName);
            if (targetItem) {
              selectComponent(host, state, targetItem, ctrl.items, false, isMulti);
              return;
            }
          }
          if (isMulti) {
            selectComponent(host, state, ctrl, sectionCtrls, false, true);
          } else {
            selectComponent(host, state, ctrl, sectionCtrls, false, false);
          }
          return;
        }

        ev?.stopPropagation();

        if (foreign) {
          const moving = movingItems.map((m) => m.ctrl).filter((c) => sectionCtrls.includes(c));
          for (const m of movingItems) {
            if (m.el) { m.el.style.zIndex = ""; m.el.classList.remove("dragging"); }
          }
          for (const c of moving) sectionCtrls.splice(sectionCtrls.indexOf(c), 1);
          if (foreign.type === "zone") {
            // Onde foi solto, mantendo a pegada e a disposição do grupo arrastado.
            const zr = foreign.zone.getBoundingClientRect();
            const zsc = zr.width / (foreign.zone.offsetWidth || zr.width || 1);
            const refX = (ev.clientX - zr.left) / zsc - (startClientX - rowStartRect.left) / curScale;
            const refY = (ev.clientY - zr.top) / zsc - (startClientY - rowStartRect.top) / curScale;
            const ref = movingItems.find((m) => m.ctrl === ctrl) || movingItems[0];
            for (const m of movingItems) {
              if (!moving.includes(m.ctrl)) continue;
              m.ctrl.x = Math.max(0, Math.round((refX + m.origX - ref.origX) / GRID) * GRID);
              m.ctrl.y = Math.max(0, Math.round((refY + m.origY - ref.origY) / GRID) * GRID);
              foreign.zone.__legoList.push(m.ctrl);
            }
          } else {
            placeInList(foreign.tabEl.__legoTabDrop.list(), moving);
            foreign.tabEl.__legoTabDrop.activate();
          }
          pushUndoSnapshot(host, undoSnapshot);
          state.refresh();
          return;
        }

        if (groupTarget) {
          const idx = sectionCtrls.indexOf(ctrl);
          if (idx >= 0) {
            sectionCtrls.splice(idx, 1);
            const dest = groupTarget.seg.items || (groupTarget.seg.items = []);
            dest.splice(Math.min(groupTarget.listIndex, dest.length), 0, zoneCtrlToItem(ctrl));
            pushUndoSnapshot(host, undoSnapshot);
            state.selectedName = ctrl.name;
            state.selectedNames = new Set([ctrl.name]);
            state.refresh();
            return;
          }
        }

        for (const item of movingItems) {
          if (item.el) {
            item.el.style.zIndex = "";
            item.el.classList.remove("dragging");
          }
          item.ctrl.x = item.curX;
          item.ctrl.y = item.curY;
        }

        if (isDragging) {
          pushUndoSnapshot(host, undoSnapshot);
        }

        if (updateBoundsFn) updateBoundsFn();
        state.refresh();
      };

      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
      window.addEventListener("mousemove", onMove, true);
      window.addEventListener("mouseup", onUp, true);
    });

    // ── 4. REDIMENSIONAMENTO 2D AO VIVO COM SMART GUIDES E SNAP TO GRID (16px) ──
    // Alça de Canto Diagonal (Borda Inferior Direita ⤡)
    const cornerResizer = el("div", "lego-resizer-corner");
    cornerResizer.title = "Drag to resize (Smart Guides & Snap 16px)";

    cornerResizer.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      cornerResizer.classList.add("active");
      row.classList.add("resizing");

      try {
        cornerResizer.setPointerCapture(e.pointerId);
      } catch {}

      const container = parentContainer || row.parentElement || document.querySelector(".lego-sec-controls") || document.body;
      const undoSnapshot = JSON.stringify(host.properties[PROP] || {});

      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const origW = typeof ctrl.w === "number" ? ctrl.w : (row.offsetWidth || 256);
      const origH = typeof ctrl.h === "number" ? ctrl.h : (row.offsetHeight || 46);
      const ctrlX = typeof ctrl.x === "number" ? ctrl.x : 0;
      const ctrlY = typeof ctrl.y === "number" ? ctrl.y : 0;
      const curScale = domScale();

      // Alvos para alinhamento inteligente (todos os outros elementos do canvas)
      const targetCtrls = (sectionCtrls || []).filter((c) => {
        return c !== ctrl && typeof c.x === "number" && typeof c.y === "number";
      });

      let activeGuides = [];
      const clearGuides = () => {
        activeGuides.forEach((g) => g.remove());
        activeGuides = [];
      };

      let finalW = origW;
      let finalH = origH;

      // Redimensionar um dos selecionados leva junto os outros selecionados
      // soltos da mesma zona: cada um recebe a mesma variação de tamanho.
      const others = (state.selectedNames?.has(ctrl.name) && state.selectedNames.size > 1)
        ? (sectionCtrls || []).filter((c) => c !== ctrl && state.selectedNames.has(c.name)).map((c) => ({
          c, w0: axW(c), h0: axH(c), min: getComponentMinDimensions(c),
          row: [...(container.querySelectorAll?.(".lego-row") || [])].find((r) => r.dataset.name === c.name) || null,
        }))
        : [];
      const resizeOthers = () => {
        const dw = finalW - origW, dh = finalH - origH;
        for (const o of others) {
          o.c.w = Math.max(o.min.minW, Math.round((o.w0 + dw) / GRID) * GRID);
          o.c.h = Math.max(o.min.minH, Math.round((o.h0 + dh) / GRID) * GRID);
          if (o.row) { o.row.style.width = `${o.c.w}px`; o.row.style.height = `${o.c.h}px`; }
        }
      };

      const onMoveCorner = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();

        const deltaX = (ev.clientX - startClientX) / curScale;
        const deltaY = (ev.clientY - startClientY) / curScale;

        const rawW = origW + deltaX;
        const rawH = origH + deltaY;
        const rawRight = ctrlX + rawW;
        const rawBottom = ctrlY + rawH;

        clearGuides();

        // ── FIGMA SMART ALIGNMENT GUIDES & MAGNETIC SNAP NO RESIZE ──
        const SNAP_TOLERANCE = 8;
        let matchedGuideX = [];
        let matchedGuideY = [];
        let bestTargetValX = null;
        let bestTargetValY = null;
        let bestDiffX = SNAP_TOLERANCE + 1;
        let bestDiffY = SNAP_TOLERANCE + 1;

        // 1. EIXO X (Borda Direita ou Mesma Largura alinhada com alvos)
        for (const t of targetCtrls) {
          const tW = t.w || 256;
          const tH = t.h || 46;

          // Alinhamento da borda direita com: right (t.x + tW), left (t.x), center (t.x + tW/2)
          // e mesma largura: ctrlX + tW
          const candidateX = [
            { val: t.x + tW, tY: t.y, tH },
            { val: t.x, tY: t.y, tH },
            { val: t.x + tW / 2, tY: t.y, tH },
            { val: ctrlX + tW, tY: t.y, tH }
          ];

          for (const cand of candidateX) {
            const diff = Math.abs(rawRight - cand.val);
            if (diff <= SNAP_TOLERANCE && diff < bestDiffX) {
              bestDiffX = diff;
              bestTargetValX = cand.val;
            }
          }
        }

        // Borda direita da zona com a MESMA margem da esquerda (a menor x dos
        // componentes da zona): senão a largura na grade de 16 deixava a
        // margem direita maior que a esquerda.
        let edgeX = null;
        const boxW = parentContainer?.clientWidth || 0;
        if (boxW) {
          const leftMargin = Math.min(ctrlX, ...(sectionCtrls || []).map((c) => (typeof c.x === "number" ? c.x : 16)));
          const cand = boxW - leftMargin;
          const diff = Math.abs(rawRight - cand);
          if (cand > ctrlX + ctrlMinW && diff <= SNAP_TOLERANCE * 2 && diff <= bestDiffX) {
            bestDiffX = diff;
            bestTargetValX = edgeX = cand;
          }
        }

        if (bestTargetValX !== null) {
          finalW = Math.max(ctrlMinW, Math.round(bestTargetValX - ctrlX));
          if (edgeX !== null) matchedGuideX.push({ x: edgeX, tY: 0, tH: parentContainer.clientHeight || ctrlY + finalH });
          for (const t of targetCtrls) {
            const tW = t.w || 256;
            const tH = t.h || 46;
            const points = [t.x, t.x + tW / 2, t.x + tW];
            if (points.some((p) => Math.abs(p - bestTargetValX) < 1.5)) {
              matchedGuideX.push({ x: bestTargetValX, tY: t.y, tH });
            }
          }
        } else {
          finalW = Math.max(ctrlMinW, Math.round(rawW / GRID) * GRID);
        }

        // 2. EIXO Y (Base Inferior ou Mesma Altura alinhada com alvos)
        for (const t of targetCtrls) {
          const tW = t.w || 256;
          const tH = t.h || 46;

          // Alinhamento da base inferior com: bottom (t.y + tH), top (t.y), center (t.y + tH/2)
          // e mesma altura: ctrlY + tH
          const candidateY = [
            { val: t.y + tH, tX: t.x, tW },
            { val: t.y, tX: t.x, tW },
            { val: t.y + tH / 2, tX: t.x, tW },
            { val: ctrlY + tH, tX: t.x, tW }
          ];

          for (const cand of candidateY) {
            const diff = Math.abs(rawBottom - cand.val);
            if (diff <= SNAP_TOLERANCE && diff < bestDiffY) {
              bestDiffY = diff;
              bestTargetValY = cand.val;
            }
          }
        }

        if (bestTargetValY !== null) {
          finalH = Math.max(ctrlMinH, Math.round(bestTargetValY - ctrlY));
          for (const t of targetCtrls) {
            const tW = t.w || 256;
            const tH = t.h || 46;
            const points = [t.y, t.y + tH / 2, t.y + tH];
            if (points.some((p) => Math.abs(p - bestTargetValY) < 1.5)) {
              matchedGuideY.push({ y: bestTargetValY, tX: t.x, tW });
            }
          }
        } else {
          finalH = Math.max(ctrlMinH, Math.round(rawH / GRID) * GRID);
        }

        // 3. Desenhar Guias Verticais de Nivelamento
        if (matchedGuideX.length > 0) {
          let minY = ctrlY;
          let maxY = ctrlY + finalH;
          matchedGuideX.forEach((m) => {
            minY = Math.min(minY, m.tY);
            maxY = Math.max(maxY, m.tY + m.tH);
          });
          const gEl = el("div", "lego-align-guide v");
          gEl.style.left = `${bestTargetValX}px`;
          gEl.style.top = `${minY - 8}px`;
          gEl.style.height = `${(maxY - minY) + 16}px`;
          container.append(gEl);
          activeGuides.push(gEl);
        }

        // 4. Desenhar Guias Horizontais de Nivelamento
        if (matchedGuideY.length > 0) {
          let minX = ctrlX;
          let maxX = ctrlX + finalW;
          matchedGuideY.forEach((m) => {
            minX = Math.min(minX, m.tX);
            maxX = Math.max(maxX, m.tX + m.tW);
          });
          const gEl = el("div", "lego-align-guide h");
          gEl.style.top = `${bestTargetValY}px`;
          gEl.style.left = `${minX - 8}px`;
          gEl.style.width = `${(maxX - minX) + 16}px`;
          container.append(gEl);
          activeGuides.push(gEl);
        }

        row.style.width = `${finalW}px`;
        row.style.height = `${finalH}px`;

        ctrl.w = finalW;
        ctrl.h = finalH;
        if (others.length) resizeOthers();
        if (applySliderResponsiveLayout) applySliderResponsiveLayout(finalW, finalH);
        if (updateBoundsFn) updateBoundsFn();
      };

      const onUpCorner = (ev) => {
        ev?.stopPropagation();
        try {
          cornerResizer.releasePointerCapture(e.pointerId);
        } catch {}

        clearGuides();
        cornerResizer.classList.remove("active");
        row.classList.remove("resizing");

        window.removeEventListener("pointermove", onMoveCorner, true);
        window.removeEventListener("pointerup", onUpCorner, true);
        window.removeEventListener("pointercancel", onUpCorner, true);
        window.removeEventListener("mousemove", onMoveCorner, true);
        window.removeEventListener("mouseup", onUpCorner, true);

        ctrl.w = finalW;
        ctrl.h = finalH;
        delete ctrl.width;
        delete ctrl.height;
        if (others.length) {
          resizeOthers();
          for (const o of others) { delete o.c.width; delete o.c.height; }
        }
        if (finalW !== origW || finalH !== origH) {
          pushUndoSnapshot(host, undoSnapshot);
        }
        state.refresh();
      };

      window.addEventListener("pointermove", onMoveCorner, true);
      window.addEventListener("pointerup", onUpCorner, true);
      window.addEventListener("pointercancel", onUpCorner, true);
      window.addEventListener("mousemove", onMoveCorner, true);
      window.addEventListener("mouseup", onUpCorner, true);
    });
    row.append(cornerResizer);
  }

  // Grupo que não comporta os itens cresce até caberem (depois de desenhado).
  if (isSegmentLike) {
    const fit = () => fitGroupToContent(host, ctrl, row, updateBoundsFn);
    requestAnimationFrame(() => requestAnimationFrame(fit));
    setTimeout(fit, 400);   // miniaturas e listas que terminam de carregar depois
  }

  return row;
}

export { pickBalanceLink, balanceLinkEntries, CONTROL_KINDS, controlKindFor, PANEL_KINDS, isPanelKind, defaultSizeFor, mkSpecialControl, mkColor, NODE_UI_WIDGET_TYPES, STANDARD_WIDGET_TYPES, isCanvasWidget, mirrorModeFor, CANVAS_MIRRORS, mirrorLoop, runMirrorLoop, mkCanvasMirror, mkDomMount, mkPreviewOverride, buildBare, buildGroup, applyLabelStyle, ghostControl, buildControl };
