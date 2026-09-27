/* Ciclo de vida: attach/detach, varredura, cores do nó, esconder widgets nativos, altura do cartão. */
// Parte do ComfyUI-SuperSubgraph (ver web/js/super_subgraph.js e CLAUDE.md).
// Só declarações: nada roda ao carregar este arquivo.

import { app } from "../../../../scripts/app.js";
import { CSS } from "../super_subgraph_css.js";
import { PAD, PROP, SCHEMA, SWEEP_MS, TICK_MS } from "./constants.js";
import { injectCSS, pushUndo, pushUndoSnapshot } from "./core.js";
import { autoLayout, requestCanvasDirty, startWatchPoll, syncWatchedWidgets } from "./widgets.js";
import { el } from "./controls.js";
import { buildControl } from "./panels.js";
import { requiredNodeWidth } from "./whole_node.js";
import { renderAlignBars } from "./form.js";
import { INSPECTOR, closeObjectInspector } from "./inspector.js";
import { buildCard } from "./card.js";
import { paintRun, rememberNodeRefs, repairInnerBinds } from "./native.js";

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

/** A cor (#rgb, #rrggbb, rgb()) é escura? null se não der para saber. */
function isDarkColor(c) {
  const str = String(c || "").trim();
  let r, g, b;
  let m = /^#([0-9a-f]{3})$/i.exec(str);
  if (m) [r, g, b] = [...m[1]].map((h) => parseInt(h + h, 16));
  else if ((m = /^#([0-9a-f]{6})/i.exec(str))) [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  else if ((m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(str))) [r, g, b] = [m[1], m[2], m[3]].map(Number);
  else return null;
  // Luminância percebida (0–255).
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

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
    root.style.removeProperty("--lego-text");
    root.style.removeProperty("--lego-dim");
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
  // O texto segue o FUNDO do nó, não o tema: no tema claro, um nó vermelho
  // escuro com texto escuro deixava os valores invisíveis.
  const dark = isDarkColor(effectiveBg);
  if (dark != null) {
    root.style.setProperty("--lego-text", dark ? "#f1f1f1" : "#1a1a1a");
    root.style.setProperty("--lego-dim", dark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.6)");
  }
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
  const syncOnDraw = (orig) => function () {
    if (this.color !== this.__lastLegoColor || this.bgcolor !== this.__lastLegoBgcolor) {
      this.__lastLegoColor = this.color;
      this.__lastLegoBgcolor = this.bgcolor;
      applyNodeColorTheme(this);
    }
    return orig ? orig.apply(this, arguments) : undefined;
  };
  node.onDrawForeground = syncOnDraw(node.onDrawForeground);
  node.onDrawBackground = syncOnDraw(node.onDrawBackground);

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
    // Campo comum (sem getter): guardar o valor atual antes de trocar por
    // acessor, senão a cor carregada do workflow some.
    if (descColor && !descColor.get) node.__rawColor = descColor.value;
    if (descBg && !descBg.get) node.__rawBgcolor = descBg.value;

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
  // A escala da UI do cartão foi removida: workflows antigos ainda a trazem.
  delete node.properties[PROP].scale;
  // Cópia colada: os nós de dentro ganharam ids novos.
  repairInnerBinds(node);

  const host = el("div");
  host.style.width = "100%";
  passMiddleDragToCanvas(host);
  passWheelToCanvas(host);
  node.__legoHost = host;

  let lastObservedH = 0;
  const state = {
    hostNode: node,
    edit: false,
    dragging: null,
    armedTool: null,   // ferramenta da paleta esperando um clique no formulário
    selectedName: null, // nome do componente aberto no Inspetor de Objetos
    selectedNames: new Set(), // conjunto de componentes selecionados (multi-seleção)
    watchers: new Map(),
    seen: new Map(),   // último valor desenhado de cada widget vigiado
    outputViews: [],   // áreas de output vivas, repintadas a cada `executed`
    observers: [],     // ResizeObservers dos controles; desligados a cada refresh
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
      for (const o of state.observers) o.disconnect();
      state.observers = [];
      host.replaceChildren(buildCard(node, state));
      paintRun(node);
      renderAlignBars(node, state);
      rememberNodeRefs(node);
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
    const minW = requiredNodeWidth(node, host);
    return [Math.max(minW, node.size?.[0] || minW), cardHeight(host) + PAD];
  };
  widget.computeLayoutSize = () => {
    hideNative(node);
    const minW = requiredNodeWidth(node, host);
    // Não agendar redimensionamento aqui para evitar loop infinito com LiteGraph
    return { minWidth: minW, minHeight: Math.max(160, cardHeight(host)) };
  };

  // Embrulha onResize uma vez só; o limite usa o cartão ATUAL (depois de um
  // "Remove Card UI" não há cartão e o nó volta a encolher livremente).
  if (!node.__legoResizeHooked) {
    node.__legoResizeHooked = true;
    const origOnResize = node.onResize;
    node.onResize = function (size) {
      if (origOnResize) origOnResize.apply(this, arguments);
      const h = this.__legoHost;
      if (!h || !Array.isArray(size)) return;
      const minW = requiredNodeWidth(this, h);
      const minH = Math.max(160, cardHeight(h) + PAD);
      if (size[0] < minW) size[0] = minW;
      if (size[1] < minH) size[1] = minH;
    };
  }
  widget.onRemove = () => {
    ATTACHED.delete(node);
    // Nó apagado com o Inspetor aberto nele: o Inspetor sai junto.
    if (INSPECTOR?.__host === node) closeObjectInspector();
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


/** Altura do cartão em si — o host mede o nó, não o conteúdo. */
function cardHeight(host) {
  if (!host) return 260;
  const card = host.firstElementChild;
  if (!card) return 260;
  const h = Math.max(card.scrollHeight || 0, card.offsetHeight || 0);
  return Math.ceil(h || 260);
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
  const minW = requiredNodeWidth(node, host);
  const curW = Math.ceil(node.size?.[0] || minW);
  const curH = Math.ceil(node.size?.[1] || 0);
  const targetW = Math.max(minW, curW);
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
  node.__legoState?.observers?.forEach((o) => o.disconnect());
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

export { ATTACHED, sweepTimer, isLayoutValid, startSweep, hideNative, showNative, passMiddleDragToCanvas, passWheelToCanvas, DEFAULT_NODE_COLORS, isDarkColor, applyNodeColorTheme, installNodeColorHooks, attach, cardHeight, resize, detach };
