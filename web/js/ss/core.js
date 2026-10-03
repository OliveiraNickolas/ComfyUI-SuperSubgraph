/* Utilidades básicas: toast, elementos, desfazer/refazer, copiar/colar e atalhos do cartão; injeção do CSS. */
// Parte do ComfyUI-SuperSubgraph (ver web/js/super_subgraph.js e CLAUDE.md).
// Só declarações: nada roda ao carregar este arquivo.

import { CSS, CSS_FORM, CSS_OUTPUT, CSS_DRAG, CSS_CAPTION_ALIGN } from "../super_subgraph_css.js";
import { PROP } from "./constants.js";
import { el } from "./controls.js";
import { activeSectionOf, groupSelectedComponents, removeControlsByName, renameClone, visibleControlsOf, walkControls } from "./form.js";
import { ensureComponentName, findSelected, leaveEditMode, renderObjectInspector } from "./inspector.js";
import { ATTACHED } from "./lifecycle.js";

/* Estilos: web/js/super_subgraph_css.js */

function showLegoToast(msg, ms = 1800) {
  let toast = document.getElementById("lego-action-toast");
  if (!toast) {
    toast = el("div", "lego-action-toast");
    toast.id = "lego-action-toast";
    document.body.append(toast);
  }
  toast.textContent = msg;
  toast.classList.add("visible");
  clearTimeout(toast.__timer);
  toast.__timer = setTimeout(() => toast.classList.remove("visible"), ms);
}

/* ── Histórico de Undo / Redo (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) ── */

/**
 * O ChangeTracker do ComfyUI também escuta Ctrl+Z (na captura, antes de nós,
 * e decide só no próximo quadro). Sem isto, um Ctrl+Z no cartão em edição
 * desfazia o layout E recarregava o workflow inteiro de um estado anterior —
 * às vezes com a promoção ainda lá. Evento que o cartão tratou fica marcado
 * e o ChangeTracker o ignora.
 */
function patchNativeUndo() {
  const CT = window.comfyAPI?.changeTracker?.ChangeTracker;
  const proto = CT?.prototype;
  if (!proto || typeof proto.undoRedo !== "function" || proto.__legoPatched) return;
  const orig = proto.undoRedo;
  proto.undoRedo = async function (e) {
    if (e?.__legoHandled) return true;
    return orig.apply(this, arguments);
  };
  proto.__legoPatched = true;
}
function pushUndoSnapshot(node, snapshot) {
  if (!node || !snapshot) return;
  if (!node.__legoUndoStack) node.__legoUndoStack = [];
  if (!node.__legoRedoStack) node.__legoRedoStack = [];
  const top = node.__legoUndoStack[node.__legoUndoStack.length - 1];
  if (top === snapshot) return;
  node.__legoUndoStack.push(snapshot);
  if (node.__legoUndoStack.length > 50) node.__legoUndoStack.shift();
  node.__legoRedoStack = [];
}

function pushUndo(node) {
  if (!node || !node.properties) return;
  const snap = JSON.stringify(node.properties[PROP] || {});
  pushUndoSnapshot(node, snap);
}

function doUndo(node, state) {
  if (!node || !node.__legoUndoStack || node.__legoUndoStack.length === 0) {
    showLegoToast("Nothing to undo");
    return false;
  }
  const currentSnap = JSON.stringify(node.properties[PROP] || {});
  const prevSnap = node.__legoUndoStack.pop();
  if (!node.__legoRedoStack) node.__legoRedoStack = [];
  node.__legoRedoStack.push(currentSnap);
  try {
    node.properties[PROP] = JSON.parse(prevSnap);
  } catch (err) {
    console.error("[SuperSubgraph] Error restoring undo state:", err);
    return false;
  }
  // O próprio Undo/Redo não pode virar entrada nova no histórico.
  node.__legoSkipHistory = true;
  showLegoToast("Undo");
  state?.refresh();
  renderObjectInspector(node, state, false);
  return true;
}

