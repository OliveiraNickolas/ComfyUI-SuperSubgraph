/* Nó inteiro como widget (buildWholeNodeCtrl), larguras de zona e tamanho do nó. */
// Parte do ComfyUI-SuperSubgraph (ver web/js/super_subgraph.js e CLAUDE.md).
// Só declarações: nada roda ao carregar este arquivo.

import { app } from "../../../../scripts/app.js";
import { CSS } from "../super_subgraph_css.js";
import { GRID, MIN_W, PROP } from "./constants.js";
import { RE_SEED, bindKey, describeWidget, isAudioCombo, isImageCombo, isVideoCombo, prettify, usable } from "./widgets.js";
import { el } from "./controls.js";
import { isOutputKind } from "./outputs.js";
import { is2DKind, isMediaKind } from "./drag.js";
import { defaultSizeFor, isPanelKind, mirrorModeFor } from "./panels.js";
import { activeTabOf, fitGroupToContent, renameClone } from "./form.js";
import { innerNodesOf, liteGraph } from "./native.js";

/* ══════════════════════════════════════════════════════════════════════════
   Nó inteiro como widget

   Em vez de montar parâmetro por parâmetro, um nó do workflow vira de uma vez
   um grupo pronto: para cada widget dele, um Label com o nome e o controle
   ligado ao widget (Load LoRA -> Label + Dropdown + Label + Stepper...).
   ══════════════════════════════════════════════════════════════════════════ */

/** Rótulo de um widget: o nome dado pelo usuário (renomeado/promovido) ou o técnico formatado. */
function widgetLabel(w) {
  return (typeof w.label === "string" && w.label.trim() && w.label !== w.name) ? w.label.trim() : prettify(w.name);
}

/** Título que o usuário deu ao nó (null se ainda é o título padrão do tipo). */
function customNodeTitle(node) {
  const t = typeof node?.title === "string" ? node.title.trim() : "";
  if (!t) return null;
  const def = liteGraph()?.registered_node_types?.[node.type]?.title || node.constructor?.title || node.type;
  return t !== def && t !== node.type ? t : null;
}

/**
 * Rótulo do componente: o nome dado ao widget vale mais; senão, num nó de
 * mídia (Load Image renomeado para "Load Image 2"), o título do nó — o nome
 * do widget ("Image") se repetiria em todos.
 */
function promotedLabel(node, w, kind) {
  const renamed = typeof w.label === "string" && w.label.trim() && w.label !== w.name;
  if (!renamed && (isMediaKind(kind) || kind === "node_ui")) return customNodeTitle(node) || widgetLabel(w);
  return widgetLabel(w);
}

/** Componente solto para um único parâmetro de um nó. */
function singleCtrlFor(host, node, w) {
  const kind = detectMediaKind(w, describeWidget(w), node);
  const c = { kind, bind: bindKey(host, node, w), label: promotedLabel(node, w, kind), ...defaultSizeFor(kind) };
  if (isPanelKind(kind)) c.labelPos = "none";
  if (kind === "node_ui") {
    // O painel do nó no tamanho dele (arredondado à grade).
    c.w = Math.ceil(Math.max(330, node.size?.[0] || 330) / GRID) * GRID;
    c.h = Math.ceil(Math.min(720, Math.max(240, node.size?.[1] || 320)) / GRID) * GRID;
    c.labelPos = "none";
  } else if (kind === "canvas_widget") {
    // A interface desenhada já se explica (botões com texto); sem rótulo na frente.
    c.w = 320;
    c.h = Math.max(32, Math.ceil((w.computeSize?.(320)?.[1] || 26) / GRID) * GRID);
    c.labelPos = "none";
  }
  if (RE_SEED.test(w.name)) c.seed = true;
  return c;
}

/**
 * Nó de saída (Preview/Save Image, Save Video, Video Combine, Preview/Save
 * Audio…): o tipo do componente de saída que mostra o que ele gera, ou null.
 * Esses nós quase não têm parâmetros — o que importa neles é a imagem.
 */
