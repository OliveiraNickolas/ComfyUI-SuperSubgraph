import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { CSS, CSS_FORM, CSS_OUTPUT, CSS_DRAG } from "./super_subgraph_css.js";

/**
 * ComfyUI Super-Subgraph — "UI Lego"  v2
 *
 * Transforma qualquer nó (em especial subgrafos) num cartão modular com abas,
 * seções e controles HTML reais.
 *
 * Decisões de arquitetura (leia antes de mexer):
 *
 *  1. DOM, não Canvas2D. O cartão é um `addDOMWidget`, então funciona tanto no
 *     renderizador de canvas quanto no de Vue Nodes. `onDrawForeground` só é
 *     chamado no canvas legado — um cartão desenhado lá fica invisível quando o
 *     usuário liga `Comfy.VueNodes.Enabled`.
 *
 *  2. Binding por NOME, nunca por índice. `widgets_values` é posicional; se um
 *     widget promovido some, todos abaixo dele andam uma casa. Gravar por índice
 *     escreve no widget errado. Todo controle guarda `bind` = nome do widget.
 *
 *  3. O widget do cartão é `serialize = false`. O frontend monta o índice de
 *     `widgets_values` só sobre widgets serializáveis, então o cartão não entra
 *     na lista e não desloca nenhum valor existente.
 *
 *  4. Esconder é `w.hidden = true`. Tirar um widget de `node.widgets` faz o
 *     ComfyUI podar o input correspondente, o que mata promoções de subgrafo.
 *
 *  5. O modelo de montagem é o do Delphi 7: a zona é um formulário vazio, a
 *     paleta arma uma ferramenta, o clique solta o componente ali SEM função,
 *     e o Inspetor de Objetos (janela flutuante) é onde se dá a função — o
 *     parâmetro do workflow que aquele componente passa a controlar.
 *
 *  6. A identidade do componente é `ctrl.name` (Slider1, Combo2...), não o
 *     objeto. `node.properties` volta da leitura embrulhado num proxy reativo,
 *     então comparar por `===` entre o que se grava e o que se lê não funciona.
 */

const EXT = "ComfyUI.SuperSubgraph";
const PROP = "ui_layout";
const SCHEMA = 2;
const MIN_W = 600;
const PAD = 24;        // folga abaixo do cartão
const TICK_MS = 250;   // intervalo mínimo entre conferências de tamanho
const SWEEP_MS = 1000; // varredura de manutenção dos cartões
const GRID = 16;       // passo do snap dos componentes na zona
const LOG = "[SuperSubgraph]";

/* Estilos: web/js/super_subgraph_css.js */

function showLegoToast(msg) {
  let toast = document.getElementById("lego-action-toast");
  if (!toast) {
    toast = el("div", "lego-action-toast");
    toast.id = "lego-action-toast";
    document.body.append(toast);
  }
  toast.textContent = msg;
  toast.classList.add("visible");
  clearTimeout(toast.__timer);
  toast.__timer = setTimeout(() => toast.classList.remove("visible"), 1200);
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
      for (const n of ATTACHED) {
        const st = n.__legoState;
        if (st) {
          let changed = false;
          if (st.armedTool) {
            st.armedTool = null;
            changed = true;
          }
          if ((st.selectedNames && st.selectedNames.size > 0) || st.selectedName) {
            st.selectedNames?.clear();
            st.selectedName = null;
            changed = true;
          }
          if (changed) {
            st.refresh();
            renderObjectInspector(n, st, false);
            e.stopPropagation();
          }
        }
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
  s.textContent = CSS + CSS_FORM + CSS_OUTPUT + CSS_DRAG;
  document.head.appendChild(s);
}

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

/** Widgets que o cartão nunca deve tocar. */
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
  return false;
}

function usable(w) {
  if (!w || w.__lego || w.__ssInternal) return false;
  if (isHelperWidget(w)) return false;
  const t = String(w.type || "").toLowerCase();
  if (t === "converted-widget" || t === "hidden") return false;
  if (t.startsWith("dom")) return false;
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
  return w ? { node: target, widget: w } : null;
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
    else if (d.kind === "toggle" || RE_TOGGLE.test(n)) bins.toggles.push({ ...ctrl, kind: "toggle" });
    else if (RE_SEED.test(n)) bins.sampler.push({ ...ctrl, seed: true });
    else if (RE_CANVAS.test(n)) bins.canvas.push(ctrl);
    else if (RE_SAMPLER.test(n)) bins.sampler.push(ctrl);
    else bins.other.push(ctrl);
  }

  const tabs = [];
  const sec = (header, controls) => ({ header, controls });

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
    tabs.push({ name: "Media", sections: [{ header: "REFERENCE GRID", grid: 3, controls: bins.media }] });
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
    tabs.push({ name: "Output", sections: [{ header: "OUTPUT", controls: outs }] });
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

/* ══════════════════════════════════════════════════════════════════════════
   Controles
   ══════════════════════════════════════════════════════════════════════════ */

const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};

/**
 * Escapa texto para interpolar em `innerHTML`. Título de nó, valor de widget,
 * nome e bind de componente vêm do workflow — que circula como JSON/PNG — e
 * nunca podem virar marcação.
 */
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

/* ══════════════════════════════════════════════════════════════════════════
   Glifos dos widgets

   Desenhos da FORMA REAL do widget no LiteGraph, não pictogramas: a pílula
   arredondada, as setas de incremento, a barra com knob, a caixa de texto
   multilinha. Quem olha reconhece o componente pelo que ele é na tela.
   Traço em `currentColor`, então herdam a cor de onde forem postos.
   ══════════════════════════════════════════════════════════════════════════ */

const PILL = '<rect x="2" y="7.5" width="20" height="9" rx="4.5" fill="none" stroke="currentColor" stroke-width="1.9"/>';

const GLYPHS = {
  // Pontilhado de arraste.
  grip:
    '<path d="M9 6.5h.01M9 12h.01M9 17.5h.01M15 6.5h.01M15 12h.01M15 17.5h.01" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',

  // X — fechar / remover.
  close:
    '<path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',

  // Tique — confirmar.
  check:
    '<path d="M5 12.6l4.5 4.4L19 7.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',

  // Setas de ordem.
  up: '<path d="M6.5 14.2L12 8.6l5.5 5.6" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',
  down: '<path d="M6.5 9.8L12 15.4l5.5-5.6" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',

  // Elo — o vínculo do componente com o parâmetro do workflow.
  link:
    '<path d="M10 14a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11.2 7.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>'
    + '<path d="M14 10a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.4-1.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',

  // Forma vazia — componente ainda sem funcao atribuida.
  blank:
    '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-dasharray="3 2.6"/>',

  // Retangulo de secao/zona.
  zone:
    '<rect x="2.6" y="4.6" width="18.8" height="14.8" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.9"/>'
    + '<path d="M2.6 9.4h18.8" stroke="currentColor" stroke-width="1.9"/>',

  // Rotulo de texto estatico.
  label:
    '<path d="M4 7.5h16M4 12h11M4 16.5h7" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
  // Barra preenchida com knob — o widget de slider.
  slider:
    '<path d="M6.5 7.5h7.5v9H6.5a4.5 4.5 0 0 1 0-9z" fill="currentColor" opacity=".38"/>' +
    PILL +
    '<circle cx="14" cy="12" r="2.9" fill="currentColor"/>',

  // Pílula com o knob à direita — booleano ligado.
  toggle: PILL + '<circle cx="17.2" cy="12" r="2.9" fill="currentColor"/>',

  // Setas de incremento nas pontas — o widget numérico.
  number: PILL +
    '<path d="M7.6 9.9L5.4 12l2.2 2.1z" fill="currentColor"/>' +
    '<path d="M16.4 9.9L18.6 12l-2.2 2.1z" fill="currentColor"/>',

  // Pílula com a seta de abrir — o combo.
  combo: PILL +
    '<path d="M14.6 10.9l2.2 2.3 2.2-2.3" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',

  // Caixa alta com linhas de texto — a área multilinha.
  textarea:
    '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
    '<path d="M5.5 9h13M5.5 12h13M5.5 15h8" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',

  // Pílula com uma linha — texto de uma linha.
  text: PILL + '<path d="M6.2 12h8.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',

  // Moldura com horizonte — a área de imagem do nó.
  media:
    '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
    '<circle cx="8.2" cy="9.4" r="1.7" fill="currentColor"/>' +
    '<path d="M4 17.2l4.6-4.8 3.4 3.4 3-2.4 4 3.8" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linejoin="round"/>',

  // Câmera / película — a área de vídeo do nó.
  video:
    '<rect x="2.5" y="5.5" width="13" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
    '<path d="M15.5 9.5l5-3.5v12l-5-3.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',

  // Alto-falante / ondas sonoras — a área de áudio do nó.
  audio:
    '<path d="M3.5 9.5v5h3.5L11.5 18V6L7 9.5H3.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>' +
    '<path d="M15 8.5a4.5 4.5 0 010 7M18 6a8 8 0 010 12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',

  play:
    '<polygon points="8.5,6 18.5,12 8.5,18" fill="currentColor"/>',

  pause:
    '<rect x="7" y="6" width="3.2" height="12" rx="1.2" fill="currentColor"/><rect x="13.8" y="6" width="3.2" height="12" rx="1.2" fill="currentColor"/>',

  dice:
    '<rect x="4" y="4" width="16" height="16" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.9"/>'
    + '<circle cx="9" cy="9" r="1.35" fill="currentColor"/>'
    + '<circle cx="15" cy="15" r="1.35" fill="currentColor"/>'
    + '<circle cx="12" cy="12" r="1.35" fill="currentColor"/>',

  chevron:
    '<path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.1" '
    + 'stroke-linecap="round" stroke-linejoin="round"/>',

  button:
    '<rect x="2.5" y="7" width="19" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
    '<path d="M7.5 12h9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',

  /* ── Cromo da interface ── */
  settings:
    '<path d="M4 8h10M18 8h2M4 16h2M10 16h10" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
    '<circle cx="16" cy="8" r="2.3" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
    '<circle cx="8" cy="16" r="2.3" fill="none" stroke="currentColor" stroke-width="1.9"/>',
  search:
    '<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M15 15l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  trash:
    '<path d="M4 7h16M9.5 7V5h5v2M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  pencil:
    '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 013 3L8 18.5z" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linejoin="round"/>',
  folder:
    '<path d="M3 6.5h6l2 2.5h10v9.5a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.5z" ' +
    'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
  // Máscara: o mesmo ícone do Mask Editor nativo do ComfyUI (comfy--mask, 16x16).
  mask:
    '<g transform="scale(1.5)" stroke="currentColor" stroke-width="1.3"><path d="M6.05 2C5.52 7.295 9.23 10.472 14 9.943"/><path stroke-linecap="round" d="M6.5 5.5 10 2"/><path stroke-linecap="square" d="m8 8 4.5-4.5"/><path stroke-linecap="round" d="M10.5 9.5 14 6"/><path stroke-linecap="round" stroke-linejoin="round" d="M8 14.667A6.667 6.667 0 108 1.333a6.667 6.667 0 000 13.334"/></g>',
  folderSearch:
    '<path d="M3 6.5h5.5l2 2H19a1.5 1.5 0 0 1 1.5 1.5v3M3 6.5v11.5A1.5 1.5 0 0 0 4.5 19.5h6.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="15.5" cy="15.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
    '<path d="M18 18l3.2 3.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  target:
    '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
    '<circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
    '<circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  grid:
    '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="none" ' +
    'stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
  plus:
    '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  model:
    '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linejoin="round"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" ' +
    'fill="none" stroke="currentColor" stroke-width="1.5" opacity=".55"/>',
  hgroup:
    '<rect x="3" y="6" width="5" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<rect x="9.5" y="6" width="5" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<rect x="16" y="6" width="5" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  vgroup:
    '<rect x="4" y="3.5" width="16" height="4.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<rect x="4" y="9.75" width="16" height="4.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<rect x="4" y="16" width="16" height="4.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  hdivider:
    '<path d="M3 12h18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  vdivider:
    '<path d="M12 3v18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  enter:
    '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
    '<path d="M9.5 16.5 14 12l-4.5-4.5M14 12H3.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  back:
    '<path d="M15 5.5 8.5 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',
  copy:
    '<rect x="8.5" y="8.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
    '<path d="M5.5 15.5H4.5a2 2 0 0 1-2-2V4.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
};

/**
 * Rótulo curto para um valor de combo.
 *
 * Nomes de modelo vêm como caminho — "MiniMax-H3/minimax_h3_ref2va_pruned_
 * int8_convrot.safetensors" — e um <select> nativo mostra a string inteira,
 * obrigando a alargar o componente só para ler o fim, que é justamente a parte
 * que distingue um arquivo do outro. Aqui fica só a leaf do caminho; quando
 * duas folhas coincidem, a pasta volta para não ficar ambíguo.
 * O value cheio continua no `title` e é o que vai para o widget.
 */
function shortLabel(value, all) {
  const txt = String(value ?? "");
  const cut = txt.lastIndexOf("/");
  if (cut < 0) return txt;
  const leaf = txt.slice(cut + 1);
  if (Array.isArray(all)) {
    let dupes = 0;
    for (const v of all) {
      const t = String(v);
      if (t.slice(t.lastIndexOf("/") + 1) === leaf && ++dupes > 1) break;
    }
    if (dupes > 1) return txt.split("/").slice(-2).join("/");
  }
  return leaf;
}

/** SVG de um glyph, pronto para innerHTML. */
function glyph(name, size = 16) {
  const d = GLYPHS[name] || GLYPHS.settings;
  return `<svg class="lego-glyph" viewBox="0 0 24 24" width="${size}" height="${size}" `
    + `fill="none" aria-hidden="true" focusable="false">${d}</svg>`;
}

/** Elemento <span> com o glyph dentro, para quando não dá para usar innerHTML. */
function glyphEl(name, size = 16) {
  const sp = document.createElement("span");
  sp.className = "lego-glyph-wrap";
  sp.innerHTML = glyph(name, size);
  return sp;
}

/** Botão só de ícone, sem texto — o padrão de toda a barra de ações. */
function glyphBtn(cls, name, size = 13, title = "") {
  const b = el("button", cls);
  b.innerHTML = glyph(name, size);
  if (title) b.title = title;
  return b;
}

/** Botão com glifo + texto, na ordem em que o olho lê. */
function glyphTextBtn(cls, name, text, size = 14) {
  const b = el("button", cls);
  b.innerHTML = `${glyph(name, size)}<span>${esc(text)}</span>`;
  return b;
}

/** Impede que o clique no controle vire arrasto do nó no canvas. */
function eatPointer(e) {
  const hostSec = e.target.closest(".lego-sec-controls");
  if (hostSec && hostSec.classList.contains("in-edit")) return;
  e.stopPropagation();
}

function mkToggle(node, w, ctrl, state) {
  const sw = el("div", "lego-sw");
  const isValOn = () => {
    if (typeof w.value === "string") return /^(true|yes|enable|enabled|on|1)$/i.test(w.value);
    if (typeof w.value === "number") return w.value !== 0;
    return !!w.value;
  };
  const paint = () => sw.classList.toggle("on", isValOn());
  paint();
  sw.addEventListener("pointerdown", eatPointer);
  sw.addEventListener("click", (e) => {
    e.stopPropagation();
    let nextVal;
    if (typeof w.value === "boolean") {
      nextVal = !w.value;
    } else if (typeof w.value === "number") {
      nextVal = w.value ? 0 : 1;
    } else if (typeof w.value === "string") {
      const low = w.value.toLowerCase();
      if (low === "true") nextVal = "false";
      else if (low === "false") nextVal = "true";
      else if (low === "yes") nextVal = "no";
      else if (low === "no") nextVal = "yes";
      else if (low === "enable" || low === "enabled") nextVal = "disabled";
      else if (low === "disable" || low === "disabled") nextVal = "enabled";
      else if (low === "on") nextVal = "off";
      else if (low === "off") nextVal = "on";
      else nextVal = !isValOn();
    } else {
      nextVal = !w.value;
    }
    writeWidget(node, w, nextVal);
    paint();
  });
  state.watch(w, paint);
  return sw;
}

function mkSlider(node, w, ctrl, state) {
  const o = w?.options || {};
  const min = Number.isFinite(ctrl?.min) ? ctrl.min : (Number.isFinite(o.min) ? o.min : 0);
  const max = Number.isFinite(ctrl?.max) ? ctrl.max : (Number.isFinite(o.max) ? o.max : 1);
  let step = ctrl?.step ?? realStep(o);
  if (!ctrl?.step && !Number.isFinite(o?.step) && !Number.isFinite(o?.step2)) {
    step = (max - min <= 1) ? 0.01 : ((max - min <= 10) ? 0.1 : 1);
  }
  const isInt = isIntWidget(o, step);
  const dec = isInt
    ? 0
    : Number.isFinite(o.precision)
      ? o.precision
      : Math.min(4, Math.max(0, (String(step).split(".")[1] || "").length));

  const wrap = el("div", "lego-slider");
  const track = el("div", "lego-track");
  const fill = el("div", "lego-fill");
  const knob = el("div", "lego-knob");
  track.append(fill, knob);
  const num = el("input", "lego-in lego-num");
  num.type = "text";
  wrap.append(track, num);

  wrap.track = track;
  wrap.num = num;

  const clamp = (v) => Math.min(max, Math.max(min, v));
  const snap = (v) => {
    const s = clamp(Math.round((v - min) / step) * step + min);
    return isInt ? Math.round(s) : Number(s.toFixed(dec));
  };
  const paint = () => {
    const v = clamp(Number(w.value) || 0);
    const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
    fill.style.width = `${pct}%`;
    knob.style.left = `${pct}%`;
    if (document.activeElement !== num) num.value = isInt ? String(Math.round(v)) : v.toFixed(dec);
  };
  paint();

  const fromX = (clientX) => {
    const r = track.getBoundingClientRect();
    const t = r.width ? (clientX - r.left) / r.width : 0;
    return snap(min + Math.min(1, Math.max(0, t)) * (max - min));
  };

  let dragging = false;
  track.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    dragging = true;
    track.setPointerCapture(e.pointerId);
    writeWidget(node, w, fromX(e.clientX));
    paint();
  });
  track.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    e.stopPropagation();
    writeWidget(node, w, fromX(e.clientX));
    paint();
  });
  const stop = (e) => {
    if (!dragging) return;
    dragging = false;
    try { track.releasePointerCapture(e.pointerId); } catch {}
  };
  track.addEventListener("pointerup", stop);
  track.addEventListener("pointercancel", stop);

  num.addEventListener("pointerdown", eatPointer);
  num.addEventListener("change", () => {
    const v = parseFloat(num.value);
    writeWidget(node, w, Number.isFinite(v) ? snap(v) : w.value);
    paint();
  });
  num.addEventListener("keydown", (e) => e.stopPropagation());

  state.watch(w, paint);
  return wrap;
}

/* ── Modo da seed (control after generate) ──────────────────────────────
 * Número com o widget "control_after_generate" do ComfyUI ao lado ganha um
 * botão que mostra e troca o modo: fixo, +1, −1 ou aleatório a cada execução.
 */
const SEED_MODE_INFO = {
  fixed: ["FIX", "Fixed: the value stays the same"],
  increment: ["+1", "Increment: +1 after each run"],
  decrement: ["\u22121", "Decrement: \u22121 after each run"],
  randomize: ["", "Randomize: a new random value after each run"],
};
function controlWidgetOf(node, w) {
  // O nome varia com a versão do frontend ("control_after_generate" ou o
  // próprio valor padrão, "fixed"); o que não muda são os valores do combo.
  const isCtl = (x) => !!x && x !== w && (
    (typeof x.name === "string" && /^control_(after|before)_generate$/.test(x.name)) ||
    (Array.isArray(x.options?.values) && x.options.values.includes("randomize") && x.options.values.includes("increment")));
  const linked = (w?.linkedWidgets || []).find(isCtl);
  if (linked) return linked;
  const list = node?.widgets || [];
  const next = list[list.indexOf(w) + 1];
  return isCtl(next) ? next : null;
}
function seedModeButton(node, w, state) {
  const cw = controlWidgetOf(node, w);
  if (!cw) return null;
  const b = el("button", "lego-seed-mode");
  b.type = "button";
  const modes = () => (Array.isArray(cw.options?.values) && cw.options.values.length ? cw.options.values : Object.keys(SEED_MODE_INFO));
  const paint = () => {
    const v = String(cw.value ?? "fixed");
    const [txt, tip] = SEED_MODE_INFO[v] || [v, v];
    b.dataset.mode = v;
    b.innerHTML = v === "randomize" ? glyph("dice", 13) : esc(txt);
    b.title = `${tip} \u2014 click to change`;
  };
  paint();
  b.addEventListener("pointerdown", eatPointer);
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    const list = modes();
    const next = list[(list.indexOf(cw.value) + 1) % list.length];
    writeWidget(node, cw, next);
    paint();
  });
  state.watch(cw, paint);
  return b;
}

function mkNumber(node, w, ctrl, state) {
  const o = w.options || {};
  const step = ctrl.step ?? realStep(o);
  const isInt = isIntWidget(o, step);

  const wrap = el("div", "lego-slider");
  const num = el("input", "lego-in");
  num.type = "text";
  wrap.append(num);

  const paint = () => {
    if (document.activeElement !== num) num.value = String(w.value ?? "");
  };
  paint();

  num.addEventListener("pointerdown", eatPointer);
  num.addEventListener("keydown", (e) => e.stopPropagation());
  num.addEventListener("change", () => {
    let v = parseFloat(num.value);
    if (!Number.isFinite(v)) { paint(); return; }
    if (Number.isFinite(o.min)) v = Math.max(o.min, v);
    if (Number.isFinite(o.max)) v = Math.min(o.max, v);
    writeWidget(node, w, isInt ? Math.round(v) : v);
    paint();
  });

  if (ctrl.seed) {
    const die = el("button", "lego-iconbtn");
    die.innerHTML = glyph("dice", 13);
    die.title = "Randomize";
    die.addEventListener("pointerdown", eatPointer);
    die.addEventListener("click", (e) => {
      e.stopPropagation();
      const max = Number.isFinite(o.max) ? o.max : 0xffffffffffff;
      writeWidget(node, w, Math.floor(Math.random() * max));
      paint();
    });
    wrap.append(die);
  }
  const seedMode = seedModeButton(node, w, state);
  if (seedMode) wrap.append(seedMode);

  state.watch(w, paint);
  return wrap;
}

/**
 * Lista suspensa própria, em camada separada.
 *
 * Um <select> nativo só é legível se tiver a largura do próprio texto, e nome
 * de modelo passa de 60 caracteres — obrigava a alargar o componente inteiro
 * só para ler o final, que é justamente o que distingue um arquivo do outro.
 * Aqui o botão ocupa o espaço que houver e a lista abre solta, larga o quanto
 * precisar, com searchBox e a pasta separada do name do arquivo.
 */
