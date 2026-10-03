/* Arrastar entre grupos e zonas; desenho dos grupos (buildSegment). */
// Parte do ComfyUI-SuperSubgraph (ver web/js/super_subgraph.js e CLAUDE.md).
// Só declarações: nada roda ao carregar este arquivo.

import { app } from "../../../../scripts/app.js";
import { GRID, PROP } from "./constants.js";
import { duplicateComponent, pushUndo, pushUndoSnapshot } from "./core.js";
import { findNodeInHostScope, prettify, resolveBind } from "./widgets.js";
import { el, glyphBtn, mkBalance, mkButton, mkCombo, mkMediaControl, mkNumber, mkSlider, mkStepNumber, mkText, mkToggle } from "./controls.js";
import { addItemToSegment, getComponentMinDimensions, isOutputKind, mkOutputView, openOutputSourceDialog, outputSourceLabel } from "./outputs.js";
import { applyLabelStyle, balanceLinkEntries, buildControl, ghostControl, isPanelKind, mkSpecialControl } from "./panels.js";
import { isGroupKind, openInspector, openLegoContextMenu } from "./picker.js";
import { colorDotButton, findFreeSpot, setComponentColor, toolByKind, walkControls } from "./form.js";
import { ensureComponentName, selectComponent } from "./inspector.js";
import { resize } from "./lifecycle.js";

/* ══════════════════════════════════════════════════════════════════════════
   Arraste entre grupos e zonas

   Os elementos do DOM carregam o dado que representam: `box.__legoSeg` é o
   grupo (horizontal/vertical) e `ctrlsBox.__legoList` é a lista de controles
   da zona. Assim o alvo do arraste sai direto do ponto sob o cursor, sem
   procurar no layout.
   ══════════════════════════════════════════════════════════════════════════ */

/** Pixels de tela por pixel do cartão (zoom do canvas): converte clientX/Y em x/y do layout. */
function domScale() {
  return app?.canvas?.ds?.scale || 1;
}

/** Componente de mídia de ENTRADA (imagem, vídeo ou áudio carregado). */
function isMediaKind(k) {
  return k === "media" || k === "video" || k === "audio";
}
const is2DKind = (k) => k === "textarea" || isMediaKind(k) || isPanelKind(k) || isOutputKind(k);

/**
 * O navegador dispara um `click` logo depois de soltar um arraste; ele não
 * pode virar seleção. Engole só esse clique — o bloqueio expira no próximo
 * ciclo para não comer o clique seguinte do usuário.
 */
function swallowNextClick() {
  const stop = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
  window.addEventListener("click", stop, true);
  setTimeout(() => window.removeEventListener("click", stop, true), 0);
}

/** Remove qualquer realce/indicador de soltura deixado por um arraste. */
function clearDropFeedback() {
  document.querySelectorAll(".lego-drop-line").forEach((e) => e.remove());
  document.querySelectorAll(".lego-segment-box.drop-into").forEach((e) => e.classList.remove("drop-into"));
  document.querySelectorAll(".lego-sec-controls.drop-out").forEach((e) => e.classList.remove("drop-out"));
  document.querySelectorAll(".lego-tab.drop-into, .lego-subtab.drop-into").forEach((e) => e.classList.remove("drop-into"));
}

/**
 * Grupo sob o ponto, com a posição de inserção entre os itens dele.
 * `skipEl` (o elemento arrastado) não conta nem como alvo nem como vizinho.
 */
function groupDropTargetAt(x, y, skipEl) {
  for (const hitEl of document.elementsFromPoint(x, y)) {
    const box = hitEl.closest?.(".lego-segment-box");
    if (!box || !box.__legoSeg) continue;
    if (skipEl && (skipEl === box || skipEl.contains(box))) continue;
    const vertical = box.classList.contains("vertical");
    const items = [...box.children].filter((c) => c.classList.contains("lego-segment-item") && c !== skipEl);
    let index = items.length;
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (vertical ? y < r.top + r.height / 2 : x < r.left + r.width / 2) { index = i; break; }
    }
    // `index` conta só os itens visíveis; converte para o índice na lista real.
    const seg = box.__legoSeg;
    const ref = items[index];
    const listIndex = ref ? seg.items.findIndex((it) => it.name === ref.dataset.name) : seg.items.length;
    return { box, seg, vertical, items, index, listIndex: listIndex < 0 ? seg.items.length : listIndex };
  }
  return null;
}

/** Zona (área de controles) sob o ponto. `skipEls`: o que está sendo arrastado. */
function zoneDropTargetAt(x, y, skipEls) {
  for (const hitEl of document.elementsFromPoint(x, y)) {
    if (skipEls && skipEls.some((s) => s && s.contains(hitEl))) continue;
    const zone = hitEl.closest?.(".lego-sec-controls");
    if (zone && zone.__legoList) return zone;
  }
  return null;
}

/**
 * Aba sob o ponto (as do cartão ou as sub-abas de uma zona). Soltar em cima
 * de uma aba leva o elemento para ela — é como se chega a outra aba no meio
 * de um arraste, já que a zona dela não está desenhada.
 */