function outputKindOfNode(node) {
  if (!node) return null;
  const t = String(node.comfyClass || node.type || "");
  const isOut = !!node.constructor?.nodeData?.output_node || /preview|save|videocombine/i.test(t);
  if (!isOut) return null;
  const ins = (node.inputs || []).map((i) => String(i.type || "").toUpperCase());
  if (/audio/i.test(t) || ins.includes("AUDIO")) return "outaudio";
  if (/video|videocombine/i.test(t) || ins.includes("VIDEO")) return "outvideo";
  if (/image/i.test(t) || ins.includes("IMAGE")) return "outimage";
  return null;
}

/** Componente de saída ligado a este nó (mostra o que ele gerou por último). */
function outputCtrlFor(node) {
  const kind = outputKindOfNode(node);
  if (!kind) return null;
  return { kind, source: String(node.id), label: node.title || node.type || "Output", ...defaultSizeFor(kind) };
}

/** Itens (label + controle) que representam os widgets do nó (todos, ou só `onlyNames`). */
function wholeNodeItems(host, node, onlyNames) {
  const items = [];
  const outCtrl = onlyNames ? null : outputCtrlFor(node);
  const mp = mediaNodeParts(node);
  for (const w of (node.widgets || []).filter(usable)) {
    if (onlyNames && !onlyNames.has(w.name)) continue;
    if (mp && !onlyNames && w !== mp.media && !mp.rest.includes(w)) continue;   // ajudantes do nó de mídia
    if (mp && w === mp.media) {
      // A mídia se identifica pelo arquivo: entra sem Label na frente.
      const mk = detectMediaKind(w, describeWidget(w), node);
      items.push({ kind: mk, bind: bindKey(host, node, w), label: promotedLabel(node, w, mk), labelPos: "none", h: 120 });
      continue;
    }
    let kind = detectMediaKind(w, describeWidget(w), node);
    if (isPanelKind(kind) || kind === "canvas_widget") {
      // Interface desenhada pelo nó: entra espelhada, sem Label na frente.
      const { w: cw, h: ch } = singleCtrlFor(host, node, w);
      items.push({ kind, bind: bindKey(host, node, w), label: widgetLabel(w), labelPos: "none", w: cw, h: ch });
      continue;
    }
    // Número vira Stepper: é o controle compacto que cabe numa linha de grupo.
    if (kind === "slider") kind = "number";
    // O nome que o usuário deu ao parâmetro (widget renomeado/promovido)
    // vale mais que o nome técnico.
    const text = widgetLabel(w);
    const control = { kind, bind: bindKey(host, node, w), label: text, labelPos: "none" };
    if (is2DKind(kind)) control.h = kind === "textarea" ? 80 : 120;
    // O botão já escreve o próprio nome; os demais ganham um Label na frente.
    if (kind !== "button") items.push({ kind: "label", text, label: text });
    items.push(control);
  }
  // Nó de saída: a imagem (vídeo, áudio) que ele gera entra junto.
  if (outCtrl) items.push({ kind: outCtrl.kind, source: outCtrl.source, label: outCtrl.label, labelPos: "none", h: 160 });
  return items;
}

/**
 * Grupo pronto com o nó inteiro. `orientation`: "row" (grupo horizontal,
 * rótulo e controle lado a lado) ou "column" (grupo vertical, empilhado).
 */
/**
 * Nó de mídia (Load Image/Video/Audio...): o componente de mídia já mostra a
 * função inteira (miniatura, arquivo, upload). Devolve o widget de mídia e os
 * parâmetros de verdade que sobram além dele (botões e toggles só de
 * interface não contam).
 */
function mediaNodeParts(node) {
  const ws = (node.widgets || []).filter(usable);
  const media = ws.find((w) => {
    const k = detectMediaKind(w, describeWidget(w), node);
    return isMediaKind(k);
  });
  if (!media) return null;
  const rest = ws.filter((w) => w !== media && w.type !== "button" && w.options?.serialize !== false);
  return { media, rest };
}