function doRedo(node, state) {
  if (!node || !node.__legoRedoStack || node.__legoRedoStack.length === 0) {
    showLegoToast("Nothing to redo");
    return false;
  }
  const currentSnap = JSON.stringify(node.properties[PROP] || {});
  const nextSnap = node.__legoRedoStack.pop();
  if (!node.__legoUndoStack) node.__legoUndoStack = [];
  node.__legoUndoStack.push(currentSnap);
  try {
    node.properties[PROP] = JSON.parse(nextSnap);
  } catch (err) {
    console.error("[SuperSubgraph] Error restoring redo state:", err);
    return false;
  }
  // O próprio Undo/Redo não pode virar entrada nova no histórico.
  node.__legoSkipHistory = true;
  showLegoToast("Redo");
  state?.refresh();
  renderObjectInspector(node, state, false);
  return true;
}

/* ── Clipboard e Duplicação (Ctrl+C / Ctrl+V / Duplicate) ── */
let LEGO_CLIPBOARD = null;
let LEGO_PASTE_OFFSET = 16;

function duplicateComponent(host, state, ctrl, list, offset = 16) {
  pushUndo(host);
  const layout = host.properties[PROP];
  const clone = renameClone(layout, JSON.parse(JSON.stringify(ctrl)));

  if (typeof clone.x === "number") clone.x = Math.round((clone.x + offset) / 16) * 16;
  if (typeof clone.y === "number") clone.y = Math.round((clone.y + offset) / 16) * 16;

  const targetList = list || visibleControlsOf(activeSectionOf(layout, state));
  if (targetList) {
    const idx = targetList.indexOf(ctrl);
    if (idx >= 0) {
      targetList.splice(idx + 1, 0, clone);
    } else {
      targetList.push(clone);
    }
  }

  if (!state.selectedNames) state.selectedNames = new Set();
  state.selectedNames.clear();
  state.selectedNames.add(clone.name);
  state.selectedName = clone.name;

  showLegoToast(`Duplicated ${clone.name}`);
  state.refresh();
  renderObjectInspector(host, state, false);
  return clone;
}

function copySelectedComponents(host, state) {
  const layout = host.properties[PROP];
  if (!state.selectedNames || state.selectedNames.size === 0) {
    if (!state.selectedName) return false;
    state.selectedNames = new Set([state.selectedName]);
  }
  const items = [];
  walkControls(layout, (c, list, sec, parentGroup) => {
    if (state.selectedNames.has(c.name)) {
      items.push({
        ctrl: JSON.parse(JSON.stringify(c)),
        isItemOfGroup: !!parentGroup,
        parentGroupName: parentGroup?.name || null
      });
    }
  });
  if (items.length === 0) return false;
  LEGO_CLIPBOARD = {
    items,
    timestamp: Date.now()
  };
  LEGO_PASTE_OFFSET = 16;
  showLegoToast(`Copied ${items.length} item${items.length > 1 ? "s" : ""}`);
  return true;
}

