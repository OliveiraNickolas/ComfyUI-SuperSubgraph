/* Inspetor de Objetos (propriedades do componente selecionado) e abas/sub-abas. */
// Parte do ComfyUI-SuperSubgraph (ver web/js/super_subgraph.js e CLAUDE.md).
// Só declarações: nada roda ao carregar este arquivo.

import { CSS } from "../super_subgraph_css.js";
import { GRID, PROP } from "./constants.js";
import { copySelectedComponents, duplicateComponent, pasteComponents, pushUndo } from "./core.js";
import { findNodeInHostScope, prettify, resolveBind } from "./widgets.js";
import { balanceRange, el, esc, glyph, glyphBtn, glyphTextBtn, mkToggle, openDropdown, seedModeShown } from "./controls.js";
import { getComponentMinDimensions, isOutputKind, openOutputSourceDialog, outputSourceLabel } from "./outputs.js";
import { isMediaKind } from "./drag.js";
import { defaultSizeFor, isPanelKind, pickBalanceLink } from "./panels.js";
import { openInspector } from "./picker.js";
import { ALIGN_OPS, TOOLBOX, alignIcon, alignSelected, colorDotButton, makeZone, openColorMenu, removeControlsByName, renderAlignBars, setComponentColor, toolByKind, uniqueComponentName, walkControls } from "./form.js";
import { exposeAsInput, hasWireInput, innerOfBind, isSuperNode, removeWireInput } from "./native.js";

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
  // Só o cartão deste nó: nomes de componente se repetem entre nós diferentes.
  const scope = host.__legoHost || document;

  if (!ctrl) {
    state.selectedNames.clear();
    state.selectedName = null;
    scope.querySelectorAll(".lego-row.selected").forEach((r) => r.classList.remove("selected"));
    scope.querySelectorAll(".lego-segment-item.selected").forEach((r) => r.classList.remove("selected"));
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
    scope.querySelectorAll(".lego-row").forEach((r) => {
      const rName = r.dataset.name;
      if (rName && state.selectedNames.has(rName)) {
        r.classList.add("selected");
      } else {
        r.classList.remove("selected");
      }
    });
    scope.querySelectorAll(".lego-segment-item").forEach((it) => {
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
  INSPECTOR_POS = null;
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

function propToggle(value, onChange) {
  const t = el("button", `lego-oi-toggle${value ? " on" : ""}`);
  t.type = "button";
  t.innerHTML = '<span class="lego-oi-toggle-knob"></span>';
  t.addEventListener("click", (e) => {
    e.stopPropagation();
    const next = !t.classList.contains("on");
    t.classList.toggle("on", next);
    onChange(next);
  });
  return t;
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

const cssEscape = (s) => (typeof CSS !== "undefined" && typeof CSS.escape === "function") ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&");

/**
 * Alinha a janela Object Properties diretamente ao lado do nó ou componente
 * que a chamou (à direita, com o topo alinhado, ou à esquerda com recuo se faltar espaço).
 */
function alignInspectorToTarget(host, state) {
  if (!INSPECTOR) return;
  const oiWidth = 324;
  const oiHeight = INSPECTOR.offsetHeight || 420;
  const gap = 14;
  const pad = 12;

  let targetEl = null;
  const cardHost = host?.__legoHost;
  if (cardHost) {
    if (state?.selectedName) {
      try {
        targetEl = cardHost.querySelector(`[data-name="${cssEscape(state.selectedName)}"]`);
      } catch {}
    }
    if (!targetEl && state?.selectedNames && state.selectedNames.size > 0) {
      for (const name of state.selectedNames) {
        try {
          targetEl = cardHost.querySelector(`[data-name="${cssEscape(name)}"]`);
          if (targetEl) break;
        } catch {}
      }
    }
    if (!targetEl) {
      targetEl = cardHost.querySelector(".lego-row.selected, .lego-segment-item.selected, .selected");
    }
    if (!targetEl) {
      targetEl = cardHost.querySelector(".lego-card") || cardHost;
    }
  }

  const rect = targetEl?.getBoundingClientRect?.();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw) {
    // Posiciona imediatamente à direita do elemento alvo, alinhando ao seu topo
    let x = rect.right + gap;
    // Se estourar a viewport à direita, tenta colocar à esquerda do elemento
    if (x + oiWidth + pad > vw) {
      if (rect.left - gap - oiWidth >= pad) {
        x = rect.left - gap - oiWidth;
      } else {
        x = Math.max(pad, vw - oiWidth - pad);
      }
    }
    // Alinha o topo com o topo do elemento alvo, contendo na altura da tela
    let y = rect.top;
    if (y + oiHeight + pad > vh) {
      y = Math.max(pad, vh - oiHeight - pad);
    } else {
      y = Math.max(pad, y);
    }

    INSPECTOR_POS = { x: Math.round(x), y: Math.round(y) };
  } else if (!INSPECTOR_POS) {
    INSPECTOR_POS = { x: Math.max(pad, vw - oiWidth - pad), y: 96 };
  }
}

/** Apaga a aba `i` mantendo aberta a que estava aberta (ou a vizinha, se era ela). */
function removeTabAt(owner, tabs, i) {
  tabs.splice(i, 1);
  const a = owner.activeTab || 0;
  if (a > i || a >= tabs.length) owner.activeTab = Math.max(0, a - 1);
}

/** Pergunta o nome e cria uma aba nova (com uma zona de duas sub-abas); true se criou. */
function addTab(layout, tabs) {
  const v = prompt("New tab name:", `Tab ${tabs.length + 1}`);
  if (!v) return false;
  tabs.push({
    name: v,
    sections: [makeZone(v.toUpperCase(), [], { width: "100%" })]
  });
  layout.activeTab = tabs.length - 1;
  return true;
}

/** Pergunta o nome e cria uma sub-aba nova na zona `s`; true se criou. */
function addSubTabTo(s) {
  const v = prompt("New sub-tab name:", `Tab ${s.tabs.length + 1}`);
  if (!v) return false;
  s.tabs.push({ name: v, controls: [] });
  s.activeTab = s.tabs.length - 1;
  return true;
}

/** A janela flutuante. Some quando não há nada selecionado ou fora da edição. */
function renderObjectInspector(host, state, force) {
  renderAlignBars(host, state);
  // O Inspetor é um só: o refresh de OUTRO cartão não pode fechá-lo nem
  // trocar o conteúdo — só um pedido explícito (`force`) o transfere.
  if (INSPECTOR && INSPECTOR.__host && INSPECTOR.__host !== host && !force) return;
  const layout = host.properties[PROP];
  if (!state.edit) return closeObjectInspector();
  // Sem `force`, só repinta o que já está aberto: ele nunca aparece sozinho.
  if (!INSPECTOR && !force) return;

  const isNew = !INSPECTOR;
  if (!INSPECTOR) {
    INSPECTOR = el("div", "lego-oi");
    INSPECTOR.addEventListener("pointerdown", (e) => e.stopPropagation());
    INSPECTOR.addEventListener("wheel", (e) => e.stopPropagation());
    document.body.append(INSPECTOR);
  }
  INSPECTOR.__host = host;

  // Se force for verdadeiro ou se for recém-aberto ou se o usuário não tiver arrastado manualmente,
  // alinha a janela imediatamente ao lado do componente ou nó que a chamou.
  if (force || isNew || !INSPECTOR.__userDragged) {
    if (force) delete INSPECTOR.__userDragged;
    alignInspectorToTarget(host, state);
  }

  if (document.querySelector(".lego-comfy-dialog")) {
    adaptInspectorWithDialog();
  } else {
    INSPECTOR.style.position = "fixed";
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
    INSPECTOR.__userDragged = true;
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
    alignRow.style.gridTemplateColumns = "repeat(5, 1fr)";
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
    state.selectedNames?.delete(ctrl.name);
    state.selectedNames?.add(clean);
    ctrl.name = clean;
    state.selectedName = clean;
    state.refresh();
  })));
  // Cor (a mesma bolinha da barra do componente).
  props.append(propRow("Color", colorDotButton("lego-oi-color-btn", ctrl.color, "Color",
    (color) => setComponentColor(host, state, ctrl, color))));
  // Entrada nativa (fio) no nó do subgrafo: para ligar um valor vindo de fora.
  if (ctrl.kind !== "balance" && isSuperNode(host) && innerOfBind(host, ctrl.bind)) {
    const wire = propToggle(hasWireInput(host, ctrl.bind), (on) => {
      if (on) exposeAsInput(host, ctrl.bind); else removeWireInput(host, ctrl.bind);
      renderObjectInspector(host, state, true);
    });
    wire.title = "Also show this parameter as an input on the node, to connect a value from outside";
    props.append(propRow("Node Input", wire));
  }

  // Botão de modo (FIX / +1 / −1 / aleatório): padrão só em seed; liga em qualquer número.
  if (ctrl.kind === "number" && ctrl.bind) {
    const hit = resolveBind(host, ctrl.bind);
    if (hit?.widget) {
      const sw = propToggle(seedModeShown(hit.node, hit.widget, ctrl), (on) => {
        pushUndo(host);
        ctrl.seedMode = on;
        state.refresh();
        renderObjectInspector(host, state, true);
      });
      sw.title = "Show the FIX / +1 / \u22121 / random button: what happens to this value after each run";
      props.append(propRow("Run Mode", sw));
    }
  }

  // Balance Slider: intervalo, passo e o nome de cada lado.
  if (ctrl.kind === "balance") {
    const { min, max, step } = balanceRange(ctrl);
    const propFloat = (value, onChange) => propText(String(value), (v) => {
      const n = parseFloat(String(v).replace(",", "."));
      if (Number.isFinite(n)) onChange(n);
      else renderObjectInspector(host, state, true);
    });
    const setNum = (key) => (n) => { pushUndo(host); ctrl[key] = n; state.refresh(); renderObjectInspector(host, state, true); };
    props.append(propRow("Min", propFloat(min, setNum("min"))));
    props.append(propRow("Max", propFloat(max, setNum("max"))));
    props.append(propRow("Step", propFloat(step, (n) => { if (n > 0) setNum("step")(n); })));
    const setText = (key) => (v) => { pushUndo(host); const t = String(v).trim(); if (t) ctrl[key] = t; else delete ctrl[key]; state.refresh(); };
    props.append(propRow("Label A", propText(ctrl.labelA || "", setText("labelA"))));
    props.append(propRow("Label B", propText(ctrl.labelB || "", setText("labelB"))));
  }

  const isDivider = ctrl.kind === "hdivider" || ctrl.kind === "vdivider";
  const isLabel = ctrl.kind === "label";
  const isButton = ctrl.kind === "button";
  const isContainer = ctrl.kind === "group" || ctrl.kind === "segment" || ctrl.kind === "vsegment";

  if (isLabel || isButton) {
    const hitNow = ctrl.bind ? resolveBind(host, ctrl.bind) : null;
    const defaultText = isButton ? (ctrl.text || ctrl.label || (hitNow ? prettify(hitNow.widget.name) : "Button")) : "Label";
    props.append(propRow(isButton ? "Button Text" : "Text", propText(ctrl.text || ctrl.label || (isButton ? defaultText : ""), (v) => {
      ctrl.text = v;
      ctrl.label = v;
      state.refresh();
    })));

    // Formatação do label / botão
    const styleRow = el("div", "lego-oi-style-row");
    styleRow.style.cssText = "display:flex;align-items:center;gap:4px;flex-wrap:wrap";
    const mkToggle = (label, title, key, css) => {
      const btn = el("button", `lego-oi-style-btn${ctrl[key] ? " on" : ""}`);
      btn.innerHTML = label;
      if (css) btn.style.cssText += css;
      btn.title = title;
      btn.addEventListener("click", (e) => { e.stopPropagation(); ctrl[key] = !ctrl[key]; state.refresh(); });
      return btn;
    };
    styleRow.append(
      mkToggle("B", "Bold", "bold", "font-weight:700"),
      mkToggle("I", "Italic", "italic", "font-style:italic"),
      mkToggle("U", "Underline", "underline", "text-decoration:underline"),
      mkToggle("S", "Strikethrough", "strike", "text-decoration:line-through"),
    );

    const ALIGNS = [
      { id: "left", icon: "≡ʟ" },
      { id: "center", icon: "≡ᴄ" },
      { id: "right", icon: "≡ʀ" },
    ];
    for (const a of ALIGNS) {
      const isDefCenter = isButton && !ctrl.align;
      const isActive = ctrl.align ? ctrl.align === a.id : (isDefCenter ? a.id === "center" : a.id === "left");
      const btn = el("button", `lego-oi-style-btn${isActive ? " on" : ""}`);
      btn.textContent = a.icon;
      btn.title = `Align ${a.id}`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (a.id === (isButton ? "center" : "left")) delete ctrl.align; else ctrl.align = a.id;
        state.refresh();
      });
      styleRow.append(btn);
    }

    const defSize = isButton ? 11 : 14;
    const sizeIn = propNumber(ctrl.fontSize || defSize, (v) => { ctrl.fontSize = Math.max(8, Math.min(72, v)); state.refresh(); }, 1);
    sizeIn.style.width = "48px";
    sizeIn.title = "Font size (px)";
    styleRow.append(sizeIn);

    props.append(propRow("Style", styleRow));

    // Fonte
    const FONTS = ["System", "Serif", "Monospace", "Cursive"];
    const FONT_MAP = { System: "", Serif: "Georgia, 'Times New Roman', serif", Monospace: "ui-monospace, SFMono-Regular, monospace", Cursive: "'Segoe Script', 'Comic Sans MS', cursive" };
    const curFont = FONTS.find((f) => FONT_MAP[f] === (ctrl.fontFamily || "")) || "System";
    const fontBtn = el("button", "lego-oi-pick");
    fontBtn.innerHTML = `<span>${curFont}</span>${glyph("chevron", 12)}`;
    fontBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openDropdown(fontBtn, FONTS, curFont, (_v, idx) => {
        const ff = FONT_MAP[FONTS[idx]];
        if (ff) ctrl.fontFamily = ff; else delete ctrl.fontFamily;
        state.refresh();
      });
    });
    props.append(propRow("Font", fontBtn));

    // Cor da fonte
    const colorBtn = el("button", "lego-oi-style-btn");
    colorBtn.textContent = "A";
    colorBtn.title = "Font color";
    colorBtn.style.cssText = `font-weight:700;min-width:28px;color:${ctrl.fontColor || "#e2e8f0"};border-bottom:3px solid ${ctrl.fontColor || "#e2e8f0"}`;
    colorBtn.addEventListener("click", (e) => {
      openColorMenu(e, ctrl.fontColor || null, (color) => {
        if (color) ctrl.fontColor = color; else delete ctrl.fontColor;
        state.refresh();
      });
    });
    props.append(propRow("Font Color", colorBtn));
  } else if (!isDivider) {
    const isSegment = ctrl.kind === "segment" || ctrl.kind === "vsegment";

    if (isSegment) {
      // Para grupos (segment/vsegment), o título visual é o Header (sem campo Caption duplicado).
      const headText = ctrl.header || ctrl.label || "";
      const headIn = propText(headText, (v) => {
        const t = String(v).trim();
        if (t) {
          ctrl.header = t;
          ctrl.label = t;
        } else {
          delete ctrl.header;
          delete ctrl.label;
        }
        state.refresh();
      });
      headIn.placeholder = "(no header)";
      props.append(propRow("Header", headIn));

      const POSICOES = [
        { id: "left", label: "Left" },
        { id: "center", label: "Center" },
        { id: "right", label: "Right" },
        { id: "none", label: "Hidden" },
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
      props.append(propRow("Header Position", posBtn));
    } else if (!isButton) {
      // Caption vazio cai no nome do widget vinculado — mostra o efetivo, não o vazio.
      const hitNow = ctrl.bind ? resolveBind(host, ctrl.bind) : null;
      const capPadrao = hitNow ? prettify(hitNow.widget.name) : (ctrl.name || "");
      const capIn = propText(ctrl.label || "", (v) => {
        ctrl.label = v;
        state.refresh();
      });
      capIn.placeholder = capPadrao;
      props.append(propRow("Caption", capIn));

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

      // Alinhamento do texto do caption (esquerda, centro, direita).
      const ALINHA = [
        { id: "left", label: "Left" },
        { id: "center", label: "Center" },
        { id: "right", label: "Right" },
      ];
      const alAtual = ALINHA.find((o) => o.id === (ctrl.labelAlign || "left")) || ALINHA[0];
      const alBtn = el("button", "lego-oi-pick");
      alBtn.innerHTML = `<span>${alAtual.label}</span>${glyph("chevron", 12)}`;
      alBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openDropdown(alBtn, ALINHA.map((o) => o.label), alAtual.label, (_v, idx) => {
          const opt = ALINHA[idx];
          if (!opt) return;
          pushUndo(host);
          if (opt.id === "left") delete ctrl.labelAlign;
          else ctrl.labelAlign = opt.id;
          state.refresh();
        });
      });
      props.append(propRow("Caption Align", alBtn));

      // Largura da caixa do caption (0 = automático conforme o texto)
      props.append(propRow("Caption Width", propNumber(ctrl.labelW || 0, (v) => {
        if (v > 0) ctrl.labelW = v;
        else delete ctrl.labelW;
        state.refresh();
      })));

      if (!parentGroup && Array.isArray(list)) {
        const detachBtn = el("button", "lego-btn", "Detach as Label");
        detachBtn.style.cssText = "margin-top:4px;width:100%;font-size:10px;padding:3px 6px;background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.4);color:#c084fc;border-radius:4px;cursor:pointer;";
        detachBtn.title = "Converte este caption em um label 2D independente no canvas e oculta o caption interno.";
        detachBtn.addEventListener("click", () => {
          pushUndo(host);
          const captionText = ctrl.label || capPadrao || "Label";
          const newLbl = {
            kind: "label",
            text: captionText,
            label: captionText,
            x: ctrl.x,
            y: Math.max(0, ctrl.y - 24),
            w: Math.max(64, Math.min(ctrl.w || 200, Math.round((captionText.length * 8 + 16) / GRID) * GRID)),
            h: 24
          };
          ensureComponentName(layout, newLbl);
          list.push(newLbl);
          ctrl.labelPos = "none";
          state.selectedName = newLbl.name;
          state.refresh();
        });
        props.append(propRow("", detachBtn));
      }
    }
  }

  const isMediaCtrl = isMediaKind(ctrl.kind) || isPanelKind(ctrl.kind);
  const isVisualMedia = ctrl.kind === "media" || ctrl.kind === "video" || ctrl.kind === "outimage" || ctrl.kind === "outvideo" || ctrl.kind === "preview_override";
  if (isVisualMedia) {
    props.append(propRow("Hide Preview", propToggle(!!ctrl.hidePreview, (v) => {
      if (v) ctrl.hidePreview = true;
      else delete ctrl.hidePreview;
      state.refresh();
    })));
  }
  const isTextarea = ctrl.kind === "textarea";
  const { minW, minH } = getComponentMinDimensions(ctrl);
  const defW = ctrl.w || (parentGroup ? (isTextarea ? 160 : (isDivider ? (ctrl.kind === "vdivider" ? 16 : 192) : 100)) : (isDivider ? (ctrl.kind === "vdivider" ? 16 : 256) : defaultSizeFor(ctrl.kind).w));
  const defH = ctrl.h || (parentGroup ? (isTextarea ? 80 : (isMediaCtrl ? (isPanelKind(ctrl.kind) ? 180 : 96) : (isDivider ? 16 : 32))) : (isTextarea ? 96 : (isDivider ? 16 : isPanelKind(ctrl.kind) ? defaultSizeFor(ctrl.kind).h : 32)));
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

  // Balance Slider: dois elos (A à esquerda, B à direita).
  const linkRow = (label, key) => {
    const b = ctrl[key];
    const h = b ? resolveBind(host, b) : null;
    const btn = el("button", `lego-oi-fn${b ? (h ? " bound" : " broken") : ""}`);
    const txt = !b ? "(not linked)" : h ? `#${h.node.id} ${h.widget.name}` : `${b} (missing)`;
    btn.innerHTML = `${glyph(b && h ? "link" : "blank", 12)}<span>${esc(txt)}</span>`;
    btn.title = "Click to choose the parameter for this side";
    btn.addEventListener("click", (e) => { e.stopPropagation(); pickBalanceLink(host, ctrl, state, list, key); });
    return propRow(label, btn);
  };
  const hit = ctrl.kind !== "balance" && ctrl.bind ? resolveBind(host, ctrl.bind) : null;
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
  if (ctrl.kind === "balance") ev.append(linkRow("Link A (left)", "bind"), linkRow("Link B (right)", "bind2"));
  else ev.append(propRow("OnChange", fnBtn));
  INSPECTOR.append(ev);

  /* ── rodapé ── */
  const foot = el("div", "lego-oi-foot");
  const dup = glyphTextBtn("lego-btn", "copy", "Duplicate", 12);
  dup.title = "Duplicate component (Ctrl+C, Ctrl+V, Ctrl+D)";
  dup.addEventListener("click", () => {
    duplicateComponent(host, state, ctrl, list);
  });
  foot.append(dup);

  if (ctrl.bind || ctrl.bind2) {
    const unbind = glyphTextBtn("lego-btn", "close", "Unbind", 12);
    unbind.addEventListener("click", () => {
      pushUndo(host);
      ctrl.bind = "";
      if (ctrl.kind === "balance") ctrl.bind2 = "";
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

  if (!INSPECTOR.__userDragged && !document.querySelector(".lego-comfy-dialog")) {
    const vh = window.innerHeight;
    const realH = INSPECTOR.offsetHeight;
    if (realH && INSPECTOR_POS && INSPECTOR_POS.y + realH + 12 > vh) {
      INSPECTOR_POS.y = Math.max(12, vh - realH - 12);
      INSPECTOR.style.top = `${INSPECTOR_POS.y}px`;
    }
  }
}

export { INSPECTOR, INSPECTOR_POS, ensureComponentName, findSelected, selectComponent, leaveEditMode, closeObjectInspector, propRow, propText, propNumber, propToggle, adaptInspectorWithDialog, cssEscape, alignInspectorToTarget, removeTabAt, addTab, addSubTabTo, renderObjectInspector };
