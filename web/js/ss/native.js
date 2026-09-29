/* Super Subgraph = subgrafo nativo + cartão: converter, copiar, entrar, layouts salvos, menu, execução. */
// Parte do ComfyUI-SuperSubgraph (ver web/js/super_subgraph.js e CLAUDE.md).
// Só declarações: nada roda ao carregar este arquivo.

import { app } from "../../../../scripts/app.js";
import { api } from "../../../../scripts/api.js";
import { LOG, MIN_W, PROP, SCHEMA } from "./constants.js";
import { pushUndo, showLegoToast } from "./core.js";
import { autoLayout, findNodeInHostScope, resolveBind, usable, writeWidget } from "./widgets.js";
import { controlWidgetOf, eatPointer, el, glyphBtn, nextRunValue } from "./controls.js";
import { buildWholeNodeCtrl } from "./whole_node.js";
import { makeZone, walkControls } from "./form.js";
import { closeObjectInspector, leaveEditMode } from "./inspector.js";
import { ATTACHED, attach, detach } from "./lifecycle.js";

/* ══════════════════════════════════════════════════════════════════════════
   Super Subgraph = subgrafo NATIVO do ComfyUI + cartão

   O Super Subgraph não tem motor próprio: é um subgrafo nativo (o mesmo do
   "Convert to Subgraph") com o cartão por cima. Execução, navegação (entrar,
   breadcrumb, Esc), entradas/saídas e desfazer são 100% do ComfyUI. Um
   subgrafo clássico continua clássico; "Convert Selection to SuperSubgraph"
   cria um subgrafo nativo com o cartão, e "Copy as SuperSubgraph" faz uma
   cópia independente de um subgrafo clássico, com cartão.
   ══════════════════════════════════════════════════════════════════════════ */

const liteGraph = () => window.LiteGraph || globalThis.LiteGraph;
const SS_LIB_DIR = "supersubgraph";

/** Subgrafo nativo com o cartão do Super Subgraph. */
const isSuperNode = (n) => isNativeSubgraphNode(n) && !!n?.properties?.[PROP];

/** Entra no subgrafo, do jeito nativo (breadcrumb, Esc e vista do ComfyUI). */
function enterSuper(sn) {
  const c = app.canvas;
  if (!c || !sn?.subgraph) return;
  closeObjectInspector();
  if (typeof c.openSubgraph === "function") c.openSubgraph(sn.subgraph, sn);
  else c.setGraph?.(sn.subgraph);
  c.setDirty?.(true, true);
}

/** Tabs do cartão a partir dos groups do ComfyUI que envolvem os nós. */
function groupsAround(graph, nodes) {
  return sortGroups(graphGroups(graph).filter((g) => nodes.some((n) => nodeInGroup(n, g))));
}

/** Põe o cartão (vazio, abas pelos groups) num subgrafo nativo. */
function makeSuper(node, groups = [], loose = true) {
  node.properties = node.properties || {};
  if (!node.title || /^New Subgraph$/i.test(node.title)) node.title = "Super Subgraph";
  // Nome mostrado no breadcrumb nativo (é o do subgrafo, não o título do nó).
  if (node.subgraph && (!node.subgraph.name || /^New Subgraph$/i.test(node.subgraph.name))) node.subgraph.name = node.title;
  // Sem os fios de promoção (seed, prompt, imagem…): o cartão controla esses
  // parâmetros direto, e fio + cartão brigariam pelo valor. Vale para
  // converter, "Turn into" e "Copy as"; conexões de dados ficam.
  try { removeUnusedWireInputs(node); } catch (err) { console.warn(LOG, "remove promotion wires", err); }
  emptySuperLayout(node, groups.map((g) => ({ title: g.title, color: g.color })), loose);
  attach(node);
  node.setSize?.([Math.max(MIN_W + 160, node.size?.[0] || 0), Math.max(node.size?.[1] || 0, 200)]);
  node.graph?.setDirtyCanvas?.(true, true);
  return node;
}