function buildWholeNodeCtrl(host, node, orientation, pos) {
  const layout = host.properties[PROP];
  // Mídia sem outro parâmetro: só o componente de mídia, sem grupo.
  const mp = mediaNodeParts(node);
  // Nó que desenha o próprio painel (Resolution Master): o painel já é o nó
  // inteiro — vira um componente só, espelhado, sem grupo em volta.
  // Nó de saída sem parâmetros (Preview Image): só o componente de saída.
  const outCtrl = outputCtrlFor(node);
  if (outCtrl && !(node.widgets || []).some(usable)) {
    return renameClone(layout, { ...outCtrl, x: pos?.x ?? 16, y: pos?.y ?? 16 });
  }
  const panel = (node.widgets || []).find((w) => usable(w) && mirrorModeFor(w) === "node");
  if (panel || (mp && !mp.rest.length)) {
    const c = { ...singleCtrlFor(host, node, panel || mp.media), x: pos?.x ?? 16, y: pos?.y ?? 16 };
    const avail = Math.max(320, Math.round(Math.max(MIN_W, host.size?.[0] || 0) - 80));
    c.x = Math.max(16, Math.min(c.x, avail - c.w));
    return renameClone(layout, c);
  }
  const items = wholeNodeItems(host, node);
  // Nó de saída com parâmetros (Save Image): empilhado, a imagem embaixo.
  let vertical = orientation === "column" || !!outCtrl;
  const has2D = items.some((it) => is2DKind(it.kind));
  // Largura do cartão (nunca menor que o mínimo que ele assume ao ser montado).
  const avail = Math.max(320, Math.round(Math.max(MIN_W, host.size?.[0] || 0) - 80));
  const snap = (v) => Math.round(v / GRID) * GRID;
  for (const it of items) {
    // Label do tamanho do texto; o controle ocupa o resto da linha.
    if (it.kind === "label" && !vertical) it.w = Math.max(48, Math.min(176, snap(String(it.text).length * 7 + 16)));
  }
  // Em linha: Stepper, Switch e botão têm largura fixa de que precisam; o
  // espaço que sobra na zona vai para quem mostra texto longo (dropdown de
  // modelo, campo de texto), que é quem sofre quando fica espremido.
  const FIXED = { number: 128, toggle: 56, button: 120 };
  let w = 288;
  if (!vertical) {
    const ctrlsRow = items.filter((it) => it.kind !== "label");
    const flex = ctrlsRow.filter((it) => !FIXED[it.kind]);
    const used = 32 + items.length * 8
      + items.filter((it) => it.kind === "label").reduce((a, it) => a + it.w, 0)
      + ctrlsRow.reduce((a, it) => a + (FIXED[it.kind] || 0), 0);
    const each = flex.length ? Math.min(320, snap((avail - used) / flex.length)) : 0;
    if (!flex.length || each >= 120) {
      for (const it of ctrlsRow) it.w = FIXED[it.kind] || (isPanelKind(it.kind) ? Math.max(each, it.w || 0) : each);
      w = Math.max(320, snap(used + ctrlsRow.reduce((a, it) => a + (FIXED[it.kind] ? 0 : it.w), 0)));
    } else if (used - ctrlsRow.reduce((a, it) => a + (FIXED[it.kind] || 0), 0) + ctrlsRow.length * 72 <= avail) {
      // Apertado: tudo flexível, dentro da largura da zona.
      for (const it of ctrlsRow) if (!isPanelKind(it.kind)) delete it.w;
      w = avail;
    } else {
      // Não cabe nem apertado: empilha, como o próprio nó no canvas (antes a
      // linha passava da borda do cartão).
      vertical = true;
      for (const it of items) if (it.kind === "label") delete it.w;
    }
  }
  if (vertical) {
    // Empilhado como o nó no canvas: uma linha por parâmetro, rótulo à
    // esquerda e controle à direita (textos longos, mídia e painéis mantêm o
    // rótulo em cima, como no nó).
    const inline = (it) => it.kind !== "label" && it.kind !== "button" && it.kind !== "textarea" && !is2DKind(it.kind) && it.kind !== "canvas_widget";
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (inline(it)) {
        it.labelPos = "left";
        const prev = items[i - 1];
        if (prev?.kind === "label") { items.splice(i - 1, 1); i--; }
      }
    }
    for (const it of items) if (it.kind !== "label" && !isPanelKind(it.kind)) delete it.w;
    w = Math.min(avail, Math.max(288, ...items.filter((it) => isPanelKind(it.kind)).map((it) => it.w || 0)));
  }
  const group = {
    kind: vertical ? "vsegment" : "segment",
    label: node.title || node.type || `Node #${node.id}`,
    header: node.title || node.type || `Node #${node.id}`,
    // Nasce dentro da largura da zona, mesmo se o clique foi perto da borda.
    x: Math.max(16, Math.min(pos?.x ?? 16, avail - w)),
    y: pos?.y ?? 16,
    w,
    // +16 para o cabeçalho com o nome do nó; em linha, a altura do item mais alto.
    h: 16 + (vertical
      // (linha "rótulo à esquerda, controle à direita" mede 27px no cartão)
      ? snap(items.reduce((a, it) => a + (it.labelPos === "left" && !it.h ? 27 : (it.kind === "label" ? 18 : (it.h || 28)) + 6), 16))
      : (has2D ? snap(Math.max(160, ...items.map((it) => (it.h || 36) + 32))) : 48)),
    items,
  };
  // Altura estimada: o 1º desenho a acerta pelo conteúdo real (ver
  // fitGroupToContent) enquanto ninguém mexer nela.
  group.autoH = group.h;
  return renameClone(layout, group);
}