function tabDropTargetAt(x, y) {
  for (const hitEl of document.elementsFromPoint(x, y)) {
    const tab = hitEl.closest?.(".lego-tab, .lego-subtab");
    if (tab && tab.__legoTabDrop) return tab;
  }
  return null;
}

/** Posiciona `ctrls` numa lista de zona a partir do canto livre mais próximo, mantendo a disposição entre eles. */
function placeInList(list, ctrls, baseX = 16, baseY = 16) {
  const minX = Math.min(...ctrls.map((c) => c.x ?? 0));
  const minY = Math.min(...ctrls.map((c) => c.y ?? 0));
  const bw = Math.max(...ctrls.map((c) => (c.x ?? 0) - minX + (c.w || 256)));
  const bh = Math.max(...ctrls.map((c) => (c.y ?? 0) - minY + (c.h || 46)));
  const spot = findFreeSpot(list, baseX, baseY, bw, bh);
  for (const c of ctrls) {
    c.x = Math.max(0, Math.round((spot.x + (c.x ?? 0) - minX) / GRID) * GRID);
    c.y = Math.max(0, Math.round((spot.y + (c.y ?? 0) - minY) / GRID) * GRID);
    list.push(c);
  }
}

/** Realça o grupo e desenha a linha onde o item vai entrar. */
function showGroupDrop(t) {
  clearDropFeedback();
  t.box.classList.add("drop-into");
  const line = el("div", `lego-drop-line ${t.vertical ? "h" : "v"}`);
  const boxR = t.box.getBoundingClientRect();
  const sc = boxR.width / (t.box.offsetWidth || boxR.width || 1);   // zoom do canvas
  const before = t.items[t.index];
  const after = t.items[t.index - 1];
  if (t.vertical) {
    const yPx = before
      ? before.getBoundingClientRect().top - 3
      : after ? after.getBoundingClientRect().bottom + 1 : boxR.top + 6;
    line.style.top = `${(yPx - boxR.top) / sc}px`;
  } else {
    const xPx = before
      ? before.getBoundingClientRect().left - 3
      : after ? after.getBoundingClientRect().right + 1 : boxR.left + 8;
    line.style.left = `${(xPx - boxR.left) / sc}px`;
  }
  t.box.append(line);
}

/** Converte um item de grupo em componente solto da zona (e vice-versa). */
function itemToZoneCtrl(item, x, y, wPx, hPx) {
  const c = { ...item, x: Math.max(0, Math.round(x / GRID) * GRID), y: Math.max(0, Math.round(y / GRID) * GRID) };
  const { minW, minH } = getComponentMinDimensions(c);
  // Solto na zona o controle ganha o rótulo ao lado (no grupo ele não tinha):
  // precisa de largura para os dois, senão o controle some espremido.
  const floorW = (is2DKind(item.kind) || item.kind === "label" || item.kind === "hdivider" || item.kind === "vdivider") ? minW : Math.max(minW, 224);
  c.w = Math.max(floorW, typeof item.w === "number" ? item.w : Math.round(wPx / GRID) * GRID || toolByKind(item.kind).w);
  c.h = Math.max(minH, typeof item.h === "number" ? item.h : Math.round(hPx / GRID) * GRID || toolByKind(item.kind).h);
  return c;
}

function zoneCtrlToItem(ctrl) {
  const it = { ...ctrl };
  delete it.x;
  delete it.y;
  delete it.width;
  delete it.height;
  // Dentro do grupo o item acompanha a largura do grupo; só o que tem corpo
  // (texto longo, mídia, output) guarda a altura que tinha.
  delete it.w;
  if (!is2DKind(it.kind) && !isGroupKind(it.kind)) delete it.h;
  return it;
}

/**
 * Arraste de um item que está DENTRO de um grupo: reordena no mesmo grupo,
 * passa para outro grupo ou sai para a zona como componente solto.
 */