function pasteComponents(host, state) {
  if (!LEGO_CLIPBOARD || !LEGO_CLIPBOARD.items || LEGO_CLIPBOARD.items.length === 0) return false;
  const layout = host.properties[PROP];
  const targetControls = visibleControlsOf(activeSectionOf(layout, state));
  if (!targetControls) return false;

  // O destino "dentro do grupo" sai da seleção de ANTES da colagem; o laço
  // abaixo muda `selectedName` a cada item colado.
  const selectedBefore = state.selectedName ? findSelected(layout, state) : null;

  pushUndo(host);

  if (!state.selectedNames) state.selectedNames = new Set();
  state.selectedNames.clear();

  const pastedNames = [];

  for (const entry of LEGO_CLIPBOARD.items) {
    const clone = renameClone(layout, JSON.parse(JSON.stringify(entry.ctrl)));
    const isContainerClone = clone.kind === "segment" || clone.kind === "vsegment" || clone.kind === "group";

    if (typeof clone.x === "number") {
      clone.x = Math.round((clone.x + LEGO_PASTE_OFFSET) / 16) * 16;
    }
    if (typeof clone.y === "number") {
      clone.y = Math.round((clone.y + LEGO_PASTE_OFFSET) / 16) * 16;
    }

    // Grupo nunca entra em grupo: colar (ou Ctrl+D) com um grupo selecionado
    // punha a cópia do grupo dentro dele mesmo.
    let addedToGroup = false;
    if (selectedBefore && !isContainerClone) {
      if (selectedBefore.ctrl && (selectedBefore.ctrl.kind === "vsegment" || selectedBefore.ctrl.kind === "segment")) {
        if (!selectedBefore.ctrl.items) selectedBefore.ctrl.items = [];
        selectedBefore.ctrl.items.push(clone);
        addedToGroup = true;
      } else if (selectedBefore.parentGroup) {
        selectedBefore.parentGroup.items.push(clone);
        addedToGroup = true;
      }
    }

    if (!addedToGroup) targetControls.push(clone);

    state.selectedNames.add(clone.name);
    state.selectedName = clone.name;
    pastedNames.push(clone.name);
  }

  LEGO_PASTE_OFFSET += 16;

  showLegoToast(`Pasted ${pastedNames.length} item${pastedNames.length > 1 ? "s" : ""}`);
  state.refresh();
  renderObjectInspector(host, state, false);
  return true;
}