/** Cartão montado a partir dos nós de dentro (uma aba por group). */
function superAutoLayout(node) {
  const base = autoLayout(node);   // cabeçalho e aba Output (se houver Preview/Save dentro)
  node.properties[PROP] = { ...base, tabs: [] };
  // Com groups do ComfyUI lá dentro: uma aba por group com os nós dele; o
  // que não está em group nenhum vai para "Other".
  const groups = sortGroups(graphGroups(node.subgraph));
  const tabFor = new Map();
  const tabOf = (g) => {
    const key = g || null;
    if (!tabFor.has(key)) {
      const sec = makeZone(g ? String(g.title || "GROUP").toUpperCase() : (groups.length ? "OTHER" : "PARAMETERS"), [], g?.color ? { color: g.color } : {});
      tabFor.set(key, { tab: { name: g ? (g.title || "Group") : (groups.length ? "Other" : "Controls"), sections: [sec] }, zone: sec.tabs[0], y: 16 });
    }
    return tabFor.get(key);
  };
  for (const g of groups) tabOf(g);
  for (const inner of innerNodesOf(node)) {
    if (!(inner.widgets || []).some(usable)) continue;
    const t = tabOf(groups.length ? ownerGroup(inner, groups) : null);
    const ctl = buildWholeNodeCtrl(node, inner, "row", { x: 16, y: t.y });
    t.zone.controls.push(ctl);
    t.y += ctl.h + 32;
  }
  for (const t of tabFor.values()) if (t.zone.controls.length || groups.length) node.properties[PROP].tabs.push(t.tab);
  if (!node.properties[PROP].tabs.length) node.properties[PROP].tabs.push({ name: "Controls", sections: [makeZone("PARAMETERS")] });
  for (const t of base.tabs || []) if (t.name === "Output") node.properties[PROP].tabs.push(t);
  node.properties[PROP].subtitle = "Super Subgraph";
  node.properties[PROP].badge = `${innerNodesOf(node).length} nodes`;
  return node.properties[PROP];
}

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
 * Anota no layout o tipo de cada nó de dentro usado pelos binds
 * (`layout.nodeRefs`), para religar o cartão quando os ids mudam.
 */
function rememberNodeRefs(host) {
  const layout = host.properties?.[PROP];
  if (!layout || !hasInnerGraph(host)) return;
  const refs = {};
  for (const id of layoutNodeIds(layout)) {
    const n = innerNodesOf(host).find((x) => String(x.id) === id);
    if (n) refs[id] = { type: n.type, title: n.title || "" };
    else if (layout.nodeRefs?.[id]) refs[id] = layout.nodeRefs[id];   // perdido: guarda para religar depois
  }
  layout.nodeRefs = refs;
}

/**
 * Colar/duplicar um subgrafo faz o ComfyUI clonar a definição com ids NOVOS
 * nos nós de dentro: os binds do cartão ("<id>/<widget>") ficariam apontando
 * para os ids antigos. Religa cada id perdido ao nó de dentro de mesmo tipo
 * (e mesmo título, se houver), na mesma ordem.
 */
function repairInnerBinds(host) {
  const layout = host.properties?.[PROP];
  const refs = layout?.nodeRefs;
  if (!refs || !hasInnerGraph(host)) return false;
  const inner = innerNodesOf(host);
  const byId = new Map(inner.map((n) => [String(n.id), n]));
  const used = new Set();
  const lost = [];
  for (const id of Object.keys(refs)) {
    const n = byId.get(id);
    if (n && n.type === refs[id].type) used.add(n);
    else lost.push(id);
  }
  if (!lost.length) return false;
  const idMap = new Map();
  const byNum = (a, b) => (Number(a) - Number(b)) || String(a).localeCompare(String(b));
  const pool = [...inner].sort((a, b) => byNum(a.id, b.id));
  for (const id of lost.sort(byNum)) {
    const same = pool.filter((n) => n.type === refs[id].type && !used.has(n));
    const pick = same.find((n) => (n.title || "") === refs[id].title) || same[0];
    if (!pick) continue;
    idMap.set(id, pick.id);
    used.add(pick);
  }
  if (!idMap.size) return false;
  remapLayoutIds(layout, idMap);
  for (const [from, to] of idMap) { refs[String(to)] = refs[from]; delete refs[from]; }
  return true;
}


/** Componentes do cartão cujo nó de dentro sumiu (apagado lá dentro). */
function lostComponents(host) {
  const lost = [];
  walkControls(host.properties?.[PROP], (c) => {
    if (typeof c.bind === "string" && c.bind.includes("/") && !resolveBind(host, c.bind)) lost.push(c);
  });
  return lost;
}

/**
 * Voltando de dentro de um subgrafo: se algum componente do cartão perdeu o
 * nó (apagado lá dentro), avisa uma vez — antes só aparecia o componente
 * vermelho, e só quando alguém olhava.
 */
function warnLostComponents(host) {
  const lost = lostComponents(host);
  const sig = lost.map((c) => c.name).sort().join(",");
  if (sig === (host.__legoLostSig || "")) return;
  host.__legoLostSig = sig;
  if (!lost.length) return;
  const n = lost.length;
  showLegoToast(`${host.title || "Super Subgraph"}: ${n} component${n > 1 ? "s" : ""} lost ${n > 1 ? "their" : "its"} node — use Rebind or Remove`, 5000);
}

/* ── Promoção: cartão (sem fio) e entrada nativa (com fio) ──────────────
 * O cartão controla o parâmetro de dentro direto — não precisa de fio. O fio
 * (entrada nativa do subgrafo) fica para quando o valor deve vir de FORA:
 * "Expose as node input" cria, "Remove node input" tira. Ao tirar, o valor
 * que valia (o do nó de fora) é copiado para o parâmetro de dentro.
 */