/** Tipo de mídia pela definição do nó (image_upload / video_upload / audio_upload). */
function uploadMediaKind(node, w) {
  const nd = node?.constructor?.nodeData;
  const spec = nd?.input?.required?.[w?.name]?.[1] || nd?.input?.optional?.[w?.name]?.[1];
  if (!spec || typeof spec !== "object") return null;
  if (spec.video_upload) return "video";
  if (spec.audio_upload) return "audio";
  if (spec.image_upload || spec.animated_image_upload) return "media";
  return null;
}

function detectMediaKind(w, desc, node) {
  // A definição do nó diz com certeza; os nomes dos arquivos são só a pista
  // (e somem quando a pasta input está vazia).
  const byDef = uploadMediaKind(node, w);
  if (byDef) return byDef;
  if (isVideoCombo(w)) return "video";
  if (isAudioCombo(w)) return "audio";
  if (isImageCombo(w)) return "media";
  const n = String(w?.name || "").toLowerCase();
  if (n.includes("video") || n.includes("vhs")) return "video";
  if (n.includes("audio") || n.includes("sound") || n.includes("voice")) return "audio";
  return desc.kind;
}

/** Lista todos os widgets vinculáveis no escopo do host (promovidos, subgrafo interno e grafo). */
function listBindableTargets(host) {
  const list = [];
  const seen = new Set();

  // 1. Widgets locais/promovidos do próprio host
  for (const w of host.widgets || []) {
    if (!usable(w)) continue;
    const key = w.name;
    if (!seen.has(key)) {
      seen.add(key);
      const desc = describeWidget(w);
      list.push({
        bind: key,
        name: w.name,
        label: prettify(w.name),
        kind: detectMediaKind(w, desc, host),
        node: host,
        widget: w,
        scope: "Promoted / Host Node",
        detail: `[Host] ${w.name} (${w.type || desc.kind})`
      });
    }
  }

  // 2. Nós internos do Subgrafo (se existirem)
  const subNodes = innerNodesOf(host);
  for (const n of subNodes) {
    if (n === host) continue;
    const nTitle = n.title || n.type || `Node #${n.id}`;
    for (const w of n.widgets || []) {
      if (!usable(w)) continue;
      const key = `${n.id}/${w.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        const desc = describeWidget(w);
        list.push({
          bind: key,
          name: w.name,
          label: `${nTitle} - ${prettify(w.name)}`,
          kind: detectMediaKind(w, desc, n),
          node: n,
          widget: w,
          scope: `Subgraph #${n.id} (${n.type})`,
          detail: `#${n.id} ${nTitle} → ${w.name}`
        });
      }
    }
  }

  // 3. Demais nós do grafo onde o host está ou do grafo ativo no canvas (compatibilidade Nodes 2.0)
  const candidateGraphs = [host.graph, app.graph, app.canvas?.getCurrentGraph?.()].filter(Boolean);
  const checkedNodes = new Set();
  for (const g of candidateGraphs) {
    const gNodes = g._nodes || g.nodes || [];
    for (const n of gNodes) {
      if (n === host || checkedNodes.has(n.id)) continue;
      checkedNodes.add(n.id);
      const nTitle = n.title || n.type || `Node #${n.id}`;
      for (const w of n.widgets || []) {
        if (!usable(w)) continue;
        const key = `${n.id}/${w.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          const desc = describeWidget(w);
          list.push({
            bind: key,
            name: w.name,
            label: `${nTitle} - ${prettify(w.name)}`,
            kind: detectMediaKind(w, desc, n),
            node: n,
            widget: w,
            scope: `Graph #${n.id} (${n.type})`,
            detail: `#${n.id} ${nTitle} → ${w.name}`
          });
        }
      }
    }
  }

  return list;
}