function openDropdown(anchorEl, values, current, onPick) {
  document.querySelectorAll(".lego-list-pop").forEach((e) => e.remove());

  const pop = el("div", "lego-list-pop");
  const searchBox = el("input", "lego-list-search");
  searchBox.type = "text";
  searchBox.placeholder = "filter\u2026";
  const listEl = el("div", "lego-list-items");
  pop.append(searchBox, listEl);

  const closePopup = () => {
    pop.remove();
    document.removeEventListener("mousedown", onOutside, true);
    window.removeEventListener("keydown", onKey, true);
  };
  const onOutside = (e) => { if (!pop.contains(e.target)) closePopup(); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); closePopup(); } };

  const render = () => {
    const q = searchBox.value.toLowerCase();
    listEl.replaceChildren();
    let n = 0;
    for (let vi = 0; vi < values.length; vi++) {
      const v = values[vi];
      const rawVal = (typeof v === "object" && v !== null && "value" in v) ? v.value : v;
      const displayLabel = (typeof v === "object" && v !== null) ? (v.content || v.text || v.label || v.value) : v;
      const t = String(displayLabel ?? "");
      if (q && !t.toLowerCase().includes(q)) continue;
      const idx = vi;
      const it = el("div", `lego-list-item${String(rawVal) === String(current) ? " sel" : ""}`);
      const cut = t.lastIndexOf("/");
      if (cut >= 0) it.append(el("span", "lego-list-folder", t.slice(0, cut + 1)));
      it.append(el("span", "lego-list-leaf", t.slice(cut + 1)));
      it.title = t;
      it.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closePopup();
        onPick(rawVal, idx);
      });
      listEl.append(it);
      if (++n >= 600) break;   // listas de modelo chegam a centenas
    }
    if (!n) listEl.append(el("div", "lego-empty", "nothing found"));
  };

  searchBox.addEventListener("input", render);
  searchBox.addEventListener("keydown", (e) => e.stopPropagation());
  render();
  document.body.append(pop);

  // Posiciona sob o botão, sem escapar da janela; abre para cima se não couber.
  const r = anchorEl.getBoundingClientRect();
  const popW = Math.min(620, Math.max(r.width, 360));
  pop.style.width = `${popW}px`;
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - popW - 8))}px`;
  const alt = pop.offsetHeight;
  pop.style.top = (r.bottom + alt + 8 > window.innerHeight && r.top > alt)
    ? `${r.top - alt - 4}px`
    : `${r.bottom + 4}px`;

  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    window.addEventListener("keydown", onKey, true);
    searchBox.focus();
  }, 0);
}

function mkCombo(node, w, ctrl, state) {
  const btn = el("button", "lego-in lego-combo-btn");
  const labelEl = el("span", "lego-combo-label");
  const chevron = el("span", "lego-combo-chevron");
  chevron.innerHTML = glyph("chevron", 13);
  btn.append(labelEl, chevron);

  const pinta = () => {
    const vals = valuesOf(w);
    labelEl.textContent = shortLabel(w.value, vals) || "\u2014";
    btn.title = String(w.value ?? "");
  };
  pinta();

  btn.addEventListener("pointerdown", eatPointer);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    openDropdown(btn, valuesOf(w), w.value, (v) => {
      writeWidget(node, w, v);
      pinta();
    });
  });

  state.watch(w, pinta);
  return btn;
}

function mkText(node, w, ctrl, state, multiline) {
  const inp = el(multiline ? "textarea" : "input", "lego-in");
  if (!multiline) inp.type = "text";
  const paint = () => { if (document.activeElement !== inp) inp.value = w.value ?? ""; };
  paint();

  inp.addEventListener("pointerdown", eatPointer);
  inp.addEventListener("keydown", (e) => e.stopPropagation());
  inp.addEventListener("change", () => writeWidget(node, w, inp.value));
  inp.addEventListener("blur", () => writeWidget(node, w, inp.value));
  state.watch(w, paint);
  return inp;
}

function mkButton(node, w, ctrl) {
  const b = el("button", "lego-in", ctrl.label || prettify(w.name));
  b.style.cursor = "pointer";
  b.addEventListener("pointerdown", eatPointer);
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    try { w.callback?.call(node, w, app.canvas, node, [0, 0], {}); } catch {}
  });
  return b;
}

/* ── Media grid ─────────────────────────────────────────────────────────── */

function viewURL(name) {
  // O Mask Editor grava "clipspace/clipspace-mask-123.png [input]": o sufixo
  // diz a pasta (input/output/temp) e não faz parte do nome do arquivo.
  let raw = String(name || "");
  let type = "input";
  const m = /\s*\[(input|output|temp)\]$/.exec(raw);
  if (m) { type = m[1]; raw = raw.slice(0, m.index); }
  const i = raw.lastIndexOf("/");
  const sub = i > 0 ? raw.slice(0, i) : "";
  const file = i > 0 ? raw.slice(i + 1) : raw;
  return api.apiURL(
    `/view?filename=${encodeURIComponent(file)}&type=${type}&subfolder=${encodeURIComponent(sub)}&rand=${Math.random()}`
  );
}

/**
 * Abre o Mask Editor do ComfyUI para `node` (um Load Image, inclusive dentro
 * de um Super Subgraph, que não está no canvas). O editor usa o nó de volta
 * ("clipspace_return_node") e, ao salvar, grava a imagem mascarada no próprio
 * widget — o cartão vê a troca pelo watcher e atualiza a miniatura.
 */
async function openMaskEditorFor(node, w) {
  const CA = window.comfyAPI?.app?.ComfyApp;
  if (typeof CA?.open_maskeditor !== "function") {
    alert("Super Subgraph: this ComfyUI version has no Mask Editor API.");
    return false;
  }
  if (!w?.value) { showLegoToast("Choose an image first"); return false; }
  // O editor lê a imagem de `node.imgs`; um nó fora do canvas pode não ter carregado.
  const src = viewURL(w.value);
  const key = (u) => { try { const q = new URL(u, location.href).searchParams; return `${q.get("type")}/${q.get("subfolder")}/${q.get("filename")}`; } catch { return ""; } };
  if (!node.imgs?.length || key(node.imgs[0]?.src) !== key(src)) {
    const img = new Image();
    img.src = src;
    try { await img.decode(); } catch { showLegoToast("Could not load the image"); return false; }
    node.imgs = [img];
    node.imageIndex = 0;
  }
  CA.clipspace_return_node = node;
  try {
    CA.open_maskeditor();
  } catch (e) {
    console.error(LOG, "mask editor", e);
    alert(`Super Subgraph: could not open the Mask Editor (${e.message}).`);
    return false;
  }
  return true;
}

async function uploadTo(node, w, file) {
  const fd = new FormData();
  fd.append("image", file, file.name);
  fd.append("type", "input");
  fd.append("overwrite", "false");
  const res = await api.fetchApi("/upload/image", { method: "POST", body: fd });
  if (res.status !== 200) throw new Error(`upload ${res.status}`);
  const data = await res.json();
  const name = data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
  const vals = w.options?.values;
  if (Array.isArray(vals) && !vals.includes(name)) vals.push(name);
  writeWidget(node, w, name);
  return name;
}

/** Constrói o componente coeso de Mídia (Image / Video / Audio Upload): Miniatura + Dropdown com Nome + Botão Selecionar/Upload */
function mkMediaControl(node, w, ctrl, state, parentRow, mediaKind) {
  const kind = mediaKind || ctrl?.kind || (isVideoCombo(w) ? "video" : isAudioCombo(w) ? "audio" : "media");
  const isVideo = kind === "video";
  const isAudio = kind === "audio";
  const mediaTypeName = isVideo ? "video" : isAudio ? "audio" : "image";
  const mediaGlyph = isVideo ? "video" : isAudio ? "audio" : "media";

  const box = el("div", `lego-media-box is-${mediaTypeName}`);
  box.addEventListener("pointerdown", eatPointer);

  // 1. Miniatura / Preview da Mídia (Sobe e expande no modo Tall)
  const thumb = el("div", "lego-media-thumb");
  thumb.title = `Click or drag a ${mediaTypeName} file here`;

  let img, video, audioEl, audioWrap, playBtn;

  if (isVideo) {
    video = el("video");
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.preload = "metadata";
    video.style.display = "none";
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "cover";

    thumb.addEventListener("mouseenter", () => {
      if (video.src && video.style.display !== "none") {
        video.play().catch(() => {});
      }
    });
    thumb.addEventListener("mouseleave", () => {
      if (video.src) {
        video.pause();
      }
    });
  } else if (isAudio) {
    audioEl = el("audio");
    audioEl.preload = "metadata";

    audioWrap = el("div", "lego-audio-player");
    audioWrap.style.display = "none";
    audioWrap.addEventListener("pointerdown", eatPointer);

    // 1. Equalizador / Visualizador de Ondas Sonoras
    const vis = el("div", "lego-audio-visualizer");
    const barHeights = [25, 45, 80, 60, 95, 40, 70, 85, 30, 65, 90, 50, 75, 100, 55, 35, 70, 45, 80, 30];
    barHeights.forEach((h, idx) => {
      const b = el("div", "lego-audio-vbar");
      b.style.height = `${Math.round(h * 0.22)}px`;
      b.style.animationDelay = `${(idx * 0.04).toFixed(2)}s`;
      vis.append(b);
    });

    // 2. Linha de Controles: Play + Timeline + Tempo
    const ctrlRow = el("div", "lego-audio-controls");

    playBtn = el("div", "lego-audio-play-btn");
    playBtn.innerHTML = glyph("play", 13);
    playBtn.title = "Play / Pause";
    playBtn.addEventListener("pointerdown", eatPointer);

    const timeline = el("div", "lego-audio-timeline");
    timeline.title = "Click or drag to seek";
    timeline.addEventListener("pointerdown", eatPointer);
    const rail = el("div", "lego-audio-rail");
    const prog = el("div", "lego-audio-progress");
    rail.append(prog);
    const knob = el("div", "lego-audio-knob");
    timeline.append(rail, knob);

    const timeLabel = el("div", "lego-audio-time", "0:00 / 0:00");

    ctrlRow.append(playBtn, timeline, timeLabel);
    audioWrap.append(vis, ctrlRow);

    const formatAudioTime = (s) => {
      if (!s || isNaN(s) || !Number.isFinite(s) || s < 0) return "0:00";
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec < 10 ? "0" : ""}${sec}`;
    };

    const updateTimes = () => {
      const cur = audioEl.currentTime || 0;
      const dur = audioEl.duration || 0;
      timeLabel.textContent = `${formatAudioTime(cur)} / ${formatAudioTime(dur)}`;
    };

    let isSeeking = false;
    const seekTo = (e) => {
      const rect = timeline.getBoundingClientRect();
      if (rect.width <= 0) return;
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const pct = Math.max(0, Math.min(1, x / rect.width));
      prog.style.width = `${pct * 100}%`;
      knob.style.left = `${pct * 100}%`;
      if (audioEl.duration && Number.isFinite(audioEl.duration)) {
        audioEl.currentTime = pct * audioEl.duration;
        updateTimes();
      }
    };

    timeline.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      isSeeking = true;
      timeline.classList.add("dragging");
      seekTo(e);

      const onPointerMove = (ev) => {
        ev.stopPropagation();
        seekTo(ev);
      };
      const onPointerUp = (ev) => {
        ev?.stopPropagation();
        isSeeking = false;
        timeline.classList.remove("dragging");
        window.removeEventListener("pointermove", onPointerMove, true);
        window.removeEventListener("pointerup", onPointerUp, true);
      };

      window.addEventListener("pointermove", onPointerMove, true);
      window.addEventListener("pointerup", onPointerUp, true);
    });

    const toggleAudio = (e) => {
      e?.stopPropagation();
      e?.preventDefault();
      if (!audioEl.src) return;
      if (audioEl.paused) {
        audioEl.play().catch((err) => console.warn(LOG, "Audio playback error:", err));
      } else {
        audioEl.pause();
      }
    };

    playBtn.addEventListener("click", toggleAudio);

    audioEl.addEventListener("loadedmetadata", updateTimes);
    audioEl.addEventListener("durationchange", updateTimes);
    audioEl.addEventListener("timeupdate", () => {
      if (isSeeking) return;
      const cur = audioEl.currentTime || 0;
      const dur = audioEl.duration || 0;
      const pct = (dur > 0 && Number.isFinite(dur)) ? (cur / dur) * 100 : 0;
      prog.style.width = `${pct}%`;
      knob.style.left = `${pct}%`;
      updateTimes();
    });
    audioEl.addEventListener("play", () => {
      playBtn.innerHTML = glyph("pause", 13);
      audioWrap.classList.add("playing");
    });
    audioEl.addEventListener("pause", () => {
      playBtn.innerHTML = glyph("play", 13);
      audioWrap.classList.remove("playing");
    });
    audioEl.addEventListener("ended", () => {
      playBtn.innerHTML = glyph("play", 13);
      audioWrap.classList.remove("playing");
      prog.style.width = "0%";
      knob.style.left = "0%";
      audioEl.currentTime = 0;
      updateTimes();
    });
  } else {
    img = el("img");
    img.style.display = "none";
  }

  const ph = el("div");
  ph.style.display = "flex";
  ph.style.flexDirection = "column";
  ph.style.alignItems = "center";
  ph.style.justifyContent = "center";
  ph.innerHTML = `<span class="lego-glyph-wrap" style="opacity:0.4;">${glyph(mediaGlyph, 30)}</span><span class="lego-media-ph-hint" style="font-size:11px;opacity:0.6;margin-top:6px;font-weight:500;">Drop or click to load ${mediaTypeName}</span>`;

  if (isVideo) {
    thumb.append(video, ph);
  } else if (isAudio) {
    thumb.append(audioWrap, audioEl, ph);
  } else {
    thumb.append(img, ph);
  }

  const updateThumb = () => {
    let val = w?.value;
    if ((!val || typeof val !== "string") && Array.isArray(node?.imgs) && node.imgs.length > 0) {
      const firstImg = node.imgs[0];
      if (firstImg) {
        val = firstImg.src || firstImg.filename || "";
      }
    }
    if (val && typeof val === "string") {
      const url = val.startsWith("http") || val.startsWith("data:") || val.startsWith("/") ? val : viewURL(val);
      if (isVideo) {
        video.src = url;
        video.style.display = "block";
        ph.style.display = "none";
        video.onerror = () => {
          video.style.display = "none";
          ph.style.display = "flex";
        };
      } else if (isAudio) {
        audioEl.src = url;
        audioWrap.style.display = "flex";
        ph.style.display = "none";
        audioEl.onerror = () => {
          audioWrap.style.display = "none";
          ph.style.display = "flex";
        };
      } else {
        img.src = url;
        img.style.display = "block";
        ph.style.display = "none";
        img.onerror = () => {
          img.style.display = "none";
          ph.style.display = "flex";
        };
      }
    } else {
      if (isVideo) {
        video.style.display = "none";
        video.removeAttribute("src");
      } else if (isAudio) {
        audioWrap.style.display = "none";
        audioEl.removeAttribute("src");
      } else {
        img.style.display = "none";
        img.removeAttribute("src");
      }
      ph.style.display = "flex";
    }
  };

  updateThumb();

  // 2. Dropdown com Nome da Mídia e Opções Anteriores
  const sel = el("button", "lego-media-select lego-combo-btn");
  const labelEl = el("span", "lego-combo-label");
  const chevron = el("span", "lego-combo-chevron");
  chevron.innerHTML = glyph("chevron", 12);
  sel.append(labelEl, chevron);

  const populateOptions = () => {
    const vals = valuesOf(w, node);
    labelEl.textContent = w?.value ? shortLabel(w.value, vals) : "\u2014";
    sel.title = w?.value ? String(w.value) : `No ${mediaTypeName} selected`;
  };

  sel.addEventListener("pointerdown", eatPointer);
  sel.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    // `valuesOf` também resolve `values` dado como função (combos dinâmicos).
    openDropdown(sel, valuesOf(w, node), w?.value, (v) => {
      writeWidget(node, w, v);
      populateOptions();
      updateThumb();
    });
  });

  populateOptions();

  // 3. Input Oculto de Arquivo e Botão Estilizado de Selecionar
  const fileInput = el("input");
  fileInput.type = "file";
  fileInput.accept = isVideo
    ? "video/*,.mp4,.webm,.mkv,.mov,.avi,.flv,.m4v"
    : isAudio
    ? "audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.opus"
    : "image/*";
  fileInput.style.display = "none";

  const uploadBtn = el("button", "lego-media-upload-btn");
  uploadBtn.type = "button";
  uploadBtn.innerHTML = glyph("folderSearch", 15);
  uploadBtn.title = `Browse / Choose a ${mediaTypeName} file`;

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      uploadBtn.textContent = "⏳";
      const uploadedName = await uploadTo(node, w, file);
      populateOptions();
      if (w) sel.value = uploadedName;
      updateThumb();
    } catch (err) {
      console.error(LOG, "Upload failed", err);
      alert(`${mediaTypeName.toUpperCase()} upload failed: ` + (err.message || err));
    } finally {
      uploadBtn.innerHTML = glyph("folderSearch", 15);
      fileInput.value = "";
    }
  });

  uploadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  thumb.addEventListener("click", (e) => {
    if (isAudio && audioEl?.src && audioWrap?.style.display !== "none") return;
    e.stopPropagation();
    fileInput.click();
  });

  // Drag & drop de arquivo diretamente na miniatura
  const over = (on) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    thumb.classList.toggle("drop", on);
  };
  box.addEventListener("dragover", over(true));
  box.addEventListener("dragenter", over(true));
  box.addEventListener("dragleave", over(false));
  box.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    thumb.classList.remove("drop");
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (isVideo && !(file.type.startsWith("video/") || RE_VIDEO.test(file.name))) return;
    if (isAudio && !(file.type.startsWith("audio/") || RE_AUDIO.test(file.name))) return;
    if (!isVideo && !isAudio && !(file.type.startsWith("image/") || RE_IMAGE.test(file.name))) return;
    try {
      uploadBtn.textContent = "⏳";
      const uploadedName = await uploadTo(node, w, file);
      populateOptions();
      if (w) sel.value = uploadedName;
      updateThumb();
    } catch (err) {
      console.error(LOG, "Upload failed", err);
    } finally {
      uploadBtn.innerHTML = glyph("folderSearch", 15);
    }
  });

  // 4. Barra de Controles Inferior
  const bar = el("div", "lego-media-bar");
  bar.append(sel, uploadBtn);

  // Imagem: botão do Mask Editor (pintar a máscara direto do cartão).
  if (!isVideo && !isAudio && w) {
    const maskBtn = el("button", "lego-media-upload-btn lego-media-mask-btn");
    maskBtn.type = "button";
    maskBtn.innerHTML = glyph("mask", 15);
    maskBtn.title = "Open in Mask Editor";
    maskBtn.addEventListener("pointerdown", eatPointer);
    maskBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openMaskEditorFor(node, w);
    });
    bar.append(maskBtn);
  }

  box.append(thumb, bar, fileInput);

  // 5. Responsividade Vertical: se a altura for >= threshold, ativa .tall
  const thresholdH = isAudio ? 64 : 76;
  if (parentRow) {
    const checkHeight = () => {
      const h = parentRow.getBoundingClientRect().height || parseInt(ctrl?.h || ctrl?.height || "0");
      box.classList.toggle("tall", h >= thresholdH || isAudio);
    };

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          box.classList.toggle("tall", entry.contentRect.height >= thresholdH || isAudio);
        }
      });
      ro.observe(parentRow);
    } else {
      checkHeight();
    }
  } else if (parseInt(ctrl?.h || ctrl?.height || "0") >= thresholdH || isAudio) {
    box.classList.add("tall");
  }

  if (w && state?.watch) {
    state.watch(w, () => {
      populateOptions();
      updateThumb();
    });
  }

  return box;
}

/* mkMediaSlot foi removida: 59 linhas definidas e nunca chamadas — quem
   desenha mídia é mkMediaControl. */