function startGroupItemDrag(e, { host, state, item, fromList, itemEl }) {
  const startX = e.clientX;
  const startY = e.clientY;
  const srcR = itemEl.getBoundingClientRect();
  const sc = srcR.width / (itemEl.offsetWidth || srcR.width || 1);
  const grabX = startX - srcR.left;
  const grabY = startY - srcR.top;
  const undoSnapshot = JSON.stringify(host.properties[PROP] || {});
  let ghost = null;
  let target = null;   // { type: "group", ...groupDropTargetAt } | { type: "zone", zone }

  const onMove = (ev) => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
      ghost = itemEl.cloneNode(true);
      ghost.classList.add("lego-drag-ghost");
      ghost.classList.remove("selected");
      ghost.style.width = `${itemEl.offsetWidth}px`;
      ghost.style.height = `${itemEl.offsetHeight}px`;
      ghost.style.transform = `scale(${sc})`;
      document.body.append(ghost);
      itemEl.classList.add("drag-source");
    }
    ev.preventDefault();
    ev.stopPropagation();
    ghost.style.left = `${ev.clientX - grabX}px`;
    ghost.style.top = `${ev.clientY - grabY}px`;

    const g = groupDropTargetAt(ev.clientX, ev.clientY, itemEl);
    if (g) {
      target = { type: "group", ...g };
      showGroupDrop(g);
      return;
    }
    const tabEl = tabDropTargetAt(ev.clientX, ev.clientY);
    if (tabEl) {
      clearDropFeedback();
      tabEl.classList.add("drop-into");
      target = { type: "tab", tabEl };
      return;
    }
    const zone = zoneDropTargetAt(ev.clientX, ev.clientY);
    clearDropFeedback();
    if (zone) {
      target = { type: "zone", zone };
      zone.classList.add("drop-out");
    } else {
      target = null;
    }
  };

  const onUp = (ev) => {
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
    clearDropFeedback();
    itemEl.classList.remove("drag-source");
    if (!ghost) {
      // Foi só um clique: a seleção cuida disso. Num campo de texto, o
      // pointerdown barrado impediu o foco nativo — devolve para digitar.
      const field = e.target.closest?.("input, textarea, select");
      if (field) field.focus();
      return;
    }
    ghost.remove();
    ev.stopPropagation();
    swallowNextClick();
    if (!target) return;

    const from = fromList.indexOf(item);
    if (from < 0) return;
    if (target.type === "group") {
      const dest = target.seg.items || (target.seg.items = []);
      let at = target.listIndex;
      fromList.splice(from, 1);
      if (dest === fromList && from < at) at--;
      dest.splice(Math.max(0, Math.min(at, dest.length)), 0, item);
    } else if (target.type === "tab") {
      fromList.splice(from, 1);
      const moved = itemToZoneCtrl(item, 0, 0, srcR.width / sc, srcR.height / sc);
      placeInList(target.tabEl.__legoTabDrop.list(), [moved]);
      target.tabEl.__legoTabDrop.activate();
    } else {
      const zr = target.zone.getBoundingClientRect();
      const zsc = zr.width / (target.zone.offsetWidth || zr.width || 1);
      const x = (ev.clientX - grabX - zr.left) / zsc;
      const y = (ev.clientY - grabY - zr.top) / zsc;
      fromList.splice(from, 1);
      const moved = itemToZoneCtrl(item, x, y, srcR.width / sc, srcR.height / sc);
      target.zone.__legoList.push(moved);
    }
    pushUndoSnapshot(host, undoSnapshot);
    state.selectedName = item.name;
    state.selectedNames = new Set([item.name]);
    state.refresh();
  };

  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
}

function clearSubTabFeedback() {
  document.querySelectorAll(".lego-subtab.drop-before, .lego-subtab.drop-after")
    .forEach((e) => e.classList.remove("drop-before", "drop-after"));
  document.querySelectorAll(".lego-subtabs.drop-into, .lego-sec-h.drop-into")
    .forEach((e) => e.classList.remove("drop-into"));
}

/** Move uma sub-aba de zona (reordenar na mesma zona ou levar para outra). */
function moveSubTab(host, state, fromSec, fromIdx, toSec, toIdx) {
  if (!Array.isArray(fromSec.tabs) || !fromSec.tabs[fromIdx]) return;
  if (fromSec === toSec && (toIdx === fromIdx || toIdx === fromIdx + 1)) return;
  pushUndo(host);
  const [tab] = fromSec.tabs.splice(fromIdx, 1);
  if (fromSec === toSec && fromIdx < toIdx) toIdx--;
  if (!Array.isArray(toSec.tabs) || !toSec.tabs.length) {
    // Zona sem sub-abas: o que ela já tem vira a primeira aba e a nova entra
    // ao lado — nada do conteúdo dela se perde.
    toSec.tabs = [{ name: "Tab 1", controls: toSec.controls || [] }];
    delete toSec.controls;
    toIdx = 1;
  }
  toIdx = Math.max(0, Math.min(toIdx, toSec.tabs.length));
  toSec.tabs.splice(toIdx, 0, tab);
  toSec.activeTab = toIdx;
  if (fromSec !== toSec) {
    if (!fromSec.tabs.length) {
      delete fromSec.tabs;
      fromSec.controls = [];
      fromSec.activeTab = 0;
    } else {
      fromSec.activeTab = Math.min(fromSec.activeTab || 0, fromSec.tabs.length - 1);
    }
  }
  state.refresh();
}