/** Converte largura (porcentagem ou px) em valor CSS, descontando o gap do flexbox. */
function widthToCss(w) {
  if (!w || w === "100%") return "100%";
  if (typeof w === "string" && w.endsWith("%")) {
    const pct = parseFloat(w);
    if (pct >= 100) return "100%";
    const gapOffset = Math.round((1 - pct / 100) * 12);
    return `calc(${pct}% - ${gapOffset}px)`;
  }
  return w;
}

/** Snap granular de largura em passos de 5%, com snaps magnéticos em 33.3% e 66.7% */
function snapWidth(ratio, isShift) {
  const pct = Math.max(10, Math.min(100, ratio * 100));
  // Shift: livre (décimos). Sem Shift: passos de 1%, com um ímã fraco nas
  // frações comuns — larguras personalizadas continuam fáceis de acertar.
  if (isShift) return `${Math.round(pct * 10) / 10}%`;
  for (const m of [25, 33.3, 50, 66.7, 75]) if (Math.abs(pct - m) < 0.8) return `${m}%`;
  return `${Math.round(pct)}%`;
}

/**
 * Largura CSS de uma coluna numa linha de `numCols` colunas: a porcentagem é
 * a fatia exata da largura útil (sem os vãos de 12px entre colunas).
 */
function colWidthCss(w, numCols) {
  const pct = parseFloat(w);
  if (!Number.isFinite(pct) || pct >= 100) return "100%";
  const gaps = 12 * Math.max(0, numCols - 1);
  return `calc((100% - ${gaps}px) * ${Math.round(pct * 10) / 1000})`;
}

/** Obtém o grupo contíguo de seções que compartilham a mesma linha (larguras < 100%, mesmo row). */
function getContiguousRow(sections, idx) {
  if (!Array.isArray(sections) || idx < 0 || idx >= sections.length) return [];
  const sec = sections[idx];
  if (!sec || !sec.width || sec.width === "100%") return sec ? [sec] : [];
  let start = idx;
  while (start > 0 && sections[start - 1].width && sections[start - 1].width !== "100%") {
    if (!sameRow(sec, sections[start - 1])) break;
    start--;
  }
  let end = idx;
  while (end < sections.length - 1 && sections[end + 1].width && sections[end + 1].width !== "100%") {
    if (!sameRow(sec, sections[end + 1])) break;
    end++;
  }
  return sections.slice(start, end + 1);
}

/** Calcula a largura percentual proporcional para N seções lado a lado. */
function widthForCount(count) {
  if (count <= 1) return "100%";
  if (count === 2) return "50%";
  if (count === 3) return "33.3%";
  if (count === 4) return "25%";
  return `${(100 / count).toFixed(1)}%`;
}