function mkStepNumber(node, w, ctrl, state) {
  const o = w?.options || {};
  const step = ctrl.step ?? realStep(o);
  const isInt = isIntWidget(o, step);
  const min = Number.isFinite(o.min) ? o.min : -Infinity;
  const max = Number.isFinite(o.max) ? o.max : Infinity;

  const wrap = el("div", "lego-step-number");
  const btnDec = el("button", "lego-step-btn", "−");
  btnDec.title = "Decrease (-" + step + ")";
  const inp = el("input", "lego-step-input");
  inp.type = "text";
  const btnInc = el("button", "lego-step-btn", "+");
  btnInc.title = "Increase (+" + step + ")";

  wrap.append(btnDec, inp, btnInc);

  const paint = () => {
    if (document.activeElement !== inp) {
      const v = Number(w.value) || 0;
      inp.value = isInt ? String(Math.round(v)) : String(v);
    }
  };
  paint();

  // Soma de floats acumula resíduo (0.1 + 0.2 = 0.30000000000000004); corta
  // na precisão do widget ou, sem ela, numa folga que some com o resíduo.
  const tidy = (v) => (isInt ? Math.round(v) : Number(v.toFixed(Number.isFinite(o.precision) ? o.precision : 10)));

  const changeVal = (delta) => {
    let cur = Number(w.value) || 0;
    cur += delta;
    if (Number.isFinite(min)) cur = Math.max(min, cur);
    if (Number.isFinite(max)) cur = Math.min(max, cur);
    writeWidget(node, w, tidy(cur));
    paint();
  };

  btnDec.addEventListener("pointerdown", eatPointer);
  btnDec.addEventListener("click", (e) => { e.stopPropagation(); changeVal(-step); });

  btnInc.addEventListener("pointerdown", eatPointer);
  btnInc.addEventListener("click", (e) => { e.stopPropagation(); changeVal(step); });

  inp.addEventListener("pointerdown", eatPointer);
  inp.addEventListener("keydown", (e) => e.stopPropagation());
  inp.addEventListener("change", () => {
    let v = parseFloat(inp.value);
    if (!Number.isFinite(v)) { paint(); return; }
    if (Number.isFinite(min)) v = Math.max(min, v);
    if (Number.isFinite(max)) v = Math.min(max, v);
    writeWidget(node, w, isInt ? Math.round(v) : v);
    paint();
  });

  const seedMode = seedModeButton(node, w, state);
  if (seedMode) wrap.append(seedMode);

  state.watch(w, paint);
  return wrap;
}

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
  // Ids de execução: subgrafo nativo prefixa com "<host>:"; o motor do Super
  // Subgraph desdobra os nós de dentro como "<host>.<id>" e mostra o output
  // no próprio host (display node).
  const superHost = isSuperNode(host);
  if (!src) {
    const pre = `${host.id}:`;
    match = superHost
      ? (k) => k === String(host.id) || k.startsWith(`${host.id}.`)
      : host.subgraph ? (k) => k.startsWith(pre) : (k) => k === String(host.id);
  } else {
    const inside = isInsideHost(host, src);
    const base = inside ? (superHost ? `${host.id}.${src}` : `${host.id}:${src}`) : src;
    match = (k) => k === base || k.startsWith(`${base}:`) || k.startsWith(`${base}.`);
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

  let files = [];
  let seq = 0;
  let idx = 0;
  let sig = null;

  const render = () => {
    stage.replaceChildren();
    bar.style.display = files.length > 1 ? "" : "none";
    if (!files.length) {
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
      const v = el("video");
      v.src = url;
      v.controls = true;
      v.loop = true;
      v.muted = true;
      v.autoplay = true;
      v.playsInline = true;
      stage.append(v);
    } else if (media === "audio") {
      const a = el("audio");
      a.src = url;
      a.controls = true;
      a.preload = "metadata";
      stage.append(el("div", "lego-out-audio-name", f.filename), a);
    } else {
      const img = el("img");
      img.src = url;
      img.alt = f.filename;
      img.draggable = false;
      img.addEventListener("click", () => { if (!state.edit) window.open(url, "_blank"); });
      stage.append(img);
    }
  };

  const update = () => {
    const res = latestOutputFor(host, ctrl, media);
    const nextSig = res ? `${res.key}#${res.seq}` : "";
    if (nextSig === sig) return;   // nada novo: não recarrega a mídia
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
  if (isOutputKind(k)) return { minW: 120, minH: k === "outaudio" ? 64 : 96 };
  if (k === "hdivider") return { minW: 16, minH: 16 };
  if (k === "vdivider") return { minW: 16, minH: 16 };
  if (k === "label") return { minW: 32, minH: 16 };
  if (k === "media" || k === "video" || k === "audio") return { minW: 140, minH: 64 };
  if (k === "textarea") return { minW: 80, minH: 48 };
  if (k === "slider") return { minW: 72, minH: 28 };
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
  const is2D = itemDef.kind === "textarea" || itemDef.kind === "media" || itemDef.kind === "video" || itemDef.kind === "audio";
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

/**
 * Builds a Custom Segment component (containing multiple inline sub-controls).
 */
/* ══════════════════════════════════════════════════════════════════════════
   Arraste entre grupos e zonas

   Os elementos do DOM carregam o dado que representam: `box.__legoSeg` é o
   grupo (horizontal/vertical) e `ctrlsBox.__legoList` é a lista de controles
   da zona. Assim o alvo do arraste sai direto do ponto sob o cursor, sem
   procurar no layout.
   ══════════════════════════════════════════════════════════════════════════ */

const isContainerKind = (k) => k === "segment" || k === "vsegment" || k === "group";
const is2DKind = (k) => k === "textarea" || k === "media" || k === "video" || k === "audio" || isOutputKind(k);

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
  if (!is2DKind(it.kind)) delete it.h;
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
    const hit = (!isCosmeticItem && !isContainerItem && !isOutputItem && item.bind) ? resolveBind(host, item.bind) : null;
    const isBound = !!hit;
    const isUnbound = !isCosmeticItem && !isContainerItem && !isOutputItem && !isBound;
    const isSelected = !!state?.edit && ((state?.selectedName && state.selectedName === item.name) || (state?.selectedNames && state.selectedNames.has(item.name)));

    const itemWrap = el(
      "div",
      `lego-segment-item kind-${item.kind}${state?.edit ? " editable" : ""}${isSelected ? " selected" : ""}${isBound ? " is-bound" : ""}${isUnbound ? " is-unbound" : ""}${isDividerItem ? " is-divider" : ""}${isLabelItem ? " is-label" : ""}`
    );
    itemWrap.dataset.itemName = item.name;
    itemWrap.dataset.name = item.name;

    // Mesma regra dos componentes soltos: dentro do grupo o item também nasce
    // na menor largura, e só cresce se alguém pedir.
    const { minW: itemMinW, minH: itemMinH } = getComponentMinDimensions(item);
    if (typeof item.w === "number") {
      itemWrap.style.flex = "none";
      itemWrap.style.width = `${Math.max(itemMinW, item.w)}px`;
      itemWrap.classList.add("has-custom-w");
    }
    const isMediaItem = item.kind === "media" || item.kind === "video" || item.kind === "audio";
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
        if (e.target.closest(".lego-item-actions, .lego-resizer-corner")) return;
        e.stopPropagation();
        e.preventDefault();
        startGroupItemDrag(e, { host, state, item, fromList: ctrl.items, itemEl: itemWrap });
      });
      itemWrap.ondragstart = (e) => e.preventDefault();

      itemWrap.addEventListener("click", (e) => {
        if (e.target.closest(".lego-item-del-btn") || e.target.closest(".lego-item-link-btn") || e.target.closest(".lego-resizer-corner")) return;
        e.stopPropagation();
        const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
        selectComponent(host, state, item, ctrl.items, false, isMulti);
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

        document.querySelectorAll(".lego-segment-item.selected").forEach((el) => el.classList.remove("selected"));
        document.querySelectorAll(".lego-row.selected").forEach((el) => el.classList.remove("selected"));
        itemWrap.classList.add("selected");
        selectComponent(host, state, item, ctrl.items, false);

        const startClientX = e.clientX;
        const startClientY = e.clientY;
        const origW = itemWrap.offsetWidth;
        const origH = itemWrap.offsetHeight;
        const curScale = app?.canvas?.ds?.scale || 1;

        let finalW = origW;
        let finalH = origH;
        const minW = itemMinW;
        const minH = itemMinH;

        const onMove = (ev) => {
          ev.stopPropagation();
          const deltaX = (ev.clientX - startClientX) / curScale;
          const deltaY = (ev.clientY - startClientY) / curScale;

          finalW = Math.max(minW, Math.round((origW + deltaX) / 16) * 16);
          itemWrap.style.flex = "none";
          itemWrap.style.width = `${finalW}px`;
          itemWrap.classList.add("has-custom-w");

          if (isVertical || item.kind === "textarea" || item.kind === "media" || item.kind === "video" || item.kind === "audio" || item.kind === "vdivider") {
            finalH = Math.max(minH, Math.round((origH + deltaY) / 16) * 16);
            itemWrap.style.height = `${finalH}px`;
            itemWrap.classList.add("has-custom-h");
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

          item.w = finalW;
          if (isVertical || item.kind === "textarea" || item.kind === "media" || item.kind === "video" || item.kind === "audio" || item.kind === "vdivider") {
            item.h = finalH;
          }
          if (finalW !== origW || finalH !== origH) {
            pushUndoSnapshot(host, undoSnapshot);
          }
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
      textSpan.style.cssText = "font-size:12px; font-weight:600; color:var(--lego-fg, #e2e8f0); user-select:none;";
      if (state?.edit) {
        textSpan.title = "Click to edit text";
        itemWrap.addEventListener("click", (e) => {
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
        } else if (isVertical && item.kind !== "combo" && item.kind !== "slider" && item.kind !== "textarea") {
          itemWrap.append(el("span", "lego-item-label", item.label || prettify(w.name)));
        }
      }

      if (item.kind === "toggle") {
        itemWrap.append(mkToggle(node, w, item, state));
      } else if (item.kind === "combo") {
        const combo = mkCombo(node, w, item, state);
        combo.style.flex = "1";
        combo.style.minWidth = "80px";
        itemWrap.append(combo);
      } else if (item.kind === "number") {
        itemWrap.append(mkStepNumber(node, w, item, state));
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

/** Tipos de controle que o componente escolhe e que o desenho respeita. */
const CONTROL_KINDS = new Set(["toggle", "slider", "number", "combo", "text", "textarea", "button", "media", "video", "audio"]);
function controlKindFor(ctrl, w) {
  return CONTROL_KINDS.has(ctrl?.kind) ? ctrl.kind : null;
}

/** Constrói o controle nu de um bind, sem a linha ao redor. Null se sumiu. */
function buildBare(host, ctrl, state) {
  const hit = resolveBind(host, ctrl.bind);
  if (!hit) return null;
  const { node, widget: w } = hit;
  const kind = (ctrl.kind === "video" || ctrl.kind === "audio" || ctrl.kind === "media")
    ? ctrl.kind
    : (isVideoCombo(w) ? "video" : isAudioCombo(w) ? "audio" : isImageCombo(w) ? "media" : describeWidget(w).kind);
  if (kind === "toggle") return mkToggle(node, w, ctrl, state);
  if (kind === "slider") return mkSlider(node, w, ctrl, state);
  if (kind === "number") return mkNumber(node, w, ctrl, state);
  if (kind === "combo") return mkCombo(node, w, ctrl, state);
  if (kind === "media" || kind === "video" || kind === "audio") return mkMediaControl(node, w, ctrl, state, null, kind);
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
function ghostControl(kind, ctrl) {
  const box = el("div", "lego-ghost");
  if (kind === "hdivider") {
    box.append(el("div", "lego-divider h"));
  } else if (kind === "vdivider") {
    box.append(el("div", "lego-divider v"));
  } else if (kind === "label") {
    box.append(el("div", "lego-canvas-label", ctrl?.text || ctrl?.label || "Label"));
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
  } else if (kind === "media" || kind === "video" || kind === "audio") {
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
      const barHeights = [25, 45, 80, 60, 95, 40, 70, 85, 30, 65, 90, 50, 75, 100, 55, 35, 70, 45, 80, 30];
      barHeights.forEach((h) => {
        const b = el("div", "lego-audio-vbar");
        b.style.height = `${Math.round(h * 0.22)}px`;
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
  const hit = (isGroup || isCosmetic || isOutput) ? null : resolveBind(host, ctrl.bind);
  const isMediaLike = (k) => k === "media" || k === "video" || k === "audio";
  const isHitMedia = isImageCombo(hit?.widget) || isVideoCombo(hit?.widget) || isAudioCombo(hit?.widget);
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
    if (ctrl.header && ctrl.labelPos !== "none") {
      row.classList.add("has-header");
      const head = el("div", "lego-seg-header", ctrl.header);
      if (ctrl.labelPos === "right") head.style.textAlign = "right";
      if (state.edit) {
        head.title = "Double-click to rename";
        head.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          const v = prompt("Group header:", ctrl.header);
          if (v != null) {
            pushUndo(host);
            if (v.trim()) ctrl.header = v.trim(); else delete ctrl.header;
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
  } else if (isGroup) {
    row = buildGroup(host, ctrl, state, sectionCtrls);
  } else {
    row = el("div", `lego-row${wide ? " wide" : ""}${isMedia ? " is-media" : ""}`);
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
    : (ctrl.kind === "hdivider" ? 16 : (ctrl.kind === "vdivider" ? 160 : (ctrl.kind === "vsegment" ? 160 : (ctrl.kind === "label" ? 32 : (hasMediaItem ? 144 : (ctrl.kind === "textarea" ? 96 : 46))))));

  ctrl.x = Math.max(0, Math.round(curX / GRID) * GRID);
  ctrl.y = Math.max(0, Math.round(curY / GRID) * GRID);
  ctrl.w = Math.max(ctrlMinW, Math.round(curW / GRID) * GRID);
  ctrl.h = Math.max(ctrlMinH, Math.round(curH / GRID) * GRID);

  ensureComponentName(host.properties[PROP], ctrl);
  row.dataset.name = ctrl.name;
  if (!state.selectedNames) state.selectedNames = new Set();
  if (state.edit && ((state.selectedName && state.selectedName === ctrl.name) || state.selectedNames.has(ctrl.name))) {
    row.classList.add("selected");
    state.selectedNames.add(ctrl.name);
  }

  if (ctrl.color) {
    row.classList.add("tinted");
    row.style.setProperty("--lego-c", ctrl.color);
  }

  row.style.position = "absolute";
  row.style.left = `${ctrl.x}px`;
  row.style.top = `${ctrl.y}px`;
  row.style.width = `${ctrl.w}px`;
  row.style.height = `${ctrl.h}px`;

  let applySliderResponsiveLayout = null;

  if (!isGroup && !isDivider && !isLabel && !isOutput) {

  if (!hit) {
    if (ctrl.bind === "" || !ctrl.bind) {
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
  if (kind === "media" || kind === "video" || kind === "audio") {
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
  else if (kind === "button") control = mkButton(node, w, ctrl);
  else control = mkText(node, w, ctrl, state, false);

  // ── Estrutura Visual 100% IDENTICA em Modo Fixo e Modo Edição ──
  const lbl = el("div", "lego-lbl", ctrl.label || prettify(w.name));
  lbl.title = node === host ? w.name : `${node.title || node.type} #${node.id} → ${w.name}`;
  if (state.edit) {
    lbl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const v = prompt("Label:", ctrl.label || w.name);
      if (v != null) { ctrl.label = v; state.refresh(); }
    });
  }

  // Posição do rótulo: à esquerda (padrão), à direita, ou escondido. Escondido
  // é só não desenhar — o nome continua no `title` e no Inspetor de Objetos.
  const labelPos = ctrl.labelPos || "left";

  applySliderResponsiveLayout = (targetW, targetH) => {
    if (!isSlider || !control || !control.track || !control.num) return;
    const effW = targetW ?? ctrl.w;
    const effH = targetH ?? ctrl.h;
    const shouldStack = effH >= 50 || (effW < 210 && labelPos !== "none");

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

      control.replaceChildren(control.track, control.num);
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
  } else if (labelPos === "none") {
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
      // O seletor de parâmetros liga a widgets; output se configura no Inspetor.
      if (isOutput) selectComponent(host, state, ctrl, sectionCtrls, true);
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

      // Cor do grupo.
      const colorBtn = el("button", "lego-iconbtn btn-color lego-color-dot-btn");
      colorBtn.type = "button";
      colorBtn.title = "Group color";
      const dot = el("span", `lego-color-dot${ctrl.color ? "" : " none"}`);
      if (ctrl.color) dot.style.background = ctrl.color;
      colorBtn.append(dot);
      colorBtn.addEventListener("pointerdown", eatPointer);
      colorBtn.addEventListener("click", (e) => {
        openColorMenu(e, ctrl.color, (color) => {
          pushUndo(host);
          if (color) ctrl.color = color; else delete ctrl.color;
          state.refresh();
        });
      });
      floatingActions.append(colorBtn);
    }

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
        e.target.closest(".lego-floating-actions") ||
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
      const undoSnapshot = JSON.stringify(host.properties[PROP] || {});
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const curScale = app?.canvas?.ds?.scale || 1;
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
      const canEnterGroup = movingItems.length === 1 && !isContainerKind(ctrl.kind);
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
      const curScale = app?.canvas?.ds?.scale || 1;

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

        if (bestTargetValX !== null) {
          finalW = Math.max(ctrlMinW, Math.round(bestTargetValX - ctrlX));
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

/** Componente solto para um único parâmetro de um nó. */
function singleCtrlFor(host, node, w) {
  const kind = detectMediaKind(w, describeWidget(w), node);
  const media = kind === "media" || kind === "video" || kind === "audio";
  const c = {
    kind,
    bind: node === host ? w.name : `${node.id}/${w.name}`,
    label: widgetLabel(w),
    w: media ? 288 : kind === "textarea" ? 320 : 256,
    h: media ? 144 : kind === "textarea" ? 96 : 48,
  };
  if (RE_SEED.test(w.name)) c.seed = true;
  return c;
}

/** Itens (label + controle) que representam os widgets do nó (todos, ou só `onlyNames`). */
function wholeNodeItems(host, node, onlyNames) {
  const items = [];
  const mp = mediaNodeParts(node);
  for (const w of (node.widgets || []).filter(usable)) {
    if (onlyNames && !onlyNames.has(w.name)) continue;
    if (mp && !onlyNames && w !== mp.media && !mp.rest.includes(w)) continue;   // ajudantes do nó de mídia
    if (mp && w === mp.media) {
      // A mídia se identifica pelo arquivo: entra sem Label na frente.
      items.push({ kind: detectMediaKind(w, describeWidget(w), node), bind: node === host ? w.name : `${node.id}/${w.name}`, label: widgetLabel(w), labelPos: "none", h: 120 });
      continue;
    }
    let kind = detectMediaKind(w, describeWidget(w), node);
    // Número vira Stepper: é o controle compacto que cabe numa linha de grupo.
    if (kind === "slider") kind = "number";
    // O nome que o usuário deu ao parâmetro (widget renomeado/promovido)
    // vale mais que o nome técnico.
    const text = widgetLabel(w);
    const control = { kind, bind: node === host ? w.name : `${node.id}/${w.name}`, label: text, labelPos: "none" };
    if (is2DKind(kind)) control.h = kind === "textarea" ? 80 : 120;
    // O botão já escreve o próprio nome; os demais ganham um Label na frente.
    if (kind !== "button") items.push({ kind: "label", text, label: text });
    items.push(control);
  }
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
    return k === "media" || k === "video" || k === "audio";
  });
  if (!media) return null;
  const rest = ws.filter((w) => w !== media && w.type !== "button" && w.options?.serialize !== false);
  return { media, rest };
}

function buildWholeNodeCtrl(host, node, orientation, pos) {
  const layout = host.properties[PROP];
  // Mídia sem outro parâmetro: só o componente de mídia, sem grupo.
  const mp = mediaNodeParts(node);
  if (mp && !mp.rest.length) {
    const c = { ...singleCtrlFor(host, node, mp.media), x: pos?.x ?? 16, y: pos?.y ?? 16 };
    const avail = Math.max(320, Math.round(Math.max(MIN_W, host.size?.[0] || 0) - 80));
    c.x = Math.max(16, Math.min(c.x, avail - c.w));
    return renameClone(layout, c);
  }
  const items = wholeNodeItems(host, node);
  const vertical = orientation === "column";
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
      for (const it of ctrlsRow) it.w = FIXED[it.kind] || each;
      w = Math.max(320, snap(used + each * flex.length));
    } else {
      // Não cabe em linha nesta zona: tudo flexível, dentro da largura dela.
      for (const it of ctrlsRow) delete it.w;
      w = avail;
    }
  }
  const group = {
    kind: vertical ? "vsegment" : "segment",
    label: node.title || node.type || `Node #${node.id}`,
    header: node.title || node.type || `Node #${node.id}`,
    // Nasce dentro da largura da zona, mesmo se o clique foi perto da borda.
    x: Math.max(16, Math.min(pos?.x ?? 16, avail - w)),
    y: pos?.y ?? 16,
    w,
    // +16 para o cabeçalho com o nome do nó.
    h: 16 + (vertical
      ? snap(items.reduce((a, it) => a + (it.kind === "label" ? 20 : (it.h || 36)) + 8, 16))
      : (has2D ? 160 : 48)),
    items,
  };
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

/** Lista widgets ainda não usados no cartão — deste nó e dos demais do grafo. */
function unboundWidgets(host, layout) {
  const used = new Set();
  for (const t of layout.tabs || []) {
    for (const s of t.sections || []) {
      for (const c of s.controls || []) {
        if (c.bind) used.add(c.bind);
        if (c.items) {
          for (const it of c.items) if (it.bind) used.add(it.bind);
        }
      }
      if (Array.isArray(s.tabs)) {
        for (const st of s.tabs) {
          for (const c of st.controls || []) {
            if (c.bind) used.add(c.bind);
            if (c.items) {
              for (const it of c.items) if (it.bind) used.add(it.bind);
            }
          }
        }
      }
    }
  }
  const all = listBindableTargets(host);
  return all.filter((it) => !used.has(it.bind));
}

/** Converte largura (porcentagem granular ou px) para value CSS com gap flexbox exato. */
/** Funções de Grid Modular de 12 Colunas (Estilo Widgets iOS) */
function widthToSpan(w) {
  if (!w) return 12;
  if (typeof w === "number") return Math.max(1, Math.min(12, Math.round(w)));
  if (typeof w === "string") {
    if (w.includes("col")) {
      const n = parseInt(w);
      if (!isNaN(n)) return Math.max(1, Math.min(12, n));
    }
    if (w.endsWith("%")) {
      const pct = parseFloat(w);
      if (pct >= 95) return 12;
      if (pct <= 20) return 2;
      return Math.max(1, Math.min(12, Math.round((pct / 100) * 12)));
    }
  }
  return 12;
}

function spanToPercent(span) {
  if (span >= 12) return "100%";
  if (span === 6) return "50%";
  if (span === 4) return "33.3%";
  if (span === 3) return "25%";
  if (span === 8) return "66.7%";
  if (span === 9) return "75%";
  return `${Math.round((span / 12) * 100)}%`;
}

function spanToBadgeLabel(span) {
  return `${span} col (${spanToPercent(span)})`;
}

function widthToCss(w) {
  if (!w || w === "100%") return "100%";
  if (typeof w === "string" && w.endsWith("%")) {
    const pct = parseFloat(w);
    if (pct >= 100) return "100%";
    const gapOffset = Math.max(1, Math.round(10 * (1 - pct / 100)));
    return `calc(${pct}% - ${gapOffset}px)`;
  }
  return w;
}

function ctrlWidthToCss(w) {
  if (!w || w === "100%") return "100%";
  if (typeof w === "string" && w.endsWith("%")) {
    const pct = parseFloat(w);
    if (pct >= 100) return "100%";
    const gapOffset = Math.max(1, Math.round(8 * (1 - pct / 100)));
    return `calc(${pct}% - ${gapOffset}px)`;
  }
  return w;
}

/** Snap granular de largura em passos de 5%, com snaps magnéticos em 33.3% e 66.7% */
function snapWidth(ratio, isShift) {
  const pct = Math.max(15, Math.min(100, ratio * 100));
  if (isShift) return `${Math.round(pct)}%`;
  if (Math.abs(pct - 33.3) < 2.5) return "33.3%";
  if (Math.abs(pct - 66.7) < 2.5) return "66.7%";
  const snapped = Math.round(pct / 5) * 5;
  return `${Math.max(15, Math.min(100, snapped))}%`;
}

/** Determina a direção de drop 4-Way (top, bottom, left, right) com base na posição do cursor. */
function getDropDirection(e, rect) {
  const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
  const relY = (e.clientY - rect.top) / Math.max(1, rect.height);

  // Bordas laterais (< 22% ou > 78%) indicam intenção de posicionar lado a lado
  if (relX > 0.78) return "right";
  if (relX < 0.22) return "left";

  // Área central (> 56% da largura) indica intenção vertical: coluna (cima ou baixo)
  if (relY < 0.5) return "top";
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

  // Abre o grafo de dentro no canvas: o grafo interno de um Super Subgraph
  // (setGraph direto) ou o subgrafo nativo.
  const ssGraph = ssInnerGraph(host);
  const savedView = canvas.ds ? { offset: [...canvas.ds.offset], scale: canvas.ds.scale } : null;
  if (ssGraph && canvas.graph !== ssGraph && typeof canvas.setGraph === "function") {
    canvas.setGraph(ssGraph);
    isInsideSubgraph = true;
    // Enquadra os nós de dentro: sem isso eles podiam cair sob as barras do
    // ComfyUI, onde o clique não chega ao canvas.
    fitCanvasTo(ssGraph);
    canvas.setDirty?.(true, true);
  } else if (host.subgraph) {
    if (typeof canvas.openSubgraph === "function") {
      canvas.openSubgraph(host.subgraph, host);
      isInsideSubgraph = true;
    } else if (typeof canvas.setGraph === "function") {
      canvas.setGraph(host.subgraph);
      isInsideSubgraph = true;
    }
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
    window.removeEventListener("keydown", onPickKey, true);
    cancelAnimationFrame(overlayRaf);
    overlay?.remove();

    // Retorna para o grafo principal se entrou no subgrafo
    if (isInsideSubgraph && ssGraph) {
      // Volta do grafo interno do Super Subgraph para onde estava, com a vista de antes.
      if (originGraph && typeof canvas.setGraph === "function") canvas.setGraph(originGraph);
      if (savedView && canvas.ds) { canvas.ds.offset = savedView.offset; canvas.ds.scale = savedView.scale; }
      canvas.setDirty?.(true, true);
    } else if (isInsideSubgraph) {
      if (typeof canvas.closeSubgraph === "function") {
        canvas.closeSubgraph();
      } else if (typeof canvas.openSubgraph === "function" && originGraph) {
        canvas.openSubgraph(originGraph);
      } else if (originGraph && typeof canvas.setGraph === "function") {
        canvas.setGraph(originGraph);
      }
      canvas.setDirty?.(true, true);
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
  if (multi) {
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

  /** Marca/desmarca: nó inteiro (título/área sem parâmetro) ou só o parâmetro. */
  const togglePick = (node, e) => {
    const key = String(node.id);
    const usableNames = (node.widgets || []).filter(usable).map((w) => w.name);
    let cx = 0, cy = 0;
    if (typeof canvas.convertEventToCanvasOffset === "function") [cx, cy] = canvas.convertEventToCanvasOffset(e);
    else {
      const r = canvas.canvas.getBoundingClientRect();
      cx = (e.clientX - r.left) / canvas.ds.scale - canvas.ds.offset[0];
      cy = (e.clientY - r.top) / canvas.ds.scale - canvas.ds.offset[1];
    }
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
          onSelect({
            bind: (hitNode === host) ? w.name : `${hitNode.id}/${w.name}`,
            label: `${nTitle} - ${prettify(w.name)}`,
            kind,
            min: w.options?.min,
            max: w.options?.max,
            step: w.options?.step,
            seed: desc.isSeed || w.name.toLowerCase().includes("seed"),
            node: hitNode,
            widget: w
          });
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
    if (multi) {
      // Só o que está no canvas (ou num nó dele): menus e painéis seguem livres.
      const onCanvas = e.target === canvas.canvas || !!e.target.closest?.(".dom-widget, [data-node-id], .lg-node");
      if (!onCanvas || e.button !== 0) return;
    }

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
  targetPickerBtn.addEventListener("click", runTargetPicker);

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
    sidePicker.addEventListener("click", runTargetPicker);
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
          const isMed = t.kind === "media" || t.kind === "video" || t.kind === "audio";
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
        const isMed = t.kind === "media" || t.kind === "video" || t.kind === "audio";
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
            <span style="font-size:14px; font-weight:600; color:var(--lego-fg, #e2e8f0); letter-spacing:0.02em;">Sample Section Label</span>
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
      const x0 = initialPos?.x ?? 16;
      let y = initialPos?.y ?? 16;
      const place = (c) => {
        const spot = findFreeSpot(zoneList, c.x, c.y, c.w, c.h);
        c.x = spot.x;
        c.y = spot.y;
        zoneList.push(c);
        ensureComponentName(layout, c);
        created.push(c.name);
        y = spot.y + c.h + 16;
      };
      for (const p of list) {
        if (p.whole) {
          place(buildWholeNodeCtrl(host, p.node, "row", { x: x0, y }));
          continue;
        }
        for (const w of (p.node.widgets || []).filter((x) => p.widgets.has(x.name))) {
          place({ ...singleCtrlFor(host, p.node, w), x: x0, y });
        }
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
        h: selectedTarget.defaultH || 44,
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
    const isTargetMedia = (selectedTarget.kind === "media" || selectedTarget.kind === "video" || selectedTarget.kind === "audio");

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

/* ── Cores por zona e por componente ─────────────────────────────────────── */
const LEGO_COLORS = [
  ["Purple", "#a855f7"], ["Blue", "#3b82f6"], ["Cyan", "#06b6d4"], ["Green", "#22c55e"],
  ["Yellow", "#eab308"], ["Orange", "#f97316"], ["Red", "#ef4444"], ["Pink", "#ec4899"],
];

/** Paleta solta: `onPick(cor)` com a cor ou `null` (sem cor). */
function openColorMenu(e, current, onPick) {
  e.preventDefault();
  e.stopPropagation();
  document.querySelector(".lego-ctx-menu")?.remove();
  const menu = el("div", "lego-ctx-menu lego-color-menu");
  const close = () => {
    menu.remove();
    document.removeEventListener("pointerdown", close);
  };
  const grid = el("div", "lego-color-grid");
  const swatch = (name, color) => {
    const b = el("button", `lego-color-swatch${(current || null) === color ? " on" : ""}${color ? "" : " none"}`);
    b.type = "button";
    b.title = name;
    if (color) b.style.background = color;
    b.addEventListener("click", (ev) => { ev.stopPropagation(); close(); onPick(color); });
    return b;
  };
  grid.append(swatch("No color", null), ...LEGO_COLORS.map(([n, c]) => swatch(n, c)));
  menu.append(grid);
  menu.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  document.body.append(menu);
  menu.style.left = `${Math.max(4, Math.min(window.innerWidth - 190, e.clientX))}px`;
  menu.style.top = `${Math.max(4, Math.min(window.innerHeight - 90, e.clientY))}px`;
  setTimeout(() => document.addEventListener("pointerdown", close), 10);
  return menu;
}

/** Nomes selecionados (ou só o componente clicado, se ele não está na seleção). */
function selectionFor(state, ctrl) {
  const names = new Set(state.selectedNames || []);
  if (ctrl && !names.has(ctrl.name)) return new Set([ctrl.name]);
  if (!names.size && state.selectedName) names.add(state.selectedName);
  return names;
}

/**
 * Agrupa (Ctrl+G) os componentes soltos selecionados da zona ativa num grupo
 * horizontal (ou vertical), no lugar do primeiro, na ordem visual.
 */
function groupSelectedComponents(host, state, vertical = false, list = null) {
  const layout = host.properties[PROP];
  list = list || visibleControlsOf(activeSectionOf(layout, state));
  if (!list) return false;
  const names = selectionFor(state, null);
  const picked = list.filter((c) => names.has(c.name) && !isGroupKind(c.kind));
  if (!picked.length) { showLegoToast("Select components (not groups) to group"); return false; }
  pushUndo(host);
  picked.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const x0 = Math.min(...picked.map((c) => c.x || 0));
  const y0 = Math.min(...picked.map((c) => c.y || 0));
  const right = Math.max(...picked.map((c) => (c.x || 0) + (c.w || 160)));
  const at = Math.min(...picked.map((c) => list.indexOf(c)));
  const items = picked.map(zoneCtrlToItem);
  const bodyH = (it) => (is2DKind(it.kind) ? (it.h || 144) : 48);
  const group = vertical
    ? { kind: "vsegment", x: x0, y: y0, w: Math.max(240, ...picked.map((c) => c.w || 0)), h: items.reduce((a, it) => a + bodyH(it) + 8, 16) }
    : { kind: "segment", x: x0, y: y0, w: Math.max(right - x0, 160 * items.length), h: Math.max(64, ...items.map((it) => bodyH(it) + 16)) };
  group.w = Math.round(group.w / GRID) * GRID;
  group.h = Math.round(group.h / GRID) * GRID;
  group.items = items;
  for (const c of picked) list.splice(list.indexOf(c), 1);
  list.splice(Math.min(at, list.length), 0, group);
  ensureComponentName(layout, group);
  state.selectedNames = new Set([group.name]);
  state.selectedName = group.name;
  state.refresh();
  showLegoToast(`Grouped ${items.length} item${items.length > 1 ? "s" : ""}`);
  return true;
}

/** Desfaz o grupo: os itens voltam soltos para a zona, lado a lado (ou empilhados). */
function ungroupComponent(host, state, group, list) {
  const i = list.indexOf(group);
  if (i < 0 || !isGroupKind(group.kind)) return false;
  pushUndo(host);
  const vertical = group.kind === "vsegment";
  let x = group.x || 16, y = group.y || 16;
  const out = (group.items || []).map((it) => {
    const c = itemToZoneCtrl(it, x, y, 0, 0);
    if (vertical) y = c.y + c.h + 16; else x = c.x + c.w + 16;
    return c;
  });
  list.splice(i, 1, ...out);
  const layout = host.properties[PROP];
  for (const c of out) ensureComponentName(layout, c);
  state.selectedNames = new Set(out.map((c) => c.name));
  state.selectedName = out[out.length - 1]?.name || null;
  state.refresh();
  return true;
}

/**
 * Vira o grupo (horizontal <-> vertical). O grupo recomeça pequeno e o ajuste
 * automático (fitGroupToContent) o faz crescer até o que os itens pedem —
 * lado a lado vira empilhado e vice-versa, sem sobra.
 */
function toggleGroupOrientation(host, state, ctrl) {
  if (ctrl.kind !== "segment" && ctrl.kind !== "vsegment") return false;
  const toVertical = ctrl.kind === "segment";
  pushUndo(host);
  ctrl.kind = toVertical ? "vsegment" : "segment";
  ctrl.w = toVertical ? 240 : 160;
  ctrl.h = 64;
  delete ctrl.width;
  delete ctrl.height;
  state.refresh();
  // O crescimento do ajuste entra no mesmo passo de Undo desta virada.
  return true;
}

/**
 * Grupo que ficou pequeno para os itens (o conteúdo vaza da caixa) cresce até
 * caber. Só cresce; diminuir é com o usuário. Não conta como passo de Undo.
 */
function fitGroupToContent(host, ctrl, row, onChange) {
  const box = row?.querySelector(".lego-segment-box");
  if (!box || !box.isConnected) return false;
  const overW = box.scrollWidth - box.clientWidth;
  const overH = box.scrollHeight - box.clientHeight;
  if (overW <= 1 && overH <= 1) return false;
  const w0 = typeof ctrl.w === "number" ? ctrl.w : row.offsetWidth;
  const h0 = typeof ctrl.h === "number" ? ctrl.h : row.offsetHeight;
  if (overW > 1) ctrl.w = Math.ceil((w0 + overW + 4) / GRID) * GRID;
  if (overH > 1) ctrl.h = Math.ceil((h0 + overH + 4) / GRID) * GRID;
  row.style.width = `${ctrl.w}px`;
  row.style.height = `${ctrl.h}px`;
  // O ajuste não é uma edição do usuário: não vira entrada de Undo.
  host.__legoLastSnap = JSON.stringify(host.properties?.[PROP] || {});
  onChange?.();
  return true;
}

/** Tipos que o mesmo parâmetro aceita (para "Change type"). */
function compatibleKinds(host, ctrl) {
  const hit = resolveBind(host, ctrl.bind);
  const k = ctrl.kind;
  if (k === "slider" || k === "number") return ["slider", "number"];
  if (k === "text" || k === "textarea") return ["text", "textarea"];
  if (hit && (hit.widget.type === "number" || /INT|FLOAT/i.test(hit.widget.type || ""))) return ["slider", "number"];
  return [k];
}
const KIND_LABEL = { slider: "Slider", number: "Stepper", text: "Text", textarea: "Text Area" };

/** Botão direito num componente (modo de edição). */
function openComponentContextMenu(e, host, state, ctrl, list) {
  const names = selectionFor(state, ctrl);
  if (!names.has(ctrl.name) || !state.selectedNames?.has(ctrl.name)) selectComponent(host, state, ctrl, list, false, false);
  const many = names.size > 1;
  const looseSel = list.filter((c) => names.has(c.name) && !isGroupKind(c.kind));
  const entries = [
    { icon: "settings", label: "Properties", action: () => selectComponent(host, state, ctrl, list, true, false) },
    { icon: "copy", label: many ? `Duplicate (${names.size})` : "Duplicate", hint: "Ctrl+D", action: () => { state.selectedNames = new Set(names); if (copySelectedComponents(host, state)) pasteComponents(host, state); } },
    null,
    { icon: "hgroup", label: "Group", hint: "Ctrl+G", disabled: !looseSel.length, action: () => { state.selectedNames = new Set(names); groupSelectedComponents(host, state, false, list); } },
    { icon: "vgroup", label: "Group vertically", hint: "Ctrl+Shift+G", disabled: !looseSel.length, action: () => { state.selectedNames = new Set(names); groupSelectedComponents(host, state, true, list); } },
  ];
  if (isGroupKind(ctrl.kind) && !many) {
    if (ctrl.kind === "segment" || ctrl.kind === "vsegment") {
      const toV = ctrl.kind === "segment";
      entries.push({ icon: toV ? "vgroup" : "hgroup", label: toV ? "Make Vertical" : "Make Horizontal", action: () => toggleGroupOrientation(host, state, ctrl) });
    }
    entries.push({ icon: "grid", label: "Ungroup", action: () => ungroupComponent(host, state, ctrl, list) });
  }
  if (!many && ctrl.bind && !isGroupKind(ctrl.kind)) {
    const kinds = compatibleKinds(host, ctrl).filter((k) => k !== ctrl.kind);
    for (const k of kinds) entries.push({ icon: k === "number" ? "number" : k, label: `Change to ${KIND_LABEL[k] || k}`, action: () => { pushUndo(host); ctrl.kind = k; state.refresh(); } });
  }
  if (!many && !isGroupKind(ctrl.kind) && ctrl.kind !== "label" && ctrl.kind !== "hdivider" && ctrl.kind !== "vdivider" && !isOutputKind(ctrl.kind)) {
    entries.push({ icon: "link", label: ctrl.bind ? "Rebind…" : "Bind…", action: () => openInspector({
      host, layout: host.properties[PROP], section: { controls: list }, ctrl, state,
      forFilterKind: ctrl.kind === "text" ? "" : ctrl.kind,
      targetCallback: (target) => {
        if (!target || target.isRaw) return;
        ctrl.bind = target.bind;
        if (!ctrl.label || ctrl.label === ctrl.name) ctrl.label = target.label || target.name;
        ctrl.kind = target.kind || ctrl.kind;
        state.refresh();
      },
    }) });
  }
  entries.push({ icon: "blank", label: "Color…", action: () => openColorMenu(e, ctrl.color, (color) => {
    pushUndo(host);
    walkControls(host.properties[PROP], (c) => { if (names.has(c.name)) { if (color) c.color = color; else delete c.color; } });
    state.refresh();
  }) });
  entries.push(null, { icon: "trash", label: many ? `Remove (${names.size})` : "Remove", hint: "Del", danger: true, action: () => {
    pushUndo(host);
    removeControlsByName(host.properties[PROP], names);
    state.selectedNames?.clear();
    state.selectedName = null;
    state.refresh();
  } });
  return openLegoContextMenu(e, entries);
}

/** Diálogo modal para adicionar uma nova Zona (Seção). */
function openAddZoneModal({ host, curTab, state }) {
  document.querySelector(".lego-ins-backdrop")?.remove();

  const backdrop = el("div", "lego-ins-backdrop");
  backdrop.addEventListener("pointerdown", eatPointer);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  const modal = el("div", "lego-inspector");
  modal.style.maxWidth = "440px";
  modal.addEventListener("click", (e) => e.stopPropagation());

  const head = el("div", "lego-ins-header");
  head.append(el("div", "lego-ins-title", "NEW ZONE"), glyphBtn("lego-iconbtn", "close", 13));
  head.querySelector("button").addEventListener("click", () => backdrop.remove());
  modal.append(head);

  const body = el("div", "lego-ins-body");

  // Nome da Zona
  const fName = el("div", "lego-ins-field");
  fName.append(el("label", null, "New Zone Name:"));
  const inName = el("input", "lego-in");
  inName.value = `ZONE ${(curTab.sections || []).length + 1}`;
  inName.placeholder = "Ex: MODELS & CHECKPOINTS, SAMPLING, LORAS...";
  inName.addEventListener("keydown", (e) => e.stopPropagation());
  fName.append(inName);
  body.append(fName);

  // Largura inicial do Card
  const fWidth = el("div", "lego-ins-field");
  fWidth.append(el("label", null, "Initial Card Width:"));
  const selWidth = el("select", "lego-in");
  const widths = [
    { id: "100%", label: "100% — Full width" },
    { id: "50%", label: "50% — Half width (side by side)" },
    { id: "33%", label: "33% — One third (3 per row)" },
    { id: "25%", label: "25% — One quarter (4 per row)" },
    { id: "66%", label: "66% — Two thirds" },
    { id: "75%", label: "75% — Three quarters" },
  ];
  for (const w of widths) {
    const opt = el("option", null, w.label);
    opt.value = w.id;
    selWidth.append(opt);
  }
  fWidth.append(selWidth);
  body.append(fWidth);

  // Modo Especial (Opcional)
  const fSpecial = el("div", "lego-ins-field");
  fSpecial.append(el("label", null, "Special Layout (Optional):"));
  const selSpecial = el("select", "lego-in");
  const specials = [
    { id: "normal", label: "Standard (Flexible Card with Components)" },
    { id: "grid3", label: "Image Grid (3×3 Grid)" },
    { id: "tabs", label: "Panel with Internal Sub-Tabs" },
  ];
  for (const s of specials) {
    const opt = el("option", null, s.label);
    opt.value = s.id;
    selSpecial.append(opt);
  }
  fSpecial.append(selSpecial);
  body.append(fSpecial);

  modal.append(body);

  const foot = el("div", "lego-ins-footer");
  const btnCancel = el("button", "lego-btn", "Cancel");
  btnCancel.addEventListener("click", () => backdrop.remove());

  const btnCreate = glyphTextBtn("lego-btn lego-btn-primary", "plus", "Create zone", 14);
  btnCreate.addEventListener("click", () => {
    const name = inName.value.trim().toUpperCase() || "NEW ZONE";
    const chosenWidth = selWidth.value;
    const chosenSpecial = selSpecial.value;

    const newSec = {
      header: name,
      width: chosenWidth,
      controls: []
    };

    if (chosenSpecial === "grid3") {
      newSec.grid = 3;
    } else if (chosenSpecial === "tabs") {
      delete newSec.controls;
      newSec.activeTab = 0;
      newSec.tabs = [
        { name: "Tab 1", controls: [] },
        { name: "Tab 2", controls: [] }
      ];
    }

    if (!curTab.sections) curTab.sections = [];
    curTab.sections.push(newSec);

    backdrop.remove();
    state.refresh();
  });

  foot.append(btnCancel, btnCreate);
  modal.append(foot);

  backdrop.append(modal);
  document.body.append(backdrop);
  inName.focus();
}

/* ══════════════════════════════════════════════════════════════════════════
   FORM MODE (Delphi 7 style)

   The zone is the form. The palette arms a tool; clicking the form
   drops the component there, initially unbound. Clicking a component selects it
   and the Object Inspector — floating window, like in Delphi — displays its
   properties and events. "Assign function" means selecting the workflow parameter
   that the component controls.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * O componente nasce na MENOR dimensão permitida — a mesma que a alça de
 * redimensionamento aceita como piso. Assim, no instante em que solta, o
 * usuário já vê o tamanho real da peça e cresce dali, em vez de receber um
 * bloco largo que some com o espaço do formulário.
 */
const MIN_CTRL_W = 80;
const MIN_CTRL_H = 48;

const TOOLBOX_CATEGORIES = [
  {
    id: "inputs",
    label: "Inputs",
    tools: [
      { kind: "text",     icon: "text",     label: "Text Input",        prefix: "Input",    w: MIN_CTRL_W, h: MIN_CTRL_H },
      { kind: "textarea", icon: "textarea", label: "Text Multiline",    prefix: "Multiline",w: 96,         h: 80 },
      { kind: "slider",   icon: "slider",   label: "Slider",            prefix: "Slider",   w: MIN_CTRL_W, h: MIN_CTRL_H },
      { kind: "number",   icon: "number",   label: "Stepper",           prefix: "Stepper",  w: MIN_CTRL_W, h: MIN_CTRL_H },
      { kind: "toggle",   icon: "toggle",   label: "Switch",            prefix: "Switch",   w: MIN_CTRL_W, h: MIN_CTRL_H },
      { kind: "combo",    icon: "combo",    label: "Dropdown",          prefix: "Dropdown", w: MIN_CTRL_W, h: MIN_CTRL_H },
    ]
  },
  {
    id: "media",
    label: "Media",
    tools: [
      { kind: "media",    icon: "media",    label: "Image Upload",      prefix: "Image",    w: 160,        h: 120 },
      { kind: "video",    icon: "video",    label: "Video Upload",      prefix: "Video",    w: 160,        h: 120 },
      { kind: "audio",    icon: "audio",    label: "Audio Upload",      prefix: "Audio",    w: 160,        h: 120 },
    ]
  },
  {
    id: "output",
    label: "Output",
    tools: [
      { kind: "outimage", icon: "media",    label: "Image Output",      prefix: "ImageOut", w: 256,        h: 224 },
      { kind: "outvideo", icon: "video",    label: "Video Output",      prefix: "VideoOut", w: 256,        h: 224 },
      { kind: "outaudio", icon: "audio",    label: "Audio Output",      prefix: "AudioOut", w: 256,        h: 96 },
    ]
  },
  {
    id: "actions",
    label: "Actions",
    tools: [
      { kind: "button",   icon: "button",   label: "Button",            prefix: "Button",   w: MIN_CTRL_W, h: MIN_CTRL_H },
    ]
  },
  {
    id: "layout",
    label: "Layout",
    tools: [
      { kind: "label",    icon: "label",    label: "Label",             prefix: "Label",    w: 120,        h: 32 },
      { kind: "segment",  icon: "hgroup",   label: "Horizontal Group",  prefix: "HGroup",   w: 128,        h: MIN_CTRL_H },
      { kind: "vsegment", icon: "vgroup",   label: "Vertical Group",    prefix: "VGroup",   w: 160,        h: 128 },
      { kind: "hdivider", icon: "hdivider", label: "Horizontal Divider",prefix: "HDivider",w: 192,        h: 16 },
      { kind: "vdivider", icon: "vdivider", label: "Vertical Divider",  prefix: "VDivider",  w: 16,         h: 128 },
    ]
  }
];

const TOOLBOX = TOOLBOX_CATEGORIES.flatMap((c) => c.tools);

const toolByKind = (kind) => TOOLBOX.find((t) => t.kind === kind) || TOOLBOX[0];

/** Percorre todo o layout chamando fn(ctrl, listaQueOContém, zona, grupoPai). */
function walkControls(layout, fn) {
  for (const tab of layout?.tabs || []) {
    for (const sec of tab.sections || []) {
      for (const c of sec.controls || []) {
        fn(c, sec.controls, sec);
        if (Array.isArray(c.items)) {
          for (const item of c.items) fn(item, c.items, sec, c);
        }
      }
      for (const sub of sec.tabs || []) {
        for (const c of sub.controls || []) {
          fn(c, sub.controls, sec);
          if (Array.isArray(c.items)) {
            for (const item of c.items) fn(item, c.items, sec, c);
          }
        }
      }
    }
  }
}

/* ── Alinhamento automático (estilo ComfyUI-Align) ────────────────────────
 * Vale para os componentes SOLTOS selecionados de uma mesma zona (itens de
 * grupo não têm x/y: quem os posiciona é o grupo). Com 2+ selecionados,
 * os botões aparecem no topo da zona, ao lado do título.
 */
const ALIGN_GAP = GRID;

/** Componentes soltos selecionados, agrupados pela lista (zona) onde moram. */
function selectedLooseByList(layout, state) {
  const byList = new Map();
  const names = state.selectedNames || new Set();
  walkControls(layout, (c, list, sec, parentGroup) => {
    if (parentGroup || !names.has(c.name)) return;
    if (!byList.has(list)) byList.set(list, []);
    byList.get(list).push(c);
  });
  return byList;
}

const axX = (c) => (typeof c.x === "number" ? c.x : 0);
const axY = (c) => (typeof c.y === "number" ? c.y : 0);
const axW = (c) => (typeof c.w === "number" ? c.w : 256);
const axH = (c) => (typeof c.h === "number" ? c.h : 46);
const snapG = (v) => Math.max(0, Math.round(v / GRID) * GRID);

/** Aplica uma operação de alinhamento/arranjo/tamanho em `ctrls`. */
function alignControls(ctrls, op, ref = null) {
  if (ctrls.length < 2) return false;
  const minX = Math.min(...ctrls.map(axX)), minY = Math.min(...ctrls.map(axY));
  const maxR = Math.max(...ctrls.map((c) => axX(c) + axW(c))), maxB = Math.max(...ctrls.map((c) => axY(c) + axH(c)));
  const midX = (minX + maxR) / 2, midY = (minY + maxB) / 2;
  const key = ref && ctrls.includes(ref) ? ref : ctrls[ctrls.length - 1];
  const minDim = (c) => getComponentMinDimensions(c);
  switch (op) {
    case "left": ctrls.forEach((c) => { c.x = minX; }); break;
    case "right": ctrls.forEach((c) => { c.x = snapG(maxR - axW(c)); }); break;
    case "hcenter": ctrls.forEach((c) => { c.x = snapG(midX - axW(c) / 2); }); break;
    case "top": ctrls.forEach((c) => { c.y = minY; }); break;
    case "bottom": ctrls.forEach((c) => { c.y = snapG(maxB - axH(c)); }); break;
    case "vcenter": ctrls.forEach((c) => { c.y = snapG(midY - axH(c) / 2); }); break;
    case "row": {
      // Em linha: da esquerda para a direita, topos alinhados, espaço fixo.
      let x = minX;
      [...ctrls].sort((a, b) => axX(a) - axX(b) || axY(a) - axY(b)).forEach((c) => { c.x = x; c.y = minY; x = snapG(x + axW(c) + ALIGN_GAP); });
      break;
    }
    case "column": {
      // Em coluna: de cima para baixo, esquerdas alinhadas, espaço fixo.
      let y = minY;
      [...ctrls].sort((a, b) => axY(a) - axY(b) || axX(a) - axX(b)).forEach((c) => { c.y = y; c.x = minX; y = snapG(y + axH(c) + ALIGN_GAP); });
      break;
    }
    case "hdist": {
      if (ctrls.length < 3) return false;
      const list = [...ctrls].sort((a, b) => axX(a) - axX(b));
      const free = (maxR - minX) - list.reduce((a, c) => a + axW(c), 0);
      const gap = free / (list.length - 1);
      let x = minX;
      list.forEach((c) => { c.x = snapG(x); x += axW(c) + gap; });
      break;
    }
    case "vdist": {
      if (ctrls.length < 3) return false;
      const list = [...ctrls].sort((a, b) => axY(a) - axY(b));
      const free = (maxB - minY) - list.reduce((a, c) => a + axH(c), 0);
      const gap = free / (list.length - 1);
      let y = minY;
      list.forEach((c) => { c.y = snapG(y); y += axH(c) + gap; });
      break;
    }
    case "samew": ctrls.forEach((c) => { c.w = Math.max(minDim(c).minW, axW(key)); }); break;
    case "sameh": ctrls.forEach((c) => { c.h = Math.max(minDim(c).minH, axH(key)); }); break;
    case "samesize": ctrls.forEach((c) => { c.w = Math.max(minDim(c).minW, axW(key)); c.h = Math.max(minDim(c).minH, axH(key)); }); break;
    default: return false;
  }
  for (const c of ctrls) { delete c.width; delete c.height; }
  return true;
}

/** Alinha a seleção (zona a zona), com Undo. */
function alignSelected(host, state, op) {
  const layout = host.properties[PROP];
  const ref = findSelected(layout, state)?.ctrl || null;
  let did = false;
  for (const ctrls of selectedLooseByList(layout, state).values()) {
    if (ctrls.length < 2) continue;
    if (!did) pushUndo(host);
    did = alignControls(ctrls, op, ref) || did;
  }
  if (did) state.refresh();
  return did;
}

const ALIGN_OPS = [
  ["left", "Align left"], ["hcenter", "Align horizontal centers"], ["right", "Align right"],
  ["top", "Align top"], ["vcenter", "Align vertical centers"], ["bottom", "Align bottom"],
  null,
  ["row", "Arrange in a row (left to right)"], ["column", "Arrange in a column (top to bottom)"],
  ["hdist", "Distribute horizontally (3+)"], ["vdist", "Distribute vertically (3+)"],
  null,
  ["samew", "Same width (as the last selected)"], ["sameh", "Same height (as the last selected)"], ["samesize", "Same size (as the last selected)"],
];

/** Ícone (SVG 16x16) de cada operação. */
function alignIcon(op) {
  const R = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="currentColor"/>`;
  const L = (x1, y1, x2, y2) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`;
  const body = {
    left: L(2, 1, 2, 15) + R(4, 3, 9, 4) + R(4, 9, 6, 4),
    hcenter: L(8, 1, 8, 15) + R(3, 3, 10, 4) + R(5, 9, 6, 4),
    right: L(14, 1, 14, 15) + R(3, 3, 9, 4) + R(6, 9, 6, 4),
    top: L(1, 2, 15, 2) + R(3, 4, 4, 9) + R(9, 4, 4, 6),
    vcenter: L(1, 8, 15, 8) + R(3, 3, 4, 10) + R(9, 5, 4, 6),
    bottom: L(1, 14, 15, 14) + R(3, 3, 4, 9) + R(9, 6, 4, 6),
    row: R(1, 5, 4, 6) + R(6, 5, 4, 6) + R(11, 5, 4, 6),
    column: R(5, 1, 6, 4) + R(5, 6, 6, 4) + R(5, 11, 6, 4),
    hdist: L(1, 2, 1, 14) + L(15, 2, 15, 14) + R(3, 4, 3, 8) + R(10, 4, 3, 8),
    vdist: L(2, 1, 14, 1) + L(2, 15, 14, 15) + R(4, 3, 8, 3) + R(4, 10, 8, 3),
    samew: L(2, 2, 14, 2) + R(2, 5, 12, 3) + R(2, 10, 12, 3),
    sameh: L(2, 2, 2, 14) + R(5, 2, 3, 12) + R(10, 2, 3, 12),
    samesize: R(2, 2, 5, 5) + R(9, 2, 5, 5) + R(2, 9, 5, 5) + R(9, 9, 5, 5),
  }[op] || "";
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">${body}</svg>`;
}

/** Barra flutuante sobre a seleção de cada zona com 2+ componentes soltos selecionados. */
function renderAlignBars(host, state) {
  const card = host?.__legoHost;
  if (!card) return;
  card.querySelectorAll(".lego-align-bar").forEach((b) => b.remove());
  if (!state.edit || (state.selectedNames?.size || 0) < 2) return;
  const byList = selectedLooseByList(host.properties[PROP], state);
  for (const box of card.querySelectorAll(".lego-sec-controls")) {
    const ctrls = byList.get(box.__legoList);
    if (!ctrls || ctrls.length < 2) continue;
    const bar = el("div", "lego-align-bar");
    bar.addEventListener("pointerdown", (e) => e.stopPropagation());
    bar.addEventListener("dblclick", (e) => e.stopPropagation());
    for (const it of ALIGN_OPS) {
      if (!it) { bar.append(el("span", "lego-align-sep")); continue; }
      const [op, title] = it;
      const b = el("button", "lego-align-btn");
      b.type = "button";
      b.dataset.op = op;
      b.title = title;
      b.innerHTML = alignIcon(op);
      if ((op === "hdist" || op === "vdist") && ctrls.length < 3) b.disabled = true;
      b.addEventListener("click", (e) => { e.stopPropagation(); alignSelected(host, state, op); });
      bar.append(b);
    }
    // No topo da zona, ao lado do título (antes das ações da zona).
    const head = box.closest(".lego-sec")?.querySelector(":scope > .lego-sec-h");
    if (!head) continue;
    const actions = head.querySelector(":scope > .lego-sec-actions");
    if (actions) head.insertBefore(bar, actions); else head.append(bar);
  }
}

/**
 * Remove do layout todo componente cujo nome esteja em `names`.
 * Coleta antes e remove depois: dar `splice` dentro do `walkControls` pulava o
 * vizinho seguinte, e de dois itens adjacentes selecionados um sobrevivia.
 * Devolve quantos removeu.
 */
function removeControlsByName(layout, names) {
  const hits = [];
  walkControls(layout, (c, list) => { if (names.has(c.name)) hits.push({ c, list }); });
  let removed = 0;
  for (const { c, list } of hits) {
    const idx = list.indexOf(c);
    if (idx >= 0) { list.splice(idx, 1); removed++; }
  }
  return removed;
}

/** Nome único no formulário — Slider1, Slider2, como o Delphi batiza. */
function uniqueComponentName(layout, prefix, reserved) {
  const taken = new Set(reserved || []);
  walkControls(layout, (c) => { if (c.name) taken.add(c.name); });
  let i = 1;
  while (taken.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

/**
 * Rebatiza um clone (e os itens dele) com nomes livres. O clone ainda não está
 * no layout, então os nomes já dados ficam reservados — senão dois itens do
 * mesmo tipo dentro do grupo saíam com o mesmo nome.
 */
function renameClone(layout, clone, reserved = new Set()) {
  const oldName = clone.name;
  clone.name = uniqueComponentName(layout, toolByKind(clone.kind).prefix, reserved);
  reserved.add(clone.name);
  if (clone.label === oldName) clone.label = clone.name;
  if (Array.isArray(clone.items)) {
    for (const item of clone.items) {
      const oldItemName = item.name;
      item.name = uniqueComponentName(layout, toolByKind(item.kind).prefix, reserved);
      reserved.add(item.name);
      if (item.label === oldItemName) item.label = item.name;
    }
  }
  return clone;
}

/** A aba que o cartão está mostrando agora. */
function activeTabOf(layout) {
  const tabs = layout?.tabs || [];
  return tabs[layout?.activeTab || 0] || tabs[0] || null;
}

/**
 * A lista de controles visível numa zona: a da sub-aba ativa, se houver
 * sub-abas, ou a da própria zona. Gravar em `sec.controls` de uma zona com
 * sub-abas punha o componente numa lista que nunca é desenhada.
 */
function visibleControlsOf(sec) {
  if (!sec) return null;
  if (Array.isArray(sec.tabs) && sec.tabs.length) {
    const idx = Math.min(Math.max(0, sec.activeTab || 0), sec.tabs.length - 1);
    const sub = sec.tabs[idx];
    return sub.controls || (sub.controls = []);
  }
  return sec.controls || (sec.controls = []);
}

/** A zona ativa da aba atual: a última clicada, se ainda existir nela, ou a primeira. */
function activeSectionOf(layout, state) {
  const tab = activeTabOf(layout);
  const sections = tab?.sections || [];
  if (state?.activeSection && sections.includes(state.activeSection)) return state.activeSection;
  return sections[0] || null;
}

/**
 * Empurra o componente em diagonal enquanto o lugar estiver ocupado — é o que
 * o Delphi faz quando você solta dois seguidos no mesmo ponto.
 */
function findFreeSpot(list, x, y, w, h) {
  const STEP = 16;
  const overlaps = (ax, ay) => (list || []).some((c) => {
    const cw = c.w || 256, ch = c.h || 46;
    return ax < (c.x || 0) + cw && ax + w > (c.x || 0)
        && ay < (c.y || 0) + ch && ay + h > (c.y || 0);
  });
  let px = x, py = y;
  for (let i = 0; i < 60 && overlaps(px, py); i++) {
    px += STEP;
    py += STEP;
  }
  return { x: px, y: py };
}

/** Cria o componente solto no formulário: sem bind, à espera de uma função. */
function makeComponent(layout, kind, x, y) {
  const t = toolByKind(kind);
  const name = uniqueComponentName(layout, t.prefix);
  const ctrl = {
    name,
    kind: t.kind,
    label: name,
    bind: "",
    x: Math.max(0, x | 0),
    y: Math.max(0, y | 0),
    w: t.w,
    h: t.h,
  };
  if (t.kind === "label") {
    ctrl.label = "Label";
    ctrl.text = "Label";
  } else if (t.kind === "text" || t.kind === "textarea") {
    ctrl.value = "";
  }
  if (t.kind === "segment" || t.kind === "vsegment") ctrl.items = [];
  // Output não tem rótulo por padrão: a própria mídia já se identifica.
  if (isOutputKind(t.kind)) ctrl.label = "";
  return ctrl;
}

/** Barra de ferramentas do formulário — clique arma, clique de novo desarma. */
function buildToolPalette(host, curTab, state) {
  const p = el("div", "lego-palette");

  const head = el("div", "lego-palette-head");
  head.append(el("span", null, "TOOLS"));
  const hint = el("span", "lego-palette-hint",
    state.armedTool
      ? `${state.armedTool.label} armed — click on form to place (Shift keeps armed, Esc cancels)`
      : "");
  if (state.armedTool) head.append(hint);
  p.append(head);

  const row = el("div", "lego-palette-items");
  for (const cat of TOOLBOX_CATEGORIES) {
    const grp = el("div", "lego-pal-group");
    const tag = el("span", "lego-pal-cat-tag", cat.label);
    grp.append(tag);
    for (const t of cat.tools) {
      const armed = state.armedTool?.kind === t.kind;
      const chip = el("div", `lego-pal-item${armed ? " armed" : ""}`);
      chip.draggable = true;
      chip.title = `${t.label} — click here then on form`;
      chip.append(glyphEl(t.icon, 15));
      chip.append(el("span", "lego-pal-label", t.label));

      chip.addEventListener("dragstart", (e) => {
        e.stopPropagation();
        state.draggingComponent = { kind: t.kind };
      });
      chip.addEventListener("dragend", () => { state.draggingComponent = null; });
      chip.addEventListener("pointerdown", eatPointer);
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        // Se houver um grupo selecionado no momento e a ferramenta for um componente interno:
        const layout = host.properties[PROP];
        const selected = findSelected(layout, state);
        if (selected?.ctrl && (selected.ctrl.kind === "vsegment" || selected.ctrl.kind === "segment") && t.kind !== "segment" && t.kind !== "vsegment") {
          addItemToSegment(host, state, selected.ctrl, t);
          return;
        }
        state.armedTool = armed ? null : t;
        state.refresh();
      });
      grp.append(chip);
    }
    row.append(grp);
  }

  const zoneGrp = el("div", "lego-pal-group");
  zoneGrp.append(el("span", "lego-pal-cat-tag", "Containers"));
  const zoneBtn = el("div", "lego-pal-item alt");
  zoneBtn.title = "Create another zone (another form) in this tab";
  zoneBtn.append(glyphEl("zone", 15));
  zoneBtn.append(el("span", "lego-pal-label", "Zone"));
  zoneBtn.addEventListener("pointerdown", eatPointer);
  zoneBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openAddZoneModal({ host, curTab, state });
  });
  zoneGrp.append(zoneBtn);
  row.append(zoneGrp);

  p.append(row);
  return p;
}

/**
 * Solta a ferramenta armada na zona, nas coordenadas do clique.
 * Devolve true se soltou alguma coisa.
 */
function dropArmedTool(host, state, section, x, y, keepArmed, forcedKind) {
  const tool = forcedKind ? toolByKind(forcedKind) : state.armedTool;
  if (!tool) return false;
  pushUndo(host);
  const layout = host.properties[PROP];
  const list = section.controls || (section.controls = []);
  const spot = findFreeSpot(list, x, y, tool.w, tool.h);
  const ctrl = makeComponent(layout, tool.kind, spot.x, spot.y);
  list.push(ctrl);
  if (!keepArmed) state.armedTool = null;
  // Seleção passa a ser SÓ o recém-solto; manter o conjunto anterior fazia o
  // Delete seguinte apagar também o que estava selecionado antes.
  state.selectedName = ctrl.name;
  state.selectedNames = new Set([ctrl.name]);
  state.refresh();
  return true;
}

/* ── Inspetor de Objetos ───────────────────────────────────────────────── */

let INSPECTOR = null;
let INSPECTOR_POS = null;
// O Inspetor só nasce no botão direito sobre o componente. Enquanto estiver
// aberto ele acompanha a seleção; fechado, o clique esquerdo apenas marca.

/**
 * Garante que o controle tenha nome — a identidade estável do componente.
 * `node.properties` volta da leitura embrulhado num proxy reativo, então
 * comparar objetos por `===` não funciona; o nome é o que sobrevive.
 */
function ensureComponentName(layout, ctrl) {
  if (!ctrl.name) ctrl.name = uniqueComponentName(layout, toolByKind(ctrl.kind).prefix);
  return ctrl.name;
}

/** Acha no layout o componente selecionado, com a lista que o contém. */
function findSelected(layout, state) {
  if (!state.selectedName && state.selectedNames && state.selectedNames.size > 0) {
    state.selectedName = Array.from(state.selectedNames)[0];
  }
  if (!state.selectedName) return null;
  let hit = null;
  walkControls(layout, (c, lst, sec, parentGroup) => {
    if (!hit && c.name === state.selectedName) hit = { ctrl: c, list: lst, parentGroup };
  });
  return hit;
}

function selectComponent(host, state, ctrl, list, openInspectorToo, multi = false) {
  const layout = host.properties[PROP];
  if (!state.selectedNames) state.selectedNames = new Set();

  if (!ctrl) {
    state.selectedNames.clear();
    state.selectedName = null;
    document.querySelectorAll(".lego-row.selected").forEach((r) => r.classList.remove("selected"));
    document.querySelectorAll(".lego-segment-item.selected").forEach((r) => r.classList.remove("selected"));
  } else {
    const name = ensureComponentName(layout, ctrl);
    if (multi) {
      if (state.selectedNames.has(name)) {
        state.selectedNames.delete(name);
      } else {
        state.selectedNames.add(name);
      }
      state.selectedName = state.selectedNames.has(name) ? name : (Array.from(state.selectedNames).pop() || null);
    } else {
      state.selectedNames.clear();
      state.selectedNames.add(name);
      state.selectedName = name;
    }

    // Atualiza marcação visual no DOM
    document.querySelectorAll(".lego-row").forEach((r) => {
      const rName = r.dataset.name;
      if (rName && state.selectedNames.has(rName)) {
        r.classList.add("selected");
      } else {
        r.classList.remove("selected");
      }
    });
    document.querySelectorAll(".lego-segment-item").forEach((it) => {
      const itName = it.dataset.name || it.dataset.itemName;
      if (itName && state.selectedNames.has(itName)) {
        it.classList.add("selected");
      } else {
        it.classList.remove("selected");
      }
    });
  }
  renderObjectInspector(host, state, !!openInspectorToo);
}

/**
 * Sai do modo de edição sem deixar rastro: ferramenta armada, seleção (a
 * principal E a múltipla) e o Inspetor. Limpar só `selectedName` deixava o
 * componente com o contorno azul de selecionado fora da edição.
 */
function leaveEditMode(state) {
  state.armedTool = null;
  state.selectedName = null;
  state.selectedNames?.clear();
  closeObjectInspector();
}

function closeObjectInspector() {
  INSPECTOR?.remove();
  INSPECTOR = null;
}

/** Linha do grid de propriedades: rótulo à esquerda, editor à direita. */
function propRow(label, editor) {
  const r = el("div", "lego-oi-row");
  r.append(el("div", "lego-oi-key", label));
  const v = el("div", "lego-oi-val");
  v.append(editor);
  r.append(v);
  return r;
}

function propText(value, onChange) {
  const i = el("input", "lego-oi-in");
  i.type = "text";
  i.value = value ?? "";
  i.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") i.blur();
  });
  i.addEventListener("change", () => onChange(i.value));
  return i;
}

function propNumber(value, onChange, step = 8) {
  const i = el("input", "lego-oi-in");
  i.type = "number";
  i.step = String(step);
  i.value = String(Math.round(value ?? 0));
  i.addEventListener("keydown", (e) => e.stopPropagation());
  i.addEventListener("change", () => onChange(Math.round(Number(i.value) || 0)));
  return i;
}

/**
 * Adapta a posição do Object Properties para ficar ao lado do Seletor de Nós/Componentes
 * sem que haja qualquer sobreposição entre as duas janelas.
 */
function adaptInspectorWithDialog() {
  const dialog = document.querySelector(".lego-comfy-dialog");
  if (!dialog || !INSPECTOR || !document.body.contains(INSPECTOR)) return;

  const vw = window.innerWidth;
  const insW = 328;
  const gap = 16;
  const pad = 16;

  if (vw >= 1220) {
    // Largura máxima que o diálogo pode ter para caber [dialog + gap + inspector] na tela
    const maxDlgW = Math.min(1360, vw - insW - gap - pad * 2);
    const dlgW = Math.max(760, maxDlgW);

    dialog.style.width = `${dlgW}px`;
    dialog.style.maxWidth = `${dlgW}px`;

    // Centraliza o conjunto [diálogo + gap + inspector] horizontalmente na viewport
    const totalW = dlgW + gap + insW;
    const startX = Math.max(pad, Math.round((vw - totalW) / 2));

    dialog.style.position = "fixed";
    dialog.style.left = `${startX}px`;
    dialog.style.top = "50%";
    dialog.style.transform = "translateY(-50%)";

    const dlgRect = dialog.getBoundingClientRect();

    // Posiciona o Object Properties imediatamente à direita do diálogo, alinhado ao topo
    INSPECTOR.style.position = "fixed";
    INSPECTOR.style.left = `${Math.round(dlgRect.right + gap)}px`;
    INSPECTOR.style.top = `${Math.round(dlgRect.top)}px`;
    INSPECTOR.style.maxHeight = `${Math.round(dlgRect.height)}px`;
    INSPECTOR.classList.add("docked-with-dialog");
  } else {
    // Em telas menores, o diálogo mantém suas dimensões confortáveis centralizado
    dialog.style.width = "min(1100px, 94vw)";
    dialog.style.maxWidth = "94vw";
    dialog.style.position = "fixed";
    dialog.style.left = "50%";
    dialog.style.top = "50%";
    dialog.style.transform = "translate(-50%, -50%)";

    INSPECTOR.classList.remove("docked-with-dialog");
    INSPECTOR.style.maxHeight = "76vh";
    if (vw >= 980) {
      INSPECTOR.style.left = `${Math.max(12, vw - insW - 16)}px`;
      INSPECTOR.style.top = "80px";
    }
  }
}

/** A janela flutuante. Some quando não há nada selecionado ou fora da edição. */
function renderObjectInspector(host, state, force) {
  renderAlignBars(host, state);
  const layout = host.properties[PROP];
  if (!state.edit) return closeObjectInspector();
  // Sem `force`, só repinta o que já está aberto: ele nunca aparece sozinho.
  if (!INSPECTOR && !force) return;

  if (!INSPECTOR) {
    INSPECTOR = el("div", "lego-oi");
    INSPECTOR.addEventListener("pointerdown", (e) => e.stopPropagation());
    INSPECTOR.addEventListener("wheel", (e) => e.stopPropagation());
    document.body.append(INSPECTOR);
    if (!INSPECTOR_POS) {
      INSPECTOR_POS = { x: Math.max(12, window.innerWidth - 336), y: 96 };
    }
  }
  if (document.querySelector(".lego-comfy-dialog")) {
    adaptInspectorWithDialog();
  } else {
    INSPECTOR.style.left = `${INSPECTOR_POS.x}px`;
    INSPECTOR.style.top = `${INSPECTOR_POS.y}px`;
    INSPECTOR.style.maxHeight = "76vh";
    INSPECTOR.classList.remove("docked-with-dialog");
  }
  INSPECTOR.replaceChildren();

  /* cabeçalho arrastável */
  const bar = el("div", "lego-oi-bar");
  bar.append(el("span", "lego-oi-bar-t", "Object Properties"));
  const close = glyphBtn("lego-iconbtn", "close", 11, "Close (properties return on selecting a component)");
  close.addEventListener("click", closeObjectInspector);
  bar.append(close);
  bar.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    e.preventDefault();
    INSPECTOR.classList.remove("docked-with-dialog");
    const dx = e.clientX - INSPECTOR_POS.x;
    const dy = e.clientY - INSPECTOR_POS.y;
    const move = (ev) => {
      INSPECTOR_POS.x = Math.max(0, Math.min(window.innerWidth - 120, ev.clientX - dx));
      INSPECTOR_POS.y = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy));
      INSPECTOR.style.left = `${INSPECTOR_POS.x}px`;
      INSPECTOR.style.top = `${INSPECTOR_POS.y}px`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
  INSPECTOR.append(bar);

  /* seletor de componente, como a combo do topo do Object Inspector */
  const all = [];
  walkControls(layout, (c, lst, sec, parentGroup) => all.push({ c, lst, parentGroup }));
  const picker = el("div", "lego-oi-picker");
  const pickBtn = el("button", "lego-oi-pick");
  const current = findSelected(layout, state);
  const sel = current?.ctrl || null;
  const itemLabel = (c, parentGroup) => {
    const base = `${c.name || c.label || c.kind}: ${toolByKind(c.kind).label}`;
    return parentGroup ? `${base} (in ${parentGroup.name || parentGroup.kind})` : base;
  };
  pickBtn.innerHTML = `<span>${esc(sel ? itemLabel(sel, current?.parentGroup) : "(no component)")}</span>${glyph("chevron", 12)}`;
  pickBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openDropdown(
      pickBtn,
      all.map(({ c, parentGroup }) => itemLabel(c, parentGroup)),
      sel ? itemLabel(sel, current?.parentGroup) : "",
      (_v, idx) => {
        const pick = all[idx];
        if (pick) selectComponent(host, state, pick.c, pick.lst);
      }
    );
  });
  picker.append(pickBtn);
  INSPECTOR.append(picker);

  // ── PAINEL DE MULTI-SELEÇÃO (FIGMA / COMFYUI STYLE) ──
  if (state.selectedNames && state.selectedNames.size > 1) {
    const selCount = state.selectedNames.size;
    pickBtn.innerHTML = `<span><strong>${selCount} objects selected</strong></span>`;

    const multiBox = el("div", "lego-oi-multi");
    multiBox.style.padding = "10px 12px";
    multiBox.style.display = "flex";
    multiBox.style.flexDirection = "column";
    multiBox.style.gap = "10px";

    const desc = el("div", "lego-oi-multi-desc");
    desc.style.fontSize = "12px";
    desc.style.color = "var(--lego-dim)";
    desc.style.lineHeight = "1.4";
    desc.textContent = `${selCount} elements selected. Drag any of them to move together with grid snap, or align them below.`;
    multiBox.append(desc);

    const tagList = el("div", "lego-oi-taglist");
    tagList.style.display = "flex";
    tagList.style.flexWrap = "wrap";
    tagList.style.gap = "4px";
    tagList.style.maxHeight = "100px";
    tagList.style.overflowY = "auto";

    state.selectedNames.forEach((name) => {
      const tag = el("span", "lego-oi-tag");
      tag.style.fontSize = "11px";
      tag.style.padding = "2px 7px";
      tag.style.borderRadius = "4px";
      tag.style.background = "rgba(56, 189, 248, 0.14)";
      tag.style.color = "#38bdf8";
      tag.style.border = "1px solid rgba(56, 189, 248, 0.3)";
      tag.style.cursor = "pointer";
      tag.title = "Click to inspect only this object";
      tag.textContent = name;
      tag.addEventListener("click", () => {
        let targetCtrl = null;
        let targetList = null;
        walkControls(layout, (c, lst) => {
          if (c.name === name) { targetCtrl = c; targetList = lst; }
        });
        if (targetCtrl) {
          selectComponent(host, state, targetCtrl, targetList, false, false);
        }
      });
      tagList.append(tag);
    });
    multiBox.append(tagList);

    const alignLabel = el("div", "lego-oi-subhead", "ALIGNMENT");
    alignLabel.style.fontSize = "10px";
    alignLabel.style.fontWeight = "700";
    alignLabel.style.letterSpacing = "0.08em";
    alignLabel.style.color = "#38bdf8";
    alignLabel.style.marginTop = "4px";

    const alignRow = el("div", "lego-oi-align-row");
    alignRow.style.display = "grid";
    alignRow.style.gridTemplateColumns = "repeat(4, 1fr)";
    alignRow.style.gap = "4px";

    const mkAlignBtn = (label, title, fn) => {
      const b = el("button", "lego-btn ghost", label);
      b.title = title;
      b.style.fontSize = "11px";
      b.style.padding = "6px 2px";
      b.style.justifyContent = "center";
      b.addEventListener("click", () => {
        fn();
        renderObjectInspector(host, state, false);
      });
      return b;
    };

    const getSelCtrls = () => {
      const res = [];
      walkControls(layout, (c) => {
        if (state.selectedNames.has(c.name)) res.push(c);
      });
      return res;
    };

    alignRow.style.gridTemplateColumns = "repeat(5, 1fr)";
    for (const it of ALIGN_OPS) {
      if (!it) continue;
      const [op, title] = it;
      const b = mkAlignBtn("", title, () => alignSelected(host, state, op));
      b.innerHTML = alignIcon(op);
      b.dataset.op = op;
      if ((op === "hdist" || op === "vdist") && selCount < 3) b.disabled = true;
      alignRow.append(b);
    }
    multiBox.append(alignLabel, alignRow);

    const dupAllBtn = el("button", "lego-btn", `Duplicate Selected (${selCount})`);
    dupAllBtn.style.marginTop = "8px";
    dupAllBtn.style.background = "rgba(56, 189, 248, 0.15)";
    dupAllBtn.style.color = "#38bdf8";
    dupAllBtn.style.borderColor = "rgba(56, 189, 248, 0.4)";
    dupAllBtn.style.fontWeight = "600";
    dupAllBtn.addEventListener("click", () => {
      copySelectedComponents(host, state);
      pasteComponents(host, state);
    });
    multiBox.append(dupAllBtn);

    const delAllBtn = el("button", "lego-btn danger", `Delete All (${selCount})`);
    delAllBtn.style.marginTop = "6px";
    delAllBtn.style.background = "#ef4444";
    delAllBtn.style.color = "#fff";
    delAllBtn.style.fontWeight = "600";
    delAllBtn.addEventListener("click", () => {
      pushUndo(host);
      removeControlsByName(layout, state.selectedNames);
      state.selectedNames.clear();
      state.selectedName = null;
      state.refresh();
      renderObjectInspector(host, state, false);
    });
    multiBox.append(delAllBtn);

    INSPECTOR.append(multiBox);
    return;
  }

  if (!sel) {
    INSPECTOR.append(el("div", "lego-oi-empty",
      all.length
        ? "Click a component in the form to view properties."
        : "Empty form. Arm a tool in the palette and click on the form."));
    return;
  }

  const { ctrl, list, parentGroup } = current;

  /* ── propriedades ── */
  INSPECTOR.append(el("div", "lego-oi-sec", "Properties"));
  const props = el("div", "lego-oi-grid");
  props.append(propRow("Name", propText(ctrl.name || "", (v) => {
    const clean = String(v).trim().replace(/\s+/g, "_");
    if (!clean || clean === ctrl.name) return;
    let taken = false;
    walkControls(layout, (c) => { if (c !== ctrl && c.name === clean) taken = true; });
    if (taken) { alert(`A component named ${clean} already exists.`); return; }
    ctrl.name = clean;
    state.selectedName = clean;
    state.refresh();
  })));

  const isDivider = ctrl.kind === "hdivider" || ctrl.kind === "vdivider";
  const isLabel = ctrl.kind === "label";
  const isContainer = ctrl.kind === "group" || ctrl.kind === "segment" || ctrl.kind === "vsegment";

  if (isLabel) {
    props.append(propRow("Text", propText(ctrl.text || ctrl.label || "", (v) => {
      ctrl.text = v;
      ctrl.label = v;
      state.refresh();
    })));
  } else if (!isDivider) {
    // Caption vazio cai no nome do widget vinculado — mostra o efetivo, não o vazio.
    const hitNow = ctrl.bind ? resolveBind(host, ctrl.bind) : null;
    const capPadrao = hitNow ? prettify(hitNow.widget.name) : (ctrl.name || "");
    const capIn = propText(ctrl.label || "", (v) => {
      ctrl.label = v;
      state.refresh();
    });
    capIn.placeholder = capPadrao;
    props.append(propRow("Caption", capIn));

    if (ctrl.kind === "segment" || ctrl.kind === "vsegment") {
      const headIn = propText(ctrl.header || "", (v) => {
        const t = String(v).trim();
        if (t) ctrl.header = t; else delete ctrl.header;
        state.refresh();
      });
      headIn.placeholder = "(no header)";
      props.append(propRow("Header", headIn));
    }

    const POSICOES = [
      { id: "left", label: "Left" },
      { id: "right", label: "Right" },
      { id: "none", label: "None" },
    ];
    const posAtual = POSICOES.find((o) => o.id === (ctrl.labelPos || "left")) || POSICOES[0];
    const posBtn = el("button", "lego-oi-pick");
    posBtn.innerHTML = `<span>${posAtual.label}</span>${glyph("chevron", 12)}`;
    posBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openDropdown(posBtn, POSICOES.map((o) => o.label), posAtual.label, (_v, idx) => {
        const opt = POSICOES[idx];
        if (!opt) return;
        if (opt.id === "left") delete ctrl.labelPos;
        else ctrl.labelPos = opt.id;
        state.refresh();
      });
    });
    props.append(propRow("Caption Position", posBtn));
  }

  if (!parentGroup) {
    props.append(propRow("Left", propNumber(ctrl.x, (v) => { ctrl.x = Math.max(0, v); state.refresh(); })));
    props.append(propRow("Top", propNumber(ctrl.y, (v) => { ctrl.y = Math.max(0, v); state.refresh(); })));
  }
  const isMediaCtrl = ctrl.kind === "media" || ctrl.kind === "video" || ctrl.kind === "audio";
  const isTextarea = ctrl.kind === "textarea";
  const { minW, minH } = getComponentMinDimensions(ctrl);
  const defW = ctrl.w || (parentGroup ? (isTextarea ? 160 : (isDivider ? (ctrl.kind === "vdivider" ? 16 : 192) : 100)) : (isDivider ? (ctrl.kind === "vdivider" ? 16 : 256) : 256));
  const defH = ctrl.h || (parentGroup ? (isTextarea ? 80 : (isMediaCtrl ? 96 : (isDivider ? 16 : 32))) : (isTextarea ? 96 : (isDivider ? 16 : 46)));
  props.append(propRow("Width", propNumber(defW, (v) => { ctrl.w = Math.max(minW, v); state.refresh(); })));
  props.append(propRow("Height", propNumber(defH, (v) => { ctrl.h = Math.max(minH, v); state.refresh(); })));

  if (ctrl.kind === "slider") {
    const hitNow = ctrl.bind ? resolveBind(host, ctrl.bind) : null;
    const o = hitNow?.widget?.options || {};
    const rangeWrap = el("div", "lego-oi-range-wrap");
    rangeWrap.style.cssText = "display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;";

    const inMin = el("input", "lego-oi-in");
    inMin.type = "number";
    inMin.step = "any";
    inMin.placeholder = String(Number.isFinite(o.min) ? o.min : 0);
    inMin.value = Number.isFinite(ctrl.min) ? String(ctrl.min) : "";
    inMin.title = "Range Minimum (x)";
    inMin.style.cssText = "flex:1;min-width:0;text-align:right;";

    const sep = el("span", "", "to");
    sep.style.cssText = "color:var(--lego-dim);font-size:11px;font-weight:600;user-select:none;flex:none;text-transform:lowercase;";

    const inMax = el("input", "lego-oi-in");
    inMax.type = "number";
    inMax.step = "any";
    inMax.placeholder = String(Number.isFinite(o.max) ? o.max : 1);
    inMax.value = Number.isFinite(ctrl.max) ? String(ctrl.max) : "";
    inMax.title = "Range Maximum (y)";
    inMax.style.cssText = "flex:1;min-width:0;text-align:right;";

    const saveRange = () => {
      const vMin = parseFloat(inMin.value);
      const vMax = parseFloat(inMax.value);
      if (Number.isFinite(vMin)) ctrl.min = vMin;
      else delete ctrl.min;
      if (Number.isFinite(vMax)) ctrl.max = vMax;
      else delete ctrl.max;
      state.refresh();
    };

    inMin.addEventListener("keydown", (e) => e.stopPropagation());
    inMin.addEventListener("change", saveRange);
    inMax.addEventListener("keydown", (e) => e.stopPropagation());
    inMax.addEventListener("change", saveRange);

    rangeWrap.append(inMin, sep, inMax);
    props.append(propRow("Range", rangeWrap));
  }

  // Grupo e segmento são recipientes: trocar o "tipo" deles desmontaria os
  // itens de dentro, então essa linha só existe para controle simples.
  const kindBtn = el("button", "lego-oi-pick");
  kindBtn.innerHTML = `<span>${toolByKind(ctrl.kind).label}</span>${glyph("chevron", 12)}`;
  kindBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openDropdown(kindBtn, TOOLBOX.map((t) => t.label), toolByKind(ctrl.kind).label, (_v, idx) => {
      const t = TOOLBOX[idx];
      if (!t) return;
      ctrl.kind = t.kind;
      if ((t.kind === "segment" || t.kind === "vsegment") && !ctrl.items) ctrl.items = [];
      state.refresh();
    });
  });
  if (!isContainer && !isDivider && !isLabel) props.append(propRow("Type", kindBtn));
  INSPECTOR.append(props);

  if (isOutputKind(ctrl.kind)) {
    /* ── origem: o nó cujo output este componente mostra ── */
    INSPECTOR.append(el("div", "lego-oi-sec", "Events"));
    const og = el("div", "lego-oi-grid");
    const srcMissing = !!ctrl.source && !findNodeInHostScope(host, ctrl.source);
    const srcBtn = el("button", `lego-oi-fn${srcMissing ? " broken" : " bound"}`);
    srcBtn.innerHTML = `${glyph(srcMissing ? "blank" : "link", 12)}<span>${esc(outputSourceLabel(host, ctrl))}</span>`;
    srcBtn.title = "Node whose output this component shows — click to change. Auto = latest output of this type.";
    srcBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openOutputSourceDialog(host, ctrl, state, list);
    });
    og.append(propRow("Source", srcBtn));
    INSPECTOR.append(og);

    const footO = el("div", "lego-oi-foot");
    const dupO = glyphTextBtn("lego-btn", "copy", "Duplicate", 12);
    dupO.addEventListener("click", () => duplicateComponent(host, state, ctrl, list));
    const delO = glyphTextBtn("lego-btn danger", "trash", "Delete", 12);
    delO.addEventListener("click", () => {
      pushUndo(host);
      const i = list.findIndex((c) => c === ctrl || c.name === ctrl.name);
      if (i >= 0) list.splice(i, 1);
      state.selectedName = null;
      state.selectedNames?.delete(ctrl.name);
      state.refresh();
    });
    footO.append(dupO, delO);
    INSPECTOR.append(footO);
    return;
  }

  if (isDivider || isLabel) {
    const footD = el("div", "lego-oi-foot");
    const delD = glyphTextBtn("lego-btn danger", "trash", "Delete", 12);
    delD.addEventListener("click", () => {
      const i = list.findIndex((c) => c === ctrl || c.name === ctrl.name);
      if (i >= 0) list.splice(i, 1);
      state.selectedName = null;
      state.selectedNames?.delete(ctrl.name);
      state.refresh();
    });
    footD.append(delD);
    INSPECTOR.append(footD);
    return;
  }

  /* ── evento: a função do componente ── */
  INSPECTOR.append(el("div", "lego-oi-sec", "Events"));
  const ev = el("div", "lego-oi-grid");

  if (isContainer) {
    const itens = ctrl.items || [];
    if (!itens.length) {
      ev.append(el("div", "lego-oi-empty", "Empty container."));
    }
    itens.forEach((item, i) => {
      const iHit = item.bind ? resolveBind(host, item.bind) : null;
      const btn = el("button", `lego-oi-fn${item.bind ? (iHit ? " bound" : " broken") : ""}`);
      const txt = !item.bind
        ? "(unbound)"
        : iHit
          ? (iHit.node === host ? iHit.widget.name : `#${iHit.node.id} ${iHit.widget.name}`)
          : `${item.bind} (missing)`;
      btn.innerHTML = `${glyph(item.bind && iHit ? "link" : "blank", 12)}<span>${esc(txt)}</span>`;
      btn.title = item.bind || "Click to choose parameter";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openInspector({
          host, layout, section: { controls: list }, ctrl: item, state,
          forFilterKind: item.kind === "text" ? "" : item.kind,
          targetCallback: (target) => {
            if (!target || target.isRaw) return;
            item.bind = target.bind;
            item.kind = target.kind || item.kind;
            state.refresh();
          },
        });
      });
      ev.append(propRow(item.label || `${toolByKind(item.kind).label}${i + 1}`, btn));
    });
    INSPECTOR.append(ev);
    const footC = el("div", "lego-oi-foot");
    const delC = glyphTextBtn("lego-btn danger", "trash", "Delete", 12);
    delC.addEventListener("click", () => {
      const i = list.findIndex((c) => c.name === ctrl.name);
      if (i >= 0) list.splice(i, 1);
      state.selectedName = null;
      state.selectedNames?.delete(ctrl.name);
      state.refresh();
    });
    footC.append(delC);
    INSPECTOR.append(footC);
    return;
  }

  const hit = ctrl.bind ? resolveBind(host, ctrl.bind) : null;
  const fnBtn = el("button", `lego-oi-fn${ctrl.bind ? (hit ? " bound" : " broken") : ""}`);
  const fnText = !ctrl.bind
    ? "(unbound)"
    : hit
      ? (hit.node === host ? hit.widget.name : `#${hit.node.id} ${hit.widget.name}`)
      : `${ctrl.bind} (missing widget)`;
  fnBtn.innerHTML = `${glyph(ctrl.bind && hit ? "link" : "blank", 12)}<span>${esc(fnText)}</span>`;
  fnBtn.title = ctrl.bind
    ? `Bound to ${ctrl.bind} — click to change`
    : "Click to choose workflow parameter controlled by this component";
  fnBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openInspector({
      host,
      layout,
      section: { controls: list },
      ctrl,
      state,
      forFilterKind: ctrl.kind === "text" ? "" : ctrl.kind,
      targetCallback: (target) => {
        if (!target || target.isRaw) return;
        ctrl.bind = target.bind;
        if (!ctrl.label || ctrl.label === ctrl.name) ctrl.label = target.label || target.name;
        ctrl.kind = target.kind || ctrl.kind;
        state.refresh();
      },
    });
  });
  ev.append(propRow("OnChange", fnBtn));
  INSPECTOR.append(ev);

  /* ── rodapé ── */
  const foot = el("div", "lego-oi-foot");
  const dup = glyphTextBtn("lego-btn", "copy", "Duplicate", 12);
  dup.title = "Duplicate component (Ctrl+C, Ctrl+V, Ctrl+D)";
  dup.addEventListener("click", () => {
    duplicateComponent(host, state, ctrl, list);
  });
  foot.append(dup);

  if (ctrl.bind) {
    const unbind = glyphTextBtn("lego-btn", "close", "Unbind", 12);
    unbind.addEventListener("click", () => {
      pushUndo(host);
      ctrl.bind = "";
      state.refresh();
    });
    foot.append(unbind);
  }
  const del = glyphTextBtn("lego-btn danger", "trash", "Delete", 12);
  del.addEventListener("click", () => {
    pushUndo(host);
    const i = list.findIndex((c) => c === ctrl || c.name === ctrl.name);
    if (i >= 0) list.splice(i, 1);
    state.selectedName = null;
    state.selectedNames?.delete(ctrl.name);
    state.refresh();
  });
  foot.append(del);
  INSPECTOR.append(foot);
}

function buildCard(host, state) {
  const layout = host.properties[PROP];
  const root = el("div", `lego-card${state.edit ? " editing" : ""}`);
  root.addEventListener("contextmenu", (e) => e.stopPropagation());
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
          if (!Array.isArray(t.sections) || !t.sections.length) t.sections = [{ header: String(t.name || "ZONE").toUpperCase(), controls: [] }];
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
              tabs.splice(i, 1);
              layout.activeTab = Math.max(0, i - 1);
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
              tabs.splice(i, 1);
              layout.activeTab = Math.max(0, i - 1);
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
            tabs.splice(i, 1);
            layout.activeTab = Math.max(0, i - 1);
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
            tabs.splice(i, 1);
            layout.activeTab = Math.max(0, i - 1);
            state.refresh();
          },
          onAdd: () => {
            const v = prompt("New tab name:", `Tab ${tabs.length + 1}`);
            if (!v) return;
            tabs.push({ name: v, sections: [{ header: v.toUpperCase(), controls: [] }] });
            layout.activeTab = tabs.length - 1;
            state.refresh();
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
        const v = prompt("New tab name:", `Tab ${tabs.length + 1}`);
        if (!v) return;
        tabs.push({ name: v, sections: [{ header: v.toUpperCase(), controls: [] }] });
        layout.activeTab = tabs.length - 1;
        state.refresh();
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

    sections.forEach((s, sIdx) => {
      const sec = el("div", `lego-sec${s.color ? " tinted" : ""}`);
      if (s.color) sec.style.setProperty("--lego-zone-c", s.color);
      sec.addEventListener("pointerdown", () => { state.activeSection = s; });

      // Aplica a largura do Card (100%, 50%, 33%, etc.) no container geral
      const secW = s.width || (s.w ? `${s.w}px` : "100%");
      sec.style.width = widthToCss(secW);
      sec.style.flex = `0 0 ${widthToCss(secW)}`;

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
        } else if (state.draggingControl) {
          e.preventDefault();
          sec.classList.add("drop-target");
        } else if (state.draggingComponent) {
          e.preventDefault();
          sec.classList.add("drop-target");
        }
      });

      sec.addEventListener("dragleave", () => {
        sec.classList.remove("lego-drop-top", "lego-drop-bottom", "lego-drop-side-right", "lego-drop-side-left", "drop-target");
      });

      sec.addEventListener("drop", (e) => {
        sec.classList.remove("lego-drop-top", "lego-drop-bottom", "lego-drop-side-right", "lego-drop-side-left", "drop-target");

        // 1. Arrastando uma ZONA sobre outra ZONA
        if (state.draggingSection && state.draggingSection.sec !== s) {
          e.preventDefault();
          const rect = sec.getBoundingClientRect();
          const dir = getDropDirection(e, rect);

          const fromIdx = state.draggingSection.fromIndex;
          const moved = sections.splice(fromIdx, 1)[0];
          state.draggingSection = null;

          const targetIdx = sections.indexOf(s);

          if (dir === "left" || dir === "right") {
            // LADO A LADO: só define 50% se não houver dimensão customizada
            if (!s.width || s.width === "100%") s.width = "50%";
            if (!moved.width || moved.width === "100%") moved.width = "50%";
            const insertIdx = (dir === "right") ? targetIdx + 1 : targetIdx;
            sections.splice(insertIdx, 0, moved);
          } else if (dir === "top") {
            // EM CIMA (coluna vertical): restaura para 100% apenas se estavam no 50% padrão
            if (!moved.width || moved.width === "50%") moved.width = "100%";
            if (s.width === "50%") s.width = "100%";
            sections.splice(targetIdx, 0, moved);
          } else {
            // EM BAIXO (coluna vertical): restaura para 100% apenas se estavam no 50% padrão
            if (!moved.width || moved.width === "50%") moved.width = "100%";
            if (s.width === "50%") s.width = "100%";
            sections.splice(targetIdx + 1, 0, moved);
          }

          state.refresh();
          return;
        }

        // 2. Arrastando um COMPONENTE para dentro desta ZONA
        if (state.draggingControl) {
          e.preventDefault();
          const { ctrl: movedCtrl, fromSectionCtrls } = state.draggingControl;
          state.draggingControl = null;

          const fromIdx = fromSectionCtrls.indexOf(movedCtrl);
          if (fromIdx >= 0) fromSectionCtrls.splice(fromIdx, 1);

          // Se na seção de origem só restou 1 controle e ele era 50%, restaura para 100%
          if (fromSectionCtrls.length === 1 && fromSectionCtrls[0].width === "50%") {
            fromSectionCtrls[0].width = "100%";
          }

          activeTarget.controls = activeTarget.controls || [];
          // Ao mover para uma nova seção, se ela estiver vazia ou com controles 100%, expande para 100%
          if (!activeTarget.controls.length || activeTarget.controls.every(c => !c.width || c.width === "100%")) {
            movedCtrl.width = "100%";
          }
          activeTarget.controls.push(movedCtrl);

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
          state.draggingSection = { sec: s, fromIndex: sIdx };
          sec.classList.add("dragging");
        });
        h.addEventListener("dragend", () => {
          state.draggingSection = null;
          sec.classList.remove("dragging");
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
      const hasMedia = list.some(c => (c.kind === "media" || c.kind === "video" || c.kind === "audio") || (c.kind === "group" && c.items?.some(it => it.kind === "media" || it.kind === "video" || it.kind === "audio")));
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
          sections.splice(sIdx, 1);
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
          const origW = sec.getBoundingClientRect().width;
          const bodyW = (body.getBoundingClientRect().width) || 800;
          const curScale = app?.canvas?.ds?.scale || 1;

          let finalW = s.width || "100%";

          const onMoveW = (ev) => {
            ev.stopPropagation();
            const rawW = Math.max(220, Math.min(bodyW, origW + (ev.clientX - startClientX) / curScale));
            const ratio = Math.max(0.2, Math.min(1.0, rawW / bodyW));
            finalW = snapWidth(ratio, ev.shiftKey);

            sec.style.width = widthToCss(finalW);
            sec.style.flex = `0 0 ${widthToCss(finalW)}`;
          };

          const onUpW = (ev) => {
            ev?.stopPropagation();
            resizerW.classList.remove("active");
            sec.classList.remove("resizing");

            window.removeEventListener("pointermove", onMoveW, true);
            window.removeEventListener("pointerup", onUpW, true);
            window.removeEventListener("pointercancel", onUpW, true);
            window.removeEventListener("mousemove", onMoveW, true);
            window.removeEventListener("mouseup", onUpW, true);

            s.width = finalW;
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
          const curScale = app?.canvas?.ds?.scale || 1;

          let finalH = origH;

          const onMoveH = (ev) => {
            ev.stopPropagation();
            finalH = Math.max(120, Math.round(origH + (ev.clientY - startClientY) / curScale));
            sec.style.minHeight = `${finalH}px`;
          };

          const onUpH = (ev) => {
            ev?.stopPropagation();
            resizerH.classList.remove("active");
            sec.classList.remove("resizing");

            window.removeEventListener("pointermove", onMoveH, true);
            window.removeEventListener("pointerup", onUpH, true);
            window.removeEventListener("pointercancel", onUpH, true);
            window.removeEventListener("mousemove", onMoveH, true);
            window.removeEventListener("mouseup", onUpH, true);

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

      // Se a zona tiver sub-abas, renderiza a barra de sub-abas interna
      if (hasSubTabs) {
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
                  s.tabs.splice(stIdx, 1);
                  s.activeTab = Math.max(0, stIdx - 1);
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
                  s.tabs.splice(stIdx, 1);
                  s.activeTab = Math.max(0, stIdx - 1);
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
                s.tabs.splice(stIdx, 1);
                s.activeTab = Math.max(0, stIdx - 1);
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
                s.tabs.splice(stIdx, 1);
                s.activeTab = Math.max(0, stIdx - 1);
                state.refresh();
              },
              onAdd: () => {
                const v = prompt("New sub-tab name:", `Tab ${s.tabs.length + 1}`);
                if (!v) return;
                s.tabs.push({ name: v, controls: [] });
                s.activeTab = s.tabs.length - 1;
                state.refresh();
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
            const v = prompt("New sub-tab name:", `Tab ${s.tabs.length + 1}`);
            if (!v) return;
            s.tabs.push({ name: v, controls: [] });
            s.activeTab = s.tabs.length - 1;
            state.refresh();
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
      const CTRL_GRID = 16;
      const ctrlsBox = el("div", `lego-sec-controls${state.edit ? " in-edit" : ""}`);
      ctrlsBox.__legoList = list;   // alvo de arraste (ver zoneDropTargetAt)

      function updateControlsBounds() {
        let maxY = 70;
        for (const item of list) {
          const iy = typeof item.y === "number" ? item.y : 16;
          const isM = (item.kind === "media" || item.kind === "video" || item.kind === "audio");
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
          empty.append(el("div", "", hasSubTabs ? `sub-tab "${activeTarget.name}" empty` : "empty zone"));
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
      } else {
        // Inicializa coordenadas 2D automáticas nos controles que ainda não têm (X, Y).
        // Zona com `grid: N` distribui em N colunas — é o que faz as 9 referências
        // virarem uma grade 3x3 em vez de uma pilha de 9 linhas.
        const autoCols = Math.max(1, Math.round(activeTarget.grid || 1));
        // A coluna sai da largura do NÓ, não de um valor fixo: 3 colunas de 288
        // pedem 928px e transbordam um nó de 680.
        const autoAvail = Math.max(256, Math.round(host.size?.[0] || MIN_W) - 56);
        const autoColW = autoCols > 1
          ? Math.max(96, Math.floor((autoAvail - 16 * (autoCols + 1)) / autoCols / CTRL_GRID) * CTRL_GRID)
          : 256;
        /** Um grupo que carrega mídia precisa de altura de miniatura, não de linha. */
        const hasMedia = (c) =>
          (c.kind === "media" || c.kind === "video" || c.kind === "audio") || (c.items || []).some((i) => i.kind === "media" || i.kind === "video" || i.kind === "audio");
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
          c.x = Math.max(0, Math.round(c.x / CTRL_GRID) * CTRL_GRID);
          c.y = Math.max(0, Math.round(c.y / CTRL_GRID) * CTRL_GRID);
          if (!c.w) c.w = autoCols > 1 ? autoColW : (hasMedia(c) ? 288 : 256);
          c.w = Math.max(hasMedia(c) ? 160 : 80, Math.round(c.w / CTRL_GRID) * CTRL_GRID);
          if (!c.h) c.h = hasMedia(c) ? 144 : (c.kind === "textarea" ? 96 : 46);
          c.h = Math.max(hasMedia(c) ? 64 : 36, Math.round(c.h / CTRL_GRID) * CTRL_GRID);
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
          const curScale = app?.canvas?.ds?.scale || 1;
          const dropX = Math.max(16, Math.round(((e.clientX - boxRect.left) / curScale) / CTRL_GRID) * CTRL_GRID);
          const dropY = Math.max(16, Math.round(((e.clientY - boxRect.top) / curScale) / CTRL_GRID) * CTRL_GRID);
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
          if (state.draggingComponent || state.draggingControl) {
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
          const curScale = app?.canvas?.ds?.scale || 1;
          const dropX = Math.max(16, Math.round(((e.clientX - boxRect.left) / curScale) / CTRL_GRID) * CTRL_GRID);
          const dropY = Math.max(16, Math.round(((e.clientY - boxRect.top) / curScale) / CTRL_GRID) * CTRL_GRID);

          if (state.draggingComponent) {
            e.preventDefault();
            e.stopPropagation();
            const d = state.draggingComponent;
            state.draggingComponent = null;
            dropArmedTool(host, state, activeTarget, dropX, dropY, false, d.kind);
          } else if (state.draggingControl) {
            e.preventDefault();
            e.stopPropagation();
            const { ctrl: movedCtrl, fromSectionCtrls } = state.draggingControl;
            state.draggingControl = null;

            const fromIdx = fromSectionCtrls.indexOf(movedCtrl);
            if (fromIdx >= 0) fromSectionCtrls.splice(fromIdx, 1);

            movedCtrl.x = dropX;
            movedCtrl.y = dropY;
            list.push(movedCtrl);
            state.refresh();
          }
        });

        // ── 2 CLIQUES NO CANVAS PARA ADICIONAR COMPONENTE (ESTILO COMFYUI CANVAS) ──
        ctrlsBox.addEventListener("dblclick", (e) => {
          if (!state.edit) return;
          if (e.target.closest(".lego-row") || e.target.closest("button") || e.target.closest("input") || e.target.closest("select")) return;
          e.stopPropagation();
          e.preventDefault();

          const boxRect = ctrlsBox.getBoundingClientRect();
          const curScale = app?.canvas?.ds?.scale || 1;
          const dropX = Math.max(16, Math.round(((e.clientX - boxRect.left) / curScale) / CTRL_GRID) * CTRL_GRID);
          const dropY = Math.max(16, Math.round(((e.clientY - boxRect.top) / curScale) / CTRL_GRID) * CTRL_GRID);

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
          const curScale = app?.canvas?.ds?.scale || 1;
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
            const sc = app?.canvas?.ds?.scale || 1;
            const px = Math.max(0, Math.round(((e.clientX - boxRect.left) / sc) / CTRL_GRID) * CTRL_GRID);
            const py = Math.max(0, Math.round(((e.clientY - boxRect.top) / sc) / CTRL_GRID) * CTRL_GRID);
            dropArmedTool(host, state, activeTarget, px, py, e.shiftKey);
          }
        });
      }

      sec.append(ctrlsBox);
      body.append(sec);
    });
    // Suporte a soltar componentes diretamente no fundo do Canvas com Snap to Grid de 20px
    if (state.edit) {
      body.addEventListener("dragover", (e) => {
        if (state.draggingComponent || state.draggingControl) {
          e.preventDefault();
        }
      });

      body.addEventListener("drop", (e) => {
        if (e.target.closest(".lego-sec")) return; // Deixa o card tratar se o drop foi em cima de um card

        const bodyRect = body.getBoundingClientRect();
        const curScale = app?.canvas?.ds?.scale || 1;
        const dropX = Math.max(20, Math.round(((e.clientX - bodyRect.left) / curScale) / GRID) * GRID);
        const dropY = Math.max(20, Math.round(((e.clientY - bodyRect.top) / curScale) / GRID) * GRID);

        if (state.draggingComponent) {
          e.preventDefault();
          const d = state.draggingComponent;
          state.draggingComponent = null;

          const newSec = {
            header: toolByKind(d.kind).label.toUpperCase(),
            x: dropX,
            y: dropY,
            w: 340,
            controls: []
          };
          sections.push(newSec);
          dropArmedTool(host, state, newSec, 16, 16, false, d.kind);
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
  // não repete o título nem desenha uma moldura dentro da moldura do nó. Os
  // botões do cabeçalho (entrar, editar) vão para a ponta direita da primeira
  // linha — a barra de abas ou o título da primeira zona.
  // `layout.showTitle: true` volta ao cabeçalho antigo.
  if (!layout.showTitle) {
    const firstRow = root.querySelector(":scope > .lego-tabs") || body.querySelector(".lego-sec-h");
    if (firstRow) {
      const tools = el("span", "lego-head-tools");
      tools.append(...[...head.children].filter((c) => c !== txt));
      firstRow.append(tools);
      head.remove();
      root.classList.add("merged");
    }
  }

  // O inspetor é uma janela fora do nó — acompanha a seleção, não o layout.
  queueMicrotask(() => renderObjectInspector(host, state, false));

  return root;
}
/* ══════════════════════════════════════════════════════════════════════════
   Ciclo de vida
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Varredor compartilhado ──────────────────────────────────────────────────
 *
 * Confere periodicamente se widgets promovidos foram recriados pelo ComfyUI
 * (após re-link interno do subgrafo) e só dispara resize se a altura do cartão
 * divergir significativamente (>= 16px).
 * ZERO trabalho quando o grafo está ocioso — sem flicker e sem redesenhos contínuos.
 */
const ATTACHED = new Set();
let sweepTimer = null;

function isLayoutValid(layout) {
  if (!layout || layout.schema !== SCHEMA || !Array.isArray(layout.tabs) || !layout.tabs.length) return false;
  for (const t of layout.tabs) {
    if (!Array.isArray(t.sections)) return false;
    for (const s of t.sections) {
      if (s.rows && (!s.controls || !s.controls.length)) return false;
    }
  }
  return true;
}

function startSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    for (const node of ATTACHED) {
      const state = node.__legoState;
      if (!state) { ATTACHED.delete(node); continue; }
      if (!node.graph) continue;          // nó removido do grafo
      const host = node.__legoHost;
      if (!host) continue;

      // Respeita nós colapsados no LiteGraph e ComfyUI nativo
      if (node.flags?.collapsed) {
        if (host.style.display !== "none") host.style.display = "none";
        continue;
      } else if (host.style.display === "none") {
        host.style.display = "";
        state.schedule(true);
      }

      const hiddenChanged = hideNative(node);

      // Sincroniza cor do nó caso tenha sido alterada externamente
      if (node.color !== node.__lastLegoColor || node.bgcolor !== node.__lastLegoBgcolor) {
        node.__lastLegoColor = node.color;
        node.__lastLegoBgcolor = node.bgcolor;
        applyNodeColorTheme(node);
      }

      const h = cardHeight(host);
      const top = node.__legoWidget?.y ?? 46;
      const targetH = Math.ceil(top + h + PAD);
      const curH = Math.ceil(node.size?.[1] || 0);

      if (hiddenChanged || Math.abs(curH - targetH) >= 16) {
        state.schedule(false);
      }
    }
    if (!ATTACHED.size) { clearInterval(sweepTimer); sweepTimer = null; }
  }, SWEEP_MS);
}

/**
 * Esconde os widgets nativos que o cartão já mostra.
 * Marca os que escondeu para não desfazer o que outra extensão escondeu.
 */
function hideNative(node) {
  let changed = false;
  for (const w of node.widgets || []) {
    if (w.__lego) continue;
    if (!w.hidden) {
      w.hidden = true;
      w.__legoHid = true;
      changed = true;
    }
  }
  return changed;
}

function showNative(node) {
  for (const w of node.widgets || []) {
    if (w.__legoHid) { w.hidden = false; delete w.__legoHid; }
  }
}


/**
 * Devolve ao canvas o arraste com o botão do meio.
 *
 * O cartão é um overlay em HTML por cima do canvas: enquanto o ponteiro está
 * sobre ele, o LiteGraph não vê evento nenhum, e a navegação nativa do ComfyUI
 * — segurar o botão do meio e arrastar para mover a vista — morria em cima do
 * subgrafo. A saída é desligar o `pointer-events` do host durante o arraste e
 * repassar o evento ao canvas, que a partir daí conduz sozinho.
 */
function passMiddleDragToCanvas(host) {
  if (host.__legoPan) return;
  host.__legoPan = true;

  host.addEventListener("pointerdown", (e) => {
    if (e.button !== 1) return;          // só o botão do meio
    const cv = app?.canvas?.canvas;
    if (!cv) return;

    e.preventDefault();
    e.stopPropagation();

    // Desligar só o host não basta: o frontend embrulha o widget num
    // `.dom-widget` que continua interceptando. Neutraliza a cadeia inteira
    // até o canvas e devolve tudo no pointerup.
    const mutes = [host];
    for (let p = host.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.tagName === "CANVAS") break;
      mutes.push(p);
      if (p.classList?.contains("dom-widget")) break;
    }
    const antes = mutes.map((elm) => elm.style.pointerEvents);
    mutes.forEach((elm) => { elm.style.pointerEvents = "none"; });

    cv.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      button: 1,
      buttons: 4,
      pointerId: e.pointerId,
      pointerType: e.pointerType || "mouse",
      isPrimary: true,
    }));

    const restore = () => {
      mutes.forEach((elm, i) => { elm.style.pointerEvents = antes[i] || ""; });
      window.removeEventListener("pointerup", restore, true);
      window.removeEventListener("pointercancel", restore, true);
    };
    window.addEventListener("pointerup", restore, true);
    window.addEventListener("pointercancel", restore, true);
  }, true);

  // O clique do meio também dispara "auxclick"/rolagem automática do navegador.
  host.addEventListener("auxclick", (e) => { if (e.button === 1) e.preventDefault(); });
}

/**
 * Devolve ao canvas o evento de rolagem (wheel / zoom).
 *
 * Como o cartão é um elemento HTML (DOM widget) posicionado sobre o canvas,
 * o navegador consome os eventos de `wheel` e o LiteGraph não recebe a rolagem,
 * impedindo o zoom ou pan nativo do ComfyUI quando o mouse está sobre o nó.
 * Repassamos o evento como um WheelEvent sintético diretamente no canvas.
 */
function passWheelToCanvas(host) {
  if (host.__legoWheel) return;
  host.__legoWheel = true;

  host.addEventListener("wheel", (e) => {
    // Se o elemento sob o ponteiro tiver rolagem vertical própria ativa
    // (ex.: textarea de prompt longo com scroll), permite rolar internamente,
    // a menos que esteja segurando Ctrl ou Meta (gesto explícito de zoom).
    const target = e.target;
    if (target && !e.ctrlKey && !e.metaKey) {
      if (target.tagName === "TEXTAREA" || target.classList?.contains("lego-scrollable")) {
        const canScrollDown = e.deltaY > 0 && target.scrollTop + target.clientHeight < target.scrollHeight - 1;
        const canScrollUp = e.deltaY < 0 && target.scrollTop > 1;
        if (canScrollDown || canScrollUp) {
          return;
        }
      }
    }

    const cv = app?.canvas?.canvas || document.querySelector("canvas.graph-canvas") || document.querySelector("canvas");
    if (!cv) return;

    e.preventDefault();
    e.stopPropagation();

    const wheelEvt = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      deltaZ: e.deltaZ,
      deltaMode: e.deltaMode ?? 0,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
    });

    const handled = !cv.dispatchEvent(wheelEvt);
    if (!handled && typeof app?.canvas?.processMouseWheel === "function") {
      try {
        app.canvas.processMouseWheel(wheelEvt);
      } catch {}
    }
  }, { passive: false });
}