function buildSegment(host, ctrl, state, sectionCtrls) {
  const isVertical = ctrl.kind === "vsegment";
  const box = el("div", `lego-segment-box ${isVertical ? "vertical" : "horizontal"}${state?.edit ? " in-edit" : ""}`);
  if (!Array.isArray(ctrl.items)) ctrl.items = [];
  box.__legoSeg = ctrl;   // alvo de arraste (ver groupDropTargetAt)

  // Duplo clique no segmento em modo de edição abre o seletor nativo com segmentCtrl
  if (state?.edit) {
    box.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      openInspector({
        host,
        layout: host.properties[PROP],
        section: { controls: sectionCtrls },
        state,
        segmentCtrl: ctrl
      });
    });
  }

  // 1. Renderiza cada item do segmento
  ctrl.items.forEach((item, idx) => {
    ensureComponentName(host.properties[PROP], item);
    const isDividerItem = item.kind === "hdivider" || item.kind === "vdivider";
    const isLabelItem = item.kind === "label";
    const isContainerItem = item.kind === "group" || item.kind === "segment" || item.kind === "vsegment";
    const isCosmeticItem = isDividerItem || isLabelItem;
    const isOutputItem = isOutputKind(item.kind);
    const isBalanceItem = item.kind === "balance";
    const hit = (!isCosmeticItem && !isContainerItem && !isOutputItem && !isBalanceItem && item.bind) ? resolveBind(host, item.bind) : null;
    const isBound = !!hit;
    const isUnbound = !isCosmeticItem && !isContainerItem && !isOutputItem && !isBalanceItem && !isBound;
    const isSelected = !!state?.edit && ((state?.selectedName && state.selectedName === item.name) || (state?.selectedNames && state.selectedNames.has(item.name)));

    const itemWrap = el(
      "div",
      `lego-segment-item kind-${item.kind}${state?.edit ? " editable" : ""}${isSelected ? " selected" : ""}${isBound ? " is-bound" : ""}${isUnbound ? " is-unbound" : ""}${isDividerItem ? " is-divider" : ""}${isLabelItem ? " is-label" : ""}`
    );
    itemWrap.dataset.itemName = item.name;
    itemWrap.dataset.name = item.name;
    if (item.labelAlign === "center" || item.labelAlign === "right") itemWrap.classList.add(`lbl-align-${item.labelAlign}`);
    if (item.color) {
      itemWrap.classList.add(item.color === "#000000" ? "tinted-solid" : "tinted");
      itemWrap.style.setProperty("--lego-c", item.color);
    }

    // Mesma regra dos componentes soltos: dentro do grupo o item também nasce
    // na menor largura, e só cresce se alguém pedir.
    const { minW: itemMinW, minH: itemMinH } = getComponentMinDimensions(item);
    if (typeof item.w === "number") {
      itemWrap.style.flex = "none";
      itemWrap.style.width = `${Math.max(itemMinW, item.w)}px`;
      // Num grupo horizontal a largura escolhida é a preferida: se o grupo
      // ficar mais estreito, o item encolhe até o mínimo do próprio conteúdo
      // (ver CSS) em vez de empurrar o grupo de volta.
      itemWrap.classList.add("has-custom-w");
    }
    const isMediaItem = isMediaKind(item.kind);
    const defaultH = isOutputItem ? (item.kind === "outaudio" ? 96 : 160) :
      (item.kind === "textarea") ? 80 :
      (isMediaItem ? 120 :
      (item.kind === "hdivider" ? 16 :
      (item.kind === "vdivider" ? 24 : null)));
    const effH = typeof item.h === "number" ? item.h : defaultH;
    if (typeof effH === "number") {
      itemWrap.style.height = `${Math.max(itemMinH, effH)}px`;
      itemWrap.classList.add("has-custom-h");
    }
    if (item.kind === "textarea") {
      itemWrap.style.minHeight = "64px";
      itemWrap.style.alignItems = "stretch";
    }
    if (isMediaItem) {
      itemWrap.style.minHeight = "80px";
      itemWrap.style.alignItems = "stretch";
      itemWrap.style.flexDirection = "column";
    }

    if (state?.edit) {
      // Arrastar o item: reordena no grupo, leva a outro grupo ou solta na
      // zona. Barra o pointerdown para não arrastar o grupo inteiro junto.
      itemWrap.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || state.armedTool) return;
        if (e.target.closest(".lego-item-actions, .lego-resizer-corner, .lego-slider-num-resizer")) return;
        e.stopPropagation();
        e.preventDefault();
        // Seleciona já no pointerdown: o clique em cima do controle (dropdown,
        // stepper) não chega ao item. Ctrl/Shift/Cmd somam à seleção; sem
        // tecla, um item que já faz parte da seleção a mantém.
        const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
        if (isMulti) selectComponent(host, state, item, ctrl.items, false, true);
        else if (!state.selectedNames?.has(item.name)) selectComponent(host, state, item, ctrl.items, false, false);
        startGroupItemDrag(e, { host, state, item, fromList: ctrl.items, itemEl: itemWrap });
      });
      itemWrap.ondragstart = (e) => e.preventDefault();
      // Ctrl/Shift+clique é só para selecionar: não abre o dropdown nem mexe
      // no controle que estiver embaixo do ponteiro.
      itemWrap.addEventListener("click", (e) => {
        if ((e.ctrlKey || e.metaKey || e.shiftKey) && !e.target.closest(".lego-item-actions, .lego-resizer-corner")) {
          e.stopPropagation();
          e.preventDefault();
        }
      }, true);

      itemWrap.addEventListener("click", (e) => {
        if (e.target.closest(".lego-item-actions") || e.target.closest(".lego-resizer-corner") || e.target.closest(".lego-slider-num-resizer")) return;
        e.stopPropagation();
        // Clique simples num item de uma seleção múltipla: fica só ele.
        const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
        if (!isMulti && state.selectedNames?.size > 1) selectComponent(host, state, item, ctrl.items, false, false);
      });

      itemWrap.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
        selectComponent(host, state, item, ctrl.items, true, isMulti);
      });

      const actionsWrap = el("div", "lego-item-actions");

      // Ícone de corrente (link) à esquerda do 'x'. No output ele escolhe o
      // NÓ de origem em vez de um widget.
      if (isOutputItem) {
        const srcOk = !item.source || !!findNodeInHostScope(host, item.source);
        const srcSubBtn = glyphBtn(`lego-item-link-btn ${srcOk ? "is-bound" : "is-unbound"}`, "link", 10);
        srcSubBtn.title = `Source: ${outputSourceLabel(host, item)} (click to change)`;
        srcSubBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openOutputSourceDialog(host, item, state, ctrl.items);
        });
        actionsWrap.append(srcSubBtn);
      } else if (isBalanceItem) {
        const ok = [item.bind, item.bind2].every((b) => b && resolveBind(host, b));
        const balBtn = glyphBtn(`lego-item-link-btn ${ok ? "is-bound" : "is-unbound"}`, "link", 10);
        balBtn.title = `Link A: ${item.bind || "none"} · Link B: ${item.bind2 || "none"} (click to change)`;
        balBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openLegoContextMenu(e, balanceLinkEntries(host, item, state, ctrl.items));
        });
        actionsWrap.append(balBtn);
      } else if (!isDividerItem && !isLabelItem && !isContainerItem) {
        const linkSubBtn = glyphBtn(
          `lego-item-link-btn ${isBound ? "is-bound" : "is-unbound"}`,
          "link",
          10
        );
        linkSubBtn.title = isBound
          ? `Linked to: ${item.bind} (click to change target)`
          : "Unbound — click to pick a workflow parameter";
        linkSubBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openInspector({
            host,
            layout: host.properties[PROP],
            section: { controls: sectionCtrls },
            state,
            forFilterKind: item.kind === "text" ? "" : item.kind,
            targetCallback: (target) => {
              if (!target || target.isRaw) return;
              item.bind = target.bind;
              item.label = target.name || target.label;
              state.refresh();
            }
          });
        });
        actionsWrap.append(linkSubBtn);
      }

      // Botão de duplicar / copiar dentro do grupo (para itens não linkados ou cosméticos)
      if (!isBound || isDividerItem || isLabelItem || isContainerItem) {
        const dupSubBtn = glyphBtn("lego-item-dup-btn", "copy", 10);
        dupSubBtn.title = "Duplicate control inside group (Ctrl+C, Ctrl+V, Ctrl+D)";
        dupSubBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          duplicateComponent(host, state, item, ctrl.items, 0);
        });
        actionsWrap.append(dupSubBtn);
      }

      // Cor do item (o mesmo botão dos componentes soltos).
      actionsWrap.append(colorDotButton("lego-item-color-btn", item.color, "Color",
        (color) => setComponentColor(host, state, item, color)));

      // Botão 'x' (fechar / remover)
      const delSubBtn = glyphBtn("lego-item-del-btn", "close", 10);
      delSubBtn.title = "Remove this control";
      delSubBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        pushUndo(host);
        ctrl.items.splice(idx, 1);
        state.refresh();
      });
      actionsWrap.append(delSubBtn);

      itemWrap.append(actionsWrap);

      // Alça de redimensionamento de canto dentro do grupo (para todos os elementos, incluindo divisores)
      const itemResizer = el("div", "lego-resizer-corner");
      itemResizer.title = "Drag to resize inside group (Snap 16px)";
      itemResizer.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        itemResizer.classList.add("active");
        itemWrap.classList.add("resizing");

        const undoSnapshot = JSON.stringify(host.properties[PROP] || {});
        // Item de uma seleção múltipla: redimensiona todos os selecionados
        // deste grupo juntos (mesma variação), como os componentes soltos.
        if (!state.selectedNames?.has(item.name)) selectComponent(host, state, item, ctrl.items, false);
        // Altura só é redimensionável em grupo vertical ou item 2D (mídia, texto longo, output…).
        const resizesH = isVertical || is2DKind(item.kind) || item.kind === "vdivider";

        const startClientX = e.clientX;
        const startClientY = e.clientY;
        const origW = itemWrap.offsetWidth;
        const origH = itemWrap.offsetHeight;
        const curScale = domScale();

        let finalW = origW;
        let finalH = origH;
        const minW = itemMinW;
        const minH = itemMinH;

        // Selecionados em qualquer grupo (ou soltos) do cartão redimensionam
        // juntos; as guias comparam com os itens de todos os grupos da zona.
        const card = host.__legoHost || box.closest(".lego-card") || document;
        const layoutNow = host.properties[PROP];
        const byName = new Map();
        walkControls(layoutNow, (c, list) => { if (c?.name) byName.set(c.name, { c, list }); });
        const elByName = (nm) => [...card.querySelectorAll(".lego-segment-item, .lego-row")].find((x) => x.dataset.name === nm) || null;
        const others = (state.selectedNames?.size > 1)
          ? [...state.selectedNames].filter((nm) => nm !== item.name).map((nm) => {
            const hitC = byName.get(nm);
            const oel = elByName(nm);
            if (!hitC || !oel || isGroupKind(hitC.c.kind)) return null;
            return { it: hitC.c, el: oel, w0: oel.offsetWidth, h0: oel.offsetHeight, min: getComponentMinDimensions(hitC.c), loose: oel.classList.contains("lego-row") };
          }).filter(Boolean)
          : [];
        // Guias em coordenadas da zona (a linha pode ligar itens de grupos diferentes).
        const zoneEl = box.closest(".lego-sec-controls") || box;
        const zr = zoneEl.getBoundingClientRect();
        const sc = domScale() || 1;
        const localRect = (x) => { const r = x.getBoundingClientRect(); return { l: (r.left - zr.left) / sc, t: (r.top - zr.top) / sc, w: r.width / sc, h: r.height / sc }; };
        const me = localRect(itemWrap);
        const x0 = me.l, y0 = me.t;
        const sibs = [...zoneEl.querySelectorAll(".lego-segment-item, .lego-row:not(.is-segment)")]
          .filter((c) => c !== itemWrap && !c.contains(itemWrap) && !others.some((o) => o.el === c))
          .map(localRect);
        let guides = [];
        const clearItemGuides = () => { guides.forEach((g) => g.remove()); guides = []; };
        const SNAP = 6;
        let matched = [];
        const snapAxis = (raw, start, key0, keyS) => {
          // Borda final alinhada com a de outro item, ou mesmo tamanho que ele.
          let best = null, diff = SNAP + 1;
          for (const sb of sibs) {
            const edge = sb[key0] + sb[keyS] - start;
            for (const cand of [edge, sb[keyS]]) {
              const d = Math.abs(cand - raw);
              if (d < diff) { diff = d; best = cand; }
            }
          }
          matched = best == null ? [] : sibs.filter((sb) => Math.abs(sb[key0] + sb[keyS] - start - best) < 1 || Math.abs(sb[keyS] - best) < 1);
          return best;
        };
        const guide = (vertical, pos) => {
          const g = el("div", `lego-align-guide ${vertical ? "v" : "h"}`);
          const span = [me, ...matched];
          if (vertical) {
            const top = Math.min(...span.map((r) => r.t)) - 6, bot = Math.max(...span.map((r) => r.t + r.h)) + 6;
            g.style.left = `${pos}px`; g.style.top = `${top}px`; g.style.height = `${bot - top}px`;
          } else {
            const left = Math.min(...span.map((r) => r.l)) - 6, right = Math.max(...span.map((r) => r.l + r.w)) + 6;
            g.style.top = `${pos}px`; g.style.left = `${left}px`; g.style.width = `${right - left}px`;
          }
          zoneEl.append(g);
          guides.push(g);
        };

        const onMove = (ev) => {
          ev.stopPropagation();
          const deltaX = (ev.clientX - startClientX) / curScale;
          const deltaY = (ev.clientY - startClientY) / curScale;
          clearItemGuides();

          const rawW = origW + deltaX;
          const snapW = ev.shiftKey ? null : snapAxis(rawW, x0, "l", "w");
          finalW = Math.max(minW, snapW != null ? Math.round(snapW) : Math.round(rawW / GRID) * GRID);
          if (snapW != null) guide(true, x0 + finalW);
          itemWrap.style.flex = "none";
          itemWrap.style.width = `${finalW}px`;
          itemWrap.classList.add("has-custom-w");

          if (resizesH) {
            const rawH = origH + deltaY;
            const snapH = ev.shiftKey ? null : snapAxis(rawH, y0, "t", "h");
            finalH = Math.max(minH, snapH != null ? Math.round(snapH) : Math.round(rawH / GRID) * GRID);
            if (snapH != null) guide(false, y0 + finalH);
            itemWrap.style.height = `${finalH}px`;
            itemWrap.classList.add("has-custom-h");
          }
          for (const o of others) {
            o.nw = Math.max(o.min.minW, o.w0 + finalW - origW);
            o.el.style.flex = "none";
            o.el.style.width = `${o.nw}px`;
            if (resizesH) { o.nh = Math.max(o.min.minH, o.h0 + finalH - origH); o.el.style.height = `${o.nh}px`; }
          }
        };

        const onUp = (ev) => {
          ev?.stopPropagation();
          itemResizer.classList.remove("active");
          itemWrap.classList.remove("resizing");

          window.removeEventListener("pointermove", onMove, true);
          window.removeEventListener("pointerup", onUp, true);
          window.removeEventListener("pointercancel", onUp, true);
          window.removeEventListener("mousemove", onMove, true);
          window.removeEventListener("mouseup", onUp, true);

          clearItemGuides();
          // Clique sem arrastar não fixa o tamanho (o item segue flexível).
          if (finalW === origW && finalH === origH) { state.refresh(); return; }
          item.w = finalW;
          if (resizesH) item.h = finalH;
          for (const o of others) {
            if (o.nw != null) o.it.w = o.nw;
            if (resizesH && o.nh != null) o.it.h = o.nh;
          }
          pushUndoSnapshot(host, undoSnapshot);
          state.refresh();
        };

        window.addEventListener("pointermove", onMove, true);
        window.addEventListener("pointerup", onUp, true);
        window.addEventListener("pointercancel", onUp, true);
        window.addEventListener("mousemove", onMove, true);
        window.addEventListener("mouseup", onUp, true);
      });
      itemWrap.append(itemResizer);
    }

    if (isDividerItem) {
      const divLine = el("div", `lego-divider ${item.kind === "vdivider" ? "v" : "h"}`);
      if (item.kind === "vdivider") {
        divLine.style.height = "100%";
        divLine.style.minHeight = "22px";
        divLine.style.margin = "0 4px";
      } else {
        divLine.style.width = "100%";
        divLine.style.margin = "4px 0";
      }
      itemWrap.append(divLine);
    } else if (isLabelItem) {
      const textSpan = el("span", "lego-item-label-text", item.text || item.label || "Label");
      // Mesmo visual dos rótulos do grupo empilhado (e de um widget nativo).
      textSpan.style.cssText = "font-size:11px; font-weight:500; color:var(--lego-dim, #a0a0a0); user-select:none; display:flex; width:100%;";
      applyLabelStyle(textSpan, item);
      if (state?.edit) {
        // Duplo clique (como o rótulo solto): o clique simples só seleciona.
        textSpan.title = "Double-click to edit text";
        itemWrap.addEventListener("dblclick", (e) => {
          if (e.target.closest(".lego-item-del-btn") || e.target.closest(".lego-resizer-corner")) return;
          e.stopPropagation();
          const val = prompt("Edit label text:", item.text || item.label || "Label");
          if (val !== null) {
            item.text = val;
            item.label = val;
            state.refresh();
          }
        });
      }
      itemWrap.append(textSpan);
    } else if (isContainerItem) {
      if (!Array.isArray(item.items)) item.items = [];
      itemWrap.style.display = "flex";
      itemWrap.style.flexDirection = "column";
      itemWrap.style.alignItems = "stretch";
      itemWrap.style.overflow = "visible";
      itemWrap.style.height = "auto";
      const innerSeg = buildSegment(host, item, state, sectionCtrls);
      innerSeg.style.flex = "1";
      innerSeg.style.minHeight = "32px";
      innerSeg.style.overflow = "visible";
      itemWrap.append(innerSeg);
    } else if (isBalanceItem) {
      const bal = mkBalance(host, item, state);
      bal.style.flex = "1";
      itemWrap.append(bal);
    } else if (isOutputItem) {
      const labelPos = item.labelPos || "left";
      if (labelPos !== "none" && item.label && item.label !== item.name) {
        itemWrap.append(el("span", "lego-item-label", item.label));
      }
      const view = mkOutputView(host, item, state);
      view.style.flex = "1";
      itemWrap.append(view);
    } else if (!hit) {
      // Elemento Unbound: renderiza normal, com a cara nativa do controle!
      const labelPos = item.labelPos || "left";
      if (labelPos !== "none" && item.label) {
        if (isMediaItem) {
          const topBar = el("div", "lego-item-top");
          if (labelPos === "right") topBar.style.justifyContent = "flex-end";
          topBar.append(el("span", "lego-item-label", item.label));
          itemWrap.append(topBar);
        } else if (isVertical && item.kind !== "combo" && item.kind !== "slider" && item.kind !== "textarea") {
          itemWrap.append(el("span", "lego-item-label", item.label));
        }
      }
      const ghost = ghostControl(item.kind, item);
      itemWrap.append(ghost);

      if (state?.edit) {
        itemWrap.title = `${item.label || item.kind} (Unbound — double click or click chain to pick parameter)`;
        itemWrap.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          openInspector({
            host,
            layout: host.properties[PROP],
            section: { controls: sectionCtrls },
            state,
            forFilterKind: item.kind === "text" ? "" : item.kind,
            targetCallback: (target) => {
              if (!target || target.isRaw) return;
              item.bind = target.bind;
              item.label = target.name || target.label;
              state.refresh();
            }
          });
        });
      }
    } else {
      // Elemento Bound: renderiza o controle real vinculado
      const { node, widget: w } = hit;
      const labelPos = item.labelPos || "left";

      if (labelPos !== "none" && (item.label || w.name)) {
        if (isMediaItem) {
          const topBar = el("div", "lego-item-top");
          if (labelPos === "right") topBar.style.justifyContent = "flex-end";
          topBar.append(el("span", "lego-item-label", item.label || prettify(w.name)));
          itemWrap.append(topBar);
        } else if (isVertical && item.kind !== "textarea" && !is2DKind(item.kind)
          && ((item.kind !== "combo" && item.kind !== "slider") || item.labelPos === "left")) {
          // Rótulo à esquerda, controle à direita: a linha de widget do nó nativo.
          itemWrap.append(el("span", "lego-item-label", item.label || prettify(w.name)));
          itemWrap.classList.add("has-inline-label");
        }
      }

      const special = mkSpecialControl(node, w, item, state);
      if (special) {
        itemWrap.append(special);
      } else if (item.kind === "toggle") {
        itemWrap.append(mkToggle(node, w, item, state));
      } else if (item.kind === "combo") {
        const combo = mkCombo(node, w, item, state);
        combo.style.flex = "1";
        combo.style.minWidth = "80px";
        itemWrap.append(combo);
      } else if (item.kind === "number") {
        // Seed mantém o controle de seed também dentro do grupo (como solto).
        itemWrap.append(item.seed ? mkNumber(node, w, item, state) : mkStepNumber(node, w, item, state));
      } else if (item.kind === "slider") {
        itemWrap.append(mkSlider(node, w, item, state));
      } else if (item.kind === "textarea") {
        const ta = mkText(node, w, item, state, true);
        ta.style.flex = "1";
        ta.style.width = "100%";
        ta.style.height = "100%";
        ta.style.minHeight = "64px";
        ta.style.boxSizing = "border-box";
        ta.style.resize = "none";
        itemWrap.append(ta);
      } else if (isMediaItem) {
        const mediaCtrl = mkMediaControl(node, w, item, state, itemWrap, item.kind);
        mediaCtrl.style.width = "100%";
        mediaCtrl.style.flex = "1";
        mediaCtrl.style.minHeight = "0";
        itemWrap.append(mediaCtrl);
      } else if (item.kind === "button") {
        itemWrap.append(mkButton(node, w, item));
      } else {
        itemWrap.append(mkText(node, w, item, state, false));
      }

      if (state?.edit) {
        itemWrap.title = `Function: ${item.bind} (Double click or click chain to change target)`;
        itemWrap.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          openInspector({
            host,
            layout: host.properties[PROP],
            section: { controls: sectionCtrls },
            state,
            forFilterKind: item.kind === "text" ? "" : item.kind,
            targetCallback: (target) => {
              if (!target || target.isRaw) return;
              item.bind = target.bind;
              item.label = target.name || target.label;
              state.refresh();
            }
          });
        });
      }
    }

    box.append(itemWrap);
  });

  // Interações de adição no grupo no modo de edição
  if (state?.edit) {
    // Permite soltar ferramenta armada clicando no fundo do grupo
    box.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".lego-seg-quick-btn") || e.target.closest(".lego-resizer-corner") || e.target.closest(".lego-item-actions")) {
        return;
      }
      if (state.armedTool) {
        e.stopPropagation();
      }
    });

    box.addEventListener("click", (e) => {
      if (e.target.closest(".lego-segment-item") || e.target.closest(".lego-seg-quick-btn")) return;
      if (state.armedTool) {
        e.stopPropagation();
        e.preventDefault();
        const tool = state.armedTool;
        if (!e.shiftKey) state.armedTool = null;
        addItemToSegment(host, state, ctrl, tool);
      }
    });

    // Permite arrastar da paleta e soltar diretamente dentro do grupo
    box.addEventListener("dragover", (e) => {
      if (state.draggingComponent) {
        e.preventDefault();
        e.stopPropagation();
        box.classList.add("drag-over");
      }
    });
    box.addEventListener("dragleave", () => {
      box.classList.remove("drag-over");
    });
    box.addEventListener("drop", (e) => {
      box.classList.remove("drag-over");
      if (state.draggingComponent) {
        e.preventDefault();
        e.stopPropagation();
        const d = state.draggingComponent;
        state.draggingComponent = null;
        addItemToSegment(host, state, ctrl, { kind: d.kind });
      }
    });

    // O "+ Add" fica na barra flutuante do grupo (buildControl), junto de
    // configurar, duplicar e remover — não mais dentro do grupo.
    if (!ctrl.items.length) {
      const hint = el("div", "lego-seg-empty-hint", "Empty group — use + above or drag elements here");
      box.append(hint);
    }
  }

  if (ctrl.items.length === 0 && !state?.edit) {
    const emptyHint = el("div", null, isVertical ? "Empty Vertical Group" : "Empty Group");
    emptyHint.style.cssText = "font-size:11.5px; color:#64748b; font-style:italic;";
    box.append(emptyHint);
  }

  return box;
}

export { domScale, isMediaKind, is2DKind, swallowNextClick, clearDropFeedback, groupDropTargetAt, zoneDropTargetAt, tabDropTargetAt, placeInList, showGroupDrop, itemToZoneCtrl, zoneCtrlToItem, startGroupItemDrag, clearSubTabFeedback, moveSubTab, buildSegment };