/**
 * Renderiza linhas de nível (horizontais e verticais) e badges com feedback visual
 * em tempo real durante o redimensionamento de arestas e o manejo (drag & drop) de zonas.
 */
function renderZoneGuides(body, { vLine, hLine } = {}) {
  if (!body) return;
  let overlay = body.querySelector(":scope > .lego-guide-overlay");
  if (!overlay) {
    overlay = el("div", "lego-guide-overlay");
    body.append(overlay);
  }
  overlay.replaceChildren();

  if (vLine) {
    const extraCls = vLine.isCol ? " col-divider" : "";
    const lineEl = el("div", `lego-level-line-v${vLine.snap ? " snap" : ""}${extraCls}`);
    lineEl.style.left = `${Math.round(vLine.x)}px`;
    overlay.append(lineEl);

    if (vLine.badgeText) {
      const badge = el("div", `lego-guide-badge${vLine.snap ? " snap" : ""}${extraCls}`);
      badge.textContent = vLine.badgeText;
      badge.style.left = `${Math.round(vLine.x)}px`;
      badge.style.top = `${Math.round(vLine.badgeY ?? 20)}px`;
      overlay.append(badge);
    }
  }

  if (hLine) {
    const lineEl = el("div", `lego-level-line-h${hLine.snap ? " snap" : ""}`);
    lineEl.style.top = `${Math.round(hLine.y)}px`;
    overlay.append(lineEl);

    if (hLine.badgeText) {
      const badge = el("div", `lego-guide-badge${hLine.snap ? " snap" : ""}`);
      badge.textContent = hLine.badgeText;
      badge.style.top = `${Math.round(hLine.y)}px`;
      badge.style.left = `${Math.round(hLine.badgeX ?? 120)}px`;
      overlay.append(badge);
    }
  }
}

/** Remove as linhas de nível e o overlay de guias visuais. */
function clearZoneGuides(body) {
  if (!body) return;
  const overlay = body.querySelector(":scope > .lego-guide-overlay");
  if (overlay) overlay.remove();
}

/** Largura mínima necessária para uma seção conter todos os seus controles internos. */
function sectionRequiredWidth(s) {
  if (!s) return 200;
  let maxX = 0;
  let minX = Infinity;
  const checkItem = (c) => {
    if (!c) return;
    const x = typeof c.x === "number" ? c.x : 16;
    let w = typeof c.w === "number" ? c.w : 0;
    if (!w) {
      if (c.kind === "vdivider") w = 16;
      else if (c.kind === "label") w = 160;
      else if (isPanelKind(c.kind) || c.kind === "canvas_widget") w = defaultSizeFor(c.kind).w;
      else if (isMediaKind(c.kind)) w = 288;
      else if (typeof isOutputKind === "function" && isOutputKind(c.kind)) w = 320;
      else w = 256;
    }
    maxX = Math.max(maxX, x + w);
    minX = Math.min(minX, x);
  };
  if (Array.isArray(s.controls)) s.controls.forEach(checkItem);
  if (Array.isArray(s.tabs)) {
    s.tabs.forEach((t) => {
      if (Array.isArray(t.controls)) t.controls.forEach(checkItem);
    });
  }
  // Margem direita = a esquerda (x do item mais à esquerda), mais as bordas e
  // o respiro da zona (8px): o conteúdo fica centrado na linha pontilhada.
  return maxX > 0 ? Math.max(200, maxX + Math.min(minX, 32) + 8) : 200;
}

/** Altura mínima necessária para uma seção conter todos os seus controles internos. */
function sectionRequiredHeight(s) {
  if (!s) return 120;
  let maxY = 0;
  const checkItem = (c) => {
    if (!c) return;
    const y = typeof c.y === "number" ? c.y : 16;
    let h = typeof c.h === "number" ? c.h : (isPanelKind(c.kind) || isMediaKind(c.kind) || c.kind === "textarea" ? defaultSizeFor(c.kind).h : 46);
    maxY = Math.max(maxY, y + h);
  };
  if (Array.isArray(s.controls)) s.controls.forEach(checkItem);
  if (Array.isArray(s.tabs)) {
    s.tabs.forEach((t) => {
      if (Array.isArray(t.controls)) t.controls.forEach(checkItem);
    });
  }
  return maxY > 0 ? Math.max(120, maxY + 32) : 120;
}