/**
 * Paleta de cores padrão do LiteGraph/ComfyUI caso LGraphCanvas.node_colors não esteja acessível.
 */
const DEFAULT_NODE_COLORS = {
  red:       { color: "#322",    bgcolor: "#533",    groupcolor: "#A88" },
  brown:     { color: "#332922", bgcolor: "#593930", groupcolor: "#b06634" },
  green:     { color: "#232",    bgcolor: "#353",    groupcolor: "#8A8" },
  blue:      { color: "#223",    bgcolor: "#335",    groupcolor: "#88A" },
  pale_blue: { color: "#2a363b", bgcolor: "#3f5159", groupcolor: "#3f789e" },
  cyan:      { color: "#233",    bgcolor: "#355",    groupcolor: "#8AA" },
  purple:    { color: "#323",    bgcolor: "#535",    groupcolor: "#a1309b" },
  yellow:    { color: "#432",    bgcolor: "#653",    groupcolor: "#b58b2a" },
  black:     { color: "#222",    bgcolor: "#000",    groupcolor: "#444" },
};

/**
 * Aplica as cores do nó (color, bgcolor, groupcolor) ao cartão Super Subgraph.
 * Quando o usuário seleciona uma cor no seletor de nós do ComfyUI, atualiza as variáveis
 * CSS do cartão em tempo real com transição suave, mantendo alta legibilidade e contraste.
 */
