import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { CSS } from "./super_subgraph_css.js";
import { EXT, GRID, LOG, PROP } from "./ss/constants.js";
import { injectCSS } from "./ss/core.js";
import { describeWidget, usable } from "./ss/widgets.js";
import { OUTPUTS, notifyOutputViews, recordOutput } from "./ss/outputs.js";
import { mirrorModeFor } from "./ss/panels.js";
import { buildWholeNodeCtrl } from "./ss/whole_node.js";
import { ATTACHED, attach } from "./ss/lifecycle.js";
import { convertSelectionToSuper, exposeAsInput, installCardMarks, onRunEvent, refreshLayoutLibrary, removeWireInput, selectedNodes, superMenuOptions, warnLostComponents } from "./ss/native.js";

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

    refreshLayoutLibrary();
    // Dentro do subgrafo: contorno nos parâmetros que estão no cartão.
    installCardMarks();
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
    // Voltando de dentro de um subgrafo, os cartões do grafo de fora se refazem.
    window.addEventListener("litegraph:set-graph", () => setTimeout(() => {
      sweep();
      // Cartões que ficaram visíveis de novo: algum componente perdeu o nó?
      const cur = app.canvas?.graph;
      for (const host of ATTACHED) if (host.graph === cur && host.__legoState) warnLostComponents(host);
    }, 50));
  },

  nodeCreated(node) {
    if (node?.properties?.[PROP]) {
      try { attach(node); } catch (e) { console.error(LOG, "nodeCreated attach failed", node.id, e); }
    }
    // Colar (Ctrl+V) e duplicar criam o nó vazio e só DEPOIS aplicam as
    // propriedades (configure): o cartão entra quando o layout chega.
    if (!node || node.__legoConfigureHooked) return;
    node.__legoConfigureHooked = true;
    const orig = node.onConfigure;
    node.onConfigure = function () {
      const r = orig?.apply(this, arguments);
      if (this.properties?.[PROP] && !this.__legoState) {
        setTimeout(() => {
          if (!this.properties?.[PROP] || this.__legoState || !this.graph) return;
          try { attach(this); } catch (e) { console.error(LOG, "attach failed", this.id, e); }
        }, 0);
      }
      return r;
    };
  },

  async loadedGraphNode(node) {
    if (node.properties?.[PROP]) {
      try { attach(node); } catch (e) { console.error(LOG, "attach failed", node.id, e); }
    }
  },

  // Tudo do SuperSubgraph num item só ("SuperSubgraph ▸"), no canvas e no nó.
  getCanvasMenuItems() {
    const sel = selectedNodes();
    if (!sel.length) return [];
    return [null, { content: "SuperSubgraph", has_submenu: true, submenu: { options: [
      { content: `Convert Selection to SuperSubgraph (${sel.length})`, callback: () => convertSelectionToSuper(sel) },
    ] } }];
  },

  getNodeMenuItems(node) {
    if (!node) return [];
    const sub = superMenuOptions(node);
    return sub.length ? [null, { content: "SuperSubgraph", has_submenu: true, submenu: { options: sub } }] : [];
  },

  __flatNode(node) { return this.__flatMenu(this.getNodeMenuItems(node)); },
  __flatCanvas() { return this.__flatMenu(this.getCanvasMenuItems()); },
  /** Para testes e scripts: como o cartão trata um widget (tests/tools/scan_widgets.mjs). */
  __classify(w) {
    return { usable: usable(w), kind: describeWidget(w).kind, mirror: mirrorModeFor(w) };
  },
  /** Para testes e scripts: promove o nó de dentro inteiro (como o Target Picker) na 1ª zona. */
  __promoteWhole(host, node, orientation = "row") {
    const layout = host.properties[PROP];
    const sec = layout.tabs[layout.activeTab || 0].sections[0];
    const list = sec.tabs ? (sec.tabs[sec.activeTab || 0].controls ||= []) : (sec.controls ||= []);
    const y = Math.max(16, ...list.map((c) => (c.y || 0) + (c.h || 46) + GRID));
    const ctrl = buildWholeNodeCtrl(host, node, orientation, { x: 16, y });
    list.push(ctrl);
    host.__legoState?.refresh();
    return ctrl;
  },
  /** Para testes e scripts: cria/tira a entrada nativa (fio) de um parâmetro do cartão. */
  __exposeAsInput(host, bind) { return exposeAsInput(host, bind); },
  __removeWireInput(host, bind) { return removeWireInput(host, bind); },
  /** Para testes e scripts: todos os itens do menu, com os de submenus, numa lista só. */
  __flatMenu(items) {
    const out = [];
    const walk = (list) => { for (const it of list || []) { if (!it) continue; out.push(it); walk(it.submenu?.options); } };
    walk(items);
    return out;
  },
});

console.log(`${LOG} v2 (DOM) loaded`);
