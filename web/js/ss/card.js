/* buildCard: o cartão inteiro (cabeçalho, abas, zonas, componentes, redimensionadores). */
// Parte do ComfyUI-SuperSubgraph (ver web/js/super_subgraph.js e CLAUDE.md).
// Só declarações: nada roda ao carregar este arquivo.

import { GRID, MIN_W, PROP } from "./constants.js";
import { pushUndo, showLegoToast } from "./core.js";
import { eatPointer, el, glyph, glyphBtn, glyphTextBtn } from "./controls.js";
import { clearSubTabFeedback, domScale, isMediaKind, moveSubTab, zoneDropTargetAt } from "./drag.js";
import { buildControl } from "./panels.js";
import { clearZoneGuides, colWidthCss, getContiguousRow, getDropDirection, groupSectionsLayout, makeRowId, renderZoneGuides, sameRow, sectionRequiredHeight, sectionRequiredWidth, snapWidth, widthForCount, widthToCss } from "./whole_node.js";
import { isGroupKind, openComponentSearchMenu, openInspector, openManageTabModal, openTabContextMenu } from "./picker.js";
import { addZoneBelow, addZoneBeside, buildToolPalette, dropArmedTool, findFreeSpot, makeComponent, makeZone, openAddZoneModal, openColorMenu, toolByKind, visibleControlsOf } from "./form.js";
import { addSubTabTo, addTab, leaveEditMode, removeTabAt, renderObjectInspector, selectComponent } from "./inspector.js";
import { applyNodeColorTheme, resize } from "./lifecycle.js";
import { enterSuper, isSuperNode, openNodeMenuFromCard, openSuperMenu } from "./native.js";