/** Nó e widget de dentro de um bind "<id>/<widget>" do host; null se não for de dentro. */
function innerOfBind(host, bind) {
  if (!host?.subgraph || typeof bind !== "string") return null;
  const i = bind.indexOf("/");
  if (i < 1) return null;
  const node = innerNodesOf(host).find((n) => String(n.id) === bind.slice(0, i));
  const widget = node?.widgets?.find((w) => w.name === bind.slice(i + 1));
  return node && widget ? { node, widget } : null;
}

/** Entrada nativa (com fio) do host que promove `name` do nó de dentro, ou null. */
function wireInputOf(host, inner, name) {
  const sg = host?.subgraph;
  const inp = (inner?.inputs || []).find((x) => x?.link != null && (x.widget?.name === name || x.name === name));
  if (!sg || !inp) return null;
  const link = sg.getLink?.(inp.link) ?? sg.links?.get?.(inp.link) ?? sg.links?.[inp.link];
  if (!link) return null;
  const ioId = sg.inputNode?.id ?? -10;
  if (!(link.originIsIoNode || String(link.origin_id) === String(ioId))) return null;
  return host.inputs?.[link.origin_slot] || null;
}

const hasWireInput = (host, bind) => {
  const t = innerOfBind(host, bind);
  return !!(t && wireInputOf(host, t.node, t.widget.name));
};

/** Parâmetros de dentro ligados a uma entrada do host (seguindo os fios dela). */
function wireTargets(host, hin) {
  const sg = host.subgraph;
  const slot = hin?._subgraphSlot;
  const out = [];
  for (const id of slot?.linkIds || []) {
    const link = sg.getLink?.(id) ?? sg.links?.get?.(id);
    const node = link && sg.getNodeById?.(link.target_id);
    const inp = node?.inputs?.[link.target_slot];
    const w = inp && (node.getWidgetFromSlot?.(inp) || node.widgets?.find((x) => x.name === (inp.widget?.name || inp.name)));
    if (w) out.push(w);
  }
  return out;
}

/** Tira a entrada nativa (fio) do host, guardando o valor dela no parâmetro de dentro. */
function dropWireInput(host, hin) {
  const slot = hin?._subgraphSlot;
  if (!slot || typeof host.subgraph?.removeInput !== "function") return false;
  const hw = (host.widgets || []).find((x) => x?.name === hin.widget?.name);
  if (hw) {
    for (const w of wireTargets(host, hin)) {
      // Nunca troca o tipo do valor (texto num widget de objeto quebra o nó).
      if (w.value == null || typeof w.value === typeof hw.value) w.value = hw.value;
    }
  }
  host.subgraph.removeInput(slot);
  return true;
}

/** "Expose as node input": cria a entrada nativa (com fio) para o parâmetro do componente. */
function exposeAsInput(host, bind) {
  const t = innerOfBind(host, bind);
  const sg = host?.subgraph;
  if (!t || typeof sg?.addInput !== "function") return false;
  if (wireInputOf(host, t.node, t.widget.name)) return true;
  const slot = t.node.getSlotFromWidget?.(t.widget);
  if (!slot) { showLegoToast("This parameter can't become a node input"); return false; }
  const names = new Set((sg.inputs || []).map((x) => x.name));
  let name = t.widget.name, k = 1;
  while (names.has(name)) name = `${t.widget.name}_${k++}`;
  const input = sg.addInput(name, String(slot.type ?? t.widget.type ?? "*"));
  input.label = slot.label || t.widget.label;
  if (!input.connect(slot, t.node)) {
    sg.removeInput(input);
    showLegoToast("Could not create the node input");
    return false;
  }
  afterWireChange(host);
  return true;
}

/** "Remove node input": tira o fio; o cartão segue controlando o parâmetro direto. */
function removeWireInput(host, bind) {
  const t = innerOfBind(host, bind);
  const hin = t && wireInputOf(host, t.node, t.widget.name);
  if (!hin) return false;
  if (hin.link != null && !confirm(`"${hin.label || hin.name}" is connected outside the subgraph. Remove the input and its connection?`)) return false;
  dropWireInput(host, hin);
  afterWireChange(host);
  return true;
}

/**
 * Tira as promoções com fio que ninguém liga por fora (as que o ComfyUI cria
 * sozinho ao converter: seed, prompt, imagem…). Entradas de dados ligadas lá
 * fora (IMAGE, MODEL…) ficam. Devolve quantas saíram.
 */
/** Outros nós que usam a MESMA definição de subgrafo (cópias do mesmo subgrafo). */
function otherInstancesOf(host) {
  const root = app.rootGraph || host?.graph?.rootGraph || app.graph;
  const out = [];
  const visit = (g) => { for (const n of g?._nodes || g?.nodes || []) if (n !== host && n?.subgraph && n.subgraph === host.subgraph) out.push(n); };
  visit(root);
  for (const sg of root?.subgraphs?.values?.() || []) visit(sg);
  return out;
}