function applyNodeColorTheme(node, card) {
  if (!node) return;
  const root = card || node.__legoHost?.querySelector?.(".lego-card") || (node.__legoHost?.firstElementChild?.classList?.contains("lego-card") ? node.__legoHost.firstElementChild : null);
  if (!root) return;

  const color = node.color;
  const bgcolor = node.bgcolor;

  if (!color && !bgcolor) {
    // Reset para o tema padrão dos Nodes 2.0 (carvão neutro)
    root.classList.remove("has-node-color");
    root.style.removeProperty("--lego-bg");
    root.style.removeProperty("--lego-head-bg");
    root.style.removeProperty("--lego-surface");
    root.style.removeProperty("--lego-surface-hover");
    root.style.removeProperty("--lego-panel");
    root.style.removeProperty("--lego-well");
    root.style.removeProperty("--lego-line");
    root.style.removeProperty("--lego-accent");
    root.style.removeProperty("--lego-node-color");
    root.style.removeProperty("--lego-node-bgcolor");
    return;
  }

  const nodeColors = (typeof LGraphCanvas !== "undefined" && LGraphCanvas.node_colors) ||
                     (typeof LiteGraph !== "undefined" && LiteGraph.node_colors) ||
                     DEFAULT_NODE_COLORS;

  let matchedPreset = null;
  for (const val of Object.values(nodeColors)) {
    if ((color && val.color === color) || (bgcolor && val.bgcolor === bgcolor)) {
      matchedPreset = val;
      break;
    }
  }

  const effectiveBg = bgcolor || color;
  const effectiveHead = color || bgcolor;
  const groupColor = matchedPreset?.groupcolor || null;

  root.classList.add("has-node-color");
  root.style.setProperty("--lego-node-color", effectiveHead);
  root.style.setProperty("--lego-node-bgcolor", effectiveBg);
  root.style.setProperty("--lego-bg", effectiveBg);
  root.style.setProperty("--lego-head-bg", effectiveHead);

  if (effectiveBg === "#000" || effectiveBg === "#000000") {
    root.style.setProperty("--lego-bg", "#121214");
    root.style.setProperty("--lego-head-bg", "#1c1c20");
    root.style.setProperty("--lego-surface", "#202024");
    root.style.setProperty("--lego-surface-hover", "#28282e");
    root.style.setProperty("--lego-panel", "#18181b");
    root.style.setProperty("--lego-well", "#0a0a0c");
    root.style.setProperty("--lego-line", "#333338");
    root.style.setProperty("--lego-accent", groupColor || "#71717a");
  } else {
    root.style.setProperty("--lego-surface", `color-mix(in srgb, ${effectiveBg} 75%, rgba(255,255,255,0.09) 25%)`);
    root.style.setProperty("--lego-surface-hover", `color-mix(in srgb, ${effectiveBg} 65%, rgba(255,255,255,0.18) 35%)`);
    root.style.setProperty("--lego-panel", `color-mix(in srgb, ${effectiveBg} 85%, #000000 15%)`);
    root.style.setProperty("--lego-well", `color-mix(in srgb, ${effectiveBg} 45%, #000000 55%)`);
    root.style.setProperty("--lego-line", `color-mix(in srgb, ${effectiveBg} 60%, rgba(255,255,255,0.22) 40%)`);
    if (groupColor) {
      root.style.setProperty("--lego-accent", groupColor);
    } else {
      root.style.setProperty("--lego-accent", `color-mix(in srgb, ${effectiveHead} 50%, #ffffff 50%)`);
    }
  }
}