/** Verifica se duas seções pertencem ao mesmo grupo de colunas (row).
 *  Retorna true se ambos não tiverem row (backward compat) ou tiverem o mesmo row. */
function sameRow(a, b) {
  const rA = a?.row, rB = b?.row;
  if (rA == null && rB == null) return true;   // legado sem row: agrupa como antes
  return rA === rB;
}

/** Gera um id único para row (agrupa colunas lado a lado). */
function makeRowId() { return Date.now() + Math.random(); }

/**
 * Agrupa seções em linhas completas (100%) e linhas de colunas (largura < 100%).
 * Permite múltiplas zonas empilhadas verticalmente dentro de uma mesma coluna
 * ao lado de uma coluna com zona única que estica para cobrir a mesma altura total.
 * Seções com `row` diferente nunca são agrupadas na mesma linha de colunas.
 */
function groupSectionsLayout(sections) {
  if (!Array.isArray(sections)) return [];
  const groups = [];
  let i = 0;
  while (i < sections.length) {
    const s = sections[i];
    if (!s.width || s.width === "100%") {
      groups.push({ type: "full", sec: s, index: i });
      i++;
    } else {
      const start = i;
      while (i < sections.length && sections[i].width && sections[i].width !== "100%") {
        // Seções com row diferente não pertencem ao mesmo grupo de colunas
        if (i > start && !sameRow(sections[start], sections[i])) break;
        i++;
      }
      const colSecs = sections.slice(start, i);

      // Agrupa por `col`. Se ninguém tiver `col`, atribui 0, 1, 2... sequencial
      const hasAnyCol = colSecs.some((x) => typeof x.col === "number");
      if (!hasAnyCol) {
        colSecs.forEach((x, idx) => { x.col = idx; });
      }

      const colMap = new Map();
      colSecs.forEach((x, localIdx) => {
        const cIdx = typeof x.col === "number" ? x.col : localIdx;
        if (!colMap.has(cIdx)) colMap.set(cIdx, []);
        colMap.get(cIdx).push({ sec: x, globalIndex: start + localIdx });
      });

      const sortedKeys = Array.from(colMap.keys()).sort((a, b) => a - b);
      sortedKeys.forEach((key, newColIdx) => {
        colMap.get(key).forEach(({ sec }) => { sec.col = newColIdx; });
      });

      const defaultW = widthForCount(sortedKeys.length);
      const columns = sortedKeys.map((key, newColIdx) => {
        const entries = colMap.get(key);
        const w = entries[0].sec.width || defaultW;
        return {
          colIdx: newColIdx,
          width: w,
          entries
        };
      });

      groups.push({ type: "columns", columns, startIndex: start, endIndex: i - 1 });
    }
  }
  return groups;
}

/**
 * A primeira zona (topo / pivot) define a largura necessária do SuperSubgraph.
 * Zonas abaixo do pivot adaptam-se e cabem na largura pivot.
 * Zonas empilhadas na mesma coluna consideram o MAX da coluna, e não a soma.
 */
function requiredNodeWidth(node, host) {
  const layout = host?.properties?.[PROP] || node?.properties?.[PROP];
  let layoutW = MIN_W;
  if (layout) {
    const curTab = typeof activeTabOf === "function" ? activeTabOf(layout) : (layout?.tabs?.[layout?.activeTab || 0] || layout?.tabs?.[0] || null);
    const sections = curTab?.sections || [];
    if (sections.length) {
      const firstSec = sections[0];
      if (!firstSec.width || firstSec.width === "100%") {
        layoutW = Math.max(MIN_W, sectionRequiredWidth(firstSec) + 36);
      } else {
        const colMap = new Map();
        let i = 0;
        const firstRow = sections[0];
        while (i < sections.length && sections[i].width && sections[i].width !== "100%") {
          if (i > 0 && !sameRow(firstRow, sections[i])) break;
          const s = sections[i];
          const c = typeof s.col === "number" ? s.col : i;
          if (!colMap.has(c)) colMap.set(c, []);
          colMap.get(c).push(s);
          i++;
        }
        let colSum = 0;
        colMap.forEach((colSecs) => {
          const maxInCol = Math.max(...colSecs.map((s) => sectionRequiredWidth(s)));
          colSum += maxInCol;
        });
        const numCols = colMap.size;
        const rowWidth = colSum + Math.max(0, numCols - 1) * 12 + 36;
        layoutW = Math.max(MIN_W, rowWidth);
      }
    }
  }
  return Math.ceil(Math.max(MIN_W, layoutW));
}