function removeUnusedWireInputs(host) {
  let n = 0;
  // A entrada é da definição: se outra cópia a usa com fio lá fora, fica.
  const others = otherInstancesOf(host);
  for (const hin of [...(host?.inputs || [])]) {
    if (hin?.link != null || !hin?.widget || !hin._subgraphSlot) continue;
    if (!wireTargets(host, hin).length) continue;
    const idx = host.inputs.indexOf(hin);
    if (others.some((o) => o.inputs?.[idx]?.link != null)) continue;
    if (dropWireInput(host, hin)) n++;
  }
  if (n) afterWireChange(host);
  return n;
}

function afterWireChange(host) {
  host.__legoState?.refresh();
  host.setDirtyCanvas?.(true, true);
  app.canvas?.setDirty?.(true, true);
}

/* ── Marca "no cartão" dentro do subgrafo ──────────────────────────────────
 * Lá dentro, todo parâmetro que está no cartão ganha um contorno e o nó um
 * selo "on card" — no uso normal e no Target Picker. Desenhado no próprio
 * canvas (segue zoom e pan, não cobre menus).
 */
const CARD_MARK = "#a855f7";

/** Parâmetros do grafo `graph` que estão no cartão de algum SS: Map(id do nó -> Set(widget)). */
function cardBindsIn(graph) {
  const map = new Map();
  for (const host of ATTACHED) {
    if (!graph || host.subgraph !== graph) continue;
    walkControls(host.properties?.[PROP], (c) => {
      const t = typeof c.bind === "string" ? c.bind.indexOf("/") : -1;
      if (t < 1) return;
      const id = c.bind.slice(0, t);
      if (!map.has(id)) map.set(id, new Set());
      map.get(id).add(c.bind.slice(t + 1));
    });
  }
  return map;
}

/** Retângulo arredondado (navegadores antigos: retângulo simples). */
function roundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/**
 * Nós em HTML (Vue Nodes): o canvas fica por baixo deles, então a marca vai
 * como atributo nas linhas dos parâmetros (o CSS desenha contorno e selo). O
 * Vue não mexe em atributos que não são dele.
 */
function syncVueMarks(marks) {
  if (!document.querySelector(".lg-node")) return;
  const want = new Set();
  for (const [id, names] of marks) {
    const nodeEl = document.querySelector(`.lg-node[data-node-id="${String(id).replace(/"/g, "")}"]`);
    if (!nodeEl) continue;
    const node = app.canvas?.graph?.getNodeById?.(id);
    want.add(nodeEl);
    for (const row of nodeEl.querySelectorAll('[data-testid="node-widget"]')) {
      const text = row.querySelector('[data-testid="widget-layout-field-label"]')?.textContent?.trim();
      const w = (node?.widgets || []).find((x) => x.name === text || x.label === text);
      if (w && names.has(w.name)) want.add(row);
    }
  }
  for (const e of document.querySelectorAll("[data-lego-on-card]")) if (!want.has(e)) e.removeAttribute("data-lego-on-card");
  for (const e of want) if (!e.hasAttribute("data-lego-on-card")) e.setAttribute("data-lego-on-card", "");
  // Selo "on card" DENTRO da linha do cabeçalho, logo depois do título: ocupa
  // o próprio espaço e os botões do cabeçalho (wireless do AllmaNodes etc.)
  // ficam ao lado, não embaixo dele. O Vue pode refazer o cabeçalho: cada
  // desenho do canvas confere de novo.
  for (const b of document.querySelectorAll(".lego-oncard-badge")) {
    if (!want.has(b.closest(".lg-node"))) b.remove();
  }
  for (const nodeEl of want) {
    if (!nodeEl.classList?.contains("lg-node")) continue;
    const id = nodeEl.getAttribute("data-node-id");
    const row = nodeEl.querySelector(`[data-testid="node-header-${String(id).replace(/"/g, "")}"]`)?.firstElementChild;
    if (!row || row.querySelector(":scope > .lego-oncard-badge")) continue;
    const badge = el("span", "lego-oncard-badge", "on card");
    badge.title = "Parameters of this node are on the Super Subgraph card";
    row.insertBefore(badge, row.children[1] || null);
  }
}

