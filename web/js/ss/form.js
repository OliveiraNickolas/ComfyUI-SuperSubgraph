/* Cores, paleta de ferramentas (FORM MODE) e alinhamento automático. */
// Parte do ComfyUI-SuperSubgraph (ver web/js/super_subgraph.js e CLAUDE.md).
// Só declarações: nada roda ao carregar este arquivo.

import { GRID, PROP } from "./constants.js";
import { copySelectedComponents, pasteComponents, pushUndo, showLegoToast } from "./core.js";
import { resolveBind } from "./widgets.js";
import { eatPointer, el, glyphEl, seedModeShown } from "./controls.js";
import { addItemToSegment, getComponentMinDimensions, isOutputKind } from "./outputs.js";
import { is2DKind, itemToZoneCtrl, zoneCtrlToItem } from "./drag.js";
import { makeRowId, sameRow, widthForCount } from "./whole_node.js";
import { isGroupKind, openInspector, openLegoContextMenu } from "./picker.js";
import { ensureComponentName, findSelected, selectComponent } from "./inspector.js";
import { exposeAsInput, hasWireInput, innerOfBind, isSuperNode, removeWireInput } from "./native.js";

/* ── Cores por zona e por componente ─────────────────────────────────────── */
const LEGO_COLORS = [
  ["Black", "#000000"],
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

/**
 * Bolinha de cor (mostra a cor atual; clique abre as cores). O MESMO botão em
 * todo lugar que tem cor: componente, item de grupo, zona e Inspetor.
 */
function colorDotButton(cls, current, title, onPick) {
  const btn = el("button", `${cls} lego-color-dot-btn`);
  btn.type = "button";
  btn.title = title;
  const dot = el("span", `lego-color-dot${current ? "" : " none"}`);
  if (current) dot.style.background = current;
  btn.append(dot);
  btn.addEventListener("pointerdown", eatPointer);
  btn.addEventListener("click", (e) => openColorMenu(e, current || null, onPick));
  return btn;
}

/** Pinta o componente — ou todos os selecionados, se ele faz parte da seleção. */
function setComponentColor(host, state, ctrl, color) {
  pushUndo(host);
  const names = selectionFor(state, ctrl);
  walkControls(host.properties[PROP], (c) => {
    if (c === ctrl || names.has(c.name)) { if (color) c.color = color; else delete c.color; }
  });
  state.refresh();
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
  const picked = list.filter((c) => names.has(c.name));
  if (!picked.length) { showLegoToast("Select components to group"); return false; }
  pushUndo(host);
  picked.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const x0 = Math.min(...picked.map((c) => c.x || 0));
  const y0 = Math.min(...picked.map((c) => c.y || 0));
  const right = Math.max(...picked.map((c) => (c.x || 0) + (c.w || 160)));
  const at = Math.min(...picked.map((c) => list.indexOf(c)));
  const items = picked.map(zoneCtrlToItem);
  const bodyH = (it) => (is2DKind(it.kind) || isGroupKind(it.kind)) ? (it.h || 144) : 48;
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
  const px = (v) => parseFloat(v) || 0;
  // Altura que o conteúdo precisa, somada peça por peça (itens, respiros e
  // cabeçalho). Medir o "estouro" pelo scroll dava resultados diferentes na
  // edição e fora dela, e o grupo engordava um pouco a cada troca de modo.
  const bs = getComputedStyle(box);
  const vertical = bs.flexDirection === "column";
  const items = [...box.children].filter((c) => c.classList?.contains("lego-segment-item") && getComputedStyle(c).position !== "absolute");
  const outerH = (c) => { const cs = getComputedStyle(c); return c.offsetHeight + px(cs.marginTop) + px(cs.marginBottom); };
  const gap = px(bs.rowGap || bs.gap);
  const content = vertical
    ? items.reduce((a, c) => a + outerH(c), 0) + gap * Math.max(0, items.length - 1)
    : Math.max(0, ...items.map(outerH));
  const boxNeed = content + px(bs.paddingTop) + px(bs.paddingBottom) + px(bs.borderTopWidth) + px(bs.borderBottomWidth);
  const rs = getComputedStyle(row);
  const flow = [...row.children].filter((c) => getComputedStyle(c).position !== "absolute" && getComputedStyle(c).display !== "none");
  const rowGap = px(rs.rowGap || rs.gap);
  const needH = Math.ceil(flow.reduce((a, c) => a + (c === box ? boxNeed : outerH(c)), 0)
    + rowGap * Math.max(0, flow.length - 1)
    + px(rs.paddingTop) + px(rs.paddingBottom) + px(rs.borderTopWidth) + px(rs.borderBottomWidth));
  const overW = box.scrollWidth - box.clientWidth;
  const w0 = typeof ctrl.w === "number" ? ctrl.w : row.offsetWidth;
  const h0 = typeof ctrl.h === "number" ? ctrl.h : row.offsetHeight;
  // Grupo de uma linha só (horizontal, sem mídia/texto longo): altura sempre
  // a do conteúdo — sobra ali é só espaço vazio (e desfaz grupos que
  // engordaram com o arredondamento antigo). Os demais só crescem.
  const oneLine = !vertical && !items.some((c) => c.classList.contains("has-custom-h"));
  // Grupo montado sozinho (nó inteiro promovido) e com a altura ainda
  // intocada: também encolhe até o conteúdo (a estimativa sobrava embaixo).
  const auto = typeof ctrl.autoH === "number" && ctrl.autoH === h0;
  const growH = needH > h0 || ((oneLine || auto) && needH < h0);
  if (overW <= 1 && !growH) return false;
  if (overW > 1) ctrl.w = Math.ceil((w0 + overW + 4) / GRID) * GRID;
  if (growH) ctrl.h = needH;
  if (auto) ctrl.autoH = ctrl.h;
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
  const looseSel = list.filter((c) => names.has(c.name));
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
  entries.push({ icon: "blank", label: "Color…", action: () => openColorMenu(e, ctrl.color, (color) => setComponentColor(host, state, ctrl, color)) });
  // Botão de modo (FIX / +1 / −1 / aleatório) em qualquer número.
  const runHit = !many && ctrl.kind === "number" && ctrl.bind ? resolveBind(host, ctrl.bind) : null;
  if (runHit?.widget) {
    const on = seedModeShown(runHit.node, runHit.widget, ctrl);
    entries.push({ icon: "blank", label: on ? "Hide run mode (FIX / +1 / \u22121)" : "Show run mode (FIX / +1 / \u22121)", action: () => {
      pushUndo(host);
      ctrl.seedMode = !on;
      state.refresh();
    } });
  }
  // Fio (entrada nativa do subgrafo): só quando o valor deve vir de FORA.
  if (!many && isSuperNode(host) && innerOfBind(host, ctrl.bind)) {
    entries.push(hasWireInput(host, ctrl.bind)
      ? { icon: "link", label: "Remove node input (wire)", action: () => removeWireInput(host, ctrl.bind) }
      : { icon: "link", label: "Expose as node input (wire)", action: () => exposeAsInput(host, ctrl.bind) });
  }
  entries.push(null, { icon: "trash", label: many ? `Remove (${names.size})` : "Remove", hint: "Del", danger: true, action: () => {
    pushUndo(host);
    removeControlsByName(host.properties[PROP], names);
    state.selectedNames?.clear();
    state.selectedName = null;
    state.refresh();
  } });
  return openLegoContextMenu(e, entries);
}

/** Cria uma nova Zona (com sub-abas internas como padrão e largura 100%). */
/**
 * Zona nova, sempre com suporte a abas: nasce com a "Tab 1" (e o "+" para
 * criar outras). `controls` vão para a Tab 1.
 */
function makeZone(header, controls = [], extra = {}) {
  return { header, ...extra, activeTab: 0, tabs: [{ name: "Tab 1", controls }] };
}

function createNewZone({ host, curTab, state }) {
  if (!curTab) return;
  const count = (curTab.sections || []).length + 1;
  const name = prompt("New Zone Name:", `ZONE ${count}`);
  if (name == null) return;
  const zoneName = (name.trim() || `ZONE ${count}`).toUpperCase();
  pushUndo(host);
  const newSec = makeZone(zoneName, [], { width: "100%" });
  if (!curTab.sections) curTab.sections = [];
  curTab.sections.push(newSec);
  state.refresh();
}
const openAddZoneModal = createNewZone;

/** Adiciona uma nova Zona empilhada abaixo da zona indicada (na mesma coluna ou linha). */
function addZoneBelow({ host, curTab, section, state }) {
  if (!curTab || !section) return null;
  const sections = curTab.sections || (curTab.sections = []);
  const idx = sections.indexOf(section);
  if (idx < 0) return null;
  const count = sections.length + 1;
  const name = prompt("New Zone Name:", `ZONE ${count}`);
  if (name == null) return null;
  const zoneName = (name.trim() || `ZONE ${count}`).toUpperCase();
  pushUndo(host);

  const isCol = section.width && section.width !== "100%";
  const newSec = makeZone(zoneName, [], { width: isCol ? section.width : "100%" });
  if (isCol) {
    newSec.col = typeof section.col === "number" ? section.col : 0;
    newSec.row = section.row;  // herda o row do grupo
  }
  sections.splice(idx + 1, 0, newSec);
  if (state) {
    state.activeSection = newSec;
    state.refresh();
  }
  return newSec;
}

/** Adiciona uma nova Zona ao lado da zona indicada (criando uma nova coluna adjacente). */
function addZoneBeside({ host, curTab, section, state }) {
  if (!curTab || !section) return null;
  const sections = curTab.sections || (curTab.sections = []);
  const idx = sections.indexOf(section);
  if (idx < 0) return null;
  const count = sections.length + 1;
  const name = prompt("New Zone Name:", `ZONE ${count}`);
  if (name == null) return null;
  const zoneName = (name.trim() || `ZONE ${count}`).toUpperCase();
  pushUndo(host);

  const newSec = makeZone(zoneName);

  const isCol = section.width && section.width !== "100%";
  if (!isCol) {
    const sharedRow = makeRowId();
    section.col = 0;
    section.width = "50%";
    section.row = sharedRow;
    newSec.col = 1;
    newSec.width = "50%";
    newSec.row = sharedRow;
    sections.splice(idx + 1, 0, newSec);
  } else {
    const targetCol = typeof section.col === "number" ? section.col : 0;
    let start = idx;
    while (start > 0 && sections[start - 1].width && sections[start - 1].width !== "100%") {
      if (!sameRow(section, sections[start - 1])) break;
      start--;
    }
    let end = idx;
    while (end < sections.length - 1 && sections[end + 1].width && sections[end + 1].width !== "100%") {
      if (!sameRow(section, sections[end + 1])) break;
      end++;
    }
    const groupSecs = sections.slice(start, end + 1);

    groupSecs.forEach((s) => {
      if (typeof s.col === "number" && s.col > targetCol) {
        s.col++;
      }
    });
    newSec.col = targetCol + 1;
    newSec.row = section.row;  // herda o row do grupo

    let insertIdx = idx;
    for (let i = start; i <= end; i++) {
      if (sections[i].col === targetCol) insertIdx = i;
    }
    sections.splice(insertIdx + 1, 0, newSec);

    const colsSet = new Set();
    groupSecs.forEach((s) => colsSet.add(s.col));
    colsSet.add(newSec.col);
    const newW = widthForCount(colsSet.size);
    groupSecs.forEach((s) => { s.width = newW; });
    newSec.width = newW;
  }

  if (state) {
    state.activeSection = newSec;
    state.refresh();
  }
  return newSec;
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
const MIN_CTRL_H = 32;

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
  const walkItems = (items, sec, parent) => {
    for (const item of items) {
      fn(item, items, sec, parent);
      if (Array.isArray(item.items)) walkItems(item.items, sec, item);
    }
  };
  for (const tab of layout?.tabs || []) {
    for (const sec of tab.sections || []) {
      for (const c of sec.controls || []) {
        fn(c, sec.controls, sec);
        if (Array.isArray(c.items)) walkItems(c.items, sec, c);
      }
      for (const sub of sec.tabs || []) {
        for (const c of sub.controls || []) {
          fn(c, sub.controls, sec);
          if (Array.isArray(c.items)) walkItems(c.items, sec, c);
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
const ALIGN_GAP = GRID;   // espaço padrão entre componentes em linha/coluna
/** Espaço (px) usado por "em linha"/"em coluna" neste cartão (ajustável na barra). */
const alignGapOf = (layout) => (Number.isFinite(layout?.alignGap) ? layout.alignGap : ALIGN_GAP);

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
function alignControls(ctrls, op, ref = null, gap = ALIGN_GAP) {
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
      // Em linha: da esquerda para a direita, topos alinhados, com o espaço
      // escolhido (sem arredondar para a grade: senão um espaço pequeno sumia).
      let x = minX;
      [...ctrls].sort((a, b) => axX(a) - axX(b) || axY(a) - axY(b)).forEach((c) => { c.x = x; c.y = minY; x = Math.round(x + axW(c) + gap); });
      break;
    }
    case "column": {
      // Em coluna: de cima para baixo, esquerdas alinhadas, com o espaço escolhido.
      let y = minY;
      [...ctrls].sort((a, b) => axY(a) - axY(b) || axX(a) - axX(b)).forEach((c) => { c.y = y; c.x = minX; y = Math.round(y + axH(c) + gap); });
      break;
    }
    case "hdist": {
      if (ctrls.length < 3) return false;
      const list = [...ctrls].sort((a, b) => axX(a) - axX(b));
      const free = (maxR - minX) - list.reduce((a, c) => a + axW(c), 0);
      const gap = free / (list.length - 1);
      let x = minX;
      // Pixel inteiro, não grade: arredondar para 16 deixava os espaços desiguais.
      list.forEach((c) => { c.x = Math.round(x); x += axW(c) + gap; });
      break;
    }
    case "vdist": {
      if (ctrls.length < 3) return false;
      const list = [...ctrls].sort((a, b) => axY(a) - axY(b));
      const free = (maxB - minY) - list.reduce((a, c) => a + axH(c), 0);
      const gap = free / (list.length - 1);
      let y = minY;
      list.forEach((c) => { c.y = Math.round(y); y += axH(c) + gap; });
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
    did = alignControls(ctrls, op, ref, alignGapOf(layout)) || did;
  }
  // Mudar o espaço refaz a última arrumação em linha/coluna.
  if (op === "row" || op === "column") state.lastArrange = op;
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
  const O = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
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
    // Mesmo tamanho (estilo ComfyUI-Align): o retângulo encosta nas duas
    // linhas-guia — laterais = largura, cima/baixo = altura, cantos = os dois.
    samew: L(1.5, 2, 1.5, 14) + L(14.5, 2, 14.5, 14) + O(3.5, 5, 9, 6),
    sameh: L(2, 1.5, 14, 1.5) + L(2, 14.5, 14, 14.5) + O(5, 3.5, 6, 9),
    samesize: `<path d="M1.5 5V1.5H5M11 1.5H14.5V5M14.5 11V14.5H11M5 14.5H1.5V11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>` + O(4, 4, 8, 8),
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
    // Espaço entre os componentes de "em linha"/"em coluna" (de 4 em 4 px).
    bar.append(el("span", "lego-align-sep"));
    const layout = host.properties[PROP];
    const gapBox = el("span", "lego-align-gap");
    gapBox.title = "Space between components when arranged in a row or column";
    const setGap = (v) => {
      layout.alignGap = Math.max(0, Math.min(64, v));
      if (state.lastArrange) alignSelected(host, state, state.lastArrange);
      else state.refresh();
    };
    const minus = el("button", "lego-align-btn", "\u2212");
    minus.type = "button";
    minus.title = "Less space";
    minus.addEventListener("click", (e) => { e.stopPropagation(); setGap(alignGapOf(layout) - 4); });
    const plus = el("button", "lego-align-btn", "+");
    plus.type = "button";
    plus.title = "More space";
    plus.addEventListener("click", (e) => { e.stopPropagation(); setGap(alignGapOf(layout) + 4); });
    gapBox.append(el("span", "lego-align-gap-lbl", "gap"), minus, el("span", "lego-align-gap-val", String(alignGapOf(layout))), plus);
    bar.append(gapBox);
    // Flutua ACIMA da zona, fora do fluxo: dentro do cabeçalho ela deixava a
    // zona mais alta no modo edição e mudava a noção do layout final.
    const head = box.closest(".lego-sec")?.querySelector(":scope > .lego-sec-h");
    if (!head) continue;
    head.append(bar);
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
/**
 * Arruma `ctrls` em linhas (x/y relativos a 0,0): lado a lado até `maxW`,
 * depois quebra; a altura de cada linha é a do maior item dela. Devolve o
 * tamanho do bloco.
 */
function packInRows(ctrls, maxW, gap = GRID) {
  let x = 0, y = 0, rowH = 0, blockW = 0;
  for (const c of ctrls) {
    c.w = Math.ceil((c.w || 256) / GRID) * GRID;
    c.h = Math.ceil((c.h || 46) / GRID) * GRID;
    if (x > 0 && x + c.w > maxW) { x = 0; y += rowH + gap; rowH = 0; }
    c.x = x;
    c.y = y;
    x += c.w + gap;
    rowH = Math.max(rowH, c.h);
    blockW = Math.max(blockW, c.x + c.w);
  }
  return { w: blockW, h: y + rowH };
}

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
        // Firefox só começa o arraste com algum dado no dataTransfer.
        try { e.dataTransfer?.setData("text/plain", t.kind); } catch {}
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

export { alignGapOf, LEGO_COLORS, openColorMenu, colorDotButton, setComponentColor, selectionFor, groupSelectedComponents, ungroupComponent, toggleGroupOrientation, fitGroupToContent, compatibleKinds, KIND_LABEL, openComponentContextMenu, makeZone, createNewZone, openAddZoneModal, addZoneBelow, addZoneBeside, MIN_CTRL_W, MIN_CTRL_H, TOOLBOX_CATEGORIES, TOOLBOX, toolByKind, walkControls, ALIGN_GAP, selectedLooseByList, axX, axY, axW, axH, snapG, alignControls, alignSelected, ALIGN_OPS, alignIcon, renderAlignBars, removeControlsByName, uniqueComponentName, renameClone, activeTabOf, visibleControlsOf, activeSectionOf, packInRows, findFreeSpot, makeComponent, buildToolPalette, dropArmedTool };