/** Determina a direção de drop 4-Way (top, bottom, left, right) com base na posição do cursor. */
function getDropDirection(e, rect) {
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);

  const relX = x / w;
  const relY = y / h;

  // Se estiver claramente no topo ou na base (25% superior ou inferior)
  if (relY < 0.25) return "top";
  if (relY > 0.75) return "bottom";

  // Se estiver nas laterais (35% esquerda ou direita)
  if (relX < 0.35) return "left";
  if (relX > 0.65) return "right";

  // Miolo: divide pelos quadrantes diagonais
  const distL = relX;
  const distR = 1 - relX;
  const distT = relY;
  const distB = 1 - relY;
  const minD = Math.min(distL, distR, distT, distB);
  if (minD === distL) return "left";
  if (minD === distR) return "right";
  if (minD === distT) return "top";
  return "bottom";
}

/** Diálogo modal Inspetor de Propriedades para configurar componentes. */
/** Detecta o nó sob a posição do mouse no canvas do LiteGraph */
function getNodeAtEvent(canvas, e) {
  if (!canvas || !canvas.canvas) return null;
  const rect = canvas.canvas.getBoundingClientRect();
  const rawX = e.clientX - rect.left;
  const rawY = e.clientY - rect.top;

  let cx, cy;
  if (typeof canvas.convertEventToCanvasOffset === "function") {
    const pt = canvas.convertEventToCanvasOffset(e);
    cx = pt[0];
    cy = pt[1];
  } else {
    const scale = canvas.ds?.scale || 1;
    const offX = canvas.ds?.offset?.[0] || 0;
    const offY = canvas.ds?.offset?.[1] || 0;
    cx = (rawX / scale) - offX;
    cy = (rawY / scale) - offY;
  }

  const graph = canvas.getCurrentGraph?.() || canvas.graph || app.graph;
  if (!graph) return null;

  if (typeof graph.getNodeOnPos === "function") {
    const n = graph.getNodeOnPos(cx, cy);
    if (n) return n;
  }

  // `node.pos[1]` é o topo do CORPO: a barra de título fica ACIMA dele. Sem
  // descontar essa altura, clicar no título do nó — que é onde a mão vai
  // primeiro — não acertava nada.
  const TITLE_BAR = (window.LiteGraph && window.LiteGraph.NODE_TITLE_HEIGHT) || 30;
  const nodes = graph._nodes || graph.nodes || [];
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (!n.pos || !n.size) continue;
    const top = n.pos[1] - TITLE_BAR;
    const bottom = n.flags?.collapsed ? n.pos[1] : n.pos[1] + n.size[1];
    if (cx >= n.pos[0] && cx <= n.pos[0] + n.size[0] && cy >= top && cy <= bottom) {
      return n;
    }
  }
  return null;
}

export { widgetLabel, customNodeTitle, promotedLabel, singleCtrlFor, outputKindOfNode, outputCtrlFor, wholeNodeItems, mediaNodeParts, buildWholeNodeCtrl, uploadMediaKind, detectMediaKind, listBindableTargets, widthToCss, snapWidth, colWidthCss, getContiguousRow, widthForCount, renderZoneGuides, clearZoneGuides, sectionRequiredWidth, sectionRequiredHeight, sameRow, makeRowId, groupSectionsLayout, requiredNodeWidth, getDropDirection, getNodeAtEvent };
