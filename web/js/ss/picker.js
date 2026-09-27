/* Target Picker (escolher no workflow), diálogo de busca de componentes, modais e menus de aba. */
// Parte do ComfyUI-SuperSubgraph (ver web/js/super_subgraph.js e CLAUDE.md).
// Só declarações: nada roda ao carregar este arquivo.

import { app } from "../../../../scripts/app.js";
import { api } from "../../../../scripts/api.js";
import { GRID, LOG, MIN_W, PROP } from "./constants.js";
import { pushUndo, showLegoToast } from "./core.js";
import { bindKey, describeWidget, prettify, usable } from "./widgets.js";
import { GLYPHS, eatPointer, el, esc, glyph, glyphBtn, glyphTextBtn } from "./controls.js";
import { OUTPUT_KINDS, addItemToSegment, isOutputKind, listOutputSourceTargets } from "./outputs.js";
import { isMediaKind } from "./drag.js";
import { buildControl } from "./panels.js";
import { buildWholeNodeCtrl, detectMediaKind, getNodeAtEvent, listBindableTargets, singleCtrlFor, wholeNodeItems } from "./whole_node.js";
import { findFreeSpot, packInRows, renameClone } from "./form.js";
import { INSPECTOR, INSPECTOR_POS, adaptInspectorWithDialog, ensureComponentName } from "./inspector.js";
import { resize } from "./lifecycle.js";
import { liteGraph } from "./native.js";