function drawCardMarks(canvas, ctx) {
  const graph = canvas?.graph;
  const inside = graph && graph !== (app.rootGraph || app.graph);
  const marks = inside ? cardBindsIn(graph) : new Map();
  syncVueMarks(marks);
  if (!marks.size) return;
  const LG = liteGraph();
  const T = LG?.NODE_TITLE_HEIGHT || 30;
  ctx.save();
  for (const node of graph._nodes || graph.nodes || []) {
    const names = marks.get(String(node.id));
    if (!names) continue;
    const [x, y] = node.pos;
    const [w] = node.size;
    // Selo no título, logo depois do texto do título: a ponta direita da barra
    // é dos botões de título (o wireless do AllmaNodes, por exemplo).
    ctx.font = canvas.title_text_font || `${LG?.NODE_TEXT_SIZE || 14}px Arial`;
    const titleW = ctx.measureText(String(node.getTitle?.() ?? node.title ?? "")).width;
    ctx.font = "600 10px Inter, system-ui, sans-serif";
    const label = "on card";
    const tw = ctx.measureText(label).width + 12;
    const bx = Math.min(x + T + titleW + 8, x + w - tw - 8);
    ctx.fillStyle = CARD_MARK;
    ctx.beginPath();
    const py = y - T + (T - 16) / 2;
    roundRect(ctx, bx, py, tw, 16, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(label, bx + 6, py + 8);
    if (node.flags?.collapsed) continue;
    // Contorno em cada parâmetro que está no cartão.
    // Tracejado: no Target Picker, a borda cheia roxa é "nó inteiro escolhido".
    ctx.strokeStyle = CARD_MARK;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    for (const wd of node.widgets || []) {
      if (!names.has(wd.name) || wd.hidden) continue;
      const wy = wd.y ?? wd.last_y;
      if (wy == null) continue;
      const h = wd.computedHeight ?? wd.computeSize?.(w)?.[1] ?? LG?.NODE_WIDGET_HEIGHT ?? 20;
      ctx.beginPath();
      roundRect(ctx, x + 4, y + wy - 1, w - 8, h + 2, 6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Liga o desenho das marcas no canvas (uma vez). */
function installCardMarks() {
  const c = app.canvas;
  if (!c || c.__legoMarks) return;
  c.__legoMarks = true;
  const orig = c.onDrawForeground;
  c.onDrawForeground = function (ctx, area) {
    const r = orig?.apply(this, arguments);
    try { drawCardMarks(this, ctx); } catch (e) { /* marca é só visual */ }
    return r;
  };
}

/** Seleção → subgrafo nativo com cartão. */
function convertSelectionToSuper(nodes = selectedNodes()) {
  const graph = app.canvas?.graph || app.graph;
  nodes = nodes.filter((n) => n.graph === graph);
  if (!nodes.length) { showLegoToast("Select the nodes to convert first"); return null; }
  if (typeof graph.convertToSubgraph !== "function") { alert("Super Subgraph needs a ComfyUI version with native subgraphs."); return null; }
  const groups = groupsAround(graph, nodes);
  const loose = nodes.some((n) => !ownerGroup(n, groups));
  let res;
  try {
    res = graph.convertToSubgraph(new Set([...nodes, ...groups]));
  } catch (err) {
    console.error(LOG, "convert to subgraph", err);
    alert(`Could not convert to subgraph: ${err.message || err}`);
    return null;
  }
  const sn = res?.node;
  if (!sn) return null;
  makeSuper(sn, groups, loose);   // (tira os fios que o ComfyUI promoveu sozinho)
  app.canvas?.selectItems?.([sn]);
  showLegoToast(`Super Subgraph created with ${nodes.length} node${nodes.length > 1 ? "s" : ""}`);
  return sn;
}

/**
 * Cópia INDEPENDENTE de um subgrafo clássico, com cartão: a definição do
 * subgrafo é clonada com id novo e nós de dentro com ids novos (o ComfyUI
 * guarda valores por id de nó; ids repetidos ligariam as duas cópias). O
 * original continua clássico e intacto; mexer num não muda o outro.
 * (Desempacotar uma 2ª instância quebra a definição compartilhada — por isso
 * não é usado.)
 */
function copyAsSuper(node) {
  const graph = node?.graph;
  const root = app.rootGraph || graph?.rootGraph;
  const LG = liteGraph();
  const src = node?.subgraph;
  if (!graph || !root || !src || typeof root.createSubgraph !== "function") return null;
  const data = JSON.parse(JSON.stringify(src.asSerialisable ? src.asSerialisable() : src.serialize()));
  data.id = crypto.randomUUID();
  data.name = `${node.title || data.name || "Subgraph"} (Super)`;
  const state = root.state || {};
  const ids = new Map();
  for (const n of data.nodes || []) {
    const nid = ++state.lastNodeId;
    ids.set(String(n.id), nid);
    n.id = nid;
  }
  for (const l of data.links || []) {
    if (ids.has(String(l.origin_id))) l.origin_id = ids.get(String(l.origin_id));
    if (ids.has(String(l.target_id))) l.target_id = ids.get(String(l.target_id));
  }
  const sub = root.createSubgraph(data);
  sub.configure?.(data);
  const sn = LG?.createNode?.(sub.id);
  if (!sn) return null;
  sn.pos = [node.pos[0] + (node.size?.[0] || 200) + 60, node.pos[1]];
  sn.title = data.name;
  graph.add(sn);
  // Os valores em uso no original (parâmetros promovidos, um por nó) vão para
  // a cópia antes de ela perder os fios — senão ela nasceria com os de dentro.
  for (const w of sn.widgets || []) {
    const src = (node.widgets || []).find((x) => x.name === w.name && !x.__lego);
    if (src && typeof src.value === typeof w.value) w.value = src.value;
  }
  makeSuper(sn);
  app.canvas?.selectItems?.([sn]);
  showLegoToast("Independent Super Subgraph copy created");
  return sn;
}

/** Nós de dentro do host: do Super Subgraph ou do subgrafo nativo. */
function innerNodesOf(host) {
  return host?.subgraph?._nodes || host?.subgraph?.nodes || [];
}
const hasInnerGraph = (host) => !!host?.subgraph;

/**
 * Layout de um Super Subgraph recém-compactado: VAZIO. Nada é promovido
 * sozinho — o que aparece no cartão é escolha de quem monta.
 */
function emptySuperLayout(node, groups = [], loose = true) {
  // Um group do ComfyUI = uma aba (com o nome e a cor dele), ainda vazia.
  const tabs = groups.map((g) => ({
    name: g.title || "Group",
    sections: [makeZone(String(g.title || "GROUP").toUpperCase(), [], g.color ? { color: g.color } : {})],
  }));
  if (!tabs.length) tabs.push({ name: "Controls", sections: [makeZone("PARAMETERS")] });
  else if (loose) tabs.push({ name: "Other", sections: [makeZone("OTHER")] });
  node.properties[PROP] = {
    schema: SCHEMA,
    title: (node.title || "Super Subgraph").toUpperCase(),
    subtitle: "Super Subgraph",
    badge: `${innerNodesOf(node).length} nodes`,
    activeTab: 0,
    tabs,
  };
  return node.properties[PROP];
}

/** Seleção atual do canvas (só nós). */
function selectedNodes() {
  const c = app.canvas;
  const sel = c?.selectedItems ? [...c.selectedItems] : Object.values(c?.selected_nodes || {});
  const Node = liteGraph()?.LGraphNode;
  const Group = liteGraph()?.LGraphGroup;
  const nodes = sel.filter((n) => (Node ? n instanceof Node : n && n.pos && n.type));
  // Group selecionado leva junto os nós que estão dentro dele.
  for (const g of sel.filter((x) => Group && x instanceof Group)) {
    for (const n of c.graph?._nodes || c.graph?.nodes || []) {
      if (nodeInGroup(n, g) && !nodes.includes(n)) nodes.push(n);
    }
  }
  return nodes;
}

/* ── Groups do ComfyUI ─────────────────────────────────────────────────────
 * Ao compactar, os groups que contêm nós da seleção vão junto para dentro
 * do Super Subgraph (e voltam no Unpack), e cada um vira uma aba do cartão.
 */
function graphGroups(graph) {
  return [...(graph?._groups || graph?.groups || [])];
}

function groupRect(g) {
  const b = g?.serialize?.().bounding || g?._bounding || [g?.pos?.[0] || 0, g?.pos?.[1] || 0, g?.size?.[0] || 0, g?.size?.[1] || 0];
  return [b[0], b[1], b[2], b[3]];
}

/** O centro do nó está dentro do group? */
function nodeInGroup(n, g) {
  if (!n?.pos) return false;
  const [x, y, w, h] = groupRect(g);
  const cx = n.pos[0] + (n.size?.[0] || 0) / 2;
  const cy = n.pos[1] + (n.size?.[1] || 0) / 2;
  return cx >= x && cx <= x + w && cy >= y && cy <= y + h;
}

/** Group "dono" do nó: o menor que o contém (groups podem estar um dentro do outro). */
function ownerGroup(n, groups) {
  let best = null, area = Infinity;
  for (const g of groups) {
    if (!nodeInGroup(n, g)) continue;
    const [, , w, h] = groupRect(g);
    if (w * h < area) { best = g; area = w * h; }
  }
  return best;
}

/** Groups em ordem de leitura (de cima para baixo, da esquerda para a direita). */
function sortGroups(groups) {
  return [...groups].sort((a, b) => {
    const [ax, ay] = groupRect(a), [bx, by] = groupRect(b);
    return (Math.round(ay / 80) - Math.round(by / 80)) || (ax - bx);
  });
}

const isNativeSubgraphNode = (n) => !!n?.subgraph && typeof n.isSubgraphNode === "function" && n.isSubgraphNode();

/** Posição do último clique no canvas (ou o centro da vista). */

const safeFileName = (s) => String(s || "SuperSubgraph").replace(/[\\/:*?"<>|]+/g, "_").trim().slice(0, 80) || "SuperSubgraph";

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
  const name = prompt("Save this card layout as:", host.title || host.properties?.[PROP]?.title || "Layout");
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
  const name = host.title || host.properties?.[PROP]?.title || "Layout";
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

/**
 * Opções do menu "SuperSubgraph" de um nó (botão direito e botão ⋯ do
 * cartão). Os nomes dizem O QUE é salvo: o Super Subgraph inteiro (com os nós)
 * ou só o layout do cartão.
 */
function superMenuOptions(node) {
  const has = !!node.properties?.[PROP];
  const isSS = isSuperNode(node);
  const isSub = isNativeSubgraphNode(node);
  const sub = [];
  const sep = () => { if (sub.length && sub[sub.length - 1] !== null) sub.push(null); };
  refreshLayoutLibrary();   // para a próxima abertura do menu

  const sel = selectedNodes();
  if (sel.length && sel.includes(node) && !(sel.length === 1 && isSub)) {
    sub.push({ content: `Convert Selection to SuperSubgraph (${sel.length})`, callback: () => convertSelectionToSuper(sel) });
  }
  if (isSub) {
    sep();
    sub.push({ content: "Open Inside", callback: () => enterSuper(node) });
    if (!has) {
      // Subgrafo clássico: vira Super aqui mesmo, ou ganha uma cópia Super independente.
      sub.push({ content: "Turn into SuperSubgraph (add card)", callback: () => makeSuper(node) });
      sub.push({ content: "Copy as SuperSubgraph (independent)", callback: () => copyAsSuper(node) });
    }
  }
  if (has) {
    sub.push({
      content: node.__legoState?.edit ? "Finish Editing Card" : "Edit Card",
      callback: () => {
        const st = node.__legoState || attach(node);
        st.edit = !st.edit;
        if (!st.edit) leaveEditMode(st);
        st.refresh();
      },
    });
    sep();
    sub.push({ content: "Save Card Layout…", callback: () => saveLayoutToLibrary(node) });
    if (SS_LAYOUTS.length) {
      sub.push({ content: "Load Card Layout", has_submenu: true, submenu: { options: SS_LAYOUTS.map((name) => ({ content: name, callback: () => loadLayoutFromLibrary(node, name) })) } });
    }
  } else if (!isSub) {
    sep();
    sub.push({ content: "Add Card UI", callback: () => { node.properties = node.properties || {}; node.properties[PROP] = autoLayout(node); attach(node); } });
  }

  // Arquivos: para mandar para alguém / trazer de fora.
  const files = [];
  if (has) files.push({ content: "Export Card Layout…", callback: () => exportLayoutToFile(node) }, { content: "Import Card Layout…", callback: () => importLayoutFromFile(node) });
  if (files.length) sub.push({ content: "Files", has_submenu: true, submenu: { options: files } });

  // O que é mais raro ou desfaz coisas fica em "More".
  const more = [];
  if (has) {
    more.push({
      content: "Rebuild Card from Widgets",
      callback: () => {
        const keepEdit = node.__legoState?.edit;
        pushUndo(node);
        node.properties[PROP] = isSS ? superAutoLayout(node) : autoLayout(node);
        if (node.__legoState) { node.__legoState.edit = !!keepEdit; node.__legoState.refresh(); }
        else attach(node);
      },
    });
    if (SS_LAYOUTS.length) more.push({ content: "Delete a Saved Card Layout", has_submenu: true, submenu: { options: SS_LAYOUTS.map((name) => ({ content: name, callback: () => deleteLayoutFromLibrary(name) })) } });
  }
  if (isSS && (node.inputs || []).some((i) => i?.widget && i.link == null && i._subgraphSlot)) {
    more.push({ content: "Remove unused input wires (the card controls them)", callback: () => {
      const n = removeUnusedWireInputs(node);
      showLegoToast(n ? `Removed ${n} input wire${n > 1 ? "s" : ""}` : "No unused input wires");
    } });
  }
  // Num Super Subgraph, tirar o cartão devolve o subgrafo clássico nativo.
  if (has) more.push({ content: isSS ? "Turn back into a classic Subgraph (remove card)" : "Remove Card UI", callback: () => detach(node) });
  if (more.length) sub.push({ content: "More", has_submenu: true, submenu: { options: more } });

  while (sub.length && sub[sub.length - 1] === null) sub.pop();
  while (sub.length && sub[0] === null) sub.shift();
  return sub;
}

/** Abre o menu "SuperSubgraph" do nó solto na tela (botão ⋯ do cartão). */
function openSuperMenu(node, e) {
  const LG = liteGraph();
  if (!LG?.ContextMenu) return;
  e.preventDefault();
  e.stopPropagation();
  new LG.ContextMenu(superMenuOptions(node), { event: e, title: "SuperSubgraph" });
}

/**
 * Botão direito no cartão, fora de um componente: o menu do próprio nó (o do
 * ComfyUI, com o "SuperSubgraph" dentro) — antes só abria clicando na borda.
 */
function openNodeMenuFromCard(node, e) {
  const c = app.canvas;
  e.preventDefault();
  try {
    if (typeof c?.processContextMenu === "function") {
      const [cx, cy] = c.convertEventToCanvasOffset?.(e) || [0, 0];
      Object.assign(e, { canvasX: cx, canvasY: cy });
      c.processContextMenu(node, e);
      return;
    }
  } catch (err) {
    console.warn(LOG, "node menu", err);
  }
  openSuperMenu(node, e);
}


/* ── Execução vista no cartão ─────────────────────────────────────────── */
const RUN = new Map();   // id do host -> estado

function runOf(host) {
  const k = String(host.id);
  let r = RUN.get(k);
  if (!r) RUN.set(k, (r = { running: false, done: new Set(), cur: null, value: 0, max: 0, err: null }));
  return r;
}

/**
 * Ids de execução do próprio host: "<id>" quando está no workflow; dentro de
 * outro subgrafo, "<pai>:<id>" (um por instância do pai — a definição pode
 * estar em vários lugares).
 */
function execPathsOf(host, depth = 0) {
  const h = String(host?.id);
  const g = host?.graph;
  const root = app.rootGraph || app.graph;
  if (!g || g === root || g.isRootGraph || depth > 8) return [h];
  const out = [];
  const visit = (graph) => {
    for (const n of graph?._nodes || graph?.nodes || []) {
      if (n?.subgraph === g) for (const p of execPathsOf(n, depth + 1)) out.push(`${p}:${h}`);
    }
  };
  visit(root);
  for (const sg of root?.subgraphs?.values?.() || []) visit(sg);
  return out.length ? out : [h];
}

/** Id (no subgrafo do host) do nó de dentro que gerou o evento `id`; null se não é dele. */
function innerIdOf(host, id, paths = execPathsOf(host)) {
  const s = String(id ?? "");
  for (const p of paths) if (s.startsWith(`${p}:`)) return s.slice(p.length + 1).split(":")[0];
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

/**
 * Depois de cada Run: os steppers com o modo guardado no cartão (+1, −1,
 * aleatório — parâmetros sem o "control after generate" do ComfyUI) andam,
 * como a seed. Quem tem o combo do ComfyUI já é tratado por ele.
 */
function applyCardRunModes() {
  for (const host of ATTACHED) {
    walkControls(host.properties?.[PROP], (c) => {
      if (c.seedMode !== true || !c.runMode || c.runMode === "fixed" || !c.bind) return;
      const hit = resolveBind(host, c.bind);
      if (!hit?.widget || controlWidgetOf(hit.node, hit.widget)) return;
      writeWidget(hit.node, hit.widget, nextRunValue(hit.widget, c.runMode));
    });
  }
}

function onRunEvent(type, d) {
  for (const host of ATTACHED) {
    const r = runOf(host);
    const paths = execPathsOf(host);
    const self = (id) => paths.includes(String(id));
    const innerIdOf_ = (id) => innerIdOf(host, id, paths);
    let changed = false;
    if (type === "execution_start") {
      r.running = false; r.done.clear(); r.cur = null; r.value = r.max = 0; r.err = null;
      changed = true;
    } else if (type === "progress_state") {
      for (const n of Object.values(d?.nodes || {})) {
        const id = String(n.node_id ?? "");
        const iid = innerIdOf_(id);
        if (!self(id) && !iid) continue;
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
      else if (self(d) || innerIdOf_(d)) { if (!r.running) { r.running = true; changed = true; } }
    } else if (type === "execution_error") {
      const id = String(d?.node_id ?? "");
      if (self(id) || innerIdOf_(id)) {
        r.err = { msg: String(d.exception_message || d.exception_type || "failed").trim(), where: innerIdOf_(id) || r.cur };
        r.running = false;
        changed = true;
      }
    } else if (type === "execution_interrupted" || type === "execution_success") {
      if (r.running) { r.running = false; r.cur = null; changed = true; }
    }
    if (changed) paintRun(host);
  }
}

export { applyCardRunModes, liteGraph, SS_LIB_DIR, isSuperNode, enterSuper, groupsAround, makeSuper, superAutoLayout, remapLayoutIds, rememberNodeRefs, repairInnerBinds, lostComponents, warnLostComponents, convertSelectionToSuper, copyAsSuper, innerNodesOf, hasInnerGraph, emptySuperLayout, selectedNodes, graphGroups, groupRect, nodeInGroup, ownerGroup, sortGroups, isNativeSubgraphNode, safeFileName, SS_LAYOUT_TYPE, SS_LAYOUT_DIR, SS_LAYOUTS, layoutNodeIds, layoutPackage, applyLayoutPackage, refreshLayoutLibrary, saveLayoutToLibrary, loadLayoutFromLibrary, deleteLayoutFromLibrary, exportLayoutToFile, importLayoutFromFile, superMenuOptions, openSuperMenu, openNodeMenuFromCard, RUN, runOf, execPathsOf, innerIdOf, innerTitle, paintRun, onRunEvent, innerOfBind, wireInputOf, hasWireInput, exposeAsInput, removeWireInput, removeUnusedWireInputs, cardBindsIn, installCardMarks };