/**
 * Instala os interceptores reativos de cor no nó para sincronizar com o seletor de cores
 * flutuante do ComfyUI, o menu de contexto ou modificações programáticas.
 */
function installNodeColorHooks(node) {
  if (!node || node.__legoColorHooksInstalled) return;
  node.__legoColorHooksInstalled = true;
  node.__lastLegoColor = node.color;
  node.__lastLegoBgcolor = node.bgcolor;

  // 1. Intercepta setColorOption (usado pela barra de cores flutuante e pelo menu de contexto)
  const origSetColorOption = node.setColorOption;
  node.setColorOption = function (colorOption) {
    const res = origSetColorOption ? origSetColorOption.apply(this, arguments) : undefined;
    this.__lastLegoColor = this.color;
    this.__lastLegoBgcolor = this.bgcolor;
    applyNodeColorTheme(this);
    return res;
  };

  // 2. Intercepta ciclos de renderização do canvas
  const origOnDrawForeground = node.onDrawForeground;
  node.onDrawForeground = function () {
    if (this.color !== this.__lastLegoColor || this.bgcolor !== this.__lastLegoBgcolor) {
      this.__lastLegoColor = this.color;
      this.__lastLegoBgcolor = this.bgcolor;
      applyNodeColorTheme(this);
    }
    return origOnDrawForeground ? origOnDrawForeground.apply(this, arguments) : undefined;
  };

  const origOnDrawBackground = node.onDrawBackground;
  node.onDrawBackground = function () {
    if (this.color !== this.__lastLegoColor || this.bgcolor !== this.__lastLegoBgcolor) {
      this.__lastLegoColor = this.color;
      this.__lastLegoBgcolor = this.bgcolor;
      applyNodeColorTheme(this);
    }
    return origOnDrawBackground ? origOnDrawBackground.apply(this, arguments) : undefined;
  };

  // 3. Intercepta configure para manter a cor ao carregar workflow ou duplicar
  const origConfigure = node.configure;
  node.configure = function () {
    const res = origConfigure ? origConfigure.apply(this, arguments) : undefined;
    this.__lastLegoColor = this.color;
    this.__lastLegoBgcolor = this.bgcolor;
    applyNodeColorTheme(this);
    return res;
  };

  // 4. Intercepta atribuições diretas a node.color e node.bgcolor via property descriptors
  try {
    const proto = Object.getPrototypeOf(node);
    const descColor = Object.getOwnPropertyDescriptor(node, "color") || Object.getOwnPropertyDescriptor(proto, "color");
    const descBg = Object.getOwnPropertyDescriptor(node, "bgcolor") || Object.getOwnPropertyDescriptor(proto, "bgcolor");

    Object.defineProperty(node, "color", {
      get() {
        return descColor && descColor.get ? descColor.get.call(this) : this.__rawColor;
      },
      set(v) {
        if (descColor && descColor.set) descColor.set.call(this, v);
        else this.__rawColor = v;
        if (this.__lastLegoColor !== v) {
          this.__lastLegoColor = v;
          applyNodeColorTheme(this);
        }
      },
      configurable: true,
      enumerable: true,
    });

    Object.defineProperty(node, "bgcolor", {
      get() {
        return descBg && descBg.get ? descBg.get.call(this) : this.__rawBgcolor;
      },
      set(v) {
        if (descBg && descBg.set) descBg.set.call(this, v);
        else this.__rawBgcolor = v;
        if (this.__lastLegoBgcolor !== v) {
          this.__lastLegoBgcolor = v;
          applyNodeColorTheme(this);
        }
      },
      configurable: true,
      enumerable: true,
    });
  } catch (err) {
    console.warn("[SuperSubgraph] color property interception fallback:", err);
  }
}

function attach(node) {
  if (!node || typeof node.addDOMWidget !== "function") return null;
  if (node.__legoState) {
    if (node.__legoHost) {
      passMiddleDragToCanvas(node.__legoHost);
      passWheelToCanvas(node.__legoHost);
    }
    applyNodeColorTheme(node);
    node.__legoState.refresh();
    return node.__legoState;
  }
  injectCSS();

  // Intercepta alterações de cor do nó (seletor de cores, menus e programático)
  installNodeColorHooks(node);

  // Intercepta onExecuted para atualizar o cartão com imagens/saídas geradas
  if (!node.__legoExecutedHookInstalled) {
    node.__legoExecutedHookInstalled = true;
    const origOnExecuted = node.onExecuted;
    node.onExecuted = function (output) {
      const r = origOnExecuted ? origOnExecuted.apply(this, arguments) : undefined;
      node.__legoState?.refresh();
      return r;
    };
  }

  // Intercepta métodos de layout e desenho do nó para suprimir totalmente
  // widgets nativos e impedir que eles apareçam ou reservem espaço vertical.
  if (!node.__legoHooksInstalled) {
    node.__legoHooksInstalled = true;

    const origGetLayoutWidgets = node.getLayoutWidgets;
    node.getLayoutWidgets = function () {
      if (this.properties?.[PROP] && !this.flags?.collapsed) {
        return (this.widgets || []).filter((w) => w && w.__lego);
      }
      return origGetLayoutWidgets ? origGetLayoutWidgets.apply(this, arguments) : [];
    };

    const origIsWidgetVisible = node.isWidgetVisible;
    node.isWidgetVisible = function (w) {
      if (this.properties?.[PROP] && !this.flags?.collapsed) {
        if (w && !w.__lego) return false;
      }
      return origIsWidgetVisible ? origIsWidgetVisible.apply(this, arguments) : true;
    };

    const origDrawWidgets = node.drawWidgets;
    node.drawWidgets = function (ctx, options) {
      if (this.properties?.[PROP] && !this.flags?.collapsed) {
        return;
      }
      return origDrawWidgets ? origDrawWidgets.apply(this, arguments) : undefined;
    };
  }

  if (!node.properties) node.properties = {};
  if (!isLayoutValid(node.properties[PROP])) {
    node.properties[PROP] = autoLayout(node);
  }

  const host = el("div");
  host.style.width = "100%";
  passMiddleDragToCanvas(host);
  passWheelToCanvas(host);
  node.__legoHost = host;

  let lastObservedH = 0;
  const state = {
    edit: false,
    dragging: null,
    armedTool: null,   // ferramenta da paleta esperando um clique no formulário
    selectedName: null, // nome do componente aberto no Inspetor de Objetos
    selectedNames: new Set(), // conjunto de componentes selecionados (multi-seleção)
    watchers: new Map(),
    seen: new Map(),   // último valor desenhado de cada widget vigiado
    outputViews: [],   // áreas de output vivas, repintadas a cada `executed`
    ro: null,
    pending: false,
    lastTick: 0,
    /**
     * Agenda uma conferência de tamanho com estrangulamento para evitar loops.
     */
    schedule(force) {
      const now = performance.now();
      if (!force && (state.pending || now - state.lastTick < TICK_MS)) return;
      state.lastTick = now;
      state.pending = true;
      requestAnimationFrame(() => {
        state.pending = false;
        hideNative(node);
        resize(node, host);
      });
    },
    /** Repinta o cartão inteiro a partir do layout atual. */
    refresh() {
      // Rede de segurança do Undo: toda mudança de layout termina num
      // refresh, então se o layout mudou desde o último desenho e ninguém
      // gravou snapshot, grava aqui o estado anterior. Um `pushUndo` explícito
      // antes da mudança grava o MESMO snapshot, que o topo da pilha descarta.
      const before = JSON.stringify(node.properties?.[PROP] || {});
      if (node.__legoSkipHistory) {
        node.__legoSkipHistory = false;
      } else if (node.__legoLastSnap && before !== node.__legoLastSnap) {
        pushUndoSnapshot(node, node.__legoLastSnap);
      }
      state.watchers.clear();
      state.seen.clear();
      state.outputViews = [];
      host.replaceChildren(buildCard(node, state));
      paintRun(node);
      renderAlignBars(node, state);
      // Depois do desenho: o `buildControl` normaliza x/y/w/h e nomes.
      node.__legoLastSnap = JSON.stringify(node.properties?.[PROP] || {});
      hideNative(node);
      state.ro?.disconnect();
      if (host.firstElementChild) {
        lastObservedH = Math.ceil(host.firstElementChild.offsetHeight || 0);
        state.ro?.observe(host.firstElementChild);
      }
      queueMicrotask(() => resize(node, host));
    },
    /** Mantém o controle em dia quando o widget muda por onOutside do cartão. */
    watch(w, fn) {
      if (!w.__legoWrapped) {
        const orig = w.callback;
        w.__legoWrapped = true;
        // O wrapper é instalado uma vez por widget, mas o widget pode estar
        // ligado a vários cartões (bind cruzado "6725/steps"): avisa todos os
        // cartões vivos, não só o que instalou o wrapper.
        w.callback = function (...args) {
          const r = orig?.apply(this, args);
          // O callback deste widget avisa os cartões dele — e, de quebra,
          // pega o que o callback ORIGINAL mudou em outros widgets (o Toggle
          // All do AllmaBypasser grava `on_*` por atribuição direta).
          for (const n of ATTACHED) {
            const fns = n.__legoState?.watchers?.get(w);
            if (fns) fns.forEach((f) => { try { f(); } catch {} });
            n.__legoState?.seen?.set(w, w.value);
          }
          syncWatchedWidgets();
          return r;
        };
      }
      if (!state.watchers.has(w)) state.watchers.set(w, []);
      state.watchers.get(w).push(fn);
      state.seen.set(w, w.value);
      startWatchPoll();
    },
  };

  const widget = node.addDOMWidget(PROP, "SUPER_SUBGRAPH", host, {
    hideOnZoom: false,
    serialize: false,
  });
  widget.serialize = false;
  widget.__lego = true;
  widget.computeSize = () => {
    return [Math.max(MIN_W, node.size?.[0] || MIN_W), cardHeight(host) + PAD];
  };
  widget.computeLayoutSize = () => {
    hideNative(node);
    // Não agendar redimensionamento aqui para evitar loop infinito com LiteGraph
    return { minWidth: MIN_W, minHeight: Math.max(160, cardHeight(host)) };
  };
  widget.onRemove = () => {
    ATTACHED.delete(node);
    state.ro?.disconnect();
    showNative(node);
    delete node.__legoState;
    delete node.__legoHost;
  };

  // Observa APENAS o elemento filho (o cartão), nunca o host que muda de tamanho com o nó
  state.ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const h = Math.ceil(entry.contentRect?.height || 0);
      if (h > 0 && Math.abs(h - lastObservedH) >= 8) {
        lastObservedH = h;
        state.schedule(false);
      }
    }
  });

  ATTACHED.add(node);
  startSweep();

  node.__legoState = state;
  node.__legoWidget = widget;
  state.refresh();
  return state;
}

/* ══════════════════════════════════════════════════════════════════════════
   Super Subgraph independente — motor próprio

   O nó "SuperSubgraph" (Python, super_subgraph_node.py) desdobra o grafo de
   dentro na execução. Aqui no frontend esse grafo de dentro é um LGraph
   próprio, fora do canvas, guardado em `properties.ss_inner.graph`:

   - os nós de dentro são nós de verdade (widgets vivos), então o cartão liga
     neles do mesmo jeito que liga em qualquer nó ("<id>/<widget>");
   - na hora de enfileirar, o widget oculto `ss_graph` vira o JSON da API do
     grafo de dentro, gerado pelo próprio `app.graphToPrompt` (bypass, mute,
     reroute e primitive funcionam como em qualquer grafo);
   - as entradas/saídas do nó são in_N/out_N genéricas; `ss_inner.inputs`
     diz para quais entradas de dentro cada in_N vai, e `ss_inner.outputs`
     de qual saída de dentro cada out_N vem.
   ══════════════════════════════════════════════════════════════════════════ */

const SS_TYPE = "SuperSubgraph";
const SS_PROP = "ss_inner";
const SS_MAX_IO = 32;

const isSuperNode = (n) => !!n && (n.type === SS_TYPE || n.comfyClass === SS_TYPE);
const liteGraph = () => window.LiteGraph || globalThis.LiteGraph;

function newInnerGraph(data) {
  const Cls = liteGraph()?.LGraph || app.rootGraph?.constructor || app.graph?.constructor;
  const g = new Cls();
  if (data) g.configure(data);
  return g;
}

/** O LGraph de dentro de um Super Subgraph (criado sob demanda a partir das propriedades). */
function ssInnerGraph(node) {
  if (!isSuperNode(node)) return null;
  if (node.__ssGraph) return node.__ssGraph;
  const data = node.properties?.[SS_PROP]?.graph;
  if (!data) return null;
  try {
    node.__ssGraph = newInnerGraph(JSON.parse(JSON.stringify(data)));
  } catch (e) {
    console.error(LOG, "could not load the inner graph of", node.id, e);
    return null;
  }
  return node.__ssGraph;
}

/** Nós de dentro do host: do Super Subgraph ou do subgrafo nativo. */
function innerNodesOf(host) {
  const g = ssInnerGraph(host);
  if (g) return g._nodes || g.nodes || [];
  return host?.subgraph?._nodes || host?.subgraph?.nodes || [];
}
const hasInnerGraph = (host) => !!(ssInnerGraph(host) || host?.subgraph);

function graphLinks(graph) {
  const l = graph?.links ?? graph?._links;
  if (!l) return [];
  return l instanceof Map ? [...l.values()] : Object.values(l);
}

/** JSON da API do grafo de dentro, no formato que o nó Python espera. */
async function buildSuperApi(node) {
  const g = ssInnerGraph(node);
  const meta = node.properties?.[SS_PROP] || {};
  if (!g) return { nodes: {}, inputs: [], outputs: [] };
  const { output } = await app.graphToPrompt(g);
  return {
    nodes: output,
    inputs: (meta.inputs || []).map((i) => i.targets || []),
    outputs: (meta.outputs || []).map((o) => o.source || null),
  };
}

/** Prepara um nó SuperSubgraph recém-criado: widget interno oculto e serialização. */
function setupSuperNode(node) {
  if (!isSuperNode(node) || node.__ssReady) return;
  node.__ssReady = true;
  const w = (node.widgets || []).find((x) => x.name === "ss_graph");
  if (w) {
    w.__ssInternal = true;
    w.hidden = true;
    // No workflow fica vazio (o grafo já vai em properties); para a API, o
    // grafo de dentro é gerado na hora de enfileirar.
    w.value = "";
    w.serializeValue = async () => JSON.stringify(await buildSuperApi(node));
    // O ComfyUI aplica o "control after generate" (seed +1, aleatória...)
    // só nos widgets dos nós do grafo que ele enfileira; os de dentro de um
    // Super Subgraph ficavam parados. Este widget repassa para eles
    // (e um Super Subgraph de dentro repassa adiante).
    const passQueued = (cb) => (opts) => {
      for (const n of innerNodesOf(node)) {
        if (n.mode === 2 || n.mode === 4) continue;   // mudo / bypass
        for (const iw of n.widgets || []) {
          try { iw?.[cb]?.(opts); } catch (e) { console.warn(LOG, cb, "failed on inner", n.id, e); }
        }
      }
    };
    w.beforeQueued = passQueued("beforeQueued");
    w.afterQueued = passQueued("afterQueued");
  }
}

/** Mostra só as entradas/saídas em uso, com o nome e o tipo de verdade. */
function applySuperSlots(node) {
  const meta = node.properties?.[SS_PROP];
  if (!meta) return;
  const nIn = (meta.inputs || []).length;
  const nOut = (meta.outputs || []).length;
  for (let i = (node.inputs || []).length - 1; i >= 0; i--) {
    const m = /^in_(\d+)$/.exec(node.inputs[i].name);
    if (m && Number(m[1]) > nIn && node.inputs[i].link == null) node.removeInput(i);
  }
  meta.inputs.forEach((inp, k) => {
    const slot = (node.inputs || []).find((s) => s.name === `in_${k + 1}`);
    if (slot) { slot.label = inp.name; slot.localized_name = inp.name; if (inp.type) slot.type = inp.type; }
  });
  while ((node.outputs || []).length > nOut) {
    const last = node.outputs.length - 1;
    if (node.outputs[last].links?.length) break;
    node.removeOutput(last);
  }
  meta.outputs.forEach((out, j) => {
    const slot = node.outputs?.[j];
    if (slot) { slot.label = out.name; slot.localized_name = out.name; if (out.type) slot.type = out.type; }
  });
}

/**
 * Layout de um Super Subgraph recém-compactado: VAZIO. Nada é promovido
 * sozinho — o que aparece no cartão é escolha de quem monta.
 */