/** Inicia o Modo de Seleção Visual no Workflow (Descompactado) */
function startVisualWorkflowPicker({ host, backdrop, onSelect, pickNode = false, allowWholeNode = false, onPromote = null, onCancel = null }) {
  backdrop.style.display = "none";
  // Seleção múltipla: clique marca/desmarca nós inteiros e parâmetros soltos;
  // "Promote" entrega tudo de uma vez.
  const multi = typeof onPromote === "function" && !pickNode;
  const picks = new Map();   // id do nó -> { node, whole, widgets: Set<nome> }
  let overlay = null;
  let overlayRaf = 0;

  const canvas = app.canvas;
  const originGraph = canvas.getCurrentGraph?.() || canvas.graph || app.graph;
  let isInsideSubgraph = false;

  // Abre o subgrafo (nativo) no canvas para escolher lá dentro.
  const savedView = canvas.ds ? { offset: [...canvas.ds.offset], scale: canvas.ds.scale } : null;
  if (host.subgraph && canvas.graph !== host.subgraph) {
    if (typeof canvas.openSubgraph === "function") canvas.openSubgraph(host.subgraph, host);
    else canvas.setGraph?.(host.subgraph);
    isInsideSubgraph = true;
    canvas.setDirty?.(true, true);
  }

  // Cria o HUD de navegação
  const hud = el("div", "lego-picker-hud");
  hud.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;">
      <span class="lego-pulse-icon lego-glyph-wrap">${glyph("target", 24)}</span>
      <div>
        <div style="font-weight:700;font-size:14px;color:#fff;letter-spacing:0.02em;">TARGET PICKER ACTIVE</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.75);">${pickNode
          ? "Click the node whose output this component should show"
          : multi
            ? "Click a node title to pick the whole node, or a parameter to pick just it · click again to unpick"
            : "Click any node on the canvas to pick the parameter to control"}</div>
      </div>
    </div>
  `;
  let promoteBtn = null;
  const updateHud = () => {
    if (!promoteBtn) return;
    let n = 0;
    for (const p of picks.values()) n += p.whole ? 1 : p.widgets.size;
    promoteBtn.disabled = n === 0;
    promoteBtn.querySelector("span").textContent = n ? `Promote (${n})` : "Promote";
  };

  const cleanup = () => {
    hud.remove();
    document.querySelector(".lego-node-picker-popup")?.remove();
    window.removeEventListener("pointerdown", onCanvasPointerDown, true);
    window.removeEventListener("pointermove", onPickHover, true);
    window.removeEventListener("keydown", onPickKey, true);
    cancelAnimationFrame(overlayRaf);
    overlay?.remove();

    // Volta para onde estava, com a vista de antes.
    if (isInsideSubgraph && originGraph && canvas.graph !== originGraph) {
      canvas.setGraph?.(originGraph);
      if (savedView && canvas.ds) {
        const apply = () => { canvas.ds.offset = [...savedView.offset]; canvas.ds.scale = savedView.scale; canvas.setDirty?.(true, true); };
        apply();
        requestAnimationFrame(apply);   // a navegação nativa reaplica a vista dela logo depois
      }
    }

    backdrop.style.display = "";
  };

  const cancelBtn = glyphTextBtn("lego-picker-cancel-btn", "close", multi ? "Cancel" : "Cancel and return", 14);
  // Cancelar: volta para o diálogo, ou fecha tudo quando o picker abriu direto.
  const cancel = () => { cleanup(); onCancel?.(); };
  cancelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    cancel();
  });
  if (multi) {
    promoteBtn = glyphTextBtn("lego-picker-promote-btn", "check", "Promote", 14);
    promoteBtn.title = "Promote everything picked to the card";
    promoteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const list = [...picks.values()].filter((p) => p.whole || p.widgets.size);
      if (!list.length) return;
      cleanup();
      onPromote(list);
    });
    hud.append(promoteBtn);
    updateHud();
  }
  hud.append(cancelBtn);
  document.body.append(hud);

  function onPickKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); cancel(); }
    else if (e.key === "Enter" && multi && picks.size) { e.stopPropagation(); e.preventDefault(); promoteBtn?.click(); }
  }
  window.addEventListener("keydown", onPickKey, true);

  /* Bordas de destaque: desenhadas por cima do canvas, seguindo zoom e pan. */
  const drawPicks = () => {
    overlayRaf = requestAnimationFrame(drawPicks);
    if (!overlay) return;
    overlay.replaceChildren();
    const ds = canvas.ds;
    const cr = canvas.canvas?.getBoundingClientRect?.();
    if (!ds || !cr) return;
    const T = liteGraph()?.NODE_TITLE_HEIGHT || 30;
    const box = (x, y, w, h, cls) => {
      const b = el("div", `lego-pick-box ${cls}`);
      b.style.left = `${cr.left + (x + ds.offset[0]) * ds.scale}px`;
      b.style.top = `${cr.top + (y + ds.offset[1]) * ds.scale}px`;
      b.style.width = `${w * ds.scale}px`;
      b.style.height = `${h * ds.scale}px`;
      overlay.append(b);
    };
    if (!multi && hoverPick && hoverPick.node.graph === canvas.graph && !hoverPick.node.flags?.collapsed) {
      const n = hoverPick.node, w = hoverPick.widget;
      const h = w.computedHeight ?? w.computeSize?.(n.size[0])?.[1] ?? liteGraph()?.NODE_WIDGET_HEIGHT ?? 20;
      box(n.pos[0] + 6, n.pos[1] + (w.y ?? w.last_y ?? 0), n.size[0] - 12, h, "widget");
    }
    for (const p of picks.values()) {
      const n = p.node;
      if (n.graph !== canvas.graph) continue;
      if (p.whole) {
        box(n.pos[0] - 3, n.pos[1] - T - 3, n.size[0] + 6, (n.flags?.collapsed ? 0 : n.size[1]) + T + 6, "whole");
        continue;
      }
      if (n.flags?.collapsed) continue;
      for (const name of p.widgets) {
        const w = (n.widgets || []).find((x) => x.name === name);
        if (!w) continue;
        const h = w.computedHeight ?? w.computeSize?.(n.size[0])?.[1] ?? liteGraph()?.NODE_WIDGET_HEIGHT ?? 20;
        box(n.pos[0] + 6, n.pos[1] + (w.y ?? w.last_y ?? 0), n.size[0] - 12, h, "widget");
      }
    }
  };
  // Destaque também ao escolher o alvo de um componente só: o parâmetro sob o
  // ponteiro acende em verde e o clique já o escolhe (sem janela de lista).
  if (multi || !pickNode) {
    overlay = el("div", "lego-pick-overlay");
    document.body.append(overlay);
    overlayRaf = requestAnimationFrame(drawPicks);
  }

  /** Parâmetro do nó sob o ponto (em coordenadas do canvas), se houver. */
  const widgetAt = (node, cx, cy) => {
    let w = null;
    try { w = node.getWidgetOnPos?.(cx, cy, true) || null; } catch { w = null; }
    if (!w) {
      const lx = cx - node.pos[0], ly = cy - node.pos[1];
      for (const x of node.widgets || []) {
        if (x.hidden || x.__lego) continue;
        const h = x.computedHeight ?? x.computeSize?.(node.size[0])?.[1] ?? 20;
        const y = x.y ?? x.last_y;
        if (y != null && ly >= y && ly <= y + h && lx >= 0 && lx <= node.size[0]) { w = x; break; }
      }
    }
    return w && usable(w) ? w : null;
  };

  /** Ponto do evento em coordenadas do canvas. */
  const canvasPos = (e) => {
    if (typeof canvas.convertEventToCanvasOffset === "function") return canvas.convertEventToCanvasOffset(e);
    const r = canvas.canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / canvas.ds.scale - canvas.ds.offset[0], (e.clientY - r.top) / canvas.ds.scale - canvas.ds.offset[1]];
  };
  /** Parâmetro sob o ponteiro (modo de um alvo só), para o destaque verde. */
  let hoverPick = null;
  function onPickHover(e) {
    if (multi || pickNode) return;
    const node = e.target === canvas.canvas ? getNodeAtEvent(canvas, e) : null;
    const [cx, cy] = node ? canvasPos(e) : [0, 0];
    const w = node && !node.flags?.collapsed ? widgetAt(node, cx, cy) : null;
    hoverPick = w ? { node, widget: w } : null;
  }
  window.addEventListener("pointermove", onPickHover, true);

  /** Marca/desmarca: nó inteiro (título/área sem parâmetro) ou só o parâmetro. */
  const togglePick = (node, e) => {
    const key = String(node.id);
    const usableNames = (node.widgets || []).filter(usable).map((w) => w.name);
    const [cx, cy] = canvasPos(e);
    const w = node.flags?.collapsed ? null : widgetAt(node, cx, cy);
    const cur = picks.get(key);
    if (!w) {
      if (cur?.whole) picks.delete(key);
      else if (usableNames.length) picks.set(key, { node, whole: true, widgets: new Set() });
      else showLegoToast("This node has no parameters to promote");
    } else if (cur?.whole) {
      // Nó inteiro marcado: clicar num parâmetro tira só ele.
      const rest = new Set(usableNames.filter((nm) => nm !== w.name));
      if (rest.size) picks.set(key, { node, whole: false, widgets: rest });
      else picks.delete(key);
    } else {
      const set = cur?.widgets || new Set();
      if (set.has(w.name)) set.delete(w.name); else set.add(w.name);
      if (set.size) picks.set(key, { node, whole: false, widgets: set });
      else picks.delete(key);
    }
    updateHud();
  };

  /** Alvo (para onSelect) de um parâmetro de um nó. */
  const widgetTarget = (node, w) => {
    const desc = describeWidget(w);
    return {
      bind: bindKey(host, node, w),
      label: `${node.title || node.type || `Node #${node.id}`} - ${prettify(w.name)}`,
      kind: detectMediaKind(w, desc, node),
      min: w.options?.min,
      max: w.options?.max,
      step: w.options?.step,
      seed: desc.isSeed || w.name.toLowerCase().includes("seed"),
      node,
      widget: w,
    };
  };

  const openNodeWidgetPopup = (hitNode, clientX, clientY) => {
    document.querySelector(".lego-node-picker-popup")?.remove();

    const popup = el("div", "lego-node-picker-popup");
    const posX = Math.max(20, Math.min(window.innerWidth - 440, clientX + 15));
    const posY = Math.max(20, Math.min(window.innerHeight - 380, clientY - 40));
    popup.style.left = `${posX}px`;
    popup.style.top = `${posY}px`;

    const nTitle = hitNode.title || hitNode.type || `Node #${hitNode.id}`;
    popup.innerHTML = `
      <div class="lego-node-picker-header">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="lego-glyph-wrap">${glyph("grid", 18)}</span>
          <div>
            <div class="lego-node-title">${esc(nTitle)} <span style="font-size:11px;color:var(--lego-accent);">#${esc(hitNode.id)}</span></div>
            <div class="lego-node-picker-sub">${esc(hitNode.type)}</div>
          </div>
        </div>
        <button class="lego-iconbtn close-btn" style="width:24px;height:24px;">${glyph("close", 12)}</button>
      </div>
      <div style="font-size:12px;color:var(--lego-dim);font-weight:600;margin-top:4px;">Select parameter for this component:</div>
    `;

    popup.querySelector(".close-btn").addEventListener("click", () => popup.remove());

    const wList = el("div");
    wList.style.display = "flex";
    wList.style.flexDirection = "column";
    wList.style.gap = "6px";
    wList.style.maxHeight = "280px";
    wList.style.overflowY = "auto";

    const usableWidgets = (hitNode.widgets || []).filter(w => usable(w));

    // Nó inteiro: um grupo pronto com todos os parâmetros, em linha ou coluna.
    if (allowWholeNode && usableWidgets.length) {
      const whole = el("div", "lego-whole-node");
      whole.append(el("div", "lego-whole-node-title", "Whole node as a widget"));
      const opts = el("div", "lego-whole-node-opts");
      for (const [orientation, label, g] of [["row", "Row", "hgroup"], ["column", "Column", "vgroup"]]) {
        const b = el("button", "lego-whole-node-btn");
        b.innerHTML = `${glyph(g, 15)}<span>${label}</span>`;
        b.title = `All ${usableWidgets.length} parameters of this node in a ${orientation === "row" ? "horizontal" : "vertical"} group`;
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelect({ isWholeNode: true, node: hitNode, orientation, label: nTitle });
          cleanup();
        });
        opts.append(b);
      }
      whole.append(opts);
      popup.append(whole);
      popup.append(el("div", "lego-whole-node-or", "or a single parameter:"));
    }

    if (!usableWidgets.length) {
      wList.append(el("div", "lego-empty", "This node has no configurable parameters."));
    } else {
      for (const w of usableWidgets) {
        const desc = describeWidget(w);
        const kind = detectMediaKind(w, desc, hitNode);

        const icon = glyph(GLYPHS[kind] ? kind : "settings", 15);

        const btn = el("button", "lego-node-widget-btn");
        const valPreview = String(w.value ?? "").slice(0, 22);
        btn.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="lego-glyph-wrap">${icon}</span>
            <span style="font-weight:600;">${esc(prettify(w.name))}</span>
            ${valPreview ? `<span style="font-size:11px;color:var(--lego-dim);font-family:monospace;">(${esc(valPreview)})</span>` : ""}
          </div>
          <span style="font-size:10.5px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.08);color:var(--lego-accent);">${esc(kind)}</span>
        `;

        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelect(widgetTarget(hitNode, w));
          cleanup();
        });

        wList.append(btn);
      }
    }

    popup.append(wList);
    document.body.append(popup);
  };

  function onCanvasPointerDown(e) {
    if (e.target.closest(".lego-picker-hud") || e.target.closest(".lego-node-picker-popup")) return;
    // Só o botão esquerdo no canvas (ou num nó dele): menus e painéis seguem livres.
    const onCanvas = e.target === canvas.canvas || !!e.target.closest?.(".dom-widget, [data-node-id], .lg-node");
    if (!onCanvas || e.button !== 0) return;

    const hitNode = getNodeAtEvent(canvas, e);
    if (!hitNode) return; // Clicou no fundo do canvas: permite pan/zoom nativo!

    e.stopPropagation();
    e.preventDefault();
    if (multi) { togglePick(hitNode, e); return; }
    // Origem de output: o alvo é o próprio nó, não um widget dele.
    if (pickNode) {
      onSelect({
        bind: hitNode === host ? "" : String(hitNode.id),
        name: hitNode.title || hitNode.type,
        label: hitNode.title || hitNode.type,
        node: hitNode,
      });
      cleanup();
      return;
    }
    // Clique direto num parâmetro: escolhe na hora. No título ou em área sem
    // parâmetro, abre a lista do nó (inclui "nó inteiro").
    const [cx, cy] = canvasPos(e);
    const w = hitNode.flags?.collapsed ? null : widgetAt(hitNode, cx, cy);
    if (w) {
      onSelect(widgetTarget(hitNode, w));
      cleanup();
      return;
    }
    openNodeWidgetPopup(hitNode, e.clientX, e.clientY);
  }

  window.addEventListener("pointerdown", onCanvasPointerDown, true);
}


// ── Catálogo de Componentes para o Menu de 2 Cliques (Estilo ComfyUI Canvas) ──

/**
 * JANELA DE ADIÇÃO E EDIÇÃO DE COMPONENTES NO DESIGN NATIVO DO COMFYUI (image_18b003.png)
 * Substitui completamente o modal antigo 'NOVO COMPONENTE'.
 */
/**
 * Desenha o nó de verdade, com o renderizador do próprio LiteGraph.
 *
 * A alternativa era remontar o nó em HTML — cabeçalho, soquetes e widgets
 * imitados à mão. Uma réplica assim nasce desatualizada: não acompanha cor,
 * forma, widget novo nem nó de terceiro, e precisa ser mantida em sincronia
 * com o ComfyUI para sempre.
 *
 * `drawNode` render relativo à origem do contexto, então nada de `node.pos`
 * é tocado — o nó no grafo fica intacto.
 */
function renderRealNode(node) {
  if (!node || typeof app?.canvas?.drawNode !== "function") return null;
  // Um nó que carrega cartão Lego tem o visual num overlay de DOM, que o
  // `drawNode` não enxerga: sairia um retângulo vazio. Nesse caso é melhor a
  // prévia em HTML, que ao menos lista os parâmetros.
  if ((node.widgets || []).some((w) => w.__lego)) return null;
  const TITLE_H = (window.LiteGraph && window.LiteGraph.NODE_TITLE_HEIGHT) || 30;
  const INSET = 12;
  const w = Math.ceil((node.size?.[0] || 200)) + INSET * 2;
  const h = Math.ceil((node.size?.[1] || 80)) + TITLE_H + INSET * 2;
  const dpr = window.devicePixelRatio || 1;

  const cv = document.createElement("canvas");
  cv.className = "lego-real-node";
  cv.width = Math.ceil(w * dpr);
  cv.height = Math.ceil(h * dpr);
  cv.style.width = "100%";
  cv.style.maxWidth = `${w}px`;
  cv.style.height = "auto";

  const ctx = cv.getContext("2d");
  if (!ctx) return null;

  // Um nó wasCollapsed desenharia só a barra de título; mostra o conteúdo e
  // devolve a bandeira como estava.
  const wasCollapsed = !!node.flags?.collapsed;
  try {
    if (wasCollapsed) node.flags.collapsed = false;
    ctx.scale(dpr, dpr);
    ctx.translate(INSET, INSET + TITLE_H);
    app.canvas.drawNode(node, ctx);
  } catch (e) {
    console.warn(LOG, "could not draw real node, falling back to HTML preview:", e);
    return null;
  } finally {
    if (wasCollapsed && node.flags) node.flags.collapsed = true;
  }
  return cv;
}


const RAW_UI_ELEMENTS = [
  // ── 1. INPUTS ──
  {
    isRaw: true,
    kind: "text",
    category: "Inputs",
    name: "Text Input",
    label: "Text Input",
    detail: "Single-line text input field",
    scope: "UI Element",
    desc: "Single-line text input field for strings, titles, or values.",
    defaultW: 220,
    defaultH: 42
  },
  {
    isRaw: true,
    kind: "textarea",
    category: "Inputs",
    name: "Text Multiline",
    label: "Text Multiline",
    detail: "Multi-line text input",
    scope: "UI Element",
    desc: "Multi-line free text input ideal for descriptions, prompts, and long-form text.",
    defaultW: 320,
    defaultH: 90
  },
  {
    isRaw: true,
    kind: "slider",
    category: "Inputs",
    name: "Slider",
    label: "Slider",
    detail: "Horizontal slider bar",
    scope: "UI Element",
    desc: "Slider bar for smooth continuous value adjustments.",
    defaultW: 256,
    defaultH: 42
  },
  {
    isRaw: true,
    kind: "number",
    category: "Inputs",
    name: "Stepper",
    label: "Stepper",
    detail: "Numeric input with increment/decrement buttons",
    scope: "UI Element",
    desc: "Precise numeric control with increment (+) and decrement (−) stepper buttons.",
    defaultW: 200,
    defaultH: 42
  },
  {
    isRaw: true,
    kind: "toggle",
    category: "Inputs",
    name: "Switch",
    label: "Switch",
    detail: "Toggle switch (Boolean True / False)",
    scope: "UI Element",
    desc: "Toggle switch for binary on/off or boolean states.",
    defaultW: 240,
    defaultH: 42
  },
  {
    isRaw: true,
    kind: "combo",
    category: "Inputs",
    name: "Dropdown",
    label: "Dropdown",
    detail: "Dropdown select menu",
    scope: "UI Element",
    desc: "Dropdown menu for selecting from a list of options.",
    defaultW: 256,
    defaultH: 42
  },

  // ── 2. MEDIA ──
  {
    isRaw: true,
    kind: "media",
    category: "Media",
    name: "Image Upload",
    label: "Image Upload",
    detail: "Image dropzone and preview",
    scope: "UI Element",
    desc: "Dropzone area for displaying, uploading, and previewing images.",
    defaultW: 280,
    defaultH: 140
  },
  {
    isRaw: true,
    kind: "video",
    category: "Media",
    name: "Video Upload",
    label: "Video Upload",
    detail: "Video dropzone, preview and playback",
    scope: "UI Element",
    desc: "Dropzone area for uploading, playing, and previewing video files.",
    defaultW: 280,
    defaultH: 140
  },
  {
    isRaw: true,
    kind: "audio",
    category: "Media",
    name: "Audio Upload",
    label: "Audio Upload",
    detail: "Audio dropzone and playback",
    scope: "UI Element",
    desc: "Dropzone area for uploading and playing audio files.",
    defaultW: 280,
    defaultH: 140
  },

  // ── 3. OUTPUT ──
  {
    isRaw: true,
    kind: "outimage",
    category: "Output",
    name: "Image Output",
    label: "Image Output",
    detail: "Shows generated images",
    scope: "UI Element",
    desc: "Displays the images generated by the workflow (Preview/Save Image), updated live on every run. Browse batches with the arrows.",
    defaultW: 256,
    defaultH: 224
  },
  {
    isRaw: true,
    kind: "outvideo",
    category: "Output",
    name: "Video Output",
    label: "Video Output",
    detail: "Plays generated videos",
    scope: "UI Element",
    desc: "Plays the videos generated by the workflow (Save Video, Video Combine), updated live on every run.",
    defaultW: 256,
    defaultH: 224
  },
  {
    isRaw: true,
    kind: "outaudio",
    category: "Output",
    name: "Audio Output",
    label: "Audio Output",
    detail: "Plays generated audio",
    scope: "UI Element",
    desc: "Plays the audio generated by the workflow (Preview/Save Audio), updated live on every run.",
    defaultW: 256,
    defaultH: 96
  },

  // ── 4. ACTIONS ──
  {
    isRaw: true,
    kind: "button",
    category: "Actions",
    name: "Button",
    label: "Button",
    detail: "Clickable action button",
    scope: "UI Element",
    desc: "Trigger button for custom workflow actions.",
    defaultW: 180,
    defaultH: 42
  },

  // ── 5. LAYOUT & COSMETIC ──
  {
    isRaw: true,
    kind: "label",
    category: "Layout",
    name: "Label",
    label: "Label",
    detail: "Text label for canvas notes and headers",
    scope: "UI Element",
    desc: "Cosmetic text label to annotate and organize sections of the canvas. Does not require any workflow parameter.",
    defaultW: 160,
    defaultH: 32
  },
  {
    isRaw: true,
    kind: "segment",
    category: "Layout",
    name: "Horizontal Group",
    label: "Horizontal Group",
    detail: "Horizontal multi-control container",
    scope: "UI Element",
    desc: "Container for grouping multiple inline controls horizontally into a single row.",
    defaultW: 368,
    defaultH: 48
  },
  {
    isRaw: true,
    kind: "vsegment",
    category: "Layout",
    name: "Vertical Group",
    label: "Vertical Group",
    detail: "Vertical multi-control container",
    scope: "UI Element",
    desc: "Container for stacking multiple controls vertically in a single column.",
    defaultW: 240,
    defaultH: 160
  },
  {
    isRaw: true,
    kind: "hdivider",
    category: "Layout",
    name: "Horizontal Divider",
    label: "Horizontal Divider",
    detail: "Thin horizontal dividing line",
    scope: "UI Element",
    desc: "Decorative horizontal divider line for organizing the canvas layout.",
    defaultW: 256,
    defaultH: 16
  },
  {
    isRaw: true,
    kind: "vdivider",
    category: "Layout",
    name: "Vertical Divider",
    label: "Vertical Divider",
    detail: "Thin vertical dividing line",
    scope: "UI Element",
    desc: "Decorative vertical divider line for organizing the canvas layout.",
    defaultW: 16,
    defaultH: 160
  }
];

function openInspector({ host, layout, section, ctrl, state, defaultKind, insertIndex, initialWidth, initialPos, targetCallback, forFilterKind, segmentCtrl, sourceFor, autoPick = false }) {
  document.querySelector(".lego-comfy-backdrop")?.remove();
  document.querySelector(".lego-ins-backdrop")?.remove();

  const isNew = !ctrl;
  const c = ctrl || {
    bind: "",
    label: "",
    kind: defaultKind || "slider",
    width: initialWidth || "100%",
  };

  const backdrop = el("div", "lego-comfy-backdrop");
  backdrop.addEventListener("pointerdown", eatPointer);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  const dialog = el("div", "lego-comfy-dialog");
  dialog.addEventListener("click", (e) => e.stopPropagation());

  // O picker só esconde o diálogo (display:none) e o devolve ao cancelar.
  // Remover o backdrop aqui fazia o "Cancel and return" voltar para o nada.
  const runTargetPicker = (onCancel = null) => {
    startVisualWorkflowPicker({
      host,
      backdrop,
      onCancel,
      pickNode: !!sourceFor,
      // Nó inteiro só faz sentido criando componentes, não ligando um existente.
      allowWholeNode: typeof targetCallback !== "function",
      // Criando componentes: seleção múltipla e promoção de uma vez.
      onPromote: typeof targetCallback !== "function" ? (list) => promotePicks(list) : null,
      onSelect: (target) => {
        if (!target) return;
        selectedTarget = target;
        insertSelectedTarget();
      }
    });
  };

  // 1. Barra de Busca Superior (Top Search Bar)
  const searchBar = el("div", "lego-comfy-searchbar");
  const searchIcon = el("div", "lego-comfy-search-icon");
  searchIcon.innerHTML = glyph("search", 18);
  const searchInput = el("input", "lego-comfy-search-input");
  searchInput.type = "text";
  searchInput.placeholder = sourceFor
    ? "Pick the node whose output this component shows..."
    : "Add a node or parameter... (ex: steps, image, denoise, seed)";
  searchInput.addEventListener("keydown", (e) => e.stopPropagation());

  // Target Picker (Botão primordial fixado no topo, visível 100% do tempo sem risco de scroll)
  const targetPickerBtn = el("button", "lego-comfy-target-picker-btn");
  targetPickerBtn.type = "button";
  targetPickerBtn.innerHTML = `${glyph("target", 16)}<span>Target Picker</span>`;
  targetPickerBtn.title = "Target Picker: Pick a node parameter directly on the workflow canvas";
  targetPickerBtn.addEventListener("click", () => runTargetPicker());

  const closeBtn = glyphBtn("lego-comfy-close-btn", "close", 15);
  closeBtn.title = "Close dialog (Esc)";
  closeBtn.addEventListener("click", () => backdrop.remove());

  searchBar.append(searchIcon, searchInput, targetPickerBtn, closeBtn);
  dialog.append(searchBar);

  // 2. Barra Horizontal de Filtros / Pills
  const filtersBar = el("div", "lego-comfy-filters");
  const filterPills = [
    { id: "all", label: "All" },
    { id: "raw", label: "Components", glyph: "blank" },
    { id: "inputs", label: "Inputs", glyph: "text", isCategory: true },
    { id: "media", label: "Media", glyph: "media", isCategory: true },
    { id: "output", label: "Outputs", glyph: "video", isCategory: true },
    { id: "actions", label: "Actions", glyph: "button", isCategory: true },
    { id: "layout", label: "Layout", glyph: "zone", isCategory: true },
    { id: "text", label: "Text Inputs", glyph: "text" },
    { id: "textarea", label: "Text Multilines", glyph: "textarea" },
    { id: "slider", label: "Sliders", glyph: "slider" },
    { id: "number", label: "Steppers", glyph: "number" },
    { id: "toggle", label: "Switches", glyph: "toggle" },
    { id: "combo", label: "Dropdowns", glyph: "combo" },
    { id: "video", label: "Videos", glyph: "video" },
    { id: "audio", label: "Audios", glyph: "audio" },
  ];

  // `activeCategory` é declarado adiante com `let` — atribuir aqui caía na zona
  // morta temporal e derrubava TODA abertura com `forFilterKind`, que é
  // justamente o caminho de "dar uma função ao componente".
  let activeFilter = forFilterKind || "all";
  filterPills.forEach(pill => {
    const pEl = el("div", `lego-comfy-pill${pill.isCategory ? " is-cat-pill" : ""}${pill.id === activeFilter ? " active" : ""}`);
    if (pill.glyph) pEl.innerHTML = glyph(pill.glyph, 15);
    pEl.append(document.createTextNode(pill.label));
    pEl.addEventListener("click", () => {
      filtersBar.querySelectorAll(".lego-comfy-pill").forEach(p => p.classList.remove("active"));
      pEl.classList.add("active");
      activeFilter = pill.id;
      renderList();
    });
    filtersBar.append(pEl);
  });

  dialog.append(filtersBar);

  // 3. Corpo Principal (3 Colunas)
  const body = el("div", "lego-comfy-body");

  // Coluna 1: Sidebar de Categorias
  const sidebar = el("div", "lego-comfy-sidebar");

  // Coluna 2: Lista Central de Nós / Parâmetros
  const listContainer = el("div", "lego-comfy-list");

  // Coluna 3: Painel Lateral de Detalhes
  const detailsPanel = el("div", "lego-comfy-details");

  body.append(sidebar, listContainer, detailsPanel);
  dialog.append(body);

  // Carrega todos os alvos vinculáveis
  // Output escolhe um NÓ de origem, não um widget: a lista muda, a janela não.
  const targets = sourceFor ? listOutputSourceTargets(host, sourceFor) : listBindableTargets(host);
  const currentBind = sourceFor ? String(sourceFor.source ?? "") : c.bind;
  let selectedTarget = targets.find(t => t.bind === currentBind) || targets[0] || null;
  let activeCategory = "all";
  let highlightedIndex = 0;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function cleanNodeTitle(node) {
    if (!node) return "Node";
    if (node.title && !UUID_RE.test(node.title)) return node.title;
    if (node.type && !UUID_RE.test(node.type)) return node.type;
    return `Node #${node.id}`;
  }

  function getNodeCategory(node, target) {
    if (!node) return "utilities";
    if (target.kind === "video" || (node.type && /(video|vhs|animate|mov)/i.test(node.type)) || (target.name && /(video|fps|frame_rate)/i.test(target.name))) {
      return "video";
    }
    if (target.kind === "audio" || (node.type && /(audio|sound|speech|voice|tts)/i.test(node.type)) || (target.name && /(audio|sound|waveform)/i.test(target.name))) {
      return "audio";
    }
    if (target.kind === "media" || (node.type && /image/i.test(node.type)) || (target.name && /image/i.test(target.name))) {
      return "image";
    }
    if ((node.type && /(sampler|k-sampler|denoise|steps|cfg|scheduler)/i.test(node.type)) || (target.name && /(steps|denoise|cfg|sampler_name|scheduler|seed)/i.test(target.name))) {
      return "sampling";
    }
    if ((node.type && /(model|checkpoint|lora|vae|clip|unet|diffusion)/i.test(node.type)) || (target.name && /(ckpt_name|lora_name|vae_name|model)/i.test(target.name))) {
      return "model";
    }
    if (target.kind === "textarea" || (node.type && /(string|prompt|text|primitive)/i.test(node.type)) || (target.name && /(prompt|text|string)/i.test(target.name))) {
      return "text";
    }
    if (target.kind === "slider" || target.kind === "number" || target.kind === "toggle" || target.kind === "combo") {
      return "controls";
    }
    return "utilities";
  }

  // Monta as categorias da Sidebar (Estilo ComfyUI Nativo)
  function renderSidebar() {
    sidebar.replaceChildren();

    // 0. Ação rápida Target Picker no topo da barra lateral
    const sidePicker = el("div", "lego-sidebar-target-picker-btn");
    sidePicker.innerHTML = `${glyph("target", 15)}<span>Target Picker</span>`;
    sidePicker.title = "Target Picker: Pick a node parameter directly on the workflow canvas";
    sidePicker.addEventListener("click", () => runTargetPicker());
    sidebar.append(sidePicker);

    // 1. Botão 'Most relevant' no topo da sidebar
    const topMostRelevant = el("div", `lego-comfy-cat-top-btn${activeCategory === "all" ? " active" : ""}`);
    const topLabel = el("span", null, "Most relevant");
    const topBadge = el("span", "lego-comfy-cat-badge", String(targets.length + RAW_UI_ELEMENTS.length));
    topMostRelevant.append(topLabel, topBadge);
    topMostRelevant.addEventListener("click", () => {
      activeCategory = "all";
      sidebar.querySelectorAll(".lego-comfy-cat-top-btn, .lego-comfy-cat-item").forEach(i => i.classList.remove("active"));
      topMostRelevant.classList.add("active");
      renderList();
    });
    sidebar.append(topMostRelevant);

    // 1.1 Categoria Elementos Crus (UI Elements)
    const rawCategoryItem = el("div", `lego-comfy-cat-item${activeCategory === "raw" ? " active" : ""}`);
    const rLabel = el("span", "lego-comfy-cat-label", "Components");
    const rBadge = el("span", "lego-comfy-cat-badge", String(RAW_UI_ELEMENTS.length));
    rawCategoryItem.append(rLabel, rBadge);
    rawCategoryItem.title = "UI Components (Switch, Stepper, Slider, Dropdown, etc.)";
    rawCategoryItem.addEventListener("click", () => {
      activeCategory = "raw";
      sidebar.querySelectorAll(".lego-comfy-cat-top-btn, .lego-comfy-cat-item").forEach(i => i.classList.remove("active"));
      rawCategoryItem.classList.add("active");
      renderList();
    });
    sidebar.append(rawCategoryItem);

    // 2. Parâmetros Promovidos do Nó Atual (Host)
    const hostTargets = targets.filter(t => t.node === host);
    if (hostTargets.length > 0) {
      const hostItem = el("div", `lego-comfy-cat-item${activeCategory === "host" ? " active" : ""}`);
      const hostName = cleanNodeTitle(host);
      const hLabel = el("span", "lego-comfy-cat-label", `\u2605 ${hostName}`);
      const hBadge = el("span", "lego-comfy-cat-badge", String(hostTargets.length));
      hostItem.append(hLabel, hBadge);
      hostItem.title = `${hostName} (#${host.id}) - Current Node Parameters`;
      hostItem.addEventListener("click", () => {
        activeCategory = "host";
        sidebar.querySelectorAll(".lego-comfy-cat-top-btn, .lego-comfy-cat-item").forEach(i => i.classList.remove("active"));
        hostItem.classList.add("active");
        renderList();
      });
      sidebar.append(hostItem);
    }

    // 3. Categorias Nativas do ComfyUI
    const catHeader = el("div", "lego-comfy-cat-header", "Categories");
    sidebar.append(catHeader);

    const categoriesDef = [
      { id: "cat:image", label: "image", icon: "media" },
      { id: "cat:video", label: "video", icon: "video" },
      { id: "cat:audio", label: "audio", icon: "audio" },
      { id: "cat:sampling", label: "sampling", icon: "settings" },
      { id: "cat:model", label: "model", icon: "model" },
      { id: "cat:text", label: "text", icon: "textarea" },
      { id: "cat:controls", label: "controls", icon: "slider" },
      { id: "cat:utilities", label: "utilities", icon: "grid" },
    ];

    categoriesDef.forEach(cat => {
      const catTargets = targets.filter(t => `cat:${getNodeCategory(t.node, t)}` === cat.id);
      if (catTargets.length === 0) return;

      const item = el("div", `lego-comfy-cat-item${activeCategory === cat.id ? " active" : ""}`);
      const cLabel = el("span", "lego-comfy-cat-label");
      cLabel.innerHTML = glyph(cat.icon, 14);
      cLabel.append(document.createTextNode(` ${cat.label}`));
      const cBadge = el("span", "lego-comfy-cat-badge", String(catTargets.length));
      item.append(cLabel, cBadge);
      item.title = `Category ${cat.label} (${catTargets.length} parameters)`;
      item.addEventListener("click", () => {
        activeCategory = cat.id;
        sidebar.querySelectorAll(".lego-comfy-cat-top-btn, .lego-comfy-cat-item").forEach(i => i.classList.remove("active"));
        item.classList.add("active");
        renderList();
      });
      sidebar.append(item);
    });

    // 4. Nós do Workflow (Limpos, Agrupados e Sem UUIDs)
    const workflowNodes = targets.filter(t => t.node !== host);
    if (workflowNodes.length > 0) {
      const nodeHeader = el("div", "lego-comfy-cat-header", "Workflow Nodes");
      sidebar.append(nodeHeader);

      const nodeGroups = new Map();
      workflowNodes.forEach(t => {
        const title = cleanNodeTitle(t.node);
        if (!nodeGroups.has(title)) {
          nodeGroups.set(title, { title, nodes: new Set(), targets: [] });
        }
        const grp = nodeGroups.get(title);
        grp.nodes.add(t.node.id);
        grp.targets.push(t);
      });

      nodeGroups.forEach(grp => {
        const grpId = `grp:${grp.title}`;
        const item = el("div", `lego-comfy-cat-item${activeCategory === grpId ? " active" : ""}`);
        const nLabel = el("span", "lego-comfy-cat-label", grp.title);
        const nBadge = el("span", "lego-comfy-cat-badge", String(grp.targets.length));
        item.append(nLabel, nBadge);

        const countInfo = grp.nodes.size > 1 ? `${grp.nodes.size} nodes` : `#${Array.from(grp.nodes)[0]}`;
        item.title = `${grp.title} (${countInfo}) · ${grp.targets.length} parameters`;
        item.addEventListener("click", () => {
          activeCategory = grpId;
          sidebar.querySelectorAll(".lego-comfy-cat-top-btn, .lego-comfy-cat-item").forEach(i => i.classList.remove("active"));
          item.classList.add("active");
          renderList();
        });
        sidebar.append(item);
      });
    }
  }

  // Renderiza a Lista Central de Resultados
  let filteredTargets = [];
  function renderList() {
    listContainer.replaceChildren();
    const query = (searchInput.value || "").trim().toLowerCase();

    // Combina elementos crus de interface e nós do workflow
    const allPool = [...RAW_UI_ELEMENTS, ...targets];

    filteredTargets = allPool.filter(t => {
      if (t.isRaw) {
        // Quando estamos vinculando um elemento existente (targetCallback), não mostrar elementos crus
        if (typeof targetCallback === "function") return false;
        if (activeCategory !== "all" && activeCategory !== "raw") return false;
        if (activeFilter === "inputs") {
          const isInput = t.kind === "text" || t.kind === "textarea" || t.kind === "slider" || t.kind === "number" || t.kind === "toggle" || t.kind === "combo";
          if (!isInput) return false;
        } else if (activeFilter === "media") {
          const isMed = isMediaKind(t.kind);
          if (!isMed) return false;
        } else if (activeFilter === "output") {
          if (!isOutputKind(t.kind)) return false;
        } else if (activeFilter === "actions") {
          if (t.kind !== "button") return false;
        } else if (activeFilter === "layout") {
          const isLay = t.kind === "label" || t.kind === "segment" || t.kind === "vsegment" || t.kind === "hdivider" || t.kind === "vdivider";
          if (!isLay) return false;
        } else if (activeFilter !== "all" && activeFilter !== "raw" && t.kind !== activeFilter) {
          return false;
        }
        if (!query) return true;
        return (t.name && t.name.toLowerCase().includes(query)) ||
               (t.label && t.label.toLowerCase().includes(query)) ||
               (t.detail && t.detail.toLowerCase().includes(query));
      }

      if (activeCategory === "raw" || activeFilter === "raw") return false;

      // Filtro por Categoria ou Nó da Sidebar
      if (activeCategory === "host") {
        if (t.node !== host) return false;
      } else if (activeCategory.startsWith("cat:")) {
        const targetCat = `cat:${getNodeCategory(t.node, t)}`;
        if (targetCat !== activeCategory) return false;
      } else if (activeCategory.startsWith("grp:")) {
        const grpTitle = activeCategory.slice(4);
        if (cleanNodeTitle(t.node) !== grpTitle) return false;
      }

      // Filtro por Pill Horizontal do Topo (activeFilter)
      if (activeFilter === "inputs") {
        const isInput = t.kind === "text" || t.kind === "textarea" || t.kind === "slider" || t.kind === "number" || t.kind === "toggle" || t.kind === "combo";
        if (!isInput) return false;
      } else if (activeFilter === "media") {
        const isMed = isMediaKind(t.kind);
        if (!isMed) return false;
      } else if (activeFilter === "actions") {
        if (t.kind !== "button") return false;
      } else if (activeFilter === "layout") {
        return false;
      } else if (activeFilter !== "all" && t.kind !== activeFilter) {
        return false;
      }

      // Filtro por Barra de Busca (query)
      if (!query) return true;
      return (t.detail && t.detail.toLowerCase().includes(query)) ||
             (t.label && t.label.toLowerCase().includes(query)) ||
             (t.name && t.name.toLowerCase().includes(query)) ||
             (t.node.title && t.node.title.toLowerCase().includes(query)) ||
             (t.node.type && t.node.type.toLowerCase().includes(query));
    });

    if (!filteredTargets.length) {
      const empty = el("div", null, "No parameters or nodes found matching these terms.");
      empty.style.padding = "24px 16px";
      empty.style.color = "var(--lego-dim)";
      empty.style.fontSize = "12px";
      empty.style.textAlign = "center";
      listContainer.append(empty);
      return;
    }

    if (!selectedTarget || !filteredTargets.includes(selectedTarget)) {
      selectedTarget = filteredTargets[0];
    }
    highlightedIndex = Math.max(0, filteredTargets.indexOf(selectedTarget));

    filteredTargets.forEach((t, idx) => {
      const isSel = t === selectedTarget;
      const row = el("div", `lego-comfy-node-row${isSel ? " active" : ""}${t.isRaw ? " is-raw-element" : ""}`);

      const left = el("div", "lego-comfy-node-left");
      const titleEl = el("div", "lego-comfy-node-title", t.label || t.name);
      const subEl = el("div", "lego-comfy-node-sub", `${t.detail} · ${t.scope}`);
      left.append(titleEl, subEl);

      const badges = el("div", "lego-comfy-node-badges");
      if (t.isRaw) {
        const catBadge = t.category || "ELEMENT";
        badges.append(el("span", "lego-comfy-badge primary", catBadge.toUpperCase()));
        badges.append(el("span", "lego-comfy-badge", t.kind.toUpperCase()));
      } else {
        badges.append(el("span", "lego-comfy-badge primary", t.kind.toUpperCase()));
        if (t.node === host) badges.append(el("span", "lego-comfy-badge", "HOST"));
        else badges.append(el("span", "lego-comfy-badge", `#${t.node.id}`));
      }

      row.append(left, badges);

      row.addEventListener("click", () => {
        selectedTarget = t;
        highlightedIndex = idx;
        listContainer.querySelectorAll(".lego-comfy-node-row").forEach(r => r.classList.remove("active"));
        row.classList.add("active");
        renderDetails();
      });

      // Duplo clique insere imediatamente!
      row.addEventListener("dblclick", () => {
        selectedTarget = t;
        insertSelectedTarget();
      });

      listContainer.append(row);
    });

    renderDetails();
  }

  // Cores oficiais dos sockets do ComfyUI
  const COMFY_SOCKET_COLORS = {
    model: "#b56576",
    conditioning: "#e0a96d",
    latent: "#e056fd",
    image: "#686de0",
    clip: "#f0932b",
    vae: "#eb4d4b",
    mask: "#00a8ff",
    control_net: "#2ed573",
    int: "#7f8c8d",
    float: "#7f8c8d",
    string: "#2ecc71",
    boolean: "#9b59b6",
    combo: "#34495e",
    generic: "#95a5a6"
  };

  function getSocketColor(type) {
    if (!type) return COMFY_SOCKET_COLORS.generic;
    const lower = String(type).toLowerCase().replace(/[^a-z0-9_]/g, "");
    return COMFY_SOCKET_COLORS[lower] || COMFY_SOCKET_COLORS.generic;
  }

  // Cache de definições nativas
  const nativeNodeDefsCache = new Map();

  async function getNativeNodeDef(nodeType) {
    if (!nodeType) return null;
    if (nativeNodeDefsCache.has(nodeType)) return nativeNodeDefsCache.get(nodeType);
    if (window.app?.nodeDefs && window.app.nodeDefs[nodeType]) {
      nativeNodeDefsCache.set(nodeType, window.app.nodeDefs[nodeType]);
      return window.app.nodeDefs[nodeType];
    }
    try {
      const res = await api.fetchApi(`/object_info/${encodeURIComponent(nodeType)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data[nodeType]) {
          nativeNodeDefsCache.set(nodeType, data[nodeType]);
          return data[nodeType];
        }
      }
    } catch (e) {
      console.warn("[SuperSubgraph] Error loading nodeDef for", nodeType, e);
    }
    return null;
  }

  // Renderiza EXCLUSIVAMENTE A RENDERIZAÇÃO FIEL DO NÓ A SER USADO (sem ficha técnica!)
  function renderDetails() {
    detailsPanel.replaceChildren();
    if (!selectedTarget) return;

    const t = selectedTarget;
    const node = t.node || host;
    const nodeType = node.type || node.comfyClass || t.name;
    const cleanTitle = cleanNodeTitle(node);

    // 1. Header do Painel Lateral
    const detHead = el("div", "lego-comfy-det-header");
    detHead.append(el("div", "lego-comfy-det-title", t.label || t.name));
    detHead.append(el("div", "lego-comfy-det-category", `${t.kind.toUpperCase()} · ${t.scope}`));
    detailsPanel.append(detHead);

    // Se for um elemento cru de interface, exibe o preview do elemento interativo
    if (t.isRaw) {
      const rawBox = el("div", "lego-raw-preview-box");
      const titleEl = el("div", null, t.label);
      titleEl.style.cssText = "font-size:16px; font-weight:600; color:#fff;";

      const previewContainer = el("div", "lego-raw-preview-ctrl");

      if (t.kind === "segment") {
        previewContainer.innerHTML = `
          <div class="lego-segment-box horizontal" style="height:42px;">
            <div class="lego-segment-item kind-toggle"><div class="lego-sw on"></div></div>
            <div class="lego-segment-item kind-text"><span>Steps:</span></div>
            <div class="lego-segment-item kind-number">
              <div class="lego-step-number"><button class="lego-step-btn">−</button><input class="lego-step-input" value="20"><button class="lego-step-btn">+</button></div>
            </div>
            <div class="lego-segment-item kind-combo" style="flex:1;">
              <div class="lego-in" style="height:28px; display:flex; align-items:center; justify-content:space-between; padding:0 8px; font-size:11px;"><span>euler</span><span class="lego-glyph-wrap">${glyph("chevron", 12)}</span></div>
            </div>
          </div>
        `;
      } else if (t.kind === "vsegment") {
        previewContainer.innerHTML = `
          <div class="lego-segment-box vertical" style="height:112px; display:flex; flex-direction:column; gap:6px; padding:8px 10px;">
            <div class="lego-segment-item kind-toggle" style="display:flex; justify-content:space-between; width:100%; align-items:center;">
              <span style="font-size:12px; font-weight:600; color:var(--lego-dim,#94a3b8);">Active:</span>
              <div class="lego-sw on"></div>
            </div>
            <div class="lego-segment-item kind-number" style="display:flex; justify-content:space-between; width:100%; align-items:center;">
              <span style="font-size:12px; font-weight:600; color:var(--lego-dim,#94a3b8);">Steps:</span>
              <div class="lego-step-number" style="height:26px;"><button class="lego-step-btn" style="width:22px;">−</button><input class="lego-step-input" value="20" style="width:36px;"><button class="lego-step-btn" style="width:22px;">+</button></div>
            </div>
            <div class="lego-segment-item kind-combo" style="width:100%;">
              <div class="lego-in" style="height:28px; display:flex; align-items:center; justify-content:space-between; padding:0 8px; font-size:11px;"><span>euler</span><span class="lego-glyph-wrap">${glyph("chevron", 12)}</span></div>
            </div>
          </div>
        `;
      } else if (t.kind === "hdivider") {
        previewContainer.innerHTML = `
          <div style="padding: 32px 12px; display:flex; align-items:center; width:100%;">
            <div style="width:100%; height:1px; background:rgba(255,255,255,0.25); border-radius:1px;"></div>
          </div>
        `;
      } else if (t.kind === "vdivider") {
        previewContainer.innerHTML = `
          <div style="padding: 12px 32px; display:flex; justify-content:center; height:100px;">
            <div style="height:100%; width:1px; background:rgba(255,255,255,0.25); border-radius:1px;"></div>
          </div>
        `;
      } else if (t.kind === "number") {
        previewContainer.innerHTML = `
          <div class="lego-step-number" style="height:36px; width:100%; max-width:180px; margin:0 auto;">
            <button class="lego-step-btn" style="width:36px; font-size:16px;">−</button>
            <input class="lego-step-input" value="20" style="font-size:14px; flex:1;">
            <button class="lego-step-btn" style="width:36px; font-size:16px;">+</button>
          </div>
        `;
      } else if (t.kind === "toggle") {
        previewContainer.innerHTML = `<div style="display:flex; justify-content:center;"><div class="lego-sw on"></div></div>`;
      } else if (t.kind === "combo") {
        previewContainer.innerHTML = `<div class="lego-in" style="height:36px; display:flex; align-items:center; justify-content:space-between; padding:0 12px; font-size:13px;"><span>Selected Option</span><span class="lego-glyph-wrap">${glyph("chevron", 12)}</span></div>`;
      } else if (t.kind === "slider") {
        previewContainer.innerHTML = `
          <div class="lego-slider">
            <div class="lego-track"><div class="lego-fill" style="width:65%;"></div><div class="lego-knob" style="left:65%;"></div></div>
            <input class="lego-in lego-num" value="0.65" style="width:60px;">
          </div>
        `;
      } else if (t.kind === "media") {
        previewContainer.innerHTML = `
          <div class="lego-media-box" style="height:86px; pointer-events:none;">
            <div class="lego-media-thumb" style="width:68px; height:100%; border-radius:7px;">
              <span class="lego-glyph-wrap" style="opacity:0.6;">${glyph("media", 26)}</span>
            </div>
            <div class="lego-media-bar" style="display:flex; flex-direction:row; align-items:center; gap:6px; width:100%;">
              <div class="lego-media-select lego-combo-btn" style="flex:1; min-width:0;"><span class="lego-combo-label">sample_image.png</span><span class="lego-combo-chevron">${glyph("chevron", 12)}</span></div>
              <div class="lego-media-upload-btn" title="Browse / Upload file">${glyph("folderSearch", 15)}</div>
            </div>
          </div>
        `;
      } else if (t.kind === "video") {
        previewContainer.innerHTML = `
          <div class="lego-media-box" style="height:86px; pointer-events:none;">
            <div class="lego-media-thumb" style="width:68px; height:100%; border-radius:7px;">
              <span class="lego-glyph-wrap" style="opacity:0.6;">${glyph("video", 26)}</span>
            </div>
            <div class="lego-media-bar" style="display:flex; flex-direction:row; align-items:center; gap:6px; width:100%;">
              <div class="lego-media-select lego-combo-btn" style="flex:1; min-width:0;"><span class="lego-combo-label">sample_video.mp4</span><span class="lego-combo-chevron">${glyph("chevron", 12)}</span></div>
              <div class="lego-media-upload-btn" title="Browse / Upload file">${glyph("folderSearch", 15)}</div>
            </div>
          </div>
        `;
      } else if (t.kind === "audio") {
        previewContainer.innerHTML = `
          <div class="lego-media-box tall" style="height:106px; pointer-events:none;">
            <div class="lego-media-thumb" style="width:100%; flex:1; border-radius:7px; position:relative; overflow:hidden;">
              <div class="lego-audio-player" style="display:flex; padding:6px 10px; gap:5px;">
                <div class="lego-audio-visualizer" style="height:18px;">
                  <div class="lego-audio-vbar" style="height:5px;"></div>
                  <div class="lego-audio-vbar" style="height:11px;"></div>
                  <div class="lego-audio-vbar" style="height:17px; background:var(--lego-accent);"></div>
                  <div class="lego-audio-vbar" style="height:13px; background:var(--lego-accent);"></div>
                  <div class="lego-audio-vbar" style="height:19px; background:var(--lego-accent);"></div>
                  <div class="lego-audio-vbar" style="height:9px;"></div>
                  <div class="lego-audio-vbar" style="height:15px;"></div>
                  <div class="lego-audio-vbar" style="height:7px;"></div>
                </div>
                <div class="lego-audio-controls" style="gap:6px;">
                  <div class="lego-audio-play-btn" style="width:24px; height:24px;">${glyph("play", 11)}</div>
                  <div class="lego-audio-timeline" style="height:14px;">
                    <div class="lego-audio-rail"><div class="lego-audio-progress" style="width:38%;"></div></div>
                    <div class="lego-audio-knob" style="left:38%; width:10px; height:10px;"></div>
                  </div>
                  <div class="lego-audio-time" style="font-size:10px;">0:14 / 0:42</div>
                </div>
              </div>
            </div>
            <div class="lego-media-bar" style="display:flex; flex-direction:row; align-items:center; gap:6px; width:100%;">
              <div class="lego-media-select lego-combo-btn" style="flex:1; min-width:0;"><span class="lego-combo-label">sample_audio.wav</span><span class="lego-combo-chevron">${glyph("chevron", 12)}</span></div>
              <div class="lego-media-upload-btn" title="Browse / Upload file">${glyph("folderSearch", 15)}</div>
            </div>
          </div>
        `;
      } else if (t.kind === "label") {
        previewContainer.innerHTML = `
          <div style="padding: 18px 12px; display:flex; align-items:center;">
            <span style="font-size:14px; font-weight:600; color:var(--lego-text); letter-spacing:0.02em;">Sample Section Label</span>
          </div>
        `;
      } else if (t.kind === "textarea") {
        previewContainer.innerHTML = `<textarea class="lego-in" style="height:70px; resize:none;" placeholder="Text Multiline / Prompt..."></textarea>`;
      } else if (isOutputKind(t.kind)) {
        const m = OUTPUT_KINDS[t.kind];
        previewContainer.innerHTML = `
          <div class="lego-out-box is-${m}" style="height:${m === "audio" ? 80 : 150}px;">
            <div class="lego-out-stage"><div class="lego-out-empty">${glyph(m === "image" ? "media" : m, 26)}<span>Latest ${m} output appears here</span></div></div>
          </div>
        `;
      } else if (t.kind === "button") {
        previewContainer.innerHTML = `<button class="lego-btn primary" style="height:36px; padding:0 20px; font-size:13px; font-weight:600; border-radius:6px; cursor:pointer;">Action Button</button>`;
      } else {
        previewContainer.innerHTML = `<input class="lego-in" value="Sample Text">`;
      }

      const descEl = el("div", "lego-raw-desc-text", t.desc);
      const hintText = (t.kind === "hdivider" || t.kind === "vdivider" || t.kind === "label")
        ? "Cosmetic element for organizing and annotating sections on the canvas. Does not require any workflow parameter."
        : (t.kind === "segment" || t.kind === "vsegment")
          ? "Container for grouping multiple controls. Drop into the form, then click [+] to add sub-controls."
          : isOutputKind(t.kind)
          ? "Works right away: shows the latest output of this type from inside the subgraph. Use the chain icon or Object Properties to pin a specific node."
          : "After dropping the component into the form, click it to assign a function — the workflow parameter it will control.";
      const hint = el("div", null, hintText);
      hint.style.cssText = "font-size:11.5px; color:#38bdf8; background:rgba(56,189,248,0.1); padding:8px 12px; border-radius:6px; line-height:1.4;";

      rawBox.append(titleEl, previewContainer, descEl, hint);
      detailsPanel.append(rawBox);

      const submitBtn = el("button", "lego-comfy-det-btn");
      submitBtn.innerHTML = `${glyph("plus", 15)}<span>Add ${esc(t.label)} to form</span>`;
      submitBtn.addEventListener("click", insertSelectedTarget);
      detailsPanel.append(submitBtn);
      return;
    }

    // 2. Área Canvas de Renderização Fiel do Nó
    const canvasArea = el("div", "lego-faithful-canvas-area");
    detailsPanel.append(canvasArea);

    const loadingEl = el("div", null, "Rendering real node...");
    loadingEl.style.cssText = "color: #a1a1aa; font-size: 13px; padding: 24px 0;";
    canvasArea.append(loadingEl);

    getNativeNodeDef(nodeType).then(nodeDef => {
      const def = nodeDef || {
        name: nodeType,
        display_name: cleanTitle,
        input: {
          required: (node.inputs || []).reduce((acc, inp) => {
            acc[inp.name] = [inp.type || "GENERIC", {}];
            return acc;
          }, (node.widgets || []).reduce((acc, w) => {
            acc[w.name] = [(w.type || "COMBO").toUpperCase(), { default: w.value }];
            return acc;
          }, {}))
        },
        output: (node.outputs || []).map(o => o.type || "GENERIC"),
        output_name: (node.outputs || []).map(o => o.name || "output")
      };

      canvasArea.replaceChildren();

      // Separação de Sockets de Conexão vs Widgets
      const allInputsReq = def.input?.required || {};
      const allInputsOpt = def.input?.optional || {};
      const allInputs = { ...allInputsReq, ...allInputsOpt };

      const socketsIn = [];
      const widgets = [];

      for (const [paramName, spec] of Object.entries(allInputs)) {
        const typeSpec = spec[0];
        const extra = (spec.length > 1 && typeof spec[1] === "object") ? spec[1] : {};

        if (Array.isArray(typeSpec)) {
          widgets.push({
            name: paramName,
            type: "COMBO",
            options: typeSpec,
            defaultVal: extra.default || typeSpec[0] || ""
          });
        } else if (["INT", "FLOAT"].includes(typeSpec)) {
          widgets.push({
            name: paramName,
            type: typeSpec,
            defaultVal: extra.default !== undefined ? extra.default : 0
          });
        } else if (typeSpec === "BOOLEAN") {
          widgets.push({
            name: paramName,
            type: "BOOLEAN",
            defaultVal: extra.default !== undefined ? extra.default : false
          });
        } else if (typeSpec === "STRING") {
          widgets.push({
            name: paramName,
            type: "STRING",
            defaultVal: extra.default || ""
          });
        } else {
          socketsIn.push({
            name: paramName,
            type: String(typeSpec)
          });
        }
      }

      // Se o nó real tiver inputs adicionais conectados no workflow, inclui
      (node.inputs || []).forEach(inp => {
        if (!socketsIn.some(s => s.name === inp.name)) {
          socketsIn.push({ name: inp.name, type: inp.type || "GENERIC" });
        }
      });

      const socketsOut = [];
      const outputs = def.output || [];
      const outputNames = def.output_name || outputs;
      for (let i = 0; i < outputs.length; i++) {
        socketsOut.push({
          name: outputNames[i] || outputs[i],
          type: outputs[i]
        });
      }
      (node.outputs || []).forEach(out => {
        if (!socketsOut.some(s => s.name === out.name)) {
          socketsOut.push({ name: out.name, type: out.type || "GENERIC" });
        }
      });

      // ══════════════════════════════════════════════════════════════════════
      // CONSTRUÇÃO DO NÓ FIEL DO COMFYUI
      // ══════════════════════════════════════════════════════════════════════
      const nodeEl = el("div", "lego-faithful-node");

      // 1. Header do Nó (com a cor real do nó no workflow)
      const header = el("div", "lego-faithful-header");
      if (node.color) {
        header.style.background = node.color;
      }
      const titleWrap = el("div", "lego-faithful-title-wrap");
      titleWrap.append(el("div", "lego-faithful-dot"));
      titleWrap.append(el("div", "lego-faithful-title", cleanTitle || def.display_name));
      const badge = el("div", "lego-faithful-id-badge", `#${node.id}`);
      header.append(titleWrap, badge);
      nodeEl.append(header);

      // 2. Corpo do Nó
      const body = el("div", "lego-faithful-body");

      // Sockets de Conexão (Inputs à esquerda, Outputs à direita)
      const maxSlots = Math.max(socketsIn.length, socketsOut.length);
      for (let i = 0; i < maxSlots; i++) {
        const row = el("div", "lego-faithful-slot-row");
        const sIn = socketsIn[i];
        const sOut = socketsOut[i];

        if (sIn) {
          const inEl = el("div", "lego-faithful-slot-in");
          const sock = el("div", "lego-faithful-socket");
          sock.style.background = getSocketColor(sIn.type);
          inEl.append(sock, el("span", null, sIn.name));
          row.append(inEl);
        }

        if (sOut) {
          const outEl = el("div", "lego-faithful-slot-out");
          const sock = el("div", "lego-faithful-socket");
          sock.style.background = getSocketColor(sOut.type);
          outEl.append(sock, el("span", null, sOut.name));
          row.append(outEl);
        }

        body.append(row);
      }

      // Widgets Fiéis do Nó (com valores reais do workflow)
      widgets.forEach(w => {
        const isSelected = (w.name === t.name);
        const wRow = el("div", `lego-faithful-widget${isSelected ? " selected" : ""}`);

        const nameEl = el("div", "lego-faithful-widget-name");
        nameEl.append(document.createTextNode(prettify(w.name)));
        if (isSelected) {
          nameEl.append(el("span", "lego-faithful-target-pill", "CONTROLLED"));
        }

        let curVal = w.defaultVal;
        const actualWidget = (node.widgets || []).find(nw => nw.name === w.name);
        if (actualWidget && actualWidget.value !== undefined) {
          curVal = actualWidget.value;
        }

        if (typeof curVal === "boolean") curVal = curVal ? "True" : "False";
        else if (typeof curVal === "number") curVal = String(curVal);
        else if (typeof curVal === "object") curVal = JSON.stringify(curVal);

        const ctrlEl = el("div", "lego-faithful-widget-ctrl");
        if (w.type === "COMBO") {
          ctrlEl.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(curVal)}</span><span class="lego-glyph-wrap" style="opacity:0.6;">${glyph("chevron", 12)}</span>`;
        } else {
          ctrlEl.textContent = String(curVal);
        }

        wRow.append(nameEl, ctrlEl);
        body.append(wRow);
      });

      nodeEl.append(body);
      // Prefere o nó desenhado pelo LiteGraph; a réplica em HTML fica só como
      // reserva para o caso de o desenho falhar.
      const noReal = renderRealNode(node);
      canvasArea.append(noReal || nodeEl);

      // Resumo Compacto
      const summary = el("div", "lego-faithful-summary");
      summary.innerHTML = `
        <div>Target: <strong style="color: #38bdf8;">${esc(t.name)}</strong> (${esc(t.kind)})</div>
        <div>Node: <strong>${esc(cleanTitle)}</strong> (#${esc(node.id)}) · <em>${esc(node.type || 'Custom')}</em></div>
      `;
      canvasArea.append(summary);
    });

    // 3. Botão Largo de Inserção / Salvar
    const submitBtn = el("button", "lego-comfy-det-btn");
    if (segmentCtrl) {
      const isVert = segmentCtrl.kind === "vsegment";
      submitBtn.innerHTML = `${glyph("plus", 15)}<span>Add to ${isVert ? "vertical group" : "group"}</span>`;
    } else if (typeof targetCallback === "function") {
      submitBtn.innerHTML = sourceFor
        ? `${glyph("link", 15)}<span>Show this node's output</span>`
        : `${glyph("link", 15)}<span>Assign function to component</span>`;
    } else {
      submitBtn.innerHTML = isNew
        ? `${glyph("plus", 15)}<span>Insert into form</span>`
        : `${glyph("check", 15)}<span>Save changes</span>`;
    }
    submitBtn.addEventListener("click", insertSelectedTarget);
    detailsPanel.append(submitBtn);

    // Atalho: o nó deste parâmetro inteiro, como widget pronto.
    if (typeof targetCallback !== "function" && t.node && (t.node.widgets || []).some(usable)) {
      const wholeRow = el("div", "lego-whole-node-opts in-details");
      for (const [orientation, label, g] of [["row", "Whole node — row", "hgroup"], ["column", "Whole node — column", "vgroup"]]) {
        const b = el("button", "lego-whole-node-btn");
        b.innerHTML = `${glyph(g, 14)}<span>${esc(label)}</span>`;
        b.title = `All parameters of ${cleanTitle} (#${node.id}) as one widget`;
        b.addEventListener("click", () => insertWholeNode(t.node, orientation));
        wholeRow.append(b);
      }
      detailsPanel.append(wholeRow);
    }
  }

  /**
   * Promove de uma vez o que foi marcado no Target Picker: nó inteiro vira um
   * widget "nó inteiro"; parâmetro solto vira um componente próprio. Entram
   * empilhados a partir do ponto de onde o seletor foi aberto — ou, vindo do
   * "+ Add" de um grupo, como itens dele.
   */
  function promotePicks(list) {
    if (!list?.length) return;
    pushUndo(host);
    const layout = host.properties[PROP];
    const created = [];
    if (segmentCtrl) {
      if (!Array.isArray(segmentCtrl.items)) segmentCtrl.items = [];
      for (const p of list) {
        const only = p.whole ? null : p.widgets;
        const tmp = renameClone(layout, { kind: "segment", items: wholeNodeItems(host, p.node, only) });
        segmentCtrl.items.push(...tmp.items);
      }
      if (segmentCtrl.name) created.push(segmentCtrl.name);
    } else {
      const zoneList = section.controls || (section.controls = []);
      // Os componentes saem arrumados: na ordem em que os nós estão no canvas
      // (de cima para baixo, da esquerda para a direita), lado a lado até a
      // largura da zona e então uma linha nova, alinhados na grade.
      const ctrls = [];
      const rowOf = (n) => Math.round((n.pos?.[1] || 0) / 80);
      const sorted = [...list].sort((a, b) => (rowOf(a.node) - rowOf(b.node)) || ((a.node.pos?.[0] || 0) - (b.node.pos?.[0] || 0)));
      for (const p of sorted) {
        if (p.whole) { ctrls.push(buildWholeNodeCtrl(host, p.node, "row", { x: 0, y: 0 })); continue; }
        for (const w of (p.node.widgets || []).filter((x) => p.widgets.has(x.name))) ctrls.push({ ...singleCtrlFor(host, p.node, w), x: 0, y: 0 });
      }
      // Nomes únicos entre si também: todos nascem antes de entrar na zona.
      const reserved = new Set();
      for (const c of ctrls) renameClone(layout, c, reserved);
      const zoneEl = [...(host.__legoHost?.querySelectorAll(".lego-sec-controls") || [])].find((b) => b.__legoList === zoneList);
      // O cartão fica escondido durante o Target Picker (clientWidth 0) e o nó
      // vai alargar para caber o componente mais largo de qualquer jeito:
      // os demais se arrumam lado a lado dentro dessa largura.
      const widest = Math.max(0, ...ctrls.map((c) => Math.ceil((c.w || 256) / GRID) * GRID));
      const availW = Math.max(320, widest, (zoneEl?.clientWidth || (host.size?.[0] || MIN_W) - 72) - GRID);
      const block = packInRows(ctrls, availW, GRID);
      // Começa onde o seletor foi aberto; se isso cobrir o que já existe na
      // zona, o bloco inteiro vai para baixo do conteúdo atual.
      let x0 = initialPos?.x ?? 16, y0 = initialPos?.y ?? 16;
      const hits = (dx, dy) => ctrls.some((c) => zoneList.some((o) =>
        c.x + dx < (o.x || 0) + (o.w || 256) && c.x + dx + c.w > (o.x || 0) &&
        c.y + dy < (o.y || 0) + (o.h || 46) && c.y + dy + c.h > (o.y || 0)));
      if (x0 + block.w > availW + GRID) x0 = 16;
      if (hits(x0, y0)) {
        x0 = 16;
        y0 = Math.max(16, ...zoneList.map((o) => (o.y || 0) + (o.h || 46) + GRID));
      }
      x0 = Math.round(x0 / GRID) * GRID;
      y0 = Math.round(y0 / GRID) * GRID;
      for (const c of ctrls) {
        c.x += x0;
        c.y += y0;
        zoneList.push(c);
        ensureComponentName(layout, c);
        created.push(c.name);
      }
    }
    state.selectedNames = new Set(created);
    state.selectedName = created[created.length - 1] || null;
    backdrop.remove();
    state.refresh();
    showLegoToast(`Promoted ${created.length} item${created.length === 1 ? "" : "s"}`);
  }

  /** Insere o nó inteiro: como grupo novo, ou como itens do grupo aberto. */
  function insertWholeNode(node, orientation) {
    if (!node) return;
    pushUndo(host);
    const layout = host.properties[PROP];
    if (segmentCtrl) {
      // Dentro de um grupo não cabe outro grupo: entram os itens.
      const tmp = renameClone(layout, { kind: "segment", items: wholeNodeItems(host, node) });
      if (!Array.isArray(segmentCtrl.items)) segmentCtrl.items = [];
      segmentCtrl.items.push(...tmp.items);
      state.selectedName = segmentCtrl.name;
      state.selectedNames = new Set(segmentCtrl.name ? [segmentCtrl.name] : []);
    } else {
      const list = section.controls || (section.controls = []);
      const group = buildWholeNodeCtrl(host, node, orientation, initialPos);
      const spot = findFreeSpot(list, group.x, group.y, group.w, group.h);
      group.x = spot.x;
      group.y = spot.y;
      list.push(group);
      state.selectedName = group.name;
      state.selectedNames = new Set([group.name]);
    }
    backdrop.remove();
    state.refresh();
  }

  // Executa a inserção / salvamento
  function insertSelectedTarget() {
    if (!selectedTarget) return;

    if (selectedTarget.isWholeNode) {
      insertWholeNode(selectedTarget.node, selectedTarget.orientation);
      return;
    }

    // Modo segmento: adiciona o elemento escolhido (cru ou alvo) dentro do segmento
    if (segmentCtrl) {
      if (selectedTarget.isRaw) {
        // Elemento cru: adiciona sem bind, usuário depois clica nele para vincular o alvo
        addItemToSegment(host, state, segmentCtrl, {
          kind: selectedTarget.kind,
          label: selectedTarget.name || selectedTarget.label,
          bind: ""
        });
      } else {
        // Alvo do workflow: já entra com bind vinculado direto
        addItemToSegment(host, state, segmentCtrl, {
          kind: selectedTarget.kind,
          label: selectedTarget.label || selectedTarget.name,
          bind: selectedTarget.bind
        });
      }
      backdrop.remove();
      return;
    }

    // Se a busca nativa foi aberta para vincular um alvo específico a um controle (ex: sub-elemento de segmento)
    if (typeof targetCallback === "function") {
      if (!selectedTarget.isRaw) pushUndo(host);
      targetCallback(selectedTarget);
      backdrop.remove();
      return;
    }

    if (selectedTarget.isRaw) {
      const newCtrl = {
        kind: selectedTarget.kind,
        label: selectedTarget.label,
        x: initialPos?.x ?? 16,
        y: initialPos?.y ?? 16,
        w: selectedTarget.defaultW || 256,
        h: selectedTarget.defaultH || 32,
        bind: ""
      };

      if (selectedTarget.kind === "label") {
        newCtrl.text = "Label";
        newCtrl.label = "Label";
      } else if (selectedTarget.kind === "text" || selectedTarget.kind === "textarea") {
        newCtrl.value = "";
      }

      if (selectedTarget.kind === "segment" || selectedTarget.kind === "vsegment") {
        newCtrl.items = [];
      }
      if (isOutputKind(selectedTarget.kind)) newCtrl.label = "";

      pushUndo(host);
      ensureComponentName(host.properties[PROP], newCtrl);
      if (!section.controls) section.controls = [];
      section.controls.push(newCtrl);
      state.selectedName = newCtrl.name;
      state.selectedNames = new Set([newCtrl.name]);
      backdrop.remove();
      state.refresh();

      if (selectedTarget.kind === "segment") {
        // Nasce limpo diretamente no canvas, pronto para receber controles via [+]
      }
      return;
    }

    pushUndo(host);
    c.bind = selectedTarget.bind;
    c.label = selectedTarget.label || prettify(selectedTarget.name);
    c.kind = selectedTarget.kind;
    const isTargetMedia = isMediaKind(selectedTarget.kind);

    if (isNew) {
      // Tamanho padrão só para quem está nascendo. Num componente existente,
      // trocar o parâmetro não pode desfazer o redimensionamento do usuário;
      // o piso por tipo é aplicado no `buildControl`.
      c.width = isTargetMedia ? "288px" : "100%";
      c.height = isTargetMedia ? "144px" : "auto";
      c.w = isTargetMedia ? 288 : 256;
      c.h = isTargetMedia ? 144 : 46;
      if (!section.controls) section.controls = [];
      if (initialPos) {
        c.x = initialPos.x;
        c.y = initialPos.y;
      }
      if (typeof insertIndex === "number" && insertIndex >= 0 && insertIndex <= section.controls.length) {
        section.controls.splice(insertIndex, 0, c);
      } else {
        section.controls.push(c);
      }
    }

    backdrop.remove();
    state.refresh();
  }

  // Suporte a teclado: Navegação por setas e Enter para confirmar
  searchInput.addEventListener("input", () => {
    highlightedIndex = 0;
    renderList();
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredTargets.length > 0) {
        highlightedIndex = (highlightedIndex + 1) % filteredTargets.length;
        selectedTarget = filteredTargets[highlightedIndex];
        renderList();
        const activeRow = listContainer.children[highlightedIndex];
        if (activeRow && activeRow.scrollIntoViewIfNeeded) activeRow.scrollIntoViewIfNeeded(false);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredTargets.length > 0) {
        highlightedIndex = (highlightedIndex - 1 + filteredTargets.length) % filteredTargets.length;
        selectedTarget = filteredTargets[highlightedIndex];
        renderList();
        const activeRow = listContainer.children[highlightedIndex];
        if (activeRow && activeRow.scrollIntoViewIfNeeded) activeRow.scrollIntoViewIfNeeded(false);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredTargets[highlightedIndex]) {
        selectedTarget = filteredTargets[highlightedIndex];
        insertSelectedTarget();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      backdrop.remove();
    }
  });

  renderSidebar();
  renderList();

  backdrop.append(dialog);
  document.body.append(backdrop);
  // Atalho "Promote parameters": vai direto ao picker; cancelar fecha tudo.
  if (autoPick) runTargetPicker(() => backdrop.remove());

  // Adapta o Object Properties ao lado do diálogo sem sobreposição
  window.addEventListener("resize", adaptInspectorWithDialog);
  requestAnimationFrame(adaptInspectorWithDialog);

  const updateDialogResponsive = () => {
    const w = dialog.offsetWidth;
    dialog.classList.toggle("dlg-compact", w < 1040);
    dialog.classList.toggle("dlg-narrow", w < 800);
  };
  const dlgResizeObs = new ResizeObserver(updateDialogResponsive);
  dlgResizeObs.observe(dialog);

  const obs = new MutationObserver(() => {
    if (!document.body.contains(backdrop)) {
      obs.disconnect();
      dlgResizeObs.disconnect();
      window.removeEventListener("resize", adaptInspectorWithDialog);
      if (INSPECTOR) {
        INSPECTOR.classList.remove("docked-with-dialog");
        INSPECTOR.style.maxHeight = "76vh";
        if (INSPECTOR_POS) {
          INSPECTOR.style.left = `${INSPECTOR_POS.x}px`;
          INSPECTOR.style.top = `${INSPECTOR_POS.y}px`;
        }
      }
    }
  });
  obs.observe(document.body, { childList: true });

  setTimeout(() => searchInput.focus?.(), 25);
}

// Redireciona openComponentSearchMenu diretamente para a nova janela nativa
function openComponentSearchMenu({ host, layout, section, state, pos, clientPos }) {
  openInspector({
    host,
    layout,
    section,
    state,
    initialPos: pos
  });
}


/** Diálogo modal para gerenciar, renomear ou excluir abas. */
function openManageTabModal({ tab, tabs, tabIndex, onUpdate, onDelete, isSubTab = false }) {
  document.querySelector(".lego-ins-backdrop")?.remove();

  const backdrop = el("div", "lego-ins-backdrop");
  backdrop.addEventListener("pointerdown", eatPointer);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  const modal = el("div", "lego-inspector");
  modal.style.maxWidth = "420px";
  modal.addEventListener("click", (e) => e.stopPropagation());

  const head = el("div", "lego-ins-header");
  const title = el("div", "lego-ins-title", isSubTab ? "MANAGE SUB-TAB" : "MANAGE TAB");
  const closeBtn = glyphBtn("lego-iconbtn", "close", 13);
  closeBtn.addEventListener("click", () => backdrop.remove());
  head.append(title, closeBtn);
  modal.append(head);

  const body = el("div", "lego-ins-body");

  const fName = el("div", "lego-ins-field");
  fName.append(el("label", null, "Tab Name:"));
  const inName = el("input", "lego-in");
  inName.value = tab.name || "";
  inName.placeholder = "Enter tab name...";
  inName.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") btnSave.click();
  });
  fName.append(inName);
  body.append(fName);

  modal.append(body);

  const foot = el("div", "lego-ins-footer");
  foot.style.justifyContent = "space-between";

  const btnDel = el("button", "lego-btn");
  btnDel.innerHTML = glyph("trash", 14);
  btnDel.append(document.createTextNode("Delete Tab"));
  btnDel.style.borderColor = "rgba(239,68,68,0.4)";
  btnDel.style.color = "#ef4444";
  if (tabs.length <= 1) {
    btnDel.disabled = true;
    btnDel.style.opacity = "0.4";
    btnDel.title = "Cannot delete the only existing tab";
  } else {
    btnDel.addEventListener("click", () => {
      if (confirm(`Are you sure you want to delete tab "${tab.name}"?`)) {
        backdrop.remove();
        onDelete();
      }
    });
  }

  const rightBtns = el("div");
  rightBtns.style.display = "flex";
  rightBtns.style.gap = "8px";

  const btnCancel = el("button", "lego-btn", "Cancel");
  btnCancel.addEventListener("click", () => backdrop.remove());

  const btnSave = glyphTextBtn("lego-btn lego-btn-primary", "check", "Save", 14);
  btnSave.addEventListener("click", () => {
    const newName = inName.value.trim();
    if (!newName) {
      alert("Tab name cannot be empty!");
      return;
    }
    tab.name = newName;
    backdrop.remove();
    onUpdate();
  });

  rightBtns.append(btnCancel, btnSave);
  foot.append(btnDel, rightBtns);
  modal.append(foot);

  backdrop.append(modal);
  document.body.append(backdrop);
  inName.focus();
  inName.select();
}

/** Menu de contexto de clique direito para abas. */
function openTabContextMenu(e, { tab, tabs, tabIndex, onUpdate, onDelete, onAdd, isSubTab = false }) {
  e.preventDefault();
  e.stopPropagation();
  document.querySelector(".lego-ctx-menu")?.remove();

  const menu = el("div", "lego-ctx-menu");
  menu.style.left = `${Math.min(window.innerWidth - 170, e.clientX)}px`;
  menu.style.top = `${Math.min(window.innerHeight - 150, e.clientY)}px`;

  const itemRen = el("button", "lego-ctx-item");
  itemRen.innerHTML = glyph("pencil", 14);
  itemRen.append(document.createTextNode("Rename Tab"));
  itemRen.addEventListener("click", () => {
    menu.remove();
    openManageTabModal({ tab, tabs, tabIndex, onUpdate, onDelete, isSubTab });
  });
  menu.append(itemRen);

  if (onAdd) {
    const itemAdd = glyphTextBtn("lego-ctx-item", "plus", "New tab", 13);
    itemAdd.addEventListener("click", () => {
      menu.remove();
      onAdd();
    });
    menu.append(itemAdd);
  }

  const itemDel = el("button", "lego-ctx-item danger");
  itemDel.innerHTML = glyph("trash", 14);
  itemDel.append(document.createTextNode("Delete Tab"));
  if (tabs.length <= 1) {
    itemDel.disabled = true;
    itemDel.style.opacity = "0.4";
  } else {
    itemDel.addEventListener("click", () => {
      menu.remove();
      if (confirm(`Delete tab "${tab.name}"?`)) {
        onDelete();
      }
    });
  }
  menu.append(itemDel);

  // O fechamento escuta `pointerdown` no documento; sem barrar aqui, o menu
  // sumia no pointerdown do próprio item e o `click` nunca chegava nele.
  menu.addEventListener("pointerdown", (ev) => ev.stopPropagation());

  const closeMenu = () => {
    menu.remove();
    document.removeEventListener("click", closeMenu);
    document.removeEventListener("pointerdown", closeMenu);
  };
  setTimeout(() => {
    document.addEventListener("click", closeMenu);
    document.addEventListener("pointerdown", closeMenu);
  }, 10);

  document.body.append(menu);
}

/**
 * Menu de contexto genérico: `entries` = [{ icon, label, hint, danger,
 * disabled, action }] ou `null` para uma linha divisória.
 */
function openLegoContextMenu(e, entries) {
  e.preventDefault();
  e.stopPropagation();
  document.querySelector(".lego-ctx-menu")?.remove();
  const menu = el("div", "lego-ctx-menu");
  const closeMenu = () => {
    menu.remove();
    document.removeEventListener("click", closeMenu);
    document.removeEventListener("pointerdown", closeMenu);
  };
  for (const it of entries) {
    if (!it) { menu.append(el("div", "lego-ctx-sep")); continue; }
    const b = el("button", `lego-ctx-item${it.danger ? " danger" : ""}`);
    b.innerHTML = glyph(it.icon || "blank", 14);
    b.append(el("span", "lego-ctx-label", it.label));
    if (it.hint) b.append(el("span", "lego-ctx-hint", it.hint));
    if (it.disabled) { b.disabled = true; b.style.opacity = "0.4"; }
    else b.addEventListener("click", (ev) => { ev.stopPropagation(); closeMenu(); it.action(); });
    menu.append(b);
  }
  // Ver openTabContextMenu: sem isto o menu some no pointerdown do próprio item.
  menu.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(window.innerWidth - (r.width || 190) - 4, e.clientX))}px`;
  menu.style.top = `${Math.max(4, Math.min(window.innerHeight - (r.height || 240) - 4, e.clientY))}px`;
  setTimeout(() => {
    document.addEventListener("click", closeMenu);
    document.addEventListener("pointerdown", closeMenu);
  }, 10);
  return menu;
}

const isGroupKind = (k) => k === "segment" || k === "vsegment" || k === "group";

export { startVisualWorkflowPicker, renderRealNode, RAW_UI_ELEMENTS, openInspector, openComponentSearchMenu, openManageTabModal, openTabContextMenu, openLegoContextMenu, isGroupKind };