/** Esc larga a ferramenta armada — o mesmo reflexo do Delphi. */
function installFormShortcuts() {
  if (window.__legoKeys) return;
  window.__legoKeys = true;
  patchNativeUndo();
  window.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    const isTyping = active && (
      active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.tagName === "SELECT" ||
      active.isContentEditable ||
      active.closest(".lego-oi") ||
      active.closest(".lego-comfy-dialog")
    );

    if (e.key === "Escape") {
      // Janela de busca aberta: o Esc é dela. Antes, com algo selecionado, este
      // atalho consumia a tecla (limpando a seleção) e a janela não fechava.
      const dlg = document.querySelector(".lego-comfy-backdrop");
      if (dlg && dlg.style.display !== "none") {
        dlg.remove();
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      // Lista de um dropdown aberta: o Esc só fecha a lista (o listener dela
      // cuida disso), sem limpar a seleção do cartão.
      if (document.querySelector(".lego-list-pop")) return;

      // 1. Se houver ferramenta armada ou componente selecionado, limpa primeiro
      let handledSelection = false;
      for (const n of ATTACHED) {
        const st = n.__legoState;
        if (st && st.edit) {
          if (st.armedTool || (st.selectedNames && st.selectedNames.size > 0) || st.selectedName) {
            st.armedTool = null;
            st.selectedNames?.clear();
            st.selectedName = null;
            st.refresh();
            renderObjectInspector(n, st, false);
            handledSelection = true;
          }
        }
      }
      if (handledSelection) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      // 2. Se não havia seleção ou ferramenta ativa, sai do Modo Edição
      let leftEdit = false;
      for (const n of ATTACHED) {
        const st = n.__legoState;
        if (st && st.edit) {
          st.edit = false;
          leaveEditMode(st);
          st.refresh();
          leftEdit = true;
        }
      }
      if (leftEdit) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      return;
    }

    if (isTyping) return;

    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    // Ctrl+Z / Cmd+Z / Ctrl+Shift+Z: Desfazer e Refazer
    if (isCtrlOrCmd && (e.key === "z" || e.key === "Z")) {
      for (const n of ATTACHED) {
        const st = n.__legoState;
        if (st && st.edit) {
          e.preventDefault();
          e.stopPropagation();
          e.__legoHandled = true;
          if (e.shiftKey) {
            doRedo(n, st);
          } else {
            doUndo(n, st);
          }
          return;
        }
      }
    }

    // Ctrl+Y / Cmd+Y: Refazer
    if (isCtrlOrCmd && (e.key === "y" || e.key === "Y")) {
      for (const n of ATTACHED) {
        const st = n.__legoState;
        if (st && st.edit) {
          e.preventDefault();
          e.stopPropagation();
          e.__legoHandled = true;
          doRedo(n, st);
          return;
        }
      }
    }

    // Ctrl+C / Cmd+C: Copiar
    if (isCtrlOrCmd && (e.key === "c" || e.key === "C")) {
      for (const n of ATTACHED) {
        const st = n.__legoState;
        if (st && st.edit) {
          if (copySelectedComponents(n, st)) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }
    }

    // Ctrl+V / Cmd+V: Colar
    if (isCtrlOrCmd && (e.key === "v" || e.key === "V")) {
      for (const n of ATTACHED) {
        const st = n.__legoState;
        if (st && st.edit) {
          if (pasteComponents(n, st)) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }
    }

    // Ctrl+D / Cmd+D: Duplicar seleção diretamente (estilo Figma)
    if (isCtrlOrCmd && (e.key === "d" || e.key === "D")) {
      for (const n of ATTACHED) {
        const st = n.__legoState;
        if (st && st.edit) {
          if (copySelectedComponents(n, st)) {
            pasteComponents(n, st);
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }
    }

    // Ctrl+G / Ctrl+Shift+G: agrupa a seleção num grupo horizontal / vertical
    if (isCtrlOrCmd && (e.key === "g" || e.key === "G")) {
      for (const n of ATTACHED) {
        const st = n.__legoState;
        if (st && st.edit && (st.selectedNames?.size || st.selectedName)) {
          e.preventDefault();
          e.stopPropagation();
          groupSelectedComponents(n, st, e.shiftKey);
          return;
        }
      }
    }

    // Ctrl+A / Cmd+A: Selecionar todos os objetos da zona ativa (estilo Figma/ComfyUI)
    if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
      for (const n of ATTACHED) {
        const st = n.__legoState;
        if (st && st.edit) {
          const layout = n.properties[PROP];
          if (!layout) continue;
          const controls = visibleControlsOf(activeSectionOf(layout, st));
          if (controls && controls.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            if (!st.selectedNames) st.selectedNames = new Set();
            st.selectedNames.clear();
            controls.forEach((c) => {
              ensureComponentName(layout, c);
              st.selectedNames.add(c.name);
            });
            st.selectedName = controls[controls.length - 1]?.name || null;
            st.refresh();
            renderObjectInspector(n, st, false);
            break;
          }
        }
      }
      return;
    }

    // Delete / Backspace: Apagar todos os objetos selecionados
    if (e.key === "Delete" || e.key === "Backspace") {
      for (const n of ATTACHED) {
        const st = n.__legoState;
        if (st && st.edit && st.selectedNames && st.selectedNames.size > 0) {
          const layout = n.properties[PROP];
          if (!layout) continue;

          // Só grava o snapshot se houver o que apagar: gravar à toa zerava o Redo.
          let anyMatch = false;
          walkControls(layout, (c) => { if (st.selectedNames.has(c.name)) anyMatch = true; });
          if (!anyMatch) continue;

          pushUndo(n); // Salva snapshot para Undo antes de apagar
          const deletedCount = removeControlsByName(layout, st.selectedNames);

          if (deletedCount > 0) {
            e.preventDefault();
            e.stopPropagation();
            st.selectedNames.clear();
            st.selectedName = null;
            st.refresh();
            renderObjectInspector(n, st, false);
            break;
          }
        }
      }
    }
  }, true);
}

function injectCSS() {
  installFormShortcuts();
  if (document.getElementById("lego-style")) return;
  const s = document.createElement("style");
  s.id = "lego-style";
  s.textContent = CSS + CSS_FORM + CSS_OUTPUT + CSS_DRAG + CSS_CAPTION_ALIGN;
  document.head.appendChild(s);
}

export { showLegoToast, patchNativeUndo, pushUndoSnapshot, pushUndo, doUndo, doRedo, LEGO_CLIPBOARD, LEGO_PASTE_OFFSET, duplicateComponent, copySelectedComponents, pasteComponents, installFormShortcuts, injectCSS };