function emptySuperLayout(node) {
  node.properties[PROP] = {
    schema: SCHEMA,
    title: (node.title || "Super Subgraph").toUpperCase(),
    subtitle: "Super Subgraph",
    badge: `${innerNodesOf(node).length} nodes`,
    activeTab: 0,
    tabs: [{ name: "Controls", sections: [{ header: "PARAMETERS", controls: [] }] }],
  };
  return node.properties[PROP];
}

/**
 * Layout automático (só sob pedido, em "Recreate Layout from Widgets"):
 * cada nó de dentro com parâmetros vira um widget "nó inteiro".
 */
function superAutoLayout(node) {
  const base = autoLayout(node);   // cabeçalho e aba Output (se houver Preview/Save dentro)
  node.properties[PROP] = { ...base, tabs: [] };
  const controls = [];
  const zone = { header: "PARAMETERS", controls };
  node.properties[PROP].tabs.push({ name: "Controls", sections: [zone] });
  let y = 16;
  for (const inner of innerNodesOf(node)) {
    if (!(inner.widgets || []).some(usable)) continue;
    const g = buildWholeNodeCtrl(node, inner, "row", { x: 16, y });
    controls.push(g);
    y += g.h + 32;
  }
  for (const t of base.tabs || []) if (t.name === "Output") node.properties[PROP].tabs.push(t);
  node.properties[PROP].subtitle = "Super Subgraph";
  node.properties[PROP].badge = `${innerNodesOf(node).length} nodes`;
  return node.properties[PROP];
}

/** Seleção atual do canvas (só nós). */
function selectedNodes() {
  const c = app.canvas;
  const sel = c?.selectedItems ? [...c.selectedItems] : Object.values(c?.selected_nodes || {});
  const Node = liteGraph()?.LGraphNode;
  return sel.filter((n) => (Node ? n instanceof Node : n && n.pos && n.type));
}

/**
 * Converte a seleção num Super Subgraph: os nós saem do grafo e passam a
 * viver dentro do nó novo; os fios que cruzavam a borda viram entradas e
 * saídas dele, religados do lado de fora.
 */
function convertSelectionToSuper(nodes = selectedNodes()) {
  const graph = app.canvas?.graph || app.graph;
  nodes = nodes.filter((n) => n.graph === graph);
  if (!nodes.length) { showLegoToast("Select the nodes to convert first"); return null; }
  if (nodes.some((n) => typeof n.isSubgraphNode === "function" && n.isSubgraphNode())) {
    alert("Super Subgraph: native subgraph nodes can't go inside a Super Subgraph yet. Unpack them first.");
    return null;
  }
  const LG = liteGraph();
  const sel = new Set(nodes.map((n) => String(n.id)));
  const links = graphLinks(graph);
  const internal = [], incoming = [], outgoing = [];
  for (const l of links) {
    const o = sel.has(String(l.origin_id)), t = sel.has(String(l.target_id));
    if (o && t) internal.push(l);
    else if (t) incoming.push(l);
    else if (o) outgoing.push(l);
  }

  // Entradas: um fio de fora que alimenta várias entradas de dentro vira UMA entrada.
  const inputs = [];
  const inByKey = new Map();
  for (const l of incoming) {
    const key = `${l.origin_id}:${l.origin_slot}`;
    const tNode = graph.getNodeById(l.target_id);
    const tIn = tNode?.inputs?.[l.target_slot];
    if (!tIn) continue;
    let io = inByKey.get(key);
    if (!io) {
      io = { name: tIn.label || tIn.localized_name || tIn.name, type: l.type || tIn.type, targets: [], ext: [l.origin_id, l.origin_slot] };
      inByKey.set(key, io);
      inputs.push(io);
    }
    io.targets.push([String(l.target_id), tIn.name]);
  }
  // Saídas: uma saída de dentro usada fora vira UMA saída, religada a todos os destinos.
  const outputs = [];
  const outByKey = new Map();
  for (const l of outgoing) {
    const key = `${l.origin_id}:${l.origin_slot}`;
    const oNode = graph.getNodeById(l.origin_id);
    const oOut = oNode?.outputs?.[l.origin_slot];
    let io = outByKey.get(key);
    if (!io) {
      io = { name: oOut?.label || oOut?.localized_name || oOut?.name || String(l.type), type: l.type || oOut?.type, source: [String(l.origin_id), Number(l.origin_slot)], ext: [] };
      outByKey.set(key, io);
      outputs.push(io);
    }
    io.ext.push([l.target_id, l.target_slot]);
  }
  if (inputs.length > SS_MAX_IO || outputs.length > SS_MAX_IO) {
    alert(`Super Subgraph: at most ${SS_MAX_IO} inputs and ${SS_MAX_IO} outputs crossing the selection (found ${inputs.length} / ${outputs.length}).`);
    return null;
  }

  // Grafo de dentro: os nós como estão, só com os fios internos.
  const internalIds = new Set(internal.map((l) => l.id));
  const sNodes = nodes.map((n) => {
    const d = JSON.parse(JSON.stringify(n.serialize()));
    for (const i of d.inputs || []) if (i.link != null && !internalIds.has(i.link)) i.link = null;
    for (const o of d.outputs || []) if (Array.isArray(o.links)) o.links = o.links.filter((id) => internalIds.has(id));
    return d;
  });
  const data = {
    last_node_id: Math.max(0, ...nodes.map((n) => Number(n.id) || 0)),
    last_link_id: Math.max(0, ...internal.map((l) => Number(l.id) || 0)),
    nodes: sNodes,
    links: internal.map((l) => [l.id, l.origin_id, l.origin_slot, l.target_id, l.target_slot, l.type]),
    groups: [],
    config: {},
    extra: {},
    version: 0.4,
  };
  const inner = newInnerGraph(data);

  const minX = Math.min(...nodes.map((n) => n.pos[0]));
  const minY = Math.min(...nodes.map((n) => n.pos[1]));

  graph.beforeChange?.();
  for (const n of nodes) graph.remove(n);

  const sn = LG.createNode(SS_TYPE);
  if (!sn) {
    alert("Super Subgraph: the SuperSubgraph node is not registered. Restart ComfyUI after updating the extension.");
    return null;
  }
  sn.pos = [minX, minY];
  graph.add(sn);
  // Nasce largo o bastante para os widgets de "nó inteiro" caberem em linha.
  sn.setSize?.([Math.max(MIN_W + 160, sn.size?.[0] || 0), Math.max(sn.size?.[1] || 0, 200)]);
  sn.title = "Super Subgraph";
  sn.properties = sn.properties || {};
  sn.properties[SS_PROP] = {
    graph: inner.serialize(),
    inputs: inputs.map(({ name, type, targets }) => ({ name, type, targets })),
    outputs: outputs.map(({ name, type, source }) => ({ name, type, source })),
  };
  sn.__ssGraph = inner;
  setupSuperNode(sn);
  applySuperSlots(sn);

  inputs.forEach((io, k) => {
    const origin = graph.getNodeById(io.ext[0]);
    const slot = (sn.inputs || []).findIndex((s) => s.name === `in_${k + 1}`);
    if (origin && slot >= 0) origin.connect(io.ext[1], sn, slot);
  });
  outputs.forEach((io, j) => {
    for (const [tid, tslot] of io.ext) {
      const target = graph.getNodeById(tid);
      if (target) sn.connect(j, target, tslot);
    }
  });

  emptySuperLayout(sn);
  attach(sn);
  graph.afterChange?.();
  app.canvas?.selectItems?.([sn]);
  graph.setDirtyCanvas?.(true, true);
  showLegoToast(`Super Subgraph created with ${nodes.length} node${nodes.length > 1 ? "s" : ""}`);
  return sn;
}

const isNativeSubgraphNode = (n) => !!n?.subgraph && typeof n.isSubgraphNode === "function" && n.isSubgraphNode();

/** Troca os ids de nó nos binds ("<id>/<widget>") e fontes de output de um layout. */
function remapLayoutIds(layout, idMap, hostBinds = new Map()) {
  const mapId = (id) => (idMap.has(String(id)) ? String(idMap.get(String(id))) : null);
  const mapBind = (b) => {
    if (typeof b !== "string" || !b) return b;
    const slash = b.indexOf("/");
    if (slash < 0) return hostBinds.get(b) || b;   // widget promovido do nó nativo
    const id = mapId(b.slice(0, slash));
    return id ? `${id}${b.slice(slash)}` : b;
  };
  const fix = (c) => {
    if (!c || typeof c !== "object") return;
    if ("bind" in c) c.bind = mapBind(c.bind);
    if (c.source != null && mapId(c.source)) c.source = mapId(c.source);
    for (const it of c.items || []) fix(it);
  };
  for (const t of layout?.tabs || []) {
    for (const sec of t.sections || []) {
      for (const c of sec.controls || []) fix(c);
      for (const st of sec.tabs || []) for (const c of st.controls || []) fix(c);
    }
  }
  return layout;
}

/**
 * Subgrafo nativo -> Super Subgraph: desfaz o nativo (o próprio ComfyUI
 * religa tudo por fora) e compacta os mesmos nós no motor próprio. O cartão
 * do nativo, se houver, vem junto com os binds apontando para os ids novos.
 */
function convertNativeToSuper(node) {
  const graph = node?.graph;
  const canvas = app.canvas;
  if (!isNativeSubgraphNode(node) || !graph) return null;
  if (canvas?.graph !== graph) { alert("Open the graph that contains this subgraph first."); return null; }
  const innerNodes = [...(node.subgraph.nodes || node.subgraph._nodes || [])];
  if (!innerNodes.length) { showLegoToast("This subgraph is empty"); return null; }
  if (innerNodes.some(isNativeSubgraphNode)) {
    alert("Super Subgraph: this subgraph has native subgraphs inside. Convert or unpack those first.");
    return null;
  }
  if (typeof graph.unpackSubgraph !== "function") {
    alert("Super Subgraph: this ComfyUI version can't unpack subgraphs.");
    return null;
  }
  const oldIds = innerNodes.map((n) => String(n.id));
  const title = node.title;
  const layout = node.properties?.[PROP] ? JSON.parse(JSON.stringify(node.properties[PROP])) : null;
  // Widgets promovidos do nativo ("proxyWidgets": [[id, nome], ...]) viram "<id>/<nome>".
  const proxies = Array.isArray(node.properties?.proxyWidgets) ? node.properties.proxyWidgets : [];
  const before = new Set((graph._nodes || graph.nodes || []).map((n) => n));

  if (!graph.unpackSubgraph(node)) { alert("Super Subgraph: ComfyUI could not unpack this subgraph."); return null; }
  // Os nós novos entram na mesma ordem dos de dentro.
  const fresh = (graph._nodes || graph.nodes || []).filter((n) => !before.has(n));
  const idMap = new Map();
  if (fresh.length === oldIds.length) oldIds.forEach((id, i) => idMap.set(id, fresh[i].id));

  const sn = convertSelectionToSuper(fresh);
  if (!sn) return null;
  if (title) sn.title = title;
  if (layout) {
    const hostBinds = new Map();
    for (const [id, name] of proxies) {
      const nid = idMap.get(String(id));
      if (nid != null && typeof name === "string") hostBinds.set(name, `${nid}/${name}`);
    }
    sn.properties[PROP] = remapLayoutIds(layout, idMap, hostBinds);
    sn.__legoState?.refresh();
  }
  showLegoToast("Subgraph converted to Super Subgraph");
  return sn;
}

/* ── Exportar, importar e biblioteca ──────────────────────────────────────
 * Um Super Subgraph vira um pacote JSON (grafo de dentro + cartão + borda)
 * que pode ir para um arquivo ou para a biblioteca do usuário (userdata do
 * ComfyUI, em "supersubgraph/"), e voltar como um nó novo em qualquer workflow.
 */
const SS_PKG_TYPE = "ComfyUI-SuperSubgraph";
const SS_LIB_DIR = "supersubgraph";
let SS_LIBRARY = [];   // nomes (sem .json), atualizados em refreshSuperLibrary()

function superPackage(sn) {
  const d = sn.serialize();
  return {
    type: SS_PKG_TYPE,
    version: 1,
    title: sn.title,
    size: [...(sn.size || [])],
    color: sn.color, bgcolor: sn.bgcolor,
    properties: JSON.parse(JSON.stringify({ [SS_PROP]: d.properties?.[SS_PROP], [PROP]: d.properties?.[PROP] })),
  };
}

function isSuperPackage(pkg) {
  return !!pkg && pkg.type === SS_PKG_TYPE && !!pkg.properties?.[SS_PROP]?.graph;
}

/** Posição do último clique no canvas (ou o centro da vista). */
function canvasDropPos() {
  const c = app.canvas;
  const m = c?.graph_mouse;
  if (m && Number.isFinite(m[0])) return [m[0], m[1]];
  const ds = c?.ds;
  const el0 = c?.canvas;
  if (!ds || !el0) return [0, 0];
  return [el0.clientWidth / 2 / ds.scale - ds.offset[0], el0.clientHeight / 2 / ds.scale - ds.offset[1]];
}

function createSuperFromPackage(pkg, pos = canvasDropPos()) {
  if (!isSuperPackage(pkg)) { alert("Super Subgraph: this file is not a SuperSubgraph export."); return null; }
  const graph = app.canvas?.graph || app.graph;
  const sn = liteGraph()?.createNode(SS_TYPE);
  if (!sn) { alert("Super Subgraph: the SuperSubgraph node is not registered. Restart ComfyUI after updating the extension."); return null; }
  sn.pos = [pos[0], pos[1]];
  sn.properties = sn.properties || {};
  const props = JSON.parse(JSON.stringify(pkg.properties));
  sn.properties[SS_PROP] = props[SS_PROP];
  if (props[PROP]) sn.properties[PROP] = props[PROP];
  graph.beforeChange?.();
  graph.add(sn);
  if (pkg.title) sn.title = pkg.title;
  if (pkg.color) sn.color = pkg.color;
  if (pkg.bgcolor) sn.bgcolor = pkg.bgcolor;
  sn.__ssGraph = null;
  setupSuperNode(sn);
  applySuperSlots(sn);
  if (!sn.properties[PROP]) emptySuperLayout(sn);
  if (Array.isArray(pkg.size) && pkg.size.length === 2) sn.setSize?.(pkg.size);
  if (!sn.__legoState) attach(sn); else sn.__legoState.refresh();
  graph.afterChange?.();
  app.canvas?.selectItems?.([sn]);
  graph.setDirtyCanvas?.(true, true);
  return sn;
}

const safeFileName = (s) => String(s || "SuperSubgraph").replace(/[\\/:*?"<>|]+/g, "_").trim().slice(0, 80) || "SuperSubgraph";

function exportSuperToFile(sn) {
  const blob = new Blob([JSON.stringify(superPackage(sn), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safeFileName(sn.title)}.supersubgraph.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importSuperFromFile(pos = canvasDropPos()) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const sn = createSuperFromPackage(JSON.parse(await f.text()), pos);
      if (sn) showLegoToast(`Imported "${sn.title}"`);
    } catch (e) {
      alert(`Super Subgraph: could not read this file (${e.message}).`);
    }
  });
  input.click();
}

async function refreshSuperLibrary() {
  try {
    const list = await api.listUserDataFullInfo?.(SS_LIB_DIR);
    SS_LIBRARY = (list || []).map((f) => String(f.path || "")).filter((p) => p.endsWith(".json") && !p.includes("/")).map((p) => p.slice(0, -5)).sort((a, b) => a.localeCompare(b));
  } catch {
    SS_LIBRARY = [];
  }
  return SS_LIBRARY;
}

async function saveSuperToLibrary(sn) {
  const name = prompt("Save to the SuperSubgraph library as:", sn.title || "SuperSubgraph");
  if (name == null || !name.trim()) return false;
  const file = safeFileName(name);
  if (SS_LIBRARY.includes(file) && !confirm(`"${file}" is already in the library. Replace it?`)) return false;
  const pkg = superPackage(sn);
  pkg.title = name.trim();
  try {
    await api.storeUserData(`${SS_LIB_DIR}/${file}.json`, pkg, { overwrite: true, stringify: true, throwOnError: true });
  } catch (e) {
    alert(`Super Subgraph: could not save to the library (${e.message}).`);
    return false;
  }
  await refreshSuperLibrary();
  showLegoToast(`Saved "${file}" to the library`);
  return true;
}

async function addSuperFromLibrary(name, pos = canvasDropPos()) {
  try {
    const res = await api.getUserData(`${SS_LIB_DIR}/${name}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return createSuperFromPackage(await res.json(), pos);
  } catch (e) {
    alert(`Super Subgraph: could not load "${name}" (${e.message}).`);
    return null;
  }
}

async function deleteSuperFromLibrary(name) {
  if (!confirm(`Delete "${name}" from the SuperSubgraph library?`)) return;
  try { await api.deleteUserData(`${SS_LIB_DIR}/${name}.json`); } catch (e) { alert(`Could not delete (${e.message}).`); }
  await refreshSuperLibrary();
}

/* ── Layouts do cartão: salvar e carregar ──────────────────────────────────
 * Só o cartão (abas, zonas, componentes), sem os nós. Fica na biblioteca do
 * usuário (userdata "supersubgraph/layouts/") ou num arquivo .sslayout.json.
 * Os binds apontam para ids de nós; ao aplicar num nó onde o id não bate
 * com o mesmo tipo de nó, ele é religado ao nó de mesmo tipo (e, se houver,
 * mesmo título) — assim um layout serve para outro Super Subgraph parecido.
 */
const SS_LAYOUT_TYPE = "ComfyUI-SuperSubgraph-Layout";
const SS_LAYOUT_DIR = `${SS_LIB_DIR}/layouts`;
let SS_LAYOUTS = [];

/** Ids de nó usados pelos binds/fontes do layout. */
function layoutNodeIds(layout) {
  const ids = new Set();
  walkControls(layout, (c) => {
    if (typeof c.bind === "string" && c.bind.includes("/")) ids.add(c.bind.slice(0, c.bind.indexOf("/")));
    if (c.source != null && c.source !== "") ids.add(String(c.source));
  });
  return ids;
}

function layoutPackage(host, name) {
  const layout = JSON.parse(JSON.stringify(host.properties[PROP] || {}));
  const nodes = {};
  for (const id of layoutNodeIds(layout)) {
    const n = findNodeInHostScope(host, id);
    if (n) nodes[id] = { type: n.type, title: n.title };
  }
  return { type: SS_LAYOUT_TYPE, version: 1, name, layout, nodes };
}

/** Aplica um pacote de layout em `host`, religando binds por tipo de nó quando preciso. */
function applyLayoutPackage(host, pkg) {
  if (pkg?.type !== SS_LAYOUT_TYPE || !pkg.layout?.tabs) { alert("Super Subgraph: this file is not a card layout."); return false; }
  const layout = JSON.parse(JSON.stringify(pkg.layout));
  const candidates = hasInnerGraph(host) ? innerNodesOf(host) : (host.graph?._nodes || host.graph?.nodes || []);
  const used = new Set();
  const idMap = new Map();
  let lost = 0;
  for (const [id, info] of Object.entries(pkg.nodes || {})) {
    const same = findNodeInHostScope(host, id);
    if (same && same.type === info.type) { used.add(same); continue; }
    const pool = candidates.filter((n) => n.type === info.type && !used.has(n));
    const pick = pool.find((n) => n.title === info.title) || pool[0];
    if (pick) { idMap.set(String(id), pick.id); used.add(pick); } else lost++;
  }
  pushUndo(host);
  host.properties[PROP] = idMap.size ? remapLayoutIds(layout, idMap) : layout;
  const st = host.__legoState || attach(host);
  st.selectedNames?.clear();
  st.selectedName = null;
  st.refresh();
  showLegoToast(lost ? `Layout loaded — ${lost} node${lost > 1 ? "s" : ""} not found (use Rebind)` : "Layout loaded");
  return true;
}

async function refreshLayoutLibrary() {
  try {
    const list = await api.listUserDataFullInfo?.(SS_LAYOUT_DIR);
    SS_LAYOUTS = (list || []).map((f) => String(f.path || "")).filter((p) => p.endsWith(".json") && !p.includes("/")).map((p) => p.slice(0, -5)).sort((a, b) => a.localeCompare(b));
  } catch {
    SS_LAYOUTS = [];
  }
  return SS_LAYOUTS;
}

async function saveLayoutToLibrary(host) {
  const name = prompt("Save this card layout as:", host.properties?.[PROP]?.title || host.title || "Layout");
  if (name == null || !name.trim()) return false;
  const file = safeFileName(name);
  if (SS_LAYOUTS.includes(file) && !confirm(`Layout "${file}" already exists. Replace it?`)) return false;
  try {
    await api.storeUserData(`${SS_LAYOUT_DIR}/${file}.json`, layoutPackage(host, name.trim()), { overwrite: true, stringify: true, throwOnError: true });
  } catch (e) {
    alert(`Super Subgraph: could not save the layout (${e.message}).`);
    return false;
  }
  await refreshLayoutLibrary();
  showLegoToast(`Layout "${file}" saved`);
  return true;
}

async function loadLayoutFromLibrary(host, name) {
  try {
    const res = await api.getUserData(`${SS_LAYOUT_DIR}/${name}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return applyLayoutPackage(host, await res.json());
  } catch (e) {
    alert(`Super Subgraph: could not load layout "${name}" (${e.message}).`);
    return false;
  }
}

async function deleteLayoutFromLibrary(name) {
  if (!confirm(`Delete layout "${name}"?`)) return;
  try { await api.deleteUserData(`${SS_LAYOUT_DIR}/${name}.json`); } catch (e) { alert(`Could not delete (${e.message}).`); }
  await refreshLayoutLibrary();
}

function exportLayoutToFile(host) {
  const name = host.properties?.[PROP]?.title || host.title || "Layout";
  const blob = new Blob([JSON.stringify(layoutPackage(host, name), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safeFileName(name)}.sslayout.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importLayoutFromFile(host) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", async () => {
    const f = input.files?.[0];
    if (!f) return;
    try { applyLayoutPackage(host, JSON.parse(await f.text())); } catch (e) { alert(`Super Subgraph: could not read this file (${e.message}).`); }
  });
  input.click();
}

/** Submenu "Card Layout" de um nó com cartão. */
function layoutMenuItems(node) {
  refreshLayoutLibrary();   // para a próxima abertura do menu
  const items = [
    { content: "Save Layout…", callback: () => saveLayoutToLibrary(node) },
  ];
  if (SS_LAYOUTS.length) {
    items.push({ content: "Load Layout", has_submenu: true, submenu: { options: SS_LAYOUTS.map((name) => ({ content: name, callback: () => loadLayoutFromLibrary(node, name) })) } });
  }
  items.push(
    { content: "Export Layout to File…", callback: () => exportLayoutToFile(node) },
    { content: "Import Layout from File…", callback: () => importLayoutFromFile(node) },
    null,
    {
      content: "Recreate Layout from Widgets",
      callback: () => {
        const keepEdit = node.__legoState?.edit;
        pushUndo(node);
        node.properties[PROP] = isSuperNode(node) ? superAutoLayout(node) : autoLayout(node);
        if (node.__legoState) { node.__legoState.edit = !!keepEdit; node.__legoState.refresh(); }
        else attach(node);
      },
    },
  );
  if (SS_LAYOUTS.length) {
    items.push({ content: "Delete Saved Layout", has_submenu: true, submenu: { options: SS_LAYOUTS.map((name) => ({ content: name, callback: () => deleteLayoutFromLibrary(name) })) } });
  }
  if (!isSuperNode(node)) items.push(null, { content: "Remove Card UI", callback: () => detach(node) });
  return items;
}

/** Desfaz o Super Subgraph: os nós de dentro voltam ao grafo, religados. */
function unpackSuper(sn) {
  const graph = sn?.graph;
  const inner = ssInnerGraph(sn);
  const canvas = app.canvas;
  if (!graph || !inner || !canvas) return;
  if (canvas.graph !== graph) { alert("Open the graph that contains this Super Subgraph first."); return; }
  const meta = sn.properties?.[SS_PROP] || {};

  // O que está ligado no nó por fora, antes de removê-lo.
  const inLinks = (meta.inputs || []).map((_, k) => {
    const slot = (sn.inputs || []).find((s) => s.name === `in_${k + 1}`);
    const l = slot?.link != null ? graph.links?.get?.(slot.link) ?? graph.links?.[slot.link] : null;
    return l ? [l.origin_id, l.origin_slot] : null;
  });
  const outLinks = (meta.outputs || []).map((_, j) => (sn.outputs?.[j]?.links || []).map((id) => {
    const l = graph.links?.get?.(id) ?? graph.links?.[id];
    return l ? [l.target_id, l.target_slot] : null;
  }).filter(Boolean));

  // Cola os nós de dentro (com os fios internos) onde o Super Subgraph estava.
  const innerNodes = innerNodesOf(sn);
  const items = {
    nodes: innerNodes.map((n) => { const d = JSON.parse(JSON.stringify(n.serialize())); return d; }),
    links: graphLinks(inner).map((l) => (l.asSerialisable ? l.asSerialisable() : {
      id: l.id, origin_id: l.origin_id, origin_slot: l.origin_slot, target_id: l.target_id, target_slot: l.target_slot, type: l.type,
    })),
    groups: [], reroutes: [], subgraphs: [],
  };
  const pos = [sn.pos[0], sn.pos[1]];
  graph.beforeChange?.();
  const res = canvas._deserializeItems(items, { position: pos });
  const map = res?.nodes || new Map();
  const byOld = (id) => map.get(id) || map.get(String(id)) || map.get(Number(id));

  (meta.inputs || []).forEach((io, k) => {
    const src = inLinks[k];
    const origin = src ? graph.getNodeById(src[0]) : null;
    if (!origin) return;
    for (const [tid, name] of io.targets || []) {
      const t = byOld(tid);
      const slot = t?.inputs?.findIndex((s) => s.name === name);
      if (t && slot >= 0) origin.connect(src[1], t, slot);
    }
  });
  (meta.outputs || []).forEach((io, j) => {
    const s = io.source ? byOld(io.source[0]) : null;
    if (!s) return;
    for (const [tid, tslot] of outLinks[j] || []) {
      const t = graph.getNodeById(tid);
      if (t) s.connect(io.source[1], t, tslot);
    }
  });

  graph.remove(sn);
  graph.afterChange?.();
  graph.setDirtyCanvas?.(true, true);
  showLegoToast("Super Subgraph unpacked");
}

/* ── Entrar no Super Subgraph ─────────────────────────────────────────────
 * O canvas passa a mostrar o grafo de dentro (é o mesmo LGraph que executa,
 * então tudo o que se edita lá vale na próxima fila). Uma pilha guarda de
 * onde se veio — e a vista de lá — para voltar, inclusive de um Super
 * Subgraph dentro de outro.
 */
const SS_NAV = [];
let ssNavWatch = null;

function fitCanvasTo(graph) {
  const c = app.canvas;
  const nodes = graph?._nodes || graph?.nodes || [];
  if (!c?.ds || !nodes.length) return;
  const T = liteGraph()?.NODE_TITLE_HEIGHT || 30;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.pos[0]); y0 = Math.min(y0, n.pos[1] - T);
    x1 = Math.max(x1, n.pos[0] + (n.size?.[0] || 200)); y1 = Math.max(y1, n.pos[1] + (n.size?.[1] || 80));
  }
  const cw = c.canvas?.clientWidth || window.innerWidth;
  const ch = c.canvas?.clientHeight || window.innerHeight;
  const scale = Math.max(0.2, Math.min(1.2, Math.min((cw - 160) / (x1 - x0 || 1), (ch - 200) / (y1 - y0 || 1))));
  c.ds.scale = scale;
  c.ds.offset = [(cw / scale - (x1 - x0)) / 2 - x0, (ch / scale - (y1 - y0)) / 2 - y0 + 20 / scale];
}

function renderSuperNavBar() {
  document.querySelector(".lego-ss-nav")?.remove();
  if (!SS_NAV.length) return;
  const bar = el("div", "lego-ss-nav");
  const back = el("button", "lego-ss-nav-back");
  back.innerHTML = `${glyph("back", 14)}<span>Back</span><kbd class="lego-ss-nav-kbd">Esc</kbd>`;
  back.title = "Leave this SuperSubgraph (Esc)";
  back.addEventListener("click", (e) => { e.stopPropagation(); exitSuper(); });
  bar.append(back);
  const crumbs = el("div", "lego-ss-nav-crumbs");
  const root = el("button", "lego-ss-nav-crumb", "Workflow");
  root.title = "Back to the main workflow";
  root.addEventListener("click", (e) => { e.stopPropagation(); exitSuper(SS_NAV.length); });
  crumbs.append(root);
  SS_NAV.forEach((f, i) => {
    crumbs.append(el("span", "lego-ss-nav-sep", "\u203a"));
    const isLast = i === SS_NAV.length - 1;
    const b = el(isLast ? "span" : "button", `lego-ss-nav-crumb${isLast ? " current" : ""}`, f.host.title || "SuperSubgraph");
    if (!isLast) b.addEventListener("click", (e) => { e.stopPropagation(); exitSuper(SS_NAV.length - 1 - i); });
    crumbs.append(b);
  });
  bar.append(crumbs);
  const badge = el("span", "lego-ss-nav-badge", "SS");
  bar.prepend(badge);
  document.body.append(bar);
  placeSuperNavBar();
}

/**
 * A barra fica logo à direita do seletor nativo "Graph" (view-mode-toggle),
 * na mesma altura dele; sem ele, no canto superior esquerdo do canvas.
 */
function placeSuperNavBar() {
  const bar = document.querySelector(".lego-ss-nav");
  if (!bar) return;
  const anchor = document.querySelector('[data-testid="view-mode-toggle"]');
  const r = anchor?.getBoundingClientRect();
  if (r && r.width > 0) {
    bar.style.left = `${Math.round(r.right + 8)}px`;
    bar.style.top = `${Math.round(r.top + (r.height - bar.offsetHeight) / 2)}px`;
  } else {
    const c = app.canvas?.canvas?.getBoundingClientRect?.();
    bar.style.left = `${Math.round((c?.left || 60) + 12)}px`;
    bar.style.top = `${Math.round((c?.top || 40) + 10)}px`;
  }
}
window.addEventListener("resize", placeSuperNavBar);