function buildCard(host, state) {
  const layout = host.properties[PROP];
  const root = el("div", `lego-card${state.edit ? " editing" : ""}`);
  // Botão direito no cartão (fora de um componente, que tem menu próprio, e
  // fora de campos de texto, que ficam com o menu do navegador): menu do nó.
  root.addEventListener("contextmenu", (e) => {
    e.stopPropagation();
    if (e.defaultPrevented || e.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
    openNodeMenuFromCard(host, e);
  });
  applyNodeColorTheme(host, root);

  /* — cabeçalho — */
  const head = el("div", "lego-head");
  const txt = el("div", "lego-head-txt");
  const titleRow = el("div", "lego-title-row");
  const titleText = layout.title || host.title || "NEW SUBGRAPH";
  const title = el("div", "lego-title", titleText);

  const editTitlePrompt = () => {
    const current = layout.title || host.title || "NEW SUBGRAPH";
    const v = prompt("Subgraph title:", current);
    if (v != null && v.trim()) {
      pushUndo(host);
      layout.title = v.trim();
      if (host.title !== undefined) host.title = layout.title;
      state.refresh();
    }
  };

  title.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    editTitlePrompt();
  });
  titleRow.append(title);

  if (state.edit) {
    title.classList.add("editable");
    title.title = "Click or double-click to rename subgraph";
    title.addEventListener("click", (e) => {
      e.stopPropagation();
      editTitlePrompt();
    });
    const editTitleBtn = el("button", "lego-title-edit-btn");
    editTitleBtn.type = "button";
    editTitleBtn.innerHTML = glyph("pencil", 12);
    editTitleBtn.title = "Rename subgraph";
    editTitleBtn.addEventListener("pointerdown", eatPointer);
    editTitleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      editTitlePrompt();
    });
    titleRow.append(editTitleBtn);
  }
  txt.append(titleRow);
  head.append(txt);

  if (isSuperNode(host)) {
    const enter = glyphBtn("lego-iconbtn lego-ss-enter", "enter", 13, "Open this SuperSubgraph to explore and edit the nodes inside");
    enter.addEventListener("pointerdown", eatPointer);
    enter.addEventListener("click", (e) => { e.stopPropagation(); enterSuper(host); });
    head.append(enter);
  }

  const more = glyphBtn("lego-iconbtn lego-more-btn", "more", 13, "SuperSubgraph menu (layouts, save, files…)");
  more.addEventListener("pointerdown", eatPointer);
  more.addEventListener("click", (e) => openSuperMenu(host, e));
  head.append(more);

  const pencil = glyphBtn(`lego-iconbtn${state.edit ? " on" : ""}`, "pencil", 12);
  pencil.title = "Edit layout mode";
  pencil.addEventListener("pointerdown", eatPointer);
  pencil.addEventListener("click", (e) => {
    e.stopPropagation();
    state.edit = !state.edit;
    if (!state.edit) leaveEditMode(state);
    state.refresh();
  });
  head.append(pencil);

  root.append(head);

  /* — abas — */
  const tabs = layout.tabs || [];
  if (tabs.length > 1 || state.edit) {
    const bar = el("div", "lego-tabs");
    tabs.forEach((t, i) => {
      const isSel = i === (layout.activeTab || 0);
      const tab = el("div", `lego-tab${isSel ? " sel" : ""}`);
      tab.append(el("span", "lego-tab-title", t.name));
      // Alvo de arraste: soltar aqui leva o elemento para a 1ª zona desta aba.
      tab.__legoTabDrop = {
        list: () => {
          if (!Array.isArray(t.sections) || !t.sections.length) t.sections = [makeZone(String(t.name || "ZONE").toUpperCase())];
          return visibleControlsOf(t.sections[0]);
        },
        activate: () => { layout.activeTab = i; },
      };

      // Em modo de edição, adiciona botões de ação na própria aba
      if (state.edit) {
        const actions = el("span", "lego-tab-actions");
        const editBtn = el("button", "lego-tab-btn");
        editBtn.innerHTML = glyph("pencil", 12);
        editBtn.title = "Rename or manage tab";
        editBtn.addEventListener("pointerdown", eatPointer);
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openManageTabModal({
            tab: t,
            tabs,
            tabIndex: i,
            isSubTab: false,
            onUpdate: () => state.refresh(),
            onDelete: () => {
              removeTabAt(layout, tabs, i);
              state.refresh();
            }
          });
        });
        actions.append(editBtn);

        if (tabs.length > 1) {
          const delBtn = glyphBtn("lego-tab-btn del", "close", 10);
          delBtn.title = "Delete tab";
          delBtn.addEventListener("pointerdown", eatPointer);
          delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirm(`Delete tab "${t.name}" and its zones?`)) {
              removeTabAt(layout, tabs, i);
              state.refresh();
            }
          });
          actions.append(delBtn);
        }
        tab.append(actions);
      }

      tab.addEventListener("pointerdown", eatPointer);
      tab.addEventListener("click", (e) => {
        e.stopPropagation();
        layout.activeTab = i;
        state.refresh();
      });

      // Duplo-clique para gerenciar/renomear/excluir
      tab.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        if (!state.edit) return;
        openManageTabModal({
          tab: t,
          tabs,
          tabIndex: i,
          isSubTab: false,
          onUpdate: () => state.refresh(),
          onDelete: () => {
            removeTabAt(layout, tabs, i);
            state.refresh();
          }
        });
      });

      // Clique com botão direito: Menu de Contexto
      tab.addEventListener("contextmenu", (e) => {
        if (!state.edit) return;
        openTabContextMenu(e, {
          tab: t,
          tabs,
          tabIndex: i,
          isSubTab: false,
          onUpdate: () => state.refresh(),
          onDelete: () => {
            removeTabAt(layout, tabs, i);
            state.refresh();
          },
          onAdd: () => {
            if (addTab(layout, tabs)) state.refresh();
          }
        });
      });

      bar.append(tab);
    });
    if (state.edit) {
      const add = el("div", "lego-tab-add");
      add.innerHTML = glyph("plus", 12);
      add.title = "New tab";
      add.addEventListener("pointerdown", eatPointer);
      add.addEventListener("click", (e) => {
        e.stopPropagation();
        if (addTab(layout, tabs)) state.refresh();
      });
      bar.append(add);
    }
    root.append(bar);
  }

  /* — corpo — */
  const cur = tabs[layout.activeTab || 0];

  // Paleta de ferramentas: só aparece em modo de edição, como no Delphi.
  if (state.edit && cur) root.append(buildToolPalette(host, cur, state));
  if (state.armedTool) root.classList.add("armed");

  const body = el("div", "lego-body");

  if (!cur) {
    body.append(el("div", "lego-empty", "empty tab"));
  } else {

    const sections = cur.sections || (cur.sections = []);

    function buildSectionElement(s, sIdx, isFullWidth, isStretch = false) {
      const sec = el("div", `lego-sec${s.color ? " tinted" : ""}${isStretch ? " lego-sec-stretch" : ""}`);
      sec.__legoSec = s;   // referência à seção para snapping direto
      if (s.color) sec.style.setProperty("--lego-zone-c", s.color);
      sec.addEventListener("pointerdown", () => { state.activeSection = s; });

      const reqW = sectionRequiredWidth(s);

      // Aplica a largura do Card (100% ou container flex da coluna)
      if (isFullWidth) {
        const secW = s.width || (s.w ? `${s.w}px` : "100%");
        const cssW = widthToCss(secW);
        sec.style.width = cssW;
        sec.style.flex = `0 0 ${cssW}`;
        sec.style.minWidth = "0";
        sec.style.maxWidth = cssW;
        sec.style.boxSizing = "border-box";
      } else {
        sec.style.width = "100%";
        sec.style.maxWidth = "100%";
        sec.style.minWidth = "0";
        sec.style.boxSizing = "border-box";
        if (isStretch) {
          sec.style.flex = "1 1 auto";
          sec.style.minHeight = "100%";
        } else {
          sec.style.flex = "0 0 auto";
        }
      }

      if (s.height) {
        sec.style.minHeight = s.height;
      }

      // Determina o destino ativo para controles (se a zona tiver sub-abas, usa a aba ativa)
      const hasSubTabs = Array.isArray(s.tabs) && s.tabs.length > 0;
      let activeTarget = s;
      let list = s.controls || (s.controls = []);

      if (hasSubTabs) {
        const curSubIdx = Math.min(Math.max(0, s.activeTab || 0), s.tabs.length - 1);
        s.activeTab = curSubIdx;
        activeTarget = s.tabs[curSubIdx];
        list = activeTarget.controls || (activeTarget.controls = []);
      }

      // Suporte a Drop Target 4-Way inteligente (cima, baixo, esquerda, direita)
      sec.addEventListener("dragover", (e) => {
        if (state.draggingSection && state.draggingSection.sec !== s) {
          e.preventDefault();
          const rect = sec.getBoundingClientRect();
          const dir = getDropDirection(e, rect);

          sec.classList.remove("lego-drop-top", "lego-drop-bottom", "lego-drop-side-right", "lego-drop-side-left");
          if (dir === "top") sec.classList.add("lego-drop-top");
          else if (dir === "bottom") sec.classList.add("lego-drop-bottom");
          else if (dir === "left") sec.classList.add("lego-drop-side-left");
          else if (dir === "right") sec.classList.add("lego-drop-side-right");

          // Linhas de nível em tempo real no manejo de zonas
          const bodyRect = body.getBoundingClientRect();
          const curScale = domScale();
          const zoneTitle = s.header || "Zona";
          if (dir === "top") {
            renderZoneGuides(body, {
              hLine: {
                y: (rect.top - bodyRect.top) / curScale,
                snap: true,
                badgeText: `⚡ Nível Superior · Inserir acima de "${zoneTitle}"`,
                badgeX: (rect.left - bodyRect.left) / curScale + (rect.width / curScale) / 2
              }
            });
          } else if (dir === "bottom") {
            renderZoneGuides(body, {
              hLine: {
                y: (rect.bottom - bodyRect.top) / curScale,
                snap: true,
                badgeText: `⚡ Nível Inferior · Inserir abaixo de "${zoneTitle}"`,
                badgeX: (rect.left - bodyRect.left) / curScale + (rect.width / curScale) / 2
              }
            });
          } else if (dir === "left") {
            renderZoneGuides(body, {
              vLine: {
                x: (rect.left - bodyRect.left) / curScale,
                snap: true,
                badgeText: `⚡ Nova Coluna à Esquerda (50% / 50%)`,
                badgeY: (rect.top - bodyRect.top) / curScale + 24
              }
            });
          } else if (dir === "right") {
            renderZoneGuides(body, {
              vLine: {
                x: (rect.right - bodyRect.left) / curScale,
                snap: true,
                badgeText: `⚡ Nova Coluna à Direita (50% / 50%)`,
                badgeY: (rect.top - bodyRect.top) / curScale + 24
              }
            });
          }
        } else if (state.draggingComponent) {
          e.preventDefault();
          sec.classList.add("drop-target");
        }
      });

      sec.addEventListener("dragleave", () => {
        sec.classList.remove("lego-drop-top", "lego-drop-bottom", "lego-drop-side-right", "lego-drop-side-left", "drop-target");
        clearZoneGuides(body);
      });

      sec.addEventListener("drop", (e) => {
        sec.classList.remove("lego-drop-top", "lego-drop-bottom", "lego-drop-side-right", "lego-drop-side-left", "drop-target");
        clearZoneGuides(body);

        // 1. Arrastando uma ZONA sobre outra ZONA
        if (state.draggingSection && state.draggingSection.sec !== s) {
          e.preventDefault();
          const rect = sec.getBoundingClientRect();
          const dir = getDropDirection(e, rect);

          pushUndo(host);
          const fromIdx = state.draggingSection.fromIndex;
          const moved = sections[fromIdx];
          state.draggingSection = null;
          if (!moved || moved === s) return;

          // 1. Remove da posição original
          sections.splice(fromIdx, 1);

          // 2. Insere na nova posição conforme a direção de encaixe (4-Way)
          const targetIdx = sections.indexOf(s);
          const isTargetCol = s.width && s.width !== "100%";

          if (dir === "top" || dir === "bottom") {
            if (isTargetCol) {
              // Empilha na MESMA COLUNA da zona alvo
              moved.col = typeof s.col === "number" ? s.col : 0;
              moved.width = s.width;
              moved.row = s.row;   // herda o row do grupo alvo
              const insertIdx = (dir === "bottom") ? targetIdx + 1 : targetIdx;
              sections.splice(insertIdx, 0, moved);
            } else {
              // Alvo é 100% full-width: vira uma linha própria de 100%
              moved.width = "100%";
              delete moved.col;
              delete moved.row;
              const insertIdx = (dir === "bottom") ? targetIdx + 1 : targetIdx;
              sections.splice(insertIdx, 0, moved);
            }
          } else {
            // LADO A LADO ("left" ou "right"): cria ou junta em uma nova coluna
            if (isTargetCol) {
              const targetCol = typeof s.col === "number" ? s.col : 0;
              let start = targetIdx;
              while (start > 0 && sections[start - 1].width && sections[start - 1].width !== "100%") {
                if (!sameRow(s, sections[start - 1])) break;
                start--;
              }
              let end = targetIdx;
              while (end < sections.length - 1 && sections[end + 1].width && sections[end + 1].width !== "100%") {
                if (!sameRow(s, sections[end + 1])) break;
                end++;
              }
              const colSecs = sections.slice(start, end + 1);

              if (dir === "left") {
                colSecs.forEach((x) => {
                  if (typeof x.col === "number" && x.col >= targetCol) x.col++;
                });
                moved.col = targetCol;
                moved.row = s.row;   // herda o row do grupo
                sections.splice(targetIdx, 0, moved);
              } else {
                colSecs.forEach((x) => {
                  if (typeof x.col === "number" && x.col > targetCol) x.col++;
                });
                moved.col = targetCol + 1;
                moved.row = s.row;   // herda o row do grupo
                let lastInCol = targetIdx;
                for (let i = start; i <= end; i++) {
                  if (sections[i].col === targetCol) lastInCol = i;
                }
                sections.splice(lastInCol + 1, 0, moved);
              }

              // Rebalanceia as larguras das colunas desse grupo
              let groupStart = start;
              let groupEnd = end + 1;
              const colsSet = new Set();
              for (let i = groupStart; i <= groupEnd; i++) {
                if (sections[i] && typeof sections[i].col === "number") colsSet.add(sections[i].col);
              }
              const newW = widthForCount(colsSet.size);
              for (let i = groupStart; i <= groupEnd; i++) {
                if (sections[i]) sections[i].width = newW;
              }
            } else {
              // Alvo é 100%: divide em duas colunas de 50%!
              const sharedRow = makeRowId();
              s.width = "50%";
              moved.width = "50%";
              s.row = sharedRow;
              moved.row = sharedRow;
              if (dir === "left") {
                s.col = 1;
                moved.col = 0;
                sections.splice(targetIdx, 0, moved);
              } else {
                s.col = 0;
                moved.col = 1;
                sections.splice(targetIdx + 1, 0, moved);
              }
            }
          }

          state.refresh();
          return;
        }

        // 3. Drop de novo componente da Paleta
        if (state.draggingComponent) {
          e.preventDefault();
          const d = state.draggingComponent;
          state.draggingComponent = null;
          const list = activeTarget.controls || (activeTarget.controls = []);
          const t0 = toolByKind(d.kind);
          const spot0 = findFreeSpot(list, 16, 16, t0.w, t0.h);
          const c = makeComponent(layout, d.kind, spot0.x, spot0.y);
          list.push(c);
          state.selectedName = c.name;
          state.selectedNames = new Set([c.name]);
          state.refresh();
        }
      });

      // Cabeçalho da Seção / Card
      const h = el("div", "lego-sec-h");

      if (state.edit) {
        const grip = el("span", "lego-grip");
        grip.innerHTML = glyph("grip", 13);
        grip.title = "Drag to move card position";
        h.append(grip);

        h.draggable = true;
        h.style.cursor = "grab";
        h.addEventListener("dragstart", (e) => {
          e.stopPropagation();
          try { e.dataTransfer?.setData("text/plain", String(s.header || "zone")); } catch {}
          state.draggingSection = { sec: s, fromIndex: sIdx };
          sec.classList.add("dragging");
        });
        h.addEventListener("dragend", () => {
          state.draggingSection = null;
          sec.classList.remove("dragging");
          clearZoneGuides(body);
        });
      }

      if (state.edit && !hasSubTabs) {
        h.addEventListener("dragover", (e) => {
          if (!state.draggingSubTab) return;
          e.preventDefault();
          e.stopPropagation();
          clearSubTabFeedback();
          h.classList.add("drop-into");
        });
        h.addEventListener("dragleave", () => h.classList.remove("drop-into"));
        h.addEventListener("drop", (e) => {
          const d = state.draggingSubTab;
          if (!d) return;
          e.preventDefault();
          e.stopPropagation();
          state.draggingSubTab = null;
          clearSubTabFeedback();
          moveSubTab(host, state, d.sec, d.idx, s, 1);
        });
      }

      const titleSpan = el("span", null, s.header || "");
      if (state.edit) {
        titleSpan.title = "Double-click to rename this card";
        titleSpan.style.cursor = "pointer";
        titleSpan.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          const v = prompt("Card Name:", s.header || "");
          if (v != null) { s.header = v.toUpperCase(); state.refresh(); }
        });
      }
      h.append(titleSpan);

      // Toggle Grade/Lista no modo normal (se tiver imagens/vídeos/áudios na lista ativa)
      const hasMedia = list.some(c => isMediaKind(c.kind) || (c.kind === "group" && c.items?.some(it => isMediaKind(it.kind))));
      if (hasMedia && !state.edit) {
        const gridToggle = glyphBtn(`lego-iconbtn${activeTarget.grid ? " on" : ""}`, "grid", 12);
        gridToggle.title = activeTarget.grid ? "Visualizar em Lista" : "Visualizar em Grade 3×3";
        gridToggle.addEventListener("pointerdown", eatPointer);
        gridToggle.addEventListener("click", (e) => {
          e.stopPropagation();
          activeTarget.grid = activeTarget.grid ? undefined : 3;
          state.refresh();
        });
        h.append(gridToggle);
      }

      // Controles rápidos do Card no modo de edição
      if (state.edit) {
        const actions = el("div", "lego-sec-actions");

        // Renomear Card
        const renBtn = el("button", "lego-iconbtn");
        renBtn.innerHTML = glyph("pencil", 12);
        renBtn.title = "Rename this card";
        renBtn.addEventListener("pointerdown", eatPointer);
        renBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const v = prompt("Card Name:", s.header || "");
          if (v != null) { s.header = v.toUpperCase(); state.refresh(); }
        });
        actions.append(renBtn);

        // Cor da zona
        const colorBtn = el("button", "lego-iconbtn lego-color-dot-btn");
        colorBtn.type = "button";
        colorBtn.title = "Zone color";
        const dot = el("span", `lego-color-dot${s.color ? "" : " none"}`);
        if (s.color) dot.style.background = s.color;
        colorBtn.append(dot);
        colorBtn.addEventListener("pointerdown", eatPointer);
        colorBtn.addEventListener("click", (e) => {
          openColorMenu(e, s.color, (color) => {
            pushUndo(host);
            if (color) s.color = color; else delete s.color;
            state.refresh();
          });
        });
        actions.append(colorBtn);

        // Adicionar Zona abaixo (empilhada na coluna)
        const addBelowBtn = glyphBtn("lego-iconbtn", "addBelow", 12);
        addBelowBtn.title = "Add zone below (stack in column)";
        addBelowBtn.addEventListener("pointerdown", eatPointer);
        addBelowBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          addZoneBelow({ host, curTab: cur, section: s, state });
        });
        actions.append(addBelowBtn);

        // Adicionar Zona ao lado (nova coluna)
        const addBesideBtn = glyphBtn("lego-iconbtn", "addBeside", 12);
        addBesideBtn.title = "Add zone beside (new column)";
        addBesideBtn.addEventListener("pointerdown", eatPointer);
        addBesideBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          addZoneBeside({ host, curTab: cur, section: s, state });
        });
        actions.append(addBesideBtn);

        // Mover para cima/lado
        if (sIdx > 0) {
          const upBtn = glyphBtn("lego-iconbtn", "up", 12);
          upBtn.title = "Move card up / left";
          upBtn.addEventListener("pointerdown", eatPointer);
          upBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            sections.splice(sIdx, 1);
            sections.splice(sIdx - 1, 0, s);
            state.refresh();
          });
          actions.append(upBtn);
        }

        // Mover para baixo/lado
        if (sIdx < sections.length - 1) {
          const downBtn = glyphBtn("lego-iconbtn", "down", 12);
          downBtn.title = "Move card down / right";
          downBtn.addEventListener("pointerdown", eatPointer);
          downBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            sections.splice(sIdx, 1);
            sections.splice(sIdx + 1, 0, s);
            state.refresh();
          });
          actions.append(downBtn);
        }

        // Adicionar Componente (Inspector) no destino ativo
        const plus = glyphBtn("lego-iconbtn on", "plus", 12);
        plus.title = "Add component to this card";
        plus.addEventListener("pointerdown", eatPointer);
        plus.addEventListener("click", (e) => {
          e.stopPropagation();
          openInspector({ host, layout, section: activeTarget, state });
        });
        actions.append(plus);

        // Excluir Card
        const delSec = el("button", "lego-iconbtn");
        delSec.innerHTML = glyph("trash", 12);
        delSec.title = "Delete this card";
        delSec.addEventListener("pointerdown", eatPointer);
        delSec.addEventListener("click", (e) => {
          e.stopPropagation();
          const totalCtrls = hasSubTabs
            ? s.tabs.reduce((acc, tab) => acc + (tab.controls?.length || 0), 0)
            : (s.controls?.length || 0);
          if (totalCtrls && !confirm(`Delete card "${s.header}" and its ${totalCtrls} components?`)) return;
          pushUndo(host);
          const sRow = getContiguousRow(sections, sIdx);
          sections.splice(sIdx, 1);
          const rem = sRow.filter((x) => x !== s);
          if (rem.length) {
            const colsSet = new Set(rem.map((x) => (typeof x.col === "number" ? x.col : 0)));
            const w = widthForCount(colsSet.size);
            rem.forEach((x) => { x.width = w; });
          }
          state.refresh();
        });
        actions.append(delSec);

        h.append(actions);
      }
      sec.append(h);

      // Alças de Redimensionamento da Zona: Largura ↔, Altura ↕ e Canto ⤡
      if (state.edit) {
        // 1. Largura (Borda Direita ↔) - Passos de 5% com Shift livre
        const resizerW = el("div", "lego-sec-resizer");
        resizerW.title = "Drag to resize width (5% steps, hold Shift for smooth)";

        // 1. Largura do Card (Direita ↔)
        resizerW.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          e.preventDefault();
          resizerW.classList.add("active");
          sec.classList.add("resizing");

          const startClientX = e.clientX;
          const bodyRect = body.getBoundingClientRect();
          const curScale = domScale();
          // Se estiver dentro de uma coluna, redimensiona a coluna e a vizinha em tempo real
          const colEl = sec.closest(".lego-col");
          const colsRow = colEl?.closest(".lego-cols-row");
          const siblingCols = colsRow ? Array.from(colsRow.querySelectorAll(":scope > .lego-col")) : [];
          // Porcentagens de coluna são da largura útil da linha (sem os vãos).
          const bodyW = Math.max(1, (bodyRect.width || 800) - 12 * Math.max(0, siblingCols.length - 1) * curScale);
          const colIdx = colEl ? siblingCols.indexOf(colEl) : -1;
          const nextColEl = (colIdx >= 0 && colIdx < siblingCols.length - 1) ? siblingCols[colIdx + 1] : null;

          const colTarget = colEl || sec;
          const colRect = colTarget.getBoundingClientRect();
          const origW = colRect.width;
          const nextColOrigW = nextColEl ? nextColEl.getBoundingClientRect().width : 0;
          const totalPairW = origW + nextColOrigW;

          let finalW = s.width || "100%";
          let finalNextW = null;

          const onMoveW = (ev) => {
            ev.stopPropagation();
            const dx = ev.clientX - startClientX;
            const minWAllowed = (colEl?.__colEntries?.length
              ? Math.max(...colEl.__colEntries.map((ent) => sectionRequiredWidth(ent.sec)))
              : sectionRequiredWidth(s)) * curScale;

            let isSnapped = false;
            let snapLabel = "";
            let localX = (ev.clientX - bodyRect.left) / curScale;

            if (nextColEl) {
              const nextColEntries = nextColEl.__colEntries || [];
              const minNextW = (nextColEntries.length
                ? Math.max(...nextColEntries.map((ent) => sectionRequiredWidth(ent.sec)))
                : 80) * curScale;

              const rawW = Math.max(minWAllowed, Math.min(totalPairW - minNextW, origW + dx));
              const rawNextW = totalPairW - rawW;
              const totalPairRatio = totalPairW / bodyW;
              const ratio = rawW / bodyW;

              finalW = snapWidth(ratio, ev.shiftKey);
              const pctA = parseFloat(finalW) || (ratio * 100);
              const pairTotalPct = totalPairRatio * 100;
              const remPct = Math.max(5, Math.round((pairTotalPct - pctA) * 10) / 10);
              finalNextW = `${remPct}%`;

              const cssW = colWidthCss(finalW, siblingCols.length);
              const cssNextW = colWidthCss(finalNextW, siblingCols.length);
              colEl.style.width = cssW;
              colEl.style.flex = `0 0 ${cssW}`;
              colEl.style.maxWidth = cssW;
              nextColEl.style.width = cssNextW;
              nextColEl.style.flex = `0 0 ${cssNextW}`;
              nextColEl.style.maxWidth = cssNextW;

              isSnapped = !ev.shiftKey && (finalW === "25%" || finalW === "33.3%" || finalW === "50%" || finalW === "66.7%" || finalW === "75%");
              const snapLocalX = ((colRect.left - bodyRect.left) + (pctA / 100 * bodyW)) / curScale;
              if (isSnapped) localX = snapLocalX;
              snapLabel = isSnapped
                ? `⚡ ${finalW} / ${finalNextW} (Aligned)`
                : `↔ ${finalW} (${Math.round(rawW / curScale)}px) · ${finalNextW} (${Math.round(rawNextW / curScale)}px)`;
            } else {
              const rawW = Math.max(minWAllowed, Math.min(bodyW, origW + dx));
              const ratio = Math.max(0.15, Math.min(1.0, rawW / bodyW));
              finalW = snapWidth(ratio, ev.shiftKey);

              const cssW = widthToCss(finalW);
              colTarget.style.width = cssW;
              colTarget.style.flex = `0 0 ${cssW}`;
              colTarget.style.maxWidth = cssW;

              isSnapped = !ev.shiftKey && (finalW === "25%" || finalW === "33.3%" || finalW === "50%" || finalW === "66.7%" || finalW === "75%" || finalW === "100%");
              const pctA = parseFloat(finalW) || (ratio * 100);
              const snapLocalX = ((colRect.left - bodyRect.left) + (pctA / 100 * bodyW)) / curScale;
              if (isSnapped) localX = snapLocalX;
              snapLabel = isSnapped ? `⚡ ${finalW} (Aligned)` : `↔ ${finalW} (${Math.round(rawW / curScale)}px)`;
            }

            // Alinhamento magnético real com arestas verticais de outras zonas
            if (!ev.shiftKey) {
              // Borda direita atual da zona/coluna sendo redimensionada (posição real no DOM)
              const curRightEdge = nextColEl
                ? ((colRect.left - bodyRect.left) + (parseFloat(finalW) || 50) / 100 * bodyW) / curScale
                : ((colRect.left - bodyRect.left) + (parseFloat(finalW) || 100) / 100 * bodyW) / curScale;

              const otherSecs = Array.from(body.querySelectorAll(".lego-sec")).filter((x) => x !== sec);
              for (const other of otherSecs) {
                const oR = other.getBoundingClientRect();
                const otherRightX = (oR.right - bodyRect.left) / curScale;
                const otherLeftX = (oR.left - bodyRect.left) / curScale;

                let snapTargetX = null;
                if (Math.abs(curRightEdge - otherRightX) <= 6) snapTargetX = otherRightX;
                else if (Math.abs(curRightEdge - otherLeftX) <= 6) snapTargetX = otherLeftX;

                if (snapTargetX !== null) {
                  const snapName = other.querySelector(".lego-sec-h span")?.textContent || "Zone";

                  // Se a outra zona começa na mesma posição de coluna, adota a largura EXATA
                  // para evitar erro de arredondamento pixel→porcentagem
                  const otherCol = other.closest(".lego-col");
                  const otherColLeft = otherCol
                    ? (otherCol.getBoundingClientRect().left - bodyRect.left) / curScale
                    : (oR.left - bodyRect.left) / curScale;
                  const myColLeft = (colRect.left - bodyRect.left) / curScale;
                  const otherSecData = other.__legoSec;

                  let adoptedW = null;
                  if (snapTargetX === otherRightX && Math.abs(otherColLeft - myColLeft) < 5 && otherSecData?.width) {
                    // Mesmo alinhamento esquerdo → copia a largura exata (sem erro de conversão)
                    adoptedW = otherSecData.width;
                  }

                  if (adoptedW) {
                    const adoptedPct = parseFloat(adoptedW);
                    const adoptedScreenW = (adoptedPct / 100) * bodyW;
                    if (adoptedScreenW >= minWAllowed && adoptedPct >= 15) {
                      if (nextColEl) {
                        const pairTotalPct = totalPairRatio * 100;
                        const remPct = Math.max(5, Math.round((pairTotalPct - adoptedPct) * 10) / 10);
                        const nextEntries = nextColEl.__colEntries || [];
                        const minNextWScreen = (nextEntries.length
                          ? Math.max(...nextEntries.map((ent) => sectionRequiredWidth(ent.sec)))
                          : 80) * curScale;
                        if (totalPairW - adoptedScreenW >= minNextWScreen) {
                          finalW = adoptedW;
                          finalNextW = `${remPct}%`;
                          const cssW = colWidthCss(finalW, siblingCols.length);
                          const cssNextW = colWidthCss(finalNextW, siblingCols.length);
                          colEl.style.width = cssW; colEl.style.flex = `0 0 ${cssW}`; colEl.style.maxWidth = cssW;
                          nextColEl.style.width = cssNextW; nextColEl.style.flex = `0 0 ${cssNextW}`; nextColEl.style.maxWidth = cssNextW;
                          localX = snapTargetX; isSnapped = true;
                          snapLabel = `⚡ Aligned with "${snapName}" (${finalW} / ${finalNextW})`;
                          break;
                        }
                      } else {
                        finalW = adoptedW;
                        const cssW = widthToCss(finalW);
                        colTarget.style.width = cssW; colTarget.style.flex = `0 0 ${cssW}`; colTarget.style.maxWidth = cssW;
                        localX = snapTargetX; isSnapped = true;
                        snapLabel = `⚡ Aligned with "${snapName}" (${finalW})`;
                        break;
                      }
                    }
                  } else {
                    // Colunas em posições diferentes: calcula a largura a partir de pixels
                    const targetWidthScreen = bodyRect.left + snapTargetX * curScale - colRect.left;
                    const targetRatio = targetWidthScreen / bodyW;
                    const targetPct = Math.round(targetRatio * 1000) / 10;

                    if (targetWidthScreen >= minWAllowed && targetPct >= 15) {
                      if (nextColEl) {
                        const pairTotalPct = totalPairRatio * 100;
                        const remPct = Math.max(5, Math.round((pairTotalPct - targetPct) * 10) / 10);
                        const nextEntries = nextColEl.__colEntries || [];
                        const minNextWScreen = (nextEntries.length
                          ? Math.max(...nextEntries.map((ent) => sectionRequiredWidth(ent.sec)))
                          : 80) * curScale;
                        if (totalPairW - targetWidthScreen >= minNextWScreen) {
                          finalW = `${targetPct}%`; finalNextW = `${remPct}%`;
                          const cssW = colWidthCss(finalW, siblingCols.length); const cssNextW = colWidthCss(finalNextW, siblingCols.length);
                          colEl.style.width = cssW; colEl.style.flex = `0 0 ${cssW}`; colEl.style.maxWidth = cssW;
                          nextColEl.style.width = cssNextW; nextColEl.style.flex = `0 0 ${cssNextW}`; nextColEl.style.maxWidth = cssNextW;
                          localX = snapTargetX; isSnapped = true;
                          snapLabel = `⚡ Aligned with "${snapName}" (${finalW} / ${finalNextW})`;
                          break;
                        }
                      } else {
                        finalW = `${targetPct}%`;
                        const cssW = widthToCss(finalW);
                        colTarget.style.width = cssW; colTarget.style.flex = `0 0 ${cssW}`; colTarget.style.maxWidth = cssW;
                        localX = snapTargetX; isSnapped = true;
                        snapLabel = `⚡ Aligned with "${snapName}" (${finalW})`;
                        break;
                      }
                    }
                  }
                }
              }
            }

            renderZoneGuides(body, {
              vLine: {
                x: localX,
                snap: isSnapped,
                badgeText: snapLabel,
                badgeY: (sec.getBoundingClientRect().top - bodyRect.top) / curScale + 20
              }
            });
          };

          const onUpW = (ev) => {
            ev?.stopPropagation();
            resizerW.classList.remove("active");
            sec.classList.remove("resizing");
            clearZoneGuides(body);

            window.removeEventListener("pointermove", onMoveW, true);
            window.removeEventListener("pointerup", onUpW, true);
            window.removeEventListener("pointercancel", onUpW, true);
            window.removeEventListener("mousemove", onMoveW, true);
            window.removeEventListener("mouseup", onUpW, true);

            // Clique sem arrastar não fixa a largura (nem grava Undo).
            if (!ev || Math.abs(ev.clientX - startClientX) < 3) return;
            pushUndo(host);
            if (colEl?.__colEntries) {
              colEl.__colEntries.forEach((ent) => { ent.sec.width = finalW; });
              if (nextColEl?.__colEntries && finalNextW) {
                nextColEl.__colEntries.forEach((ent) => { ent.sec.width = finalNextW; });
              }
            } else {
              s.width = finalW;
              if (finalW !== "100%") {
                s.col = 0;
                // Row próprio para não fundir com grupos de colunas vizinhos
                if (!s.row) s.row = makeRowId();
              } else {
                delete s.col;
                delete s.row;
              }
            }
            state.refresh();
          };

          window.addEventListener("pointermove", onMoveW, true);
          window.addEventListener("pointerup", onUpW, true);
          window.addEventListener("pointercancel", onUpW, true);
          window.addEventListener("mousemove", onMoveW, true);
          window.addEventListener("mouseup", onUpW, true);
        });
        sec.append(resizerW);

        // 2. Altura do Card (Inferior ↕)
        const resizerH = el("div", "lego-sec-resizer-bottom");
        resizerH.title = "Drag to resize minimum card height (↕) or double-click for auto";

        resizerH.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          delete s.height;
          state.refresh();
        });

        resizerH.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          e.preventDefault();
          resizerH.classList.add("active");
          sec.classList.add("resizing");

          const startClientY = e.clientY;
          const origH = sec.getBoundingClientRect().height;
          const curScale = domScale();
          const bodyRect = body.getBoundingClientRect();
          const secRect = sec.getBoundingClientRect();
          const secTopY = (secRect.top - bodyRect.top) / curScale;

          // Referências para linhas de nível horizontais (outras zonas)
          const otherLevels = [];
          body.querySelectorAll(".lego-sec").forEach((other) => {
            if (other === sec) return;
            const oR = other.getBoundingClientRect();
            otherLevels.push({
              bottomY: (oR.bottom - bodyRect.top) / curScale,
              h: oR.height / curScale,
              name: other.querySelector(".lego-sec-h span")?.textContent || "Zona"
            });
          });

          let finalH = Math.round(origH / curScale);

          const onMoveH = (ev) => {
            ev.stopPropagation();
            const minHAllowed = sectionRequiredHeight(s);
            const dy = ev.clientY - startClientY;
            let rawH = Math.max(minHAllowed, Math.round((origH + dy) / curScale));
            let currentBottomY = secTopY + rawH;

            let hSnap = false;
            let snapName = "";
            if (!ev.shiftKey) {
              for (const lvl of otherLevels) {
                // Alinhamento com a base de outra zona
                if (Math.abs(currentBottomY - lvl.bottomY) <= 8) {
                  currentBottomY = lvl.bottomY;
                  rawH = Math.max(minHAllowed, Math.round(currentBottomY - secTopY));
                  hSnap = true;
                  snapName = lvl.name;
                  break;
                }
                // Alinhamento de mesma altura
                if (Math.abs(rawH - lvl.h) <= 8) {
                  rawH = Math.max(minHAllowed, Math.round(lvl.h));
                  currentBottomY = secTopY + rawH;
                  hSnap = true;
                  snapName = lvl.name;
                  break;
                }
              }
            }

            finalH = rawH;
            sec.style.minHeight = `${finalH}px`;

            const badgeText = hSnap
              ? `⚡ ${finalH}px (Linha de Nível com "${snapName}")`
              : `↕ ${finalH}px`;

            const badgeX = (sec.getBoundingClientRect().left - bodyRect.left) / curScale + (sec.getBoundingClientRect().width / curScale) / 2;

            renderZoneGuides(body, {
              hLine: {
                y: currentBottomY,
                snap: hSnap,
                badgeText,
                badgeX
              }
            });
          };

          const onUpH = (ev) => {
            ev?.stopPropagation();
            resizerH.classList.remove("active");
            sec.classList.remove("resizing");
            clearZoneGuides(body);

            window.removeEventListener("pointermove", onMoveH, true);
            window.removeEventListener("pointerup", onUpH, true);
            window.removeEventListener("pointercancel", onUpH, true);
            window.removeEventListener("mousemove", onMoveH, true);
            window.removeEventListener("mouseup", onUpH, true);

            // Clique sem arrastar não fixa a altura: a zona segue crescendo sozinha.
            if (!ev || Math.abs(ev.clientY - startClientY) < 3) return;
            pushUndo(host);
            s.height = `${finalH}px`;
            state.refresh();
          };

          window.addEventListener("pointermove", onMoveH, true);
          window.addEventListener("pointerup", onUpH, true);
          window.addEventListener("pointercancel", onUpH, true);
          window.addEventListener("mousemove", onMoveH, true);
          window.addEventListener("mouseup", onUpH, true);
        });
        sec.append(resizerH);
      }

      // Se a zona tiver sub-abas, renderiza a barra de sub-abas interna. Fora
      // da edição, uma aba só não precisa de barra (a zona fica limpa).
      if (hasSubTabs && (state.edit || s.tabs.length > 1)) {
        const subBar = el("div", "lego-subtabs");
        s.tabs.forEach((st, stIdx) => {
          const isSel = stIdx === s.activeTab;
          const subTab = el("div", `lego-subtab${isSel ? " sel" : ""}`);
          subTab.append(el("span", "lego-subtab-title", st.name));
          subTab.__legoTabDrop = {
            list: () => st.controls || (st.controls = []),
            activate: () => { s.activeTab = stIdx; },
          };

          // Sub-aba arrastável: reordena na zona ou muda de zona.
          if (state.edit) {
            subTab.draggable = true;
            subTab.title = "Drag to reorder or move to another zone";
            subTab.addEventListener("dragstart", (e) => {
              e.stopPropagation();
              state.draggingSubTab = { sec: s, idx: stIdx };
              try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", st.name || ""); } catch {}
              subTab.classList.add("dragging");
            });
            subTab.addEventListener("dragend", () => {
              state.draggingSubTab = null;
              subTab.classList.remove("dragging");
              clearSubTabFeedback();
            });
            subTab.addEventListener("dragover", (e) => {
              if (!state.draggingSubTab) return;
              e.preventDefault();
              e.stopPropagation();
              const r = subTab.getBoundingClientRect();
              const after = e.clientX > r.left + r.width / 2;
              clearSubTabFeedback();
              subTab.classList.add(after ? "drop-after" : "drop-before");
            });
            subTab.addEventListener("drop", (e) => {
              const d = state.draggingSubTab;
              if (!d) return;
              e.preventDefault();
              e.stopPropagation();
              const r = subTab.getBoundingClientRect();
              const after = e.clientX > r.left + r.width / 2;
              state.draggingSubTab = null;
              clearSubTabFeedback();
              moveSubTab(host, state, d.sec, d.idx, s, stIdx + (after ? 1 : 0));
            });
          }

          // Em modo de edição, adiciona botões de ação rápidos na sub-aba
          if (state.edit) {
            const subActions = el("span", "lego-subtab-actions");
            const editBtn = el("button", "lego-subtab-btn");
              editBtn.innerHTML = glyph("pencil", 12);
            editBtn.title = "Rename or manage sub-tab";
            editBtn.addEventListener("pointerdown", eatPointer);
            editBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              openManageTabModal({
                tab: st,
                tabs: s.tabs,
                tabIndex: stIdx,
                isSubTab: true,
                onUpdate: () => state.refresh(),
                onDelete: () => {
                  removeTabAt(s, s.tabs, stIdx);
                  state.refresh();
                }
              });
            });
            subActions.append(editBtn);

            if (s.tabs.length > 1) {
              const delBtn = glyphBtn("lego-subtab-btn del", "close", 10);
              delBtn.title = "Delete sub-tab";
              delBtn.addEventListener("pointerdown", eatPointer);
              delBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (confirm(`Delete sub-tab "${st.name}" and its components?`)) {
                  removeTabAt(s, s.tabs, stIdx);
                  state.refresh();
                }
              });
              subActions.append(delBtn);
            }
            subTab.append(subActions);
          }

          subTab.addEventListener("pointerdown", eatPointer);
          subTab.addEventListener("click", (e) => {
            e.stopPropagation();
            s.activeTab = stIdx;
            state.refresh();
          });

          // Duplo clique na sub-aba
          subTab.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            if (!state.edit) return;
            openManageTabModal({
              tab: st,
              tabs: s.tabs,
              tabIndex: stIdx,
              isSubTab: true,
              onUpdate: () => state.refresh(),
              onDelete: () => {
                removeTabAt(s, s.tabs, stIdx);
                state.refresh();
              }
            });
          });

          // Botão direito na sub-aba
          subTab.addEventListener("contextmenu", (e) => {
            if (!state.edit) return;
            openTabContextMenu(e, {
              tab: st,
              tabs: s.tabs,
              tabIndex: stIdx,
              isSubTab: true,
              onUpdate: () => state.refresh(),
              onDelete: () => {
                removeTabAt(s, s.tabs, stIdx);
                state.refresh();
              },
              onAdd: () => {
                if (addSubTabTo(s)) state.refresh();
              }
            });
          });

          subBar.append(subTab);
        });

        if (state.edit) {
          const addSubTab = el("div", "lego-subtab-add");
          addSubTab.innerHTML = glyph("plus", 11);
          addSubTab.title = "Add new sub-tab in this zone";
          addSubTab.addEventListener("pointerdown", eatPointer);
          addSubTab.addEventListener("click", (e) => {
            e.stopPropagation();
            if (addSubTabTo(s)) state.refresh();
          });
          subBar.append(addSubTab);
        }
        // Soltar no espaço vazio da barra: entra no fim da fila desta zona.
        if (state.edit) {
          subBar.addEventListener("dragover", (e) => {
            if (!state.draggingSubTab) return;
            e.preventDefault();
            e.stopPropagation();
            clearSubTabFeedback();
            subBar.classList.add("drop-into");
          });
          subBar.addEventListener("dragleave", () => subBar.classList.remove("drop-into"));
          subBar.addEventListener("drop", (e) => {
            const d = state.draggingSubTab;
            if (!d) return;
            e.preventDefault();
            e.stopPropagation();
            state.draggingSubTab = null;
            clearSubTabFeedback();
            moveSubTab(host, state, d.sec, d.idx, s, s.tabs.length);
          });
        }
        sec.append(subBar);
      }

      // ── ÁREA DE CANVAS 2D DA ZONA (SEM TEXTURA DE BOLINHAS, TOTALMENTE DISCRETO) ──
      const ctrlsBox = el("div", `lego-sec-controls${state.edit ? " in-edit" : ""}`);
      ctrlsBox.__legoList = list;   // alvo de arraste (ver zoneDropTargetAt)
      ctrlsBox.style.minWidth = "0";

      // Abas da mesma zona têm a mesma altura: a área usa o conteúdo mais alto
      // entre TODAS as abas, não só a ativa (senão a zona pulava ao trocar de aba).
      const tabLists = hasSubTabs && s.tabs.length > 1
        ? s.tabs.map((t) => (t === activeTarget ? list : (t.controls || [])))
        : [list];
      function updateControlsBounds() {
        let maxY = 70;
        for (const item of tabLists.flat()) {
          const iy = typeof item.y === "number" ? item.y : 16;
          const isM = isMediaKind(item.kind);
          const ih = typeof item.h === "number" ? item.h : (isM ? 144 : 46);
          maxY = Math.max(maxY, iy + ih + 16);
        }
        ctrlsBox.style.minHeight = `${maxY}px`;
        ctrlsBox.style.height = `${maxY}px`;
      }

      if (!list.length) {
        if (state.edit) {
          const dz = el("div", "lego-zone-dropzone");
          dz.style.width = "100%";
          dz.style.padding = "14px";
          dz.style.borderRadius = "8px";
          dz.style.border = "1.5px dashed rgba(255,255,255,0.12)";
          dz.style.textAlign = "center";
          dz.style.color = "var(--lego-dim)";
          dz.innerHTML = `<span class="lego-glyph-wrap">${glyph("plus", 16)}</span> <span>Empty zone. <b>Double-click here</b> to add a component.</span>`;
          dz.style.cursor = "pointer";
          dz.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            openComponentSearchMenu({
              host,
              layout: host.properties[PROP],
              section: activeTarget,
              state,
              pos: { x: 16, y: 16 },
              clientPos: { x: e.clientX, y: e.clientY }
            });
          });
          ctrlsBox.append(dz);
        } else {
          // Fora da edição a zona vazia convida a começar: "Promote parameters"
          // abre o picker direto; 2 cliques entram na edição e abrem a busca.
          const empty = el("div", "lego-empty lego-empty-cta");
          empty.append(el("div", "", hasSubTabs && s.tabs.length > 1 ? `tab "${activeTarget.name}" is empty` : "empty zone"));
          const cta = glyphTextBtn("lego-promote-cta", "target", "Promote parameters", 14);
          cta.title = "Pick nodes or parameters on the canvas and add them to this card";
          cta.addEventListener("pointerdown", (e) => e.stopPropagation());
          cta.addEventListener("click", (e) => {
            e.stopPropagation();
            state.edit = true;
            state.refresh();
            openInspector({ host, layout: host.properties[PROP], section: activeTarget, state, initialPos: { x: 16, y: 16 }, autoPick: true });
          });
          empty.append(cta, el("div", "lego-empty-hint", "or double-click to edit"));
          ctrlsBox.append(empty);
        }
        // Aba vazia numa zona com outras abas: mesma altura das outras.
        if (tabLists.length > 1) updateControlsBounds();
      } else {
        // Inicializa coordenadas 2D automáticas nos controles que ainda não têm (X, Y).
        // Zona com `grid: N` distribui em N colunas — é o que faz as 9 referências
        // virarem uma grade 3x3 em vez de uma pilha de 9 linhas.
        /** Um grupo que carrega mídia precisa de altura de miniatura, não de linha. */
        const hasMedia = (c) =>
          isMediaKind(c.kind) || (c.items || []).some((i) => isMediaKind(i.kind));
        const autoCols = Math.max(1, Math.round(activeTarget.grid || 1));
        // A coluna sai da largura disponível NA ZONA, não do nó inteiro, evitando estourar em zonas 50%
        const secWStr = s.width || "100%";
        const secPct = secWStr.endsWith("%") ? (parseFloat(secWStr) / 100) : 1;
        const hostW = host.size?.[0] || MIN_W;
        const autoAvail = Math.max(200, Math.round((hostW - 56) * secPct) - 24);
        const autoColW = autoCols > 1
          ? Math.max(96, Math.floor((autoAvail - 16 * (autoCols + 1)) / autoCols / GRID) * GRID)
          : (list[0] && hasMedia(list[0]) ? 288 : 256);
        let autoCol = 0;
        let curColY = 16;
        let rowH = 0;
        list.forEach((c) => {
          if (typeof c.x !== "number" || typeof c.y !== "number") {
            const cH = c.h || (hasMedia(c) || c.kind === "textarea" ? 160 : 46);
            c.x = 16 + autoCol * (autoColW + 16);
            c.y = curColY;
            rowH = Math.max(rowH, cH);
            autoCol += 1;
            if (autoCol >= autoCols) {
              autoCol = 0;
              curColY += rowH + 16;
              rowH = 0;
            }
          }
          // Posição em pixel inteiro (não na grade): o alinhamento em linha/coluna
          // pode usar um espaço menor que a grade; arrastar continua encaixando.
          c.x = Math.max(0, Math.round(c.x));
          c.y = Math.max(0, Math.round(c.y));
          if (!c.w) c.w = autoCols > 1 ? autoColW : (hasMedia(c) ? 288 : 256);
          c.w = Math.max(hasMedia(c) ? 160 : 80, Math.round(c.w / GRID) * GRID);
          if (!c.h) c.h = hasMedia(c) ? 144 : (c.kind === "textarea" ? 96 : 46);
          // Grupos guardam a altura exata do conteúdo (sem grade), ver buildControl.
          if (!isGroupKind(c.kind)) c.h = Math.max(hasMedia(c) ? 64 : 36, Math.round(c.h / GRID) * GRID);
        });

        // Renderiza cada controle no Canvas 2D
        for (const c of list) {
          ctrlsBox.append(buildControl(host, c, state, list, ctrlsBox, updateControlsBounds));
        }

        updateControlsBounds();
      }

      // Fora da edição: 2 cliques numa área vazia da zona entram na edição e
      // abrem a busca de componentes ali mesmo.
      if (!state.edit) {
        ctrlsBox.addEventListener("dblclick", (e) => {
          if (e.target.closest(".lego-row, button, input, select, textarea, video, audio")) return;
          e.stopPropagation();
          e.preventDefault();
          const boxRect = ctrlsBox.getBoundingClientRect();
          const curScale = domScale();
          const dropX = Math.max(16, Math.round(((e.clientX - boxRect.left) / curScale) / GRID) * GRID);
          const dropY = Math.max(16, Math.round(((e.clientY - boxRect.top) / curScale) / GRID) * GRID);
          state.edit = true;
          state.refresh();
          openComponentSearchMenu({
            host,
            layout: host.properties[PROP],
            section: activeTarget,
            state,
            pos: { x: dropX, y: dropY },
            clientPos: { x: e.clientX, y: e.clientY }
          });
        });
      }

      // Suporte a soltar novo componente da paleta diretamente nas coordenadas X, Y desta zona
      if (state.edit) {
        ctrlsBox.addEventListener("dragover", (e) => {
          if (state.draggingComponent) {
            e.preventDefault();
            ctrlsBox.classList.add("over");
          }
        });
        ctrlsBox.addEventListener("dragleave", () => {
          ctrlsBox.classList.remove("over");
        });
        ctrlsBox.addEventListener("drop", (e) => {
          ctrlsBox.classList.remove("over");
          const boxRect = ctrlsBox.getBoundingClientRect();
          const curScale = domScale();
          const dropX = Math.max(16, Math.round(((e.clientX - boxRect.left) / curScale) / GRID) * GRID);
          const dropY = Math.max(16, Math.round(((e.clientY - boxRect.top) / curScale) / GRID) * GRID);

          if (state.draggingComponent) {
            e.preventDefault();
            e.stopPropagation();
            const d = state.draggingComponent;
            state.draggingComponent = null;
            dropArmedTool(host, state, activeTarget, dropX, dropY, false, d.kind);
          }
        });

        // ── 2 CLIQUES NO CANVAS PARA ADICIONAR COMPONENTE (ESTILO COMFYUI CANVAS) ──
        ctrlsBox.addEventListener("dblclick", (e) => {
          if (!state.edit) return;
          if (e.target.closest(".lego-row") || e.target.closest("button") || e.target.closest("input") || e.target.closest("select")) return;
          e.stopPropagation();
          e.preventDefault();

          const boxRect = ctrlsBox.getBoundingClientRect();
          const curScale = domScale();
          const dropX = Math.max(16, Math.round(((e.clientX - boxRect.left) / curScale) / GRID) * GRID);
          const dropY = Math.max(16, Math.round(((e.clientY - boxRect.top) / curScale) / GRID) * GRID);

          openComponentSearchMenu({
            host,
            layout: host.properties[PROP],
            section: activeTarget,
            state,
            pos: { x: dropX, y: dropY },
            clientPos: { x: e.clientX, y: e.clientY }
          });
        });

        // ── SELEÇÃO POR ÁREA (MARQUEE SELECTION) ESTILO COMFYUI / FIGMA ──
        ctrlsBox.addEventListener("pointerdown", (e) => {
          if (!state.edit) return;
          if (e.button !== 0) return; // apenas botão esquerdo
          if (e.target.closest(".lego-row") || e.target.closest("button") || e.target.closest("input") || e.target.closest("textarea") || e.target.closest("select") || e.target.closest(".lego-resizer-corner")) return;
          if (state.armedTool) return; // deixa o clique posicionar a ferramenta

          e.stopPropagation();

          const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
          if (!state.selectedNames) state.selectedNames = new Set();
          const initialSelected = new Set(isMulti ? state.selectedNames : []);

          if (!isMulti) {
            state.selectedNames.clear();
            state.selectedName = null;
            ctrlsBox.querySelectorAll(".lego-row.selected").forEach((r) => r.classList.remove("selected"));
            ctrlsBox.querySelectorAll(".lego-segment-item.selected").forEach((r) => r.classList.remove("selected"));
          }

          const boxRect = ctrlsBox.getBoundingClientRect();
          const curScale = domScale();
          const startX = (e.clientX - boxRect.left) / curScale;
          const startY = (e.clientY - boxRect.top) / curScale;

          let selBox = null;
          let isMarquee = false;

          const onMarqueeMove = (ev) => {
            const curX = (ev.clientX - boxRect.left) / curScale;
            const curY = (ev.clientY - boxRect.top) / curScale;

            const dist = Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY);
            if (!isMarquee) {
              if (dist < 4) return;
              isMarquee = true;
              selBox = el("div", "lego-selection-box");
              ctrlsBox.append(selBox);
            }

            ev.stopPropagation();

            const minX = Math.min(startX, curX);
            const minY = Math.min(startY, curY);
            const w = Math.abs(curX - startX);
            const h = Math.abs(curY - startY);

            selBox.style.left = `${minX}px`;
            selBox.style.top = `${minY}px`;
            selBox.style.width = `${w}px`;
            selBox.style.height = `${h}px`;

            // Testa interseção com cada .lego-row presente na zona
            const rows = ctrlsBox.querySelectorAll(".lego-row");
            rows.forEach((r) => {
              const rName = r.dataset.name;
              if (!rName) return;
              const rx = parseFloat(r.style.left) || r.offsetLeft || 0;
              const ry = parseFloat(r.style.top) || r.offsetTop || 0;
              const rw = parseFloat(r.style.width) || r.offsetWidth || 100;
              const rh = parseFloat(r.style.height) || r.offsetHeight || 40;

              const overlaps = !(rx + rw < minX || rx > minX + w || ry + rh < minY || ry > minY + h);

              if (overlaps) {
                state.selectedNames.add(rName);
                r.classList.add("selected");
              } else if (!initialSelected.has(rName)) {
                state.selectedNames.delete(rName);
                r.classList.remove("selected");
              }
            });
          };

          const onMarqueeUp = (ev) => {
            window.removeEventListener("pointermove", onMarqueeMove, true);
            window.removeEventListener("pointerup", onMarqueeUp, true);
            window.removeEventListener("pointercancel", onMarqueeUp, true);

            if (selBox) {
              selBox.remove();
              selBox = null;
            }

            if (isMarquee) {
              ev?.stopPropagation();
              if (state.selectedNames.size > 0) {
                state.selectedName = Array.from(state.selectedNames).pop();
                renderObjectInspector(host, state, false);
              } else {
                state.selectedName = null;
                renderObjectInspector(host, state, false);
              }
            } else {
              // Clique simples no canvas vazio sem arrasto
              if (!isMulti) {
                selectComponent(host, state, null, null, false);
              }
            }
          };

          window.addEventListener("pointermove", onMarqueeMove, true);
          window.addEventListener("pointerup", onMarqueeUp, true);
          window.addEventListener("pointercancel", onMarqueeUp, true);
        });

        // Clique no formulário: solta a ferramenta armada
        ctrlsBox.addEventListener("click", (e) => {
          if (e.target.closest(".lego-row")) return;
          if (state.armedTool) {
            e.preventDefault();
            e.stopPropagation();
            const boxRect = ctrlsBox.getBoundingClientRect();
            const sc = domScale();
            const px = Math.max(0, Math.round(((e.clientX - boxRect.left) / sc) / GRID) * GRID);
            const py = Math.max(0, Math.round(((e.clientY - boxRect.top) / sc) / GRID) * GRID);
            dropArmedTool(host, state, activeTarget, px, py, e.shiftKey);
          }
        });
      }

      sec.append(ctrlsBox);
      return sec;
    }

    const layoutGroups = groupSectionsLayout(sections);
    layoutGroups.forEach((g) => {
      if (g.type === "full") {
        body.append(buildSectionElement(g.sec, g.index, true, false));
      } else if (g.type === "columns") {
        const colsRow = el("div", "lego-cols-row");
        const numCols = g.columns.length;
        const colElements = [];

        g.columns.forEach((col, cIdx) => {
          const colEl = el("div", "lego-col");
          colEl.__colEntries = col.entries;
          colEl.__col = col;
          const defaultW = widthForCount(numCols);
          const colW = col.width || defaultW;
          const cssW = colWidthCss(colW, numCols);
          if (cIdx === numCols - 1) {
            // A última coluna ocupa o que sobra: a borda direita da linha
            // sempre bate com a das zonas de largura total (as porcentagens
            // somadas nem sempre dão 100% e deixavam um vão à direita).
            colEl.classList.add("is-last");
            colEl.style.flex = "1 1 0";
          } else {
            colEl.style.width = cssW;
            colEl.style.flex = `0 0 ${cssW}`;
            colEl.style.maxWidth = cssW;
          }
          colEl.style.minWidth = "0";
          colEl.style.boxSizing = "border-box";

          col.entries.forEach(({ sec, globalIndex }) => {
            const isStretch = (col.entries.length === 1);
            const secEl = buildSectionElement(sec, globalIndex, false, isStretch);
            colEl.append(secEl);
          });
          colElements.push(colEl);
        });

        g.columns.forEach((col, cIdx) => {
          colsRow.append(colElements[cIdx]);

          // Divisor interativo entre esta coluna e a próxima (Aresta de redimensionamento)
          if (state.edit && cIdx < numCols - 1) {
            const colA = col;
            const colB = g.columns[cIdx + 1];
            const colAEl = colElements[cIdx];
            const colBEl = colElements[cIdx + 1];

            const divider = el("div", "lego-col-divider");
            divider.title = "Drag to resize the columns (Shift = free) · Double-click to type the widths";
            // Duplo clique: digita as larguras de todas as colunas da linha.
            divider.addEventListener("dblclick", (e) => {
              e.stopPropagation();
              e.preventDefault();
              const cur = g.columns.map((c) => String(parseFloat(c.width || widthForCount(numCols)))).join(" / ");
              const v = prompt(`Column widths in % (${numCols} columns, left to right):`, cur);
              if (v == null) return;
              let nums = v.split(/[\/;,\s]+/).map((x) => parseFloat(x)).filter((x) => Number.isFinite(x) && x > 0);
              if (nums.length !== numCols) { showLegoToast(`Type ${numCols} numbers, e.g. ${cur}`); return; }
              const sum = nums.reduce((a, x) => a + x, 0);
              if (Math.abs(sum - 100) > 0.5) nums = nums.map((x) => (x * 100) / sum);   // soma ≠ 100: proporcional
              pushUndo(host);
              g.columns.forEach((c, i) => c.entries.forEach((ent) => { ent.sec.width = `${Math.round(nums[i] * 10) / 10}%`; }));
              state.refresh();
            });

            divider.addEventListener("pointerdown", (e) => {
              e.stopPropagation();
              e.preventDefault();
              divider.classList.add("active");

              const startClientX = e.clientX;
              const bodyRect = body.getBoundingClientRect();
              const curScale = domScale();
              // Porcentagens são da largura útil da linha (sem os vãos entre colunas).
              const bodyW = Math.max(1, (bodyRect.width || 800) - 12 * (numCols - 1) * curScale);

              const colARect = colAEl.getBoundingClientRect();
              const colBRect = colBEl.getBoundingClientRect();
              const colAStyle = colAEl.style.cssText, colBStyle = colBEl.style.cssText;
              const origWA = colARect.width;
              const origWB = colBRect.width;
              const totalPairW = origWA + origWB;
              const totalPairRatio = totalPairW / bodyW;

              const minWA = Math.max(...colA.entries.map((ent) => sectionRequiredWidth(ent.sec)), 80) * curScale;
              const minWB = Math.max(...colB.entries.map((ent) => sectionRequiredWidth(ent.sec)), 80) * curScale;

              let finalWA = colA.width || widthForCount(numCols);
              let finalWB = colB.width || widthForCount(numCols);

              const onMoveCol = (ev) => {
                ev.stopPropagation();
                const dx = ev.clientX - startClientX;
                const rawWA = Math.max(minWA, Math.min(totalPairW - minWB, origWA + dx));
                const rawWB = totalPairW - rawWA;

                const ratioA = rawWA / bodyW;
                finalWA = snapWidth(ratioA, ev.shiftKey);
                const pctA = parseFloat(finalWA) || (ratioA * 100);
                const pairTotalPct = totalPairRatio * 100;
                const remPct = Math.max(5, Math.round((pairTotalPct - pctA) * 10) / 10);
                finalWB = `${remPct}%`;

                const cssWA = colWidthCss(finalWA, numCols);
                const cssWB = colWidthCss(finalWB, numCols);
                colAEl.style.width = cssWA;
                colAEl.style.flex = `0 0 ${cssWA}`;
                colAEl.style.maxWidth = cssWA;
                colBEl.style.width = cssWB;
                colBEl.style.flex = `0 0 ${cssWB}`;
                colBEl.style.maxWidth = cssWB;

                let isSnapped = !ev.shiftKey && Math.abs(pctA - ratioA * 100) > 0.5 && (
                  finalWA === "25%" || finalWA === "33.3%" || finalWA === "50%" || finalWA === "66.7%" || finalWA === "75%"
                );
                const snapLocalX = ((colARect.left - bodyRect.left) + (pctA / 100 * bodyW)) / curScale;
                let localX = isSnapped ? snapLocalX : (ev.clientX - bodyRect.left) / curScale;

                let badgeText = isSnapped
                  ? `⚡ ${finalWA} / ${finalWB} (Aligned)`
                  : `↔ ${finalWA} (${Math.round(rawWA / curScale)}px) · ${finalWB} (${Math.round(rawWB / curScale)}px)`;

                // Alinhamento magnético com arestas de zonas de outras linhas
                if (!ev.shiftKey && !isSnapped) {
                  // Borda direita real da coluna A neste momento
                  const curDividerX = ((colARect.left - bodyRect.left) + (pctA / 100 * bodyW)) / curScale;
                  const otherSecs = Array.from(body.querySelectorAll(".lego-sec")).filter(
                    (x) => !colAEl.contains(x)
                  );
                  for (const other of otherSecs) {
                    const oR = other.getBoundingClientRect();
                    const otherRightX = (oR.right - bodyRect.left) / curScale;
                    const otherLeftX = (oR.left - bodyRect.left) / curScale;

                    let snapTargetX = null;
                    // Ímã curto: só puxa quando já está quase alinhado.
                    if (Math.abs(curDividerX - otherRightX) <= 6) snapTargetX = otherRightX;
                    else if (Math.abs(curDividerX - otherLeftX) <= 6) snapTargetX = otherLeftX;

                    if (snapTargetX !== null) {
                      const snapName = other.querySelector(".lego-sec-h span")?.textContent || "Zone";

                      // Se a outra zona começa na mesma posição, adota a largura EXATA
                      const otherCol = other.closest(".lego-col");
                      const otherColLeft = otherCol
                        ? (otherCol.getBoundingClientRect().left - bodyRect.left) / curScale
                        : (oR.left - bodyRect.left) / curScale;
                      const myColLeft = (colARect.left - bodyRect.left) / curScale;
                      const otherSecData = other.__legoSec;

                      let tPct;
                      if (snapTargetX === otherRightX && Math.abs(otherColLeft - myColLeft) < 5 && otherSecData?.width) {
                        tPct = parseFloat(otherSecData.width);
                      } else {
                        const targetWScreen = bodyRect.left + snapTargetX * curScale - colARect.left;
                        tPct = Math.round((targetWScreen / bodyW) * 1000) / 10;
                      }

                      const tScreenW = (tPct / 100) * bodyW;
                      const tRemPct = Math.max(5, Math.round((pairTotalPct - tPct) * 10) / 10);

                      if (tScreenW >= minWA && totalPairW - tScreenW >= minWB && tPct >= 15) {
                        finalWA = (snapTargetX === otherRightX && Math.abs(otherColLeft - myColLeft) < 5 && otherSecData?.width)
                          ? otherSecData.width : `${tPct}%`;
                        finalWB = `${tRemPct}%`;
                        const cA = colWidthCss(finalWA, numCols);
                        const cB = colWidthCss(finalWB, numCols);
                        colAEl.style.width = cA; colAEl.style.flex = `0 0 ${cA}`; colAEl.style.maxWidth = cA;
                        colBEl.style.width = cB; colBEl.style.flex = `0 0 ${cB}`; colBEl.style.maxWidth = cB;
                        localX = snapTargetX;
                        isSnapped = true;
                        badgeText = `⚡ Aligned with "${snapName}" (${finalWA} / ${finalWB})`;
                        break;
                      }
                    }
                  }
                }

                renderZoneGuides(body, {
                  vLine: {
                    x: localX,
                    snap: isSnapped,
                    badgeText,
                    badgeY: (colARect.top - bodyRect.top) / curScale + 24,
                    isCol: true
                  }
                });
              };

              const onUpCol = (ev) => {
                ev?.stopPropagation();
                divider.classList.remove("active");
                clearZoneGuides(body);

                window.removeEventListener("pointermove", onMoveCol, true);
                window.removeEventListener("pointerup", onUpCol, true);
                window.removeEventListener("pointercancel", onUpCol, true);
                window.removeEventListener("mousemove", onMoveCol, true);
                window.removeEventListener("mouseup", onUpCol, true);

                // Clique sem arrastar (ex.: o 1º clique de um duplo clique) não
                // muda nada nem redesenha — senão o duplo clique se perdia.
                if (!ev || Math.abs(ev.clientX - startClientX) < 3) {
                  colAEl.style.cssText = colAStyle; colBEl.style.cssText = colBStyle;
                  return;
                }
                pushUndo(host);
                colA.entries.forEach((ent) => { ent.sec.width = finalWA; });
                colB.entries.forEach((ent) => { ent.sec.width = finalWB; });
                state.refresh();
              };

              window.addEventListener("pointermove", onMoveCol, true);
              window.addEventListener("pointerup", onUpCol, true);
              window.addEventListener("pointercancel", onUpCol, true);
              window.addEventListener("mousemove", onMoveCol, true);
              window.addEventListener("mouseup", onUpCol, true);
            });

            colsRow.append(divider);
          }
        });
        body.append(colsRow);
      }
    });
    // Suporte a soltar componentes diretamente no fundo do Canvas com Snap to Grid de 20px
    if (state.edit) {
      body.addEventListener("dragover", (e) => {
        if (state.draggingSection) {
          e.preventDefault();
          if (!e.target.closest(".lego-sec")) {
            const bodyRect = body.getBoundingClientRect();
            const curScale = domScale();
            renderZoneGuides(body, {
              hLine: {
                y: (bodyRect.bottom - bodyRect.top) / curScale - 6,
                snap: true,
                badgeText: "⚡ Nova Linha no Final (100%)",
                badgeX: (bodyRect.width / curScale) / 2
              }
            });
          }
        }
        if (state.draggingComponent) {
          e.preventDefault();
        }
      });

      body.addEventListener("dragleave", (e) => {
        if (!e.relatedTarget || !body.contains(e.relatedTarget)) {
          clearZoneGuides(body);
        }
      });

      body.addEventListener("drop", (e) => {
        clearZoneGuides(body);
        if (e.target.closest(".lego-sec")) return; // Deixa o card tratar se o drop foi em cima de um card

        if (state.draggingComponent) {
          e.preventDefault();
          const d = state.draggingComponent;
          state.draggingComponent = null;

          const before = JSON.stringify(host.properties[PROP] || {});
          const newSec = makeZone(toolByKind(d.kind).label.toUpperCase());
          sections.push(newSec);
          dropArmedTool(host, state, newSec.tabs[0], 16, 16, false, d.kind);
          // O dropArmedTool gravou o Undo já com a zona vazia; um passo só
          // (zona + componente) deve voltar ao estado de antes do drop.
          const stack = host.__legoUndoStack;
          if (stack?.length) stack[stack.length - 1] = before;
        }
      });

      // Botão para Adicionar Nova Zona
      const addZoneBtn = el("div", "lego-zone-add");
      addZoneBtn.innerHTML = `${glyph("plus", 16)}<span>NEW ZONE</span>`;
      addZoneBtn.title = "Create a new zone or control group in this tab";
      addZoneBtn.style.width = "100%";
      addZoneBtn.addEventListener("pointerdown", eatPointer);
      addZoneBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openAddZoneModal({ host, curTab: cur, state });
      });
      body.append(addZoneBtn);
    }
  }

  root.append(body);

  // Uma borda só: o título já aparece na barra nativa do nó, então o cartão
  // não repete o título. Os botões ficam no cabeçalho compacto (sem título).
  // `layout.showTitle: true` volta ao cabeçalho antigo (título + botões).
  if (!layout.showTitle) {
    txt.remove();
    head.classList.add("compact");
    root.classList.add("merged");
  }

  // O inspetor é uma janela fora do nó — acompanha a seleção, não o layout.
  queueMicrotask(() => renderObjectInspector(host, state, false));

  return root;
}

export { buildCard };