// Esc sai do Super Subgraph — a não ser que esteja digitando ou com algum
// diálogo/picker aberto (aí o Esc é deles). Na captura: o ComfyUI consome o
// Esc no próprio atalho (sair do subgrafo nativo), que não conhece o nosso.
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.defaultPrevented || !SS_NAV.length) return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  const t = e.target;
  if (t?.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
  if (document.querySelector(".lego-comfy-backdrop, .lego-ins-backdrop, .lego-picker-hud, .p-dialog-mask, .litecontextmenu, .litegraph .dialog")) return;
  if (app.canvas?.graph !== SS_NAV[SS_NAV.length - 1].inner) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  exitSuper();
}, true);

/** Abre o grafo de dentro do Super Subgraph no canvas. */
function enterSuper(sn) {
  const c = app.canvas;
  const inner = ssInnerGraph(sn);
  if (!c || !inner || typeof c.setGraph !== "function") return;
  if (c.graph === inner) return;
  closeObjectInspector();
  SS_NAV.push({ host: sn, from: c.graph, inner, view: { offset: [...(c.ds?.offset || [0, 0])], scale: c.ds?.scale || 1 } });
  c.deselectAll?.();
  c.setGraph(inner);
  fitCanvasTo(inner);
  c.setDirty?.(true, true);
  renderSuperNavBar();
  watchSuperBoundary();
  // Se o workflow for trocado por fora (abrir outro, voltar pelo breadcrumb
  // nativo...), a pilha deixa de valer e a barra some.
  if (!ssNavWatch) {
    ssNavWatch = setInterval(() => {
      if (!SS_NAV.length) { clearInterval(ssNavWatch); ssNavWatch = null; return; }
      if (app.canvas?.graph !== SS_NAV[SS_NAV.length - 1].inner) {
        SS_NAV.length = 0;
        renderSuperNavBar();
        return;
      }
      placeSuperNavBar();   // acompanha o seletor "Graph" se ele mudar de lugar
    }, 500);
  }
}

/** Volta `levels` níveis (1 = sai do Super Subgraph atual). */
function exitSuper(levels = 1) {
  const c = app.canvas;
  let frame = null;
  for (let i = 0; i < levels && SS_NAV.length; i++) frame = SS_NAV.pop();
  if (!frame || !c) { renderSuperNavBar(); return; }
  c.deselectAll?.();
  c.setGraph(frame.from);
  if (c.ds) { c.ds.offset = frame.view.offset; c.ds.scale = frame.view.scale; }
  c.setDirty?.(true, true);
  renderSuperNavBar();
  // O de dentro pode ter mudado (nós novos, removidos): a borda e os cartões se refazem.
  for (const f of [frame, ...SS_NAV]) { pruneSuperBoundary(f.host); f.host.__legoState?.refresh(); }
}

/* ── Borda do Super Subgraph (entradas e saídas vistas de dentro) ─────────
 * Dentro do Super Subgraph, as entradas de dentro que recebem um fio de fora
 * (in_N) e as saídas que vão para fora (out_N) ganham uma etiqueta roxa. Pelo
 * menu do nó dá para expor/tirar entradas e saídas sem precisar desfazer.
 *
 * Regras: in_N são contíguas (in_1..in_n) e o Python acha o alvo pelo índice;
 * out_N idem, pela posição. Tirar uma do meio renomeia as seguintes.
 */

/** Frame do Super Subgraph aberto no canvas agora (ou null). */
function currentSuperFrame() {
  const top = SS_NAV[SS_NAV.length - 1];
  return top && app.canvas?.graph === top.inner ? top : null;
}

/** Host (o nó SuperSubgraph) cujo grafo de dentro contém `node`. */
function superHostOf(node) {
  const f = currentSuperFrame();
  return f && node?.graph === f.inner ? f.host : null;
}

/** Entradas/saídas de borda de um nó de dentro: [{ k, slot, name }] / [{ j, slot, name }]. */
function boundaryOf(host, node) {
  const meta = host.properties?.[SS_PROP] || {};
  const id = String(node.id);
  const ins = [], outs = [];
  (meta.inputs || []).forEach((io, k) => {
    for (const [tid, name] of io.targets || []) {
      if (String(tid) !== id) continue;
      const slot = (node.inputs || []).findIndex((s) => s.name === name);
      if (slot >= 0) ins.push({ k, slot, name: io.name || name });
    }
  });
  (meta.outputs || []).forEach((io, j) => {
    if (io.source && String(io.source[0]) === id) outs.push({ j, slot: Number(io.source[1]), name: io.name });
  });
  return { ins, outs };
}

/** Links de fora ligados no slot `in_N` do host. */
function hostInputIndex(host, k) {
  return (host.inputs || []).findIndex((s) => s.name === `in_${k + 1}`);
}

function afterBoundaryChange(host) {
  applySuperSlots(host);
  host.setSize?.(host.computeSize ? [Math.max(host.size[0], host.computeSize()[0]), host.size[1]] : host.size);
  host.graph?.setDirtyCanvas?.(true, true);
  app.canvas?.setDirty?.(true, true);
}

/** Expõe a entrada `inputName` do nó de dentro como uma nova in_N. */
function exposeSuperInput(host, node, inputName) {
  const meta = host.properties[SS_PROP];
  meta.inputs = meta.inputs || [];
  if (meta.inputs.length >= SS_MAX_IO) { showLegoToast(`At most ${SS_MAX_IO} inputs`); return; }
  const inp = (node.inputs || []).find((s) => s.name === inputName);
  if (!inp) return;
  const k = meta.inputs.length;
  meta.inputs.push({ name: inp.label || inp.localized_name || inp.name, type: inp.type, targets: [[String(node.id), inp.name]] });
  if (hostInputIndex(host, k) < 0) host.addInput(`in_${k + 1}`, "*");
  afterBoundaryChange(host);
  showLegoToast(`Input "${meta.inputs[k].name}" exposed`);
}

/** Tira a entrada `inputName` do nó de dentro da borda; in_N vazia sai e as seguintes renumeram. */
function unexposeSuperInput(host, node, inputName) {
  const meta = host.properties[SS_PROP];
  const id = String(node.id);
  const k = (meta.inputs || []).findIndex((io) => (io.targets || []).some(([t, n]) => String(t) === id && n === inputName));
  if (k < 0) return;
  const io = meta.inputs[k];
  io.targets = io.targets.filter(([t, n]) => !(String(t) === id && n === inputName));
  if (!io.targets.length) {
    meta.inputs.splice(k, 1);
    const idx = hostInputIndex(host, k);
    if (idx >= 0) host.removeInput(idx);   // desliga o fio de fora
    // Renumera: in_(k+2).. viram in_(k+1).., mantendo os fios.
    for (let m = k + 1; m <= meta.inputs.length; m++) {
      const slot = (host.inputs || []).find((s) => s.name === `in_${m + 1}`);
      if (slot) slot.name = `in_${m}`;
    }
  }
  afterBoundaryChange(host);
  showLegoToast(`Input "${io.name}" is no longer exposed`);
}

/** Expõe a saída `slot` do nó de dentro como uma nova out_N. */
function exposeSuperOutput(host, node, slot) {
  const meta = host.properties[SS_PROP];
  meta.outputs = meta.outputs || [];
  if (meta.outputs.length >= SS_MAX_IO) { showLegoToast(`At most ${SS_MAX_IO} outputs`); return; }
  const out = node.outputs?.[slot];
  if (!out) return;
  const j = meta.outputs.length;
  meta.outputs.push({ name: out.label || out.localized_name || out.name || String(out.type), type: out.type, source: [String(node.id), Number(slot)] });
  // As saídas do host acompanham meta.outputs pela posição.
  while ((host.outputs || []).length < j) host.addOutput(`out_${host.outputs.length + 1}`, "*");
  if ((host.outputs || []).length === j) host.addOutput(`out_${j + 1}`, "*");
  afterBoundaryChange(host);
  showLegoToast(`Output "${meta.outputs[j].name}" exposed`);
}

/** Tira a saída `slot` do nó de dentro da borda; as seguintes sobem uma posição. */
function unexposeSuperOutput(host, node, slot) {
  const meta = host.properties[SS_PROP];
  const id = String(node.id);
  const j = (meta.outputs || []).findIndex((io) => io.source && String(io.source[0]) === id && Number(io.source[1]) === Number(slot));
  if (j < 0) return;
  const [io] = meta.outputs.splice(j, 1);
  // removeOutput desliga os fios desta saída e desloca os das seguintes.
  if (host.outputs?.[j]) host.removeOutput(j);
  (host.outputs || []).forEach((o, i) => { if (/^out_\d+$/.test(o.name)) o.name = `out_${i + 1}`; });
  afterBoundaryChange(host);
  showLegoToast(`Output "${io.name}" is no longer exposed`);
}

/**
 * Nó de dentro apagado (ou entrada/saída que sumiu): a borda que apontava
 * para ele sai também, com a mesma renumeração do "Unexpose".
 */
function pruneSuperBoundary(host) {
  const inner = ssInnerGraph(host);
  const meta = host?.properties?.[SS_PROP];
  if (!inner || !meta) return;
  const nodeOf = (id) => inner.getNodeById?.(id) ?? inner.getNodeById?.(Number(id));
  let changed = false;
  for (let k = (meta.inputs || []).length - 1; k >= 0; k--) {
    const io = meta.inputs[k];
    const keep = (io.targets || []).filter(([id, name]) => (nodeOf(id)?.inputs || []).some((s) => s.name === name));
    if (keep.length === (io.targets || []).length) continue;
    changed = true;
    if (keep.length) { io.targets = keep; continue; }
    meta.inputs.splice(k, 1);
    const idx = hostInputIndex(host, k);
    if (idx >= 0) host.removeInput(idx);
    for (let m = k + 1; m <= meta.inputs.length; m++) {
      const slot = (host.inputs || []).find((s) => s.name === `in_${m + 1}`);
      if (slot) slot.name = `in_${m}`;
    }
  }
  for (let j = (meta.outputs || []).length - 1; j >= 0; j--) {
    const src = meta.outputs[j].source;
    if (src && nodeOf(src[0])?.outputs?.[Number(src[1])]) continue;
    changed = true;
    meta.outputs.splice(j, 1);
    if (host.outputs?.[j]) host.removeOutput(j);
  }
  if (!changed) return;
  (host.outputs || []).forEach((o, i) => { if (/^out_\d+$/.test(o.name)) o.name = `out_${i + 1}`; });
  afterBoundaryChange(host);
}

/** Itens do menu de um nó de dentro: expor/tirar entradas e saídas. */
function boundaryMenuItems(node) {
  const host = superHostOf(node);
  if (!host || !host.properties?.[SS_PROP]) return [];
  const b = boundaryOf(host, node);
  const exposedIn = new Set(b.ins.map((x) => (node.inputs || [])[x.slot]?.name));
  const exposedOut = new Set(b.outs.map((x) => x.slot));
  const label = (s) => s.label || s.localized_name || s.name;
  const sub = (list) => ({ options: list, title: undefined });
  const items = [];
  // Só entradas sem fio de dentro: um fio de fora e um de dentro na mesma entrada seria ambíguo.
  const canIn = (node.inputs || []).filter((s) => s.link == null && !exposedIn.has(s.name));
  if (canIn.length) items.push({
    content: "Expose Input", has_submenu: true,
    submenu: sub(canIn.map((s) => ({ content: `${label(s)}${s.widget ? " (widget)" : ""}`, callback: () => exposeSuperInput(host, node, s.name) }))),
  });
  if (b.ins.length) items.push({
    content: "Unexpose Input", has_submenu: true,
    submenu: sub(b.ins.map((x) => ({ content: `in_${x.k + 1}: ${x.name}`, callback: () => unexposeSuperInput(host, node, node.inputs[x.slot].name) }))),
  });
  const canOut = (node.outputs || []).map((s, i) => ({ s, i })).filter(({ i }) => !exposedOut.has(i));
  if (canOut.length) items.push({
    content: "Expose Output", has_submenu: true,
    submenu: sub(canOut.map(({ s, i }) => ({ content: label(s), callback: () => exposeSuperOutput(host, node, i) }))),
  });
  if (b.outs.length) items.push({
    content: "Unexpose Output", has_submenu: true,
    submenu: sub(b.outs.map((x) => ({ content: `out_${x.j + 1}: ${x.name}`, callback: () => unexposeSuperOutput(host, node, x.slot) }))),
  });
  return items;
}

/* Etiquetas da borda: desenhadas por cima do canvas enquanto se está dentro. */
let ssBoundaryRaf = 0;
function drawSuperBoundary() {
  ssBoundaryRaf = 0;
  let layer = document.querySelector(".lego-ss-boundary");
  const f = currentSuperFrame();
  if (!f) { layer?.remove(); return; }
  ssBoundaryRaf = requestAnimationFrame(drawSuperBoundary);
  if (!layer) { layer = el("div", "lego-ss-boundary"); document.body.append(layer); }
  const c = app.canvas;
  const ds = c?.ds;
  const cr = c?.canvas?.getBoundingClientRect?.();
  if (!ds || !cr) return;
  const tags = [];
  for (const node of f.inner._nodes || f.inner.nodes || []) {
    const b = boundaryOf(f.host, node);
    if (!b.ins.length && !b.outs.length) continue;
    const pos = (isIn, slot) => {
      let p = null;
      try { p = node.getConnectionPos?.(isIn, slot); } catch { p = null; }
      if (!p) p = [node.pos[0] + (isIn ? 0 : node.size[0]), node.pos[1] + 14 + slot * 20];
      if (node.flags?.collapsed) p = [node.pos[0] + (isIn ? 0 : (node._collapsed_width || 80)), node.pos[1] - 15];
      return [cr.left + (p[0] + ds.offset[0]) * ds.scale, cr.top + (p[1] + ds.offset[1]) * ds.scale];
    };
    for (const x of b.ins) tags.push({ cls: "in", xy: pos(true, x.slot), text: `in_${x.k + 1} →`, title: `Fed from outside: ${x.name}` });
    for (const x of b.outs) tags.push({ cls: "out", xy: pos(false, x.slot), text: `→ out_${x.j + 1}`, title: `Goes outside: ${x.name}` });
  }
  const key = tags.map((t) => `${t.cls}${t.text}${Math.round(t.xy[0])},${Math.round(t.xy[1])}`).join("|");
  if (layer.__key === key) return;
  layer.__key = key;
  layer.replaceChildren(...tags.map((t) => {
    const e = el("div", `lego-ss-io ${t.cls}`, t.text);
    e.title = t.title;
    e.style.left = `${Math.round(t.xy[0])}px`;
    e.style.top = `${Math.round(t.xy[1])}px`;
    return e;
  }));
}
function watchSuperBoundary() {
  if (!ssBoundaryRaf) ssBoundaryRaf = requestAnimationFrame(drawSuperBoundary);
}

/* ── Execução vista no cartão ────────────────────────────────────────────
 * Barra de progresso com o nó de dentro que está rodando, e o erro (com o
 * nó de dentro que falhou) numa faixa vermelha. Os ids de execução dos nós
 * de dentro vêm como "<host>.<id>" (Super Subgraph) ou "<host>:<id>" (nativo).
 */
const RUN = new Map();   // id do host -> estado

function runOf(host) {
  const k = String(host.id);
  let r = RUN.get(k);
  if (!r) RUN.set(k, (r = { running: false, done: new Set(), cur: null, value: 0, max: 0, err: null }));
  return r;
}

function innerIdOf(host, id) {
  const s = String(id ?? ""), h = String(host.id);
  if (s.startsWith(`${h}.`)) return s.slice(h.length + 1).split(".")[0];
  if (s.startsWith(`${h}:`)) return s.slice(h.length + 1).split(":")[0];
  return null;
}

function innerTitle(host, iid) {
  const n = innerNodesOf(host).find((x) => String(x.id) === String(iid));
  return n ? (n.title || n.type) : `#${iid}`;
}

function paintRun(node) {
  const card = node?.__legoHost?.querySelector?.(".lego-card");
  if (!card) return;
  const r = RUN.get(String(node.id));
  let bar = card.querySelector(":scope > .lego-run");
  if (!r || (!r.running && !r.err)) { bar?.remove(); return; }
  if (!bar) {
    bar = el("div", "lego-run");
    const head = card.querySelector(":scope > .lego-head");
    if (head) head.after(bar); else card.prepend(bar);
  }
  bar.replaceChildren();
  if (r.running) {
    const total = innerNodesOf(node).length;
    const part = r.max ? Math.min(1, r.value / r.max) : 0;
    const frac = total ? Math.min(1, (r.done.size + part) / total) : part;
    const label = r.cur
      ? `Running \u00b7 ${innerTitle(node, r.cur)}${r.max > 1 ? ` ${r.value}/${r.max}` : ""}`
      : `Running${r.max > 1 ? ` ${r.value}/${r.max}` : "\u2026"}`;
    const track = el("div", "lego-run-track");
    const fill = el("div", "lego-run-fill");
    fill.style.width = `${Math.round(frac * 100)}%`;
    track.append(fill);
    bar.append(el("div", "lego-run-label", label), track);
  }
  if (r.err) {
    const box = el("div", "lego-run-error");
    const where = r.err.where ? `Error in ${innerTitle(node, r.err.where)}` : "Error";
    box.append(el("b", "", where), el("span", "", `: ${r.err.msg}`));
    const x = glyphBtn("lego-run-close", "close", 11);
    x.title = "Dismiss";
    x.addEventListener("pointerdown", eatPointer);
    x.addEventListener("click", (e) => { e.stopPropagation(); r.err = null; paintRun(node); });
    box.append(x);
    box.title = r.err.msg;
    bar.append(box);
  }
}

function onRunEvent(type, d) {
  for (const host of ATTACHED) {
    const r = runOf(host);
    const h = String(host.id);
    let changed = false;
    if (type === "execution_start") {
      r.running = false; r.done.clear(); r.cur = null; r.value = r.max = 0; r.err = null;
      changed = true;
    } else if (type === "progress_state") {
      for (const n of Object.values(d?.nodes || {})) {
        const id = String(n.node_id ?? "");
        const iid = innerIdOf(host, id);
        if (id !== h && !iid) continue;
        changed = true;
        if (n.state === "running") {
          r.running = true;
          if (iid) { r.cur = iid; r.value = n.value || 0; r.max = n.max || 0; }
          else if (!r.cur) { r.value = n.value || 0; r.max = n.max || 0; }
        } else if (n.state === "finished" && iid) {
          r.done.add(iid);
        }
      }
    } else if (type === "executing") {
      if (d == null) { if (r.running) { r.running = false; r.cur = null; changed = true; } }
      else if (String(d) === h || innerIdOf(host, d)) { if (!r.running) { r.running = true; changed = true; } }
    } else if (type === "execution_error") {
      const id = String(d?.node_id ?? "");
      if (id === h || innerIdOf(host, id)) {
        r.err = { msg: String(d.exception_message || d.exception_type || "failed").trim(), where: innerIdOf(host, id) || r.cur };
        r.running = false;
        changed = true;
      }
    } else if (type === "execution_interrupted" || type === "execution_success") {
      if (r.running) { r.running = false; r.cur = null; changed = true; }
    }
    if (changed) paintRun(host);
  }
}

/** Altura do cartão em si — o host mede o nó, não o conteúdo. */
function cardHeight(host) {
  if (!host) return 260;
  const card = host.firstElementChild;
  if (!card) return 260;
  // `offsetHeight` é a caixa renderizada, que o nó já limita; `scrollHeight` é
  // o conteúdo. Medir a caixa primeiro realimenta o próprio tamanho: o cartão
  // nunca cresce e o excedente vaza para onOutside do nó.
  return Math.ceil(Math.max(card.scrollHeight || 0, card.offsetHeight || 0) || 260);
}

/**
 * Largura que o nó precisa para nenhum componente sair pela direita da zona
 * (0 = a atual basta). Cada zona diz quanto falta; numa zona de 50% cada px a
 * mais no nó rende meio px na zona, por isso a proporção. Zona de largura fixa
 * em px não cresce com o nó e fica de fora (senão o nó cresceria sem parar).
 */
function requiredNodeWidth(node, host) {
  const hw = host?.clientWidth || 0;
  if (!hw) return 0;
  let extra = 0;
  for (const box of host.querySelectorAll(".lego-sec-controls")) {
    const list = box.__legoList;
    const bw = box.clientWidth;
    if (!list?.length || !bw) continue;
    if (/px$/.test(box.closest(".lego-sec")?.style.width || "")) continue;
    const right = Math.max(...list.map((c) => (typeof c.x === "number" ? c.x : 0) + (typeof c.w === "number" ? c.w : 0)));
    const over = right + GRID - bw;
    if (over > 0) extra = Math.max(extra, Math.ceil((over * hw) / bw));
  }
  return extra ? Math.ceil((node.size?.[0] || MIN_W) + extra) : 0;
}

/**
 * Dimensiona o nó a partir do cartão com histerese (mínimo 8px) para evitar flickering.
 * A largura só cresce sozinha (até os componentes caberem); diminuir é com o usuário.
 */
function resize(node, host) {
  if (!node || !host) return;
  const h = cardHeight(host);
  if (!h || h < 40) return;
  const top = node.__legoWidget?.y ?? 46;
  const minW = MIN_W;
  const curW = Math.ceil(node.size?.[0] || minW);
  const curH = Math.ceil(node.size?.[1] || 0);
  const targetW = Math.max(minW, curW, requiredNodeWidth(node, host));
  const targetH = Math.ceil(top + h + PAD);

  if (Math.abs(curH - targetH) >= 8 || curW < targetW) {
    node.setSize([targetW, targetH]);
    requestCanvasDirty(node.graph);
  }
}

function detach(node) {
  ATTACHED.delete(node);
  closeObjectInspector();
  node.__legoState?.ro?.disconnect();
  const w = node.__legoWidget;
  if (w) {
    const i = (node.widgets || []).indexOf(w);
    if (i >= 0) node.widgets.splice(i, 1);
    w.element?.remove();
  }
  showNative(node);
  delete node.__legoWidget;
  delete node.__legoState;
  delete node.__legoHost;
  delete node.properties?.[PROP];
  node.setSize(node.computeSize());
  node.graph?.setDirtyCanvas?.(true, true);
}

/* ══════════════════════════════════════════════════════════════════════════
   Extensão
   ══════════════════════════════════════════════════════════════════════════ */

app.registerExtension({
  name: EXT,

  commands: [
    {
      id: "SuperSubgraph.ConvertSelection",
      label: "Convert Selection to SuperSubgraph",
      // Mesmo ícone do "Convert to Subgraph" nativo (lucide shrink), com o selo
      // "SS" — desenhado em CSS (.lego-ss-icon), já que a barra só aceita classe.
      icon: "lego-ss-icon",
      function: () => convertSelectionToSuper(),
    },
  ],

  // Barra flutuante que aparece ao selecionar nós.
  getSelectionToolboxCommands() {
    return ["SuperSubgraph.ConvertSelection"];
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== SS_TYPE) return;
    const proto = nodeType.prototype;

    // O grafo de dentro vai no workflow sempre atualizado (valores mudados
    // pelo cartão moram nos nós de dentro, não nas propriedades).
    const origSerialize = proto.onSerialize;
    proto.onSerialize = function (o) {
      origSerialize?.apply(this, arguments);
      if (this.__ssGraph && o?.properties?.[SS_PROP]) {
        o.properties[SS_PROP].graph = this.__ssGraph.serialize();
      }
    };

    // Carregar/colar: o grafo de dentro é refeito a partir das propriedades.
    const origConfigure = proto.onConfigure;
    proto.onConfigure = function () {
      const r = origConfigure?.apply(this, arguments);
      this.__ssGraph = null;
      setupSuperNode(this);
      applySuperSlots(this);
      // O frontend ainda mexe nos slots depois do configure (entradas de
      // widget); de novo no próximo tique, para sobrar só as in_N em uso.
      setTimeout(() => { applySuperSlots(this); this.setDirtyCanvas?.(true, true); }, 0);
      return r;
    };
  },

  async setup() {
    injectCSS();

    // Outputs gerados: guarda o último de cada id de execução e repinta as
    // áreas de Image/Video/Audio Output dos cartões.
    api.addEventListener("executed", (e) => {
      const d = e?.detail;
      if (!d?.output) return;
      recordOutput(d.node, d.output);
      if (d.display_node != null && String(d.display_node) !== String(d.node)) recordOutput(d.display_node, d.output);
      notifyOutputViews();
    });
    refreshSuperLibrary();
    refreshLayoutLibrary();
    for (const type of ["execution_start", "progress_state", "executing", "execution_error", "execution_interrupted", "execution_success"]) {
      api.addEventListener(type, (e) => { try { onRunEvent(type, e?.detail); } catch (err) { console.warn(LOG, "run feedback", err); } });
    }
    // Outputs que o frontend já guardava (execução anterior ao carregamento).
    try {
      for (const [k, v] of Object.entries(app.nodeOutputs || {})) if (!OUTPUTS.has(k)) recordOutput(k, v);
    } catch { /* frontend sem nodeOutputs */ }
    const sweep = () => {
      const graphs = [app.rootGraph || app.graph];
      const cur = app.canvas?.getCurrentGraph?.();
      if (cur && !graphs.includes(cur)) graphs.push(cur);
      for (const g of graphs) {
        for (const n of (g?._nodes || g?.nodes || [])) {
          if (n?.properties?.[PROP] && !n.__legoState) {
            try { attach(n); } catch (e) { console.error(LOG, "attach failed", n.id, e); }
          }
        }
      }
    };
    sweep();
    setTimeout(sweep, 500);
    app.canvas?.subgraph && setTimeout(sweep, 1200);
  },

  nodeCreated(node) {
    if (isSuperNode(node)) setupSuperNode(node);
    if (node?.properties?.[PROP]) {
      try { attach(node); } catch (e) { console.error(LOG, "nodeCreated attach failed", node.id, e); }
    }
  },

  async loadedGraphNode(node) {
    if (node.properties?.[PROP]) {
      try { attach(node); } catch (e) { console.error(LOG, "attach failed", node.id, e); }
    }
  },

  // Tudo do SuperSubgraph num item só ("SuperSubgraph ▸"), no canvas e no nó.
  getCanvasMenuItems() {
    const sel = selectedNodes();
    const pos = canvasDropPos();
    const sub = [];
    if (sel.length) sub.push({ content: `Convert Selection (${sel.length})`, callback: () => convertSelectionToSuper(sel) }, null);
    refreshSuperLibrary();   // para a próxima abertura do menu
    if (SS_LIBRARY.length) {
      sub.push({ content: "Add from Library", has_submenu: true, submenu: { options: SS_LIBRARY.map((name) => ({ content: name, callback: () => addSuperFromLibrary(name, pos) })) } });
    }
    sub.push({ content: "Import from File…", callback: () => importSuperFromFile(pos) });
    if (SS_LIBRARY.length) {
      sub.push({ content: "Delete from Library", has_submenu: true, submenu: { options: SS_LIBRARY.map((name) => ({ content: name, callback: () => deleteSuperFromLibrary(name) })) } });
    }
    return [null, { content: "SuperSubgraph", has_submenu: true, submenu: { options: sub } }];
  },

  getNodeMenuItems(node) {
    if (!node) return [];
    const has = !!node.properties?.[PROP];
    const sub = [];
    const sep = () => { if (sub.length && sub[sub.length - 1] !== null) sub.push(null); };

    const sel = selectedNodes();
    if (sel.length && sel.includes(node) && !(sel.length === 1 && isSuperNode(node))) sub.push({ content: `Convert Selection (${sel.length})`, callback: () => convertSelectionToSuper(sel) });
    if (isNativeSubgraphNode(node)) sub.push({ content: "Convert This Subgraph", callback: () => convertNativeToSuper(node) });

    if (isSuperNode(node)) {
      sep();
      sub.push(
        { content: "Open", callback: () => enterSuper(node) },
        { content: "Unpack", callback: () => unpackSuper(node) },
        null,
        { content: "Save to Library…", callback: () => saveSuperToLibrary(node) },
        { content: "Export to File…", callback: () => exportSuperToFile(node) },
      );
    }

    const border = boundaryMenuItems(node);
    if (border.length) { sep(); sub.push(...border); }

    sep();
    if (has) {
      sub.push({
        content: node.__legoState?.edit ? "Finish Editing Card" : "Edit Card",
        callback: () => {
          const s = node.__legoState || attach(node);
          s.edit = !s.edit;
          if (!s.edit) leaveEditMode(s);
          s.refresh();
        },
      });
      sub.push({ content: "Card Layout", has_submenu: true, submenu: { options: layoutMenuItems(node) } });
    } else {
      sub.push({
        content: "Add Card UI",
        callback: () => {
          node.properties = node.properties || {};
          node.properties[PROP] = autoLayout(node);
          attach(node);
        },
      });
    }
    while (sub.length && sub[sub.length - 1] === null) sub.pop();
    return sub.length ? [null, { content: "SuperSubgraph", has_submenu: true, submenu: { options: sub } }] : [];
  },

  __flatNode(node) { return this.__flatMenu(this.getNodeMenuItems(node)); },
  __flatCanvas() { return this.__flatMenu(this.getCanvasMenuItems()); },
  /** Para testes e scripts: todos os itens do menu, com os de submenus, numa lista só. */
  __flatMenu(items) {
    const out = [];
    const walk = (list) => { for (const it of list || []) { if (!it) continue; out.push(it); walk(it.submenu?.options); } };
    walk(items);
    return out;
  },
});

console.log(`${LOG} v2 (DOM) loaded`);


/**
 * Interactive dialog to assemble Custom Segment element
 * Allows adding Checkbox, Text, Dropdown, and Number (+/-) in the same element.
 */
