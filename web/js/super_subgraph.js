import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

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

/* ══════════════════════════════════════════════════════════════════════════
   Estilo
   ══════════════════════════════════════════════════════════════════════════ */

const CSS = `
/* ══════════════════════════════════════════════════════════════════════════
   JANELA DE ADIÇÃO E SELEÇÃO DE NÓS / PARÂMETROS NO ESTILO COMFYUI NATIVO (1360px x 860px - image_9c491d.png)
   ══════════════════════════════════════════════════════════════════════════ */
.lego-comfy-backdrop{
  position: fixed;
  inset: 0;
  z-index: 100000;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(5px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  -webkit-font-smoothing: antialiased;
}

.lego-comfy-dialog{
  width: min(1360px, 94vw);
  max-width: 96vw;
  height: min(860px, 90vh);
  max-height: 92vh;
  min-height: 480px;
  background: var(--modal-panel-background, var(--comfy-menu-bg, #1e1f22));
  border: 1px solid var(--border-default, rgba(255, 255, 255, 0.14));
  border-radius: 12px;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  animation: legoComfyPop 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes legoComfyPop {
  from { transform: scale(0.97); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* ── Topo: Barra de Busca Confortável e Larga ── */
.lego-comfy-searchbar{
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: #24242b;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
}
.lego-comfy-search-icon{
  font-size: 22px;
  color: var(--lego-dim);
  display: flex;
  align-items: center;
}
.lego-comfy-search-input{
  flex: 1;
  background: transparent;
  border: none;
  color: #ffffff;
  font-size: 17px;
  font-weight: 500;
  outline: none;
  padding: 4px 0;
}
.lego-comfy-search-input::placeholder{
  color: rgba(255, 255, 255, 0.38);
  font-weight: 400;
}
.lego-comfy-close-btn{
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--lego-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 15px;
  transition: background .12s, color .12s;
}
.lego-comfy-close-btn:hover{
  background: rgba(239, 68, 68, 0.85);
  color: #fff;
  border-color: transparent;
}

/* ── Barra Horizontal de Filtros (Chips / Pills) ── */
.lego-comfy-filters{
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  background: #19191e;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  overflow-x: auto;
}
.lego-comfy-pill{
  padding: 6px 14px;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.06);
  color: #a1a1aa;
  border: 1px solid rgba(255, 255, 255, 0.09);
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  transition: background .12s, color .12s, border-color .12s;
}
.lego-comfy-pill:hover{
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}
.lego-comfy-pill.active{
  background: var(--lego-accent);
  color: #ffffff;
  border-color: var(--lego-accent);
}
.lego-comfy-pill.is-cat-pill{
  color: #60a5fa;
  border-color: rgba(59, 130, 246, 0.35);
  background: rgba(59, 130, 246, 0.1);
}
.lego-comfy-pill.is-cat-pill:hover{
  background: rgba(59, 130, 246, 0.22);
  color: #93c5fd;
  border-color: rgba(59, 130, 246, 0.6);
}
.lego-comfy-pill.is-cat-pill.active{
  background: var(--lego-accent);
  color: #ffffff;
  border-color: var(--lego-accent);
}
/* ── Target Picker Primordial (Topo Fixo do Seletor e Sidebar) ── */
.lego-comfy-target-picker-btn{
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: 8px;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: #ffffff;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  box-shadow: 0 2px 10px rgba(37, 99, 235, 0.38);
  transition: background .15s ease, transform .12s ease, box-shadow .15s ease;
}
.lego-comfy-target-picker-btn:hover{
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.55);
}
.lego-comfy-target-picker-btn:active{
  transform: translateY(0);
  box-shadow: 0 1px 4px rgba(37, 99, 235, 0.3);
}
.lego-comfy-target-picker-btn svg{
  color: #93c5fd;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
}
.lego-comfy-target-picker-btn:hover svg{
  color: #ffffff;
}

.lego-sidebar-target-picker-btn{
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 8px;
  background: rgba(37, 99, 235, 0.16);
  border: 1px solid rgba(59, 130, 246, 0.4);
  color: #93c5fd;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all .15s ease;
  user-select: none;
}
.lego-sidebar-target-picker-btn:hover{
  background: rgba(37, 99, 235, 0.32);
  border-color: #60a5fa;
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
}
.lego-sidebar-target-picker-btn svg{
  color: #60a5fa;
}
.lego-sidebar-target-picker-btn:hover svg{
  color: #ffffff;
}

/* ── Corpo com 3 Colunas: Sidebar + Lista de Nós + Painel de Detalhes ── */
.lego-comfy-body{
  flex: 1;
  display: flex;
  min-height: 0;
  background: #15151a;
}

/* Coluna 1: Sidebar de Categorias e Nós (Estilo ComfyUI Nativo) */
.lego-comfy-sidebar{
  flex: 0 0 clamp(190px, 20vw, 260px);
  min-width: 170px;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: #18181e;
  overflow-y: auto;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
}
.lego-comfy-cat-top-btn{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.09);
  font-size: 13.5px;
  font-weight: 600;
  color: #f1f5f9;
  cursor: pointer;
  user-select: none;
  margin-bottom: 8px;
  transition: background .12s, border-color .12s, color .12s;
}
.lego-comfy-cat-top-btn:hover{
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.18);
  color: #ffffff;
}
.lego-comfy-cat-top-btn.active{
  background: rgba(59, 130, 246, 0.24);
  border-color: rgba(59, 130, 246, 0.6);
  color: #93c5fd;
}
.lego-comfy-cat-header{
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #38bdf8;
  padding: 12px 10px 6px;
}
.lego-comfy-cat-item{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 7px;
  cursor: pointer;
  user-select: none;
  border: 1px solid transparent;
  transition: background .1s, color .1s, border-color .1s;
}
.lego-comfy-cat-label{
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.82);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lego-comfy-cat-badge{
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.55);
  flex-shrink: 0;
}
.lego-comfy-cat-item:hover{
  background: rgba(255, 255, 255, 0.08);
}
.lego-comfy-cat-item:hover .lego-comfy-cat-label{
  color: #ffffff;
}
.lego-comfy-cat-item.active{
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}
.lego-comfy-cat-item.active .lego-comfy-cat-label{
  color: #93c5fd;
  font-weight: 600;
}
.lego-comfy-cat-top-btn.active .lego-comfy-cat-badge,
.lego-comfy-cat-item.active .lego-comfy-cat-badge{
  background: rgba(59, 130, 246, 0.38);
  color: #bfdbfe;
}

/* Coluna 2: Lista Central de Parâmetros e Nós */
.lego-comfy-list{
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: #141418;
}
.lego-comfy-node-row{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  border: 1px solid transparent;
  transition: background .1s, border-color .1s;
}
.lego-comfy-node-row:hover{
  background: rgba(255, 255, 255, 0.07);
}
.lego-comfy-node-row.active{
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.5);
}
.lego-comfy-node-left{
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.lego-comfy-node-title{
  font-size: 14.5px;
  font-weight: 600;
  color: #ffffff;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
.lego-comfy-node-sub{
  font-size: 12.5px;
  color: #a1a1aa;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}
.lego-comfy-node-badges{
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.lego-comfy-badge{
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.lego-comfy-badge.primary{
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
  border-color: rgba(59, 130, 246, 0.35);
}




/* ══════════════════════════════════════════════════════════════════════════
   RENDERIZAÇÃO FIEL DO NÓ DO COMFYUI (Visual Nativo sem Ficha Técnica)
   ══════════════════════════════════════════════════════════════════════════ */
.lego-faithful-canvas-area{
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  background: #131316;
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  background-size: 20px 20px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 16px 12px;
  gap: 12px;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
}

/* O Nó Fiel do ComfyUI */
.lego-combo-btn{display:flex;align-items:center;gap:6px;justify-content:space-between;
  text-align:left;cursor:pointer;overflow:hidden}
.lego-combo-label{flex:1;min-width:2.5em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lego-combo-chevron{flex:none;display:inline-flex;opacity:.6}
.lego-combo-btn:hover{border-color:var(--lego-accent)}

.lego-list-pop{position:fixed;z-index:10000000;display:flex;flex-direction:column;gap:6px;
  padding:8px;background:#1c1c24;border:1px solid #4a4a5c;border-radius:9px;
  box-shadow:0 12px 34px rgba(0,0,0,0.65);max-height:min(60vh,420px)}
.lego-list-search{flex:none;background:rgba(0,0,0,0.4);color:#f2f2f6;border:1px solid #3f3f4e;
  border-radius:6px;padding:7px 10px;font:inherit;font-size:12.5px;outline:none}
.lego-list-search:focus{border-color:#3b82f6}
.lego-list-items{overflow-y:auto;display:flex;flex-direction:column;gap:1px;min-height:0}
/* flex:none — filho de flex encolhe por padrão, e com a lista rolando os
   itens ficavam espremidos uns sobre os outros. */
.lego-list-item{flex:none;display:flex;align-items:baseline;gap:0;padding:7px 10px;border-radius:5px;
  cursor:pointer;font-size:12.5px;line-height:1.35;color:#f2f2f6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lego-list-item:hover{background:#3b82f6;color:#fff}
.lego-list-item.sel{background:rgba(59,130,246,0.22);font-weight:600}
.lego-list-folder{opacity:.5;font-size:11.5px;flex:none}
.lego-list-leaf{flex:none}

.lego-glyph{display:block;flex:none;vertical-align:middle}
.lego-glyph-wrap{display:inline-flex;align-items:center;justify-content:center;flex:none}

.lego-real-node{display:block;margin:0 auto;border-radius:8px;image-rendering:auto}

.lego-faithful-node{
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  background: #242429;
  border: 1.5px solid #3c3c46;
  border-radius: 8px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
  animation: legoFaithfulAppear 0.15s ease-out;
}

@keyframes legoFaithfulAppear{
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}

/* Header do Nó */
.lego-faithful-header{
  padding: 10px 14px;
  background: #2e3038;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.lego-faithful-title-wrap{
  display: flex;
  align-items: center;
  gap: 9px;
  overflow: hidden;
}
.lego-faithful-dot{
  width: 8.5px;
  height: 8.5px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 7px #10b981;
  flex-shrink: 0;
}
.lego-faithful-title{
  font-size: 14px;
  font-weight: 700;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}
.lego-faithful-id-badge{
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  flex-shrink: 0;
}

/* Corpo do Nó */
.lego-faithful-body{
  padding: 12px 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  background: #242429;
}

/* Sockets de Entrada e Saída */
.lego-faithful-slot-row{
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 22px;
  font-size: 12px;
}
.lego-faithful-slot-in{
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #e4e4e7;
  font-weight: 500;
}
.lego-faithful-slot-out{
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #e4e4e7;
  font-weight: 500;
  margin-left: auto;
  flex-direction: row-reverse;
}
.lego-faithful-socket{
  width: 9.5px;
  height: 9.5px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
  flex-shrink: 0;
}

/* Widgets Fiéis */
.lego-faithful-widget{
  background: #1a1a1f;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 7px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  position: relative;
  transition: all .15s ease;
}
.lego-faithful-widget.selected{
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  box-shadow: 0 0 0 1.5px #38bdf8, 0 0 16px rgba(56, 189, 248, 0.45);
}
.lego-faithful-widget-name{
  font-size: 12px;
  font-weight: 600;
  color: #cbd5e1;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lego-faithful-widget.selected .lego-faithful-widget-name{
  color: #38bdf8;
  font-weight: 700;
}
.lego-faithful-target-pill{
  font-size: 9.5px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: #0284c7;
  color: #ffffff;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.lego-faithful-widget-ctrl{
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #f1f5f9;
  background: #101013;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 3px 8px;
  border-radius: 4px;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

/* Resumo Inferior */
.lego-faithful-summary{
  width: 100%;
  max-width: 360px;
  box-sizing: border-box;
  padding: 10px 14px;
  background: rgba(20, 20, 24, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #94a3b8;
}
.lego-faithful-summary strong{
  color: #f8fafc;
}

/* Componentes Crus no Diálogo de Busca */
.lego-comfy-node-row.is-raw-element{
  border-left: 3px solid #38bdf8;
  background: rgba(56, 189, 248, 0.05);
}
.lego-comfy-node-row.is-raw-element:hover{
  background: rgba(56, 189, 248, 0.14);
}
.lego-comfy-node-row.is-raw-element.active{
  background: rgba(56, 189, 248, 0.22);
}
.lego-raw-preview-box{
  width: 100%;
  box-sizing: border-box;
  background: #18181d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.lego-raw-preview-ctrl{
  width: 100%;
  max-width: 320px;
}
.lego-raw-desc-text{
  font-size: 13px;
  color: #94a3b8;
  line-height: 1.5;
  text-align: center;
}

/* Coluna 3: Painel Lateral de Detalhes */
.lego-comfy-details{
  flex: 0 0 clamp(260px, 28vw, 360px);
  min-width: 230px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  background: #18181e;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  box-sizing: border-box;
}

/* ── Responsividade Inteligente do Seletor de Nós (Classes de Contêiner + Media Queries) ── */
.lego-comfy-dialog.dlg-compact .lego-comfy-sidebar,
@media (max-width: 1080px) {
  .lego-comfy-sidebar {
    flex: 0 0 190px !important;
    min-width: 160px !important;
    padding: 10px 8px !important;
  }
  .lego-comfy-details {
    flex: 0 0 270px !important;
    min-width: 220px !important;
    padding: 12px !important;
  }
}
.lego-comfy-dialog.dlg-narrow .lego-comfy-sidebar,
@media (max-width: 820px) {
  .lego-comfy-sidebar {
    flex: 0 0 150px !important;
    min-width: 130px !important;
    padding: 8px 6px !important;
  }
  .lego-comfy-cat-label {
    font-size: 12px !important;
  }
  .lego-comfy-details {
    flex: 0 0 230px !important;
    min-width: 200px !important;
    padding: 10px !important;
  }
}
.lego-comfy-det-header{
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
}
.lego-comfy-det-title{
  font-size: 18px;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.3;
}
.lego-comfy-det-category{
  font-size: 12.5px;
  color: #38bdf8;
  font-weight: 600;
}
.lego-comfy-det-desc{
  font-size: 12.5px;
  line-height: 1.5;
  color: #a1a1aa;
}
.lego-comfy-det-field{
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lego-comfy-det-label{
  font-size: 11.5px;
  font-weight: 700;
  color: #e2e8f0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.lego-comfy-det-input{
  width: 100%;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.38);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 7px;
  padding: 10px 12px;
  color: #ffffff;
  font-size: 13.5px;
  outline: none;
  transition: border-color .12s;
}
.lego-comfy-det-input:focus{
  border-color: var(--lego-accent);
}
.lego-comfy-det-grid{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.lego-comfy-det-btn{
  margin-top: auto;
  padding: 13px 18px;
  border-radius: 8px;
  background: var(--lego-accent);
  color: #ffffff;
  font-size: 15px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.45);
  transition: background .12s, transform .08s;
}
.lego-comfy-det-btn:hover{
  background: #2563eb;
  transform: translateY(-1px);
}
.lego-comfy-det-btn:active{
  transform: translateY(0);
}


/* ── Menu Flutuante de Adicionar Componente com 2 Cliques (Estilo ComfyUI Canvas) ── */
.lego-search-overlay{
  position: fixed;
  inset: 0;
  z-index: 999999;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
}
.lego-search-box{
  position: fixed;
  z-index: 1000000;
  width: 320px;
  max-height: 420px;
  background: #181824;
  border: 1.5px solid var(--lego-accent);
  border-radius: 8px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: inherit;
  animation: legoSearchPop 0.12s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes legoSearchPop {
  from { transform: scale(0.94); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.lego-search-header{
  padding: 10px;
  background: rgba(10, 10, 16, 0.8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lego-search-title{
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lego-dim);
}
.lego-search-input{
  width: 100%;
  box-sizing: border-box;
  background: rgba(26, 26, 36, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  padding: 8px 10px;
  color: #fff;
  font-size: 13px;
  outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.lego-search-input:focus{
  border-color: var(--lego-accent);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35);
}
.lego-search-list{
  overflow-y: auto;
  max-height: 320px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.lego-search-item{
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: background .1s ease, color .1s ease;
}
.lego-search-item:hover, .lego-search-item.highlighted{
  background: var(--lego-accent);
  color: #fff;
}
.lego-search-item-icon{
  font-size: 18px;
  width: 24px;
  text-align: center;
  flex-shrink: 0;
}
.lego-search-item-info{
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.lego-search-item-title{
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--lego-text);
}
.lego-search-item-desc{
  font-size: 11px;
  color: var(--lego-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lego-search-item:hover .lego-search-item-title,
.lego-search-item.highlighted .lego-search-item-title{
  color: #ffffff;
}
.lego-search-item:hover .lego-search-item-desc,
.lego-search-item.highlighted .lego-search-item-desc{
  color: #dbeafe;
}
.lego-search-footer{
  padding: 6px 10px;
  background: rgba(10, 10, 16, 0.6);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 10px;
  color: var(--lego-dim);
  display: flex;
  justify-content: space-between;
}

/* ── Borda de Seleção de Elementos ── */
.lego-row.selected::before{
  content: "";
  position: absolute;
  inset: -2px;
  border: 1.5px solid var(--lego-accent);
  border-radius: 9px;
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.4);
}


.lego-card{
  /* Três níveis legíveis: o cartão é o mais ESCURO (container), a linha do
     componente é CLARA (superfície elevada) e o campo dentro dela volta a ser
     escuro (poço). Antes a linha era mais escura que o cartão — superfície
     elevada mais escura que o fundo — e tudo se dissolvia. */
  /* Três níveis perfeitamente alinhados aos tokens e superfícies dos Nodes 2.0 do ComfyUI */
  --lego-bg: var(--node-component-surface, var(--color-charcoal-700, #202121));
  --lego-surface: var(--component-node-widget-background, var(--color-charcoal-500, #2d2e32));
  --lego-surface-hover: var(--component-node-widget-background-hovered, var(--color-charcoal-400, #313235));
  --lego-well: var(--comfy-input-bg, #171718);
  --lego-panel: var(--node-component-surface, #262729);
  --lego-panel-hover: var(--component-node-widget-background-hovered, #313235);
  --lego-line: var(--node-border, var(--border-default, #3c3d42));
  --lego-line-strong: var(--border-default, var(--color-charcoal-200, rgba(255,255,255,0.14)));
  --lego-text: var(--text-primary, var(--input-text, #ffffff));
  --lego-dim: var(--text-secondary, var(--descrip-text, #a0a0a0));
  --lego-accent: var(--primary-background, var(--color-azure-600, #0b8ce9));
  --lego-on: var(--color-jade-600, #00cd72);
  box-sizing:border-box; width:100%;
  display:flex; flex-direction:column; gap:10px;
  padding:12px 14px; border-radius:10px;
  background:var(--lego-bg); color:var(--lego-text);
  font:13px/1.5 Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  border:1px solid var(--lego-line);
  box-shadow:0 4px 18px rgba(0,0,0,0.32);
  transition: background 0.15s ease, border-color 0.15s ease;
}
.lego-card *{box-sizing:border-box}

.lego-card.has-node-color {
  background: var(--lego-bg);
  border-color: var(--lego-line);
}
.lego-card.has-node-color .lego-head {
  background: var(--lego-head-bg, var(--lego-node-color, transparent));
  margin: -12px -14px 4px -14px;
  padding: 10px 14px;
  border-radius: 9px 9px 0 0;
  border-bottom: 1px solid var(--lego-line);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.lego-head{display:flex;align-items:center;gap:10px}
.lego-head-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.lego-title-row{display:flex;align-items:center;gap:8px;min-width:0}
.lego-title{font-size:15px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff}
.lego-title.editable{cursor:pointer;transition:color .15s ease}
.lego-title.editable:hover{color:var(--lego-accent,#38bdf8)}
.lego-title-edit-btn{flex:none;width:22px;height:22px;border-radius:5px;
  background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.4);
  color:#38bdf8;cursor:pointer;display:inline-flex;align-items:center;
  justify-content:center;padding:0;transition:all .15s ease}
.lego-title-edit-btn:hover{background:var(--lego-accent,#38bdf8);color:#fff;
  border-color:var(--lego-accent,#38bdf8);box-shadow:0 0 8px rgba(56,189,248,0.4)}
.lego-sub{font-size:12px;color:var(--lego-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lego-badge{flex:none;font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;
  background:rgba(255,255,255,0.06);border:1px solid var(--lego-line);color:var(--lego-dim);white-space:nowrap}
.lego-iconbtn{flex:none;width:28px;height:28px;border-radius:7px;cursor:pointer;
  display:grid;place-items:center;background:rgba(255,255,255,0.04);color:var(--lego-dim);
  border:1px solid var(--lego-line);font-size:14px;line-height:1;padding:0;transition:all .15s ease}
.lego-iconbtn:hover{color:var(--lego-text);background:rgba(255,255,255,0.08);border-color:var(--lego-accent)}
.lego-iconbtn.on{color:#fff;background:var(--lego-accent);border-color:var(--lego-accent)}

.lego-tabs{display:flex;gap:4px;border-bottom:2px solid var(--lego-line);overflow-x:auto;
  scrollbar-width:none;margin:2px 0 4px 0}
.lego-tabs::-webkit-scrollbar{display:none}
.lego-tab{flex:none;padding:8px 16px;cursor:pointer;color:var(--lego-dim);
  border-bottom:2.5px solid transparent;margin-bottom:-2px;white-space:nowrap;user-select:none;
  font-size:13px;font-weight:600;transition:all .15s ease}
.lego-tab:hover{color:var(--lego-text)}
.lego-tab.sel{color:#fff;border-bottom-color:var(--lego-accent);font-weight:700}
.lego-tab-add{flex:none;padding:8px 12px;cursor:pointer;color:var(--lego-dim);
  border-bottom:2.5px solid transparent;margin-bottom:-2px;font-size:15px;font-weight:700}
.lego-tab-add:hover{color:var(--lego-accent)}

/* ── Layout Geral de Cards no Subgrafo ── */
.lego-body{
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
}

.lego-sec{
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-radius: 10px;
  padding: 12px;
  background: var(--lego-panel);
  border: 1px solid var(--lego-line);
  box-sizing: border-box;
  min-width: 240px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  transition: border-color .15s, box-shadow .15s;
}
.lego-sec:hover{
  border-color: rgba(59, 130, 246, 0.35);
}

/* ── Controls area inside Zone ── */
.lego-sec-controls{
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  background: transparent;
  border-radius: 8px;
  min-height: 70px;
  overflow: visible;
  transition: min-height .15s ease, height .15s ease;
}

/* In edit mode, subtle dashed border marks the canvas area */
.lego-sec-controls.in-edit{
  background: rgba(0, 0, 0, 0.15);
  border: 1.5px dashed rgba(255, 255, 255, 0.12);
  padding: 6px;
  min-height: 60px;
}
.lego-sec-controls.in-edit:hover, .lego-sec-controls.in-edit.over{
  border-color: var(--lego-accent);
  background: rgba(59, 130, 246, 0.06);
}

/* Só existe UMA regra base de .lego-row, mais abaixo. Havia quatro blocos
   empilhados aqui: o último vencia e desfazia em silêncio o contraste que os
   anteriores tinham ajustado. */
.lego-row.dragging{
  opacity: 0.85 !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8) !important;
  border-color: var(--lego-accent) !important;
  z-index: 99999 !important;
  cursor: grabbing !important;
  user-select: none !important;
}
.lego-row.is-label{
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
.lego-row.is-label:hover{
  border-color: rgba(255, 255, 255, 0.2) !important;
}
.lego-row.is-label.selected{
  border-color: var(--lego-accent) !important;
  box-shadow: 0 0 0 1px var(--lego-accent) !important;
}
.lego-canvas-label{
  font-size: 13px;
  font-weight: 600;
  color: var(--lego-fg, #e2e8f0);
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  user-select: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Ações flutuantes discretas (engrenagem, link e X vermelhinho) ── */
/* Flutuam projetadas para fora da borda no canto superior direito, sem cobrir o interior */
.lego-floating-actions{
  position: absolute;
  top: -8px;
  right: -6px;
  display: flex;
  align-items: center;
  gap: 3px;
  z-index: 50;
  background: transparent;
  border: none;
  padding: 0;
  box-shadow: none;
  opacity: 0;
  pointer-events: none;
  transition: opacity .12s ease, transform .12s ease;
  transform: translateY(-2px);
}
.lego-row:hover .lego-floating-actions,
.lego-row.selected .lego-floating-actions,
.lego-row.unbound .lego-floating-actions{
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
.lego-row.selected{
  border-color: var(--lego-accent) !important;
  box-shadow: 0 0 0 1px var(--lego-accent), 0 2px 10px rgba(59, 130, 246, 0.35) !important;
}
.lego-floating-actions .lego-iconbtn{
  width: 17px;
  height: 17px;
  font-size: 10px;
  border-radius: 50%;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.6);
  transition: all .12s ease;
}
/* Botão de configurações (engrenagem) */
.lego-floating-actions .lego-iconbtn.btn-cfg{
  background: rgba(18, 18, 28, 0.95);
  color: #94a3b8;
  border: 1px solid rgba(255, 255, 255, 0.22);
}
.lego-floating-actions .lego-iconbtn.btn-cfg:hover{
  background: var(--lego-accent);
  color: #fff;
  border-color: var(--lego-accent);
  transform: scale(1.15);
}
/* Botão de duplicar / copiar */
.lego-floating-actions .lego-iconbtn.btn-dup,
.lego-item-dup-btn{
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: rgba(18, 18, 28, 0.95);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.45);
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.6);
  transition: all .12s ease;
}
.lego-item-dup-btn{
  width: 16px;
  height: 16px;
}
.lego-floating-actions .lego-iconbtn.btn-dup:hover,
.lego-item-dup-btn:hover{
  background: #38bdf8 !important;
  color: #0f172a !important;
  border-color: #38bdf8 !important;
  transform: scale(1.15);
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.6);
}
/* Botão de corrente (link / vínculo) à esquerda do X */
.lego-floating-actions .lego-iconbtn.btn-link.is-bound{
  color: #38bdf8;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(56, 189, 248, 0.6);
}
.lego-floating-actions .lego-iconbtn.btn-link.is-bound:hover{
  background: #38bdf8 !important;
  color: #0f172a !important;
  border-color: #38bdf8 !important;
  transform: scale(1.15);
}
.lego-floating-actions .lego-iconbtn.btn-link.is-unbound{
  color: #000;
  background: #f59e0b;
  border: 1px solid #fbbf24;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.6);
}
.lego-floating-actions .lego-iconbtn.btn-link.is-unbound:hover{
  background: #fbbf24 !important;
  border-color: #fff !important;
  transform: scale(1.15);
}
/* O X vermelhinho flutuando para fora do elemento */
.lego-floating-actions .lego-iconbtn.btn-del{
  background: #ef4444 !important;
  color: #fff !important;
  border: 1px solid rgba(0, 0, 0, 0.3) !important;
}
.lego-floating-actions .lego-iconbtn.btn-del:hover{
  background: #dc2626 !important;
  transform: scale(1.15);
  box-shadow: 0 3px 8px rgba(239, 68, 68, 0.7);
}




/* Indicadores de Drop 4-Way (Cima, Baixo, Esquerda, Direita) */
.lego-drop-top{box-shadow:inset 0 4px 0 var(--lego-accent) !important;background:rgba(59,130,246,0.12) !important}
.lego-drop-bottom{box-shadow:inset 0 -4px 0 var(--lego-accent) !important;background:rgba(59,130,246,0.12) !important}
.lego-drop-side-right{box-shadow:inset -4px 0 0 var(--lego-accent) !important;background:rgba(59,130,246,0.12) !important}
.lego-drop-side-left{box-shadow:inset 4px 0 0 var(--lego-accent) !important;background:rgba(59,130,246,0.12) !important}

.lego-sec.drop-target{outline:2.5px dashed var(--lego-accent) !important;background:rgba(59,130,246,0.12) !important}
.lego-sec.dragging{opacity:0.35;outline:2px dashed var(--lego-dim)}

/* ── Alças de Redimensionamento de Zona (Largura ↔ e Altura ↕) ── */
.lego-sec-resizer{position:absolute;top:0;right:-4px;bottom:8px;width:9px;cursor:col-resize;
  z-index:30;user-select:none;border-radius:4px;transition:background .15s}
.lego-sec-resizer:hover, .lego-sec-resizer.active{background:var(--lego-accent);box-shadow:0 0 10px rgba(59,130,246,0.7)}

.lego-sec-resizer-bottom{position:absolute;left:0;right:8px;bottom:-4px;height:9px;cursor:row-resize;
  z-index:30;user-select:none;border-radius:4px;transition:background .15s}
.lego-sec-resizer-bottom:hover, .lego-sec-resizer-bottom.active{background:var(--lego-accent);box-shadow:0 0 10px rgba(59,130,246,0.7)}

/* Alças de Redimensionamento de Componente (Largura ↔ e Altura ↕) */
.lego-row-resizer{position:absolute;top:0;right:-3px;bottom:6px;width:7px;cursor:col-resize;
  z-index:25;user-select:none;border-radius:3px;transition:background .15s}
.lego-row-resizer:hover, .lego-row-resizer.active{background:var(--lego-accent);box-shadow:0 0 8px rgba(59,130,246,0.6)}

.lego-row-resizer-bottom{position:absolute;left:0;right:6px;bottom:-3px;height:7px;cursor:row-resize;
  z-index:25;user-select:none;border-radius:3px;transition:background .15s}
.lego-row-resizer-bottom:hover, .lego-row-resizer-bottom.active{background:var(--lego-accent);box-shadow:0 0 8px rgba(59,130,246,0.6)}

/* Alça de Canto Elegante (Bordinha em Negrito) */
.lego-resizer-corner{position:absolute;right:2px;bottom:2px;width:12px;height:12px;cursor:nwse-resize;
  z-index:35;user-select:none;box-sizing:border-box;
  border-right:2.5px solid rgba(255,255,255,0.42);border-bottom:2.5px solid rgba(255,255,255,0.42);
  border-bottom-right-radius:5px;transition:border-color .15s, box-shadow .15s, transform .12s}
.lego-resizer-corner:hover, .lego-resizer-corner.active{border-color:var(--lego-accent);
  box-shadow:2px 2px 8px rgba(59,130,246,0.7);transform:scale(1.2)}

/* ── Botão / Chip de Largura ── */
.lego-width-badge{flex:none;font-size:11px;font-weight:700;padding:2px 7px;border-radius:5px;
  background:rgba(255,255,255,0.06);border:1px solid var(--lego-line);color:var(--lego-dim);
  cursor:pointer;user-select:none;transition:all .15s;display:inline-flex;align-items:center;gap:3px}
.lego-width-badge:hover{color:#fff;background:rgba(59,130,246,0.2);border-color:var(--lego-accent)}

/* Tooltip flutuante de Resize */
.lego-resize-tooltip{position:fixed;background:var(--lego-accent);color:#fff;font-size:12px;font-weight:700;
  padding:4px 9px;border-radius:5px;box-shadow:0 4px 15px rgba(0,0,0,0.6);pointer-events:none;z-index:99999999}
.lego-sec-h{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;letter-spacing:.08em;
  text-transform:uppercase;color:var(--lego-dim)}
.lego-sec-h::after{content:"";flex:1;height:1px;background:var(--lego-line)}
.lego-sec-h .lego-iconbtn{width:22px;height:22px;font-size:12px;border-radius:5px}

/* ── Internal widgets container ── */
.lego-row.resizing, .lego-sec.resizing{transition:none !important;user-select:none !important}

/* Componente do formulário — a ÚNICA regra base. A posição vem inline do JS
   (absoluta, com snap à grade); o resto mora aqui. */
.lego-row{position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:6px 12px;border-radius:8px;background:var(--lego-panel);min-height:42px;
  width:100%;min-width:0;box-sizing:border-box;user-select:none;
  border:1px solid var(--lego-line-strong);box-shadow:0 2px 8px rgba(0,0,0,0.35);
  transition:background .15s ease,border-color .15s ease}
.lego-row:hover{background:var(--lego-panel-hover);border-color:rgba(59,130,246,0.45)}
.lego-row .lego-lbl{flex:1;min-width:60px;color:var(--lego-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  font-size:13px;font-weight:500}
.lego-row .lego-in, .lego-row .lego-slider{flex:1;min-width:80px}
.lego-row .lego-sw{flex:none}
.lego-row.wide{flex-direction:column;align-items:stretch}
.lego-row.wide .lego-in{width:100%}
.lego-row.drag{opacity:.4}
.lego-row.over{outline:2px dashed var(--lego-accent)}


.lego-row.missing .lego-lbl{color:#ef4444;text-decoration:line-through}
.lego-grip{cursor:grab;color:var(--lego-dim);padding:0 4px;user-select:none;font-size:14px}

.lego-in{width:100%;min-width:0;background:var(--lego-well,rgba(0,0,0,0.34));color:var(--lego-text);
  border:1px solid var(--lego-line);border-radius:6px;padding:6px 10px;font:inherit;font-size:13px;
  transition:border-color .15s,background .15s}
.lego-in:focus{outline:none;border-color:var(--lego-accent);background:rgba(0,0,0,0.35)}
.lego-in[disabled]{opacity:.45}
select.lego-in{cursor:pointer}
select.lego-in option{background:#1f1f26;color:#fff}
textarea.lego-in{resize:vertical;min-height:75px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:12.5px;line-height:1.45}

.lego-slider{display:flex;align-items:center;gap:8px;min-width:0;width:100%;box-sizing:border-box}
.lego-track{position:relative;flex:1;height:8px;border-radius:99px;background:rgba(0,0,0,0.45);
  cursor:pointer;min-width:32px;box-sizing:border-box}
.lego-fill{position:absolute;inset:0 auto 0 0;border-radius:99px;background:var(--lego-accent)}
.lego-knob{position:absolute;top:50%;width:16px;height:16px;border-radius:50%;
  background:#ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.6);transform:translate(-50%,-50%);pointer-events:none;transition:transform .08s}
.lego-track:hover .lego-knob{transform:translate(-50%,-50%) scale(1.15)}
.lego-num{flex:none;width:58px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;box-sizing:border-box;height:26px;line-height:24px;padding:2px 6px;font-size:12px}

/* ── Slider Empilhado / Responsivo quando estreito ou alto ── */
.lego-row.is-slider{box-sizing:border-box}
.lego-row.is-slider.slider-stacked{flex-direction:column !important;align-items:stretch !important;justify-content:center !important;gap:4px !important;padding:6px 10px !important}
.lego-row.is-slider.slider-stacked > .lego-row-top{display:flex !important;align-items:center !important;justify-content:space-between !important;width:100% !important;min-width:0 !important;gap:8px !important}
.lego-row.is-slider.slider-stacked > .lego-row-top > .lego-lbl{flex:1 !important;min-width:0 !important;white-space:nowrap !important;overflow:hidden !important;text-overflow:ellipsis !important;font-size:12.5px !important}
.lego-row.is-slider.slider-stacked > .lego-slider{width:100% !important;display:flex !important;align-items:center !important;gap:8px !important}
.lego-row.is-slider.slider-stacked > .lego-slider > .lego-track{width:100% !important;flex:1 !important}

.lego-sw{position:relative;flex:none;width:44px;height:24px;border-radius:99px;
  background:rgba(0,0,0,0.5);cursor:pointer;transition:background .15s ease;border:1px solid rgba(255,255,255,0.06)}
.lego-sw::after{content:"";position:absolute;top:2px;left:3px;width:18px;height:18px;
  border-radius:50%;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.4);transition:transform .15s cubic-bezier(0.4,0,0.2,1)}
.lego-sw.on{background:var(--lego-on);border-color:rgba(34,197,94,0.4)}
.lego-sw.on::after{transform:translateX(20px)}

.lego-grid{display:grid;gap:10px}
/* ── Load Image / Video / Audio / Componente de Mídia Coeso e Responsivo Vertical ── */
.lego-row.is-media{
  justify-content: flex-start !important;
  align-items: stretch !important;
  flex-direction: column !important;
  padding: 6px 10px !important;
  gap: 4px !important;
  box-sizing: border-box !important;
}
.lego-row.is-media > .lego-row-top{
  flex: none;
  margin-bottom: 2px;
  min-height: 18px;
}
.lego-row.is-media > .lego-row-top .lego-lbl{
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.2;
}

.lego-media-box{
  display: flex;
  gap: 8px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  flex: 1;
  min-height: 0;
  height: auto;
}

/* Modo Compacto (Altura Padrão < 110px) */
.lego-media-box:not(.tall){
  flex-direction: row;
  align-items: center;
}
.lego-media-box:not(.tall) .lego-media-thumb{
  flex: none;
  width: 44px;
  height: 44px;
  max-height: 100%;
  border-radius: 7px;
  background: rgba(0,0,0,0.45);
  border: 1.5px solid var(--lego-line);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: all .15s ease;
  box-shadow: inset 0 2px 6px rgba(0,0,0,0.5);
}
.lego-media-box:not(.tall) .lego-media-thumb img,
.lego-media-box:not(.tall) .lego-media-thumb video,
.lego-media-box:not(.tall) .lego-media-thumb .lego-audio-player{
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: cover;
  display: block;
}
.lego-media-box:not(.tall) .lego-media-ph-hint{
  display: none;
}
.lego-media-box:not(.tall) .lego-media-bar{
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

/* Modo Expandido / Responsivo (Quando o usuário aumenta a altura >= 110px) */
.lego-media-box.tall{
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}
.lego-media-box.tall .lego-media-thumb{
  flex: 1;
  width: 100%;
  min-height: 0;
  border-radius: 8px;
  background: rgba(0,0,0,0.6);
  border: 1.5px solid var(--lego-line);
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all .15s ease;
  box-shadow: inset 0 2px 10px rgba(0,0,0,0.7);
}
.lego-media-box.tall .lego-media-thumb img,
.lego-media-box.tall .lego-media-thumb video,
.lego-media-box.tall .lego-media-thumb .lego-audio-player{
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  padding: 4px;
  box-sizing: border-box;
  display: block;
}
.lego-media-box.tall .lego-media-ph-hint{
  display: block;
}
.lego-media-box.tall .lego-media-bar{
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 28px;
}

.lego-media-thumb:hover{
  border-color: var(--lego-accent);
  box-shadow: 0 0 12px rgba(59,130,246,0.5);
}
.lego-media-thumb.drop{
  outline: 2px dashed var(--lego-accent);
  background: rgba(59,130,246,0.2) !important;
}

.lego-media-select{
  flex: 1;
  min-width: 0;
  background: var(--lego-well,rgba(0,0,0,0.34));
  color: var(--lego-text);
  border: 1px solid var(--lego-line);
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 28px;
  height: 28px;
  box-sizing: border-box;
  transition: border-color .15s, background .15s;
}
.lego-media-select .lego-combo-label{
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lego-media-select:focus{
  outline: none;
  border-color: var(--lego-accent);
  background: rgba(0,0,0,0.4);
}

.lego-media-upload-btn{
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  min-width: 28px;
  padding: 0;
  border-radius: 6px;
  background: rgba(59,130,246,0.18);
  border: 1px solid rgba(59,130,246,0.4);
  color: #fff;
  cursor: pointer;
  transition: all .15s ease;
  box-sizing: border-box;
}
.lego-media-upload-btn:hover{
  background: var(--lego-accent);
  border-color: var(--lego-accent);
  box-shadow: 0 2px 10px rgba(59,130,246,0.4);
}

.lego-slot{position:relative;aspect-ratio:1;border:1.5px dashed var(--lego-line);border-radius:10px;
  display:grid;place-items:center;overflow:hidden;background:var(--lego-panel);cursor:pointer;transition:all .15s}
.lego-slot:hover{border-color:var(--lego-accent);background:var(--lego-panel-hover)}
.lego-slot.drop{border-color:var(--lego-accent);border-style:solid;background:rgba(59,130,246,0.15)}
.lego-slot img{width:100%;height:100%;object-fit:cover}
.lego-slot .ph{color:var(--lego-dim);font-size:11.5px;font-weight:500;text-align:center;padding:6px;word-break:break-word}
.lego-slot .cap{position:absolute;left:0;right:0;bottom:0;padding:4px 6px;font-size:10.5px;font-weight:600;
  background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.lego-row.grp{grid-template-columns:28px 1fr auto}

/* Mosaico de mídia dentro de uma zona em grade: tudo empilhado, miniatura
   ocupando a folga vertical. Lado a lado só cabe em linha larga. */
.lego-row.grp.grp-media{flex-direction:column;align-items:stretch;gap:4px;padding:6px 8px}
.lego-row.grp.grp-media > .lego-lbl.grp-n{flex:none;text-align:left;font-size:10px;opacity:.55}
.lego-row.grp.grp-media .lego-grp{flex-direction:column;align-items:stretch;gap:5px;flex:1;min-height:0}
.lego-row.grp.grp-media .lego-cell.k-media,
.lego-row.grp.grp-media .lego-cell.k-video,
.lego-row.grp.grp-media .lego-cell.k-audio{flex:1;min-height:0;display:flex}
/* O controle de mídia já traz o seu próprio botão de escolher arquivo; o
   widget upload promovido do LoadImage faz exatamente a mesma coisa. Os dois
   juntos espremiam a miniatura para fora do mosaico. */
.lego-row.grp.grp-media .lego-cell.k-button{display:none}
.lego-row.grp.grp-media .lego-media-box{flex-direction:column;gap:5px;min-height:0}
.lego-row.grp.grp-media .lego-media-thumb{
  flex:1 1 auto;
  min-height:60px;
  width:100%;
  position:relative;
}
.lego-row.grp.grp-media .lego-media-thumb img,
.lego-row.grp.grp-media .lego-media-thumb video,
.lego-row.grp.grp-media .lego-media-thumb .lego-audio-player{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  max-width:100%;
  max-height:100%;
  object-fit:contain;
  box-sizing:border-box;
  display:block;
}
.lego-row.grp.grp-media .lego-media-bar{flex:none;display:flex;flex-direction:row;align-items:center;gap:6px;width:100%}
.lego-row.grp.grp-media .lego-media-select{flex:1;min-width:0;width:auto}

/* ── Audio Player com Timeline, Equalizador e Design Coeso ── */
.lego-audio-player{
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: stretch;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.45);
  user-select: none;
}

/* Modo Compacto: o thumb é 44x44, mostra só o botão de play centralizado */
.lego-media-box:not(.tall) .lego-audio-player{
  padding: 0 !important;
  align-items: center !important;
  justify-content: center !important;
  background: transparent !important;
}
.lego-media-box:not(.tall) .lego-audio-visualizer,
.lego-media-box:not(.tall) .lego-audio-timeline,
.lego-media-box:not(.tall) .lego-audio-time{
  display: none !important;
}
.lego-media-box:not(.tall) .lego-audio-controls{
  justify-content: center;
  width: auto;
}

/* Visualizador / Equalizador de Ondas Sonoras */
.lego-audio-visualizer{
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 22px;
  width: 100%;
  overflow: hidden;
  flex: none;
}
.lego-audio-vbar{
  flex: 1;
  max-width: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.22);
  height: 6px;
  transition: height 0.15s ease, background 0.15s ease;
}
.lego-audio-player.playing .lego-audio-vbar{
  background: var(--lego-accent, #3b82f6);
  animation: legoEqualizer 0.75s ease-in-out infinite alternate;
}
@keyframes legoEqualizer{
  0%{ transform: scaleY(0.2); }
  50%{ transform: scaleY(1.0); }
  100%{ transform: scaleY(0.35); }
}

/* Linha de Controles: Play + Timeline + Tempo */
.lego-audio-controls{
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  flex: none;
}
.lego-audio-play-btn{
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--lego-accent, #3b82f6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  transition: transform 0.12s ease, filter 0.12s ease;
}
.lego-audio-play-btn:hover{
  transform: scale(1.08);
  filter: brightness(1.12);
}

/* Timeline / Barra de Progresso Arrastável */
.lego-audio-timeline{
  flex: 1;
  position: relative;
  height: 18px;
  display: flex;
  align-items: center;
  cursor: pointer;
  touch-action: none;
  min-width: 40px;
}
.lego-audio-rail{
  position: absolute;
  left: 0;
  right: 0;
  height: 5px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.16);
  overflow: hidden;
}
.lego-audio-progress{
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0%;
  border-radius: 99px;
  background: var(--lego-accent, #3b82f6);
  transition: width 0.05s linear;
}
.lego-audio-knob{
  position: absolute;
  top: 50%;
  left: 0%;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0.85;
  transition: transform 0.12s ease, opacity 0.12s ease;
}
.lego-audio-timeline:hover .lego-audio-knob,
.lego-audio-timeline.dragging .lego-audio-knob{
  opacity: 1;
  transform: translate(-50%, -50%) scale(1.25);
}

/* Display de Tempo Monospace */
.lego-audio-time{
  flex: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  font-weight: 500;
  color: var(--lego-dim, rgba(255, 255, 255, 0.6));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  letter-spacing: -0.2px;
}


.lego-lbl.grp-n{text-align:center;font-variant-numeric:tabular-nums;font-weight:700;color:var(--lego-dim);font-size:12px}
.lego-grp{display:flex;align-items:center;gap:8px;min-width:0;width:100%}
.lego-cell{min-width:0}
.lego-cell.k-combo{flex:1;min-width:80px}
.lego-cell.k-toggle,.lego-cell.k-button{flex:none}
.lego-cell.k-slider{flex:1;min-width:90px}
.lego-cell.k-number{flex:none;width:120px}
.lego-cell.k-text{flex:1;min-width:70px}

.lego-cols{display:grid;gap:8px;align-items:start}
.lego-cols .lego-row.wide{grid-column:1/-1}

.lego-empty{color:var(--lego-dim);font-size:12px;font-style:italic;padding:12px;text-align:center}
.lego-pick{display:flex;flex-direction:column;gap:5px;max-height:240px;overflow:auto;
  padding:8px;background:#1f1f26;border:1px solid var(--lego-line);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,0.4)}
.lego-pick button{text-align:left;background:transparent;border:0;color:var(--lego-text);
  font:inherit;font-size:12px;padding:5px 8px;border-radius:5px;cursor:pointer;transition:background .12s}
.lego-pick button:hover{background:var(--lego-accent);color:#fff}

/* ══════════════════════════════════════════════════════════════════════════
   ELEMENTO SEGMENTO PERSONALIZADO (Custom Multi-Control Segment)
   ══════════════════════════════════════════════════════════════════════════ */

/* Modo Edição Inline do Segmento */
.lego-segment-box.in-edit{
  border-style: dashed;
  border-color: rgba(56, 189, 248, 0.4);
  overflow: visible !important;
}
.lego-segment-item.editable{
  cursor: pointer;
  position: relative;
  border-radius: 5px;
  padding: 2px 4px;
  transition: all .12s ease;
  overflow: visible !important;
}
.lego-segment-item.editable:hover{
  background: rgba(56, 189, 248, 0.2);
  outline: 1px solid #38bdf8;
}
.lego-segment-item.editable.selected{
  background: rgba(56, 189, 248, 0.22) !important;
  outline: 1.5px solid #38bdf8 !important;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.35) !important;
}
.lego-segment-item .lego-resizer-corner{
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 10px;
  height: 10px;
  cursor: nwse-resize;
  z-index: 35;
  box-sizing: border-box;
  border-right: 2.5px solid rgba(255, 255, 255, 0.5);
  border-bottom: 2.5px solid rgba(255, 255, 255, 0.5);
  border-bottom-right-radius: 4px;
  display: none;
  transition: border-color .15s, box-shadow .15s, transform .12s;
}
.lego-segment-item.editable:hover .lego-resizer-corner,
.lego-segment-item.editable.selected .lego-resizer-corner,
.lego-segment-item.editable.resizing .lego-resizer-corner{
  display: block;
}
.lego-segment-item .lego-resizer-corner:hover,
.lego-segment-item .lego-resizer-corner.active{
  border-color: var(--lego-accent, #38bdf8);
  box-shadow: 2px 2px 6px rgba(56, 189, 248, 0.8);
  transform: scale(1.2);
}
.lego-row > .lego-resizer-corner{
  z-index: 40 !important;
}
.lego-item-actions{
  display: none;
  position: absolute;
  top: -8px;
  right: -6px;
  align-items: center;
  gap: 3px;
  z-index: 30;
}
.lego-segment-item.editable:hover .lego-item-actions,
.lego-segment-item.editable.selected .lego-item-actions,
.lego-segment-item.editable.is-unbound .lego-item-actions{
  display: flex;
}
.lego-item-link-btn{
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(18, 18, 28, 0.95);
  color: #cbd5e1;
  font-size: 9px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.6);
  transition: all .12s ease;
}
.lego-item-link-btn.is-bound{
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.6);
  background: rgba(15, 23, 42, 0.95);
}
.lego-item-link-btn.is-bound:hover{
  background: #38bdf8;
  color: #0f172a;
  border-color: #38bdf8;
  transform: scale(1.15);
}
.lego-item-link-btn.is-unbound{
  color: #000;
  background: #f59e0b;
  border-color: #fbbf24;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.6);
}
.lego-item-link-btn.is-unbound:hover{
  background: #fbbf24;
  color: #000;
  border-color: #fff;
  transform: scale(1.15);
}
.lego-item-del-btn{
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ef4444 !important;
  color: #fff !important;
  font-size: 9px;
  border: 1px solid rgba(0, 0, 0, 0.25);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.6);
  transition: all .12s ease;
}
.lego-item-del-btn:hover{
  background: #dc2626 !important;
  transform: scale(1.15);
  box-shadow: 0 3px 6px rgba(239, 68, 68, 0.7);
}
.lego-item-label{
  font-size: 11.5px;
  font-weight: 600;
  color: var(--lego-dim, #94a3b8);
  white-space: nowrap;
  flex: none;
}


/* Segmento como .lego-row no Canvas 2D */
.lego-row.is-segment{
  padding: 4px 6px;
  overflow: visible !important;
}
.lego-row.is-segment .lego-segment-box{
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
}


.lego-segment-box{
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--lego-well, rgba(0, 0, 0, 0.35));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 4px 10px;
  overflow: hidden;
  user-select: none;
}
.lego-segment-box.vertical{
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 8px 10px;
  overflow-y: auto;
}
.lego-segment-box.vertical .lego-segment-item{
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
}
.lego-segment-item.has-custom-w{
  flex: none !important;
}
.lego-segment-box.vertical .lego-segment-item.has-custom-w{
  flex: none !important;
  max-width: 100%;
  align-self: flex-start !important;
}
.lego-segment-box.vertical .lego-segment-item.kind-toggle,
.lego-segment-box.vertical .lego-segment-item.kind-number{
  justify-content: space-between;
}
.lego-segment-box.vertical .lego-segment-item.kind-combo,
.lego-segment-box.vertical .lego-segment-item.kind-slider{
  width: 100%;
  box-sizing: border-box;
}
.lego-segment-box.vertical .lego-segment-item.kind-textarea{
  width: 100%;
  box-sizing: border-box;
  align-items: stretch;
  min-height: 64px;
}
.lego-segment-box.vertical .lego-segment-item.kind-media,
.lego-segment-box.vertical .lego-segment-item.kind-video,
.lego-segment-box.vertical .lego-segment-item.kind-audio{
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  min-height: 80px;
}
.lego-segment-item.kind-media,
.lego-segment-item.kind-video,
.lego-segment-item.kind-audio{
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-height: 80px;
}
.lego-segment-item.kind-media .lego-item-top,
.lego-segment-item.kind-video .lego-item-top,
.lego-segment-item.kind-audio .lego-item-top{
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 16px;
  margin-bottom: 2px;
}
.lego-segment-item.kind-media .lego-item-top .lego-item-label,
.lego-segment-item.kind-video .lego-item-top .lego-item-label,
.lego-segment-item.kind-audio .lego-item-top .lego-item-label{
  font-size: 11px;
  font-weight: 600;
  color: var(--lego-sub-color, #94a3b8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lego-segment-item .lego-media-box{
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.lego-segment-item .lego-media-box .lego-media-thumb{
  flex: 1;
  width: 100%;
  min-height: 48px;
  position: relative;
  overflow: hidden;
}
.lego-segment-item .lego-media-box .lego-media-bar{
  flex: none;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
}
.lego-segment-item.kind-textarea{
  display: flex;
  align-items: stretch;
  min-height: 64px;
}
.lego-segment-item.kind-textarea .lego-ghost{
  width: 100%;
  height: 100%;
  min-height: 64px;
  align-items: stretch;
}
.lego-segment-item.kind-textarea textarea.lego-in,
.lego-segment-item.kind-textarea .lego-ghost textarea.lego-in,
.lego-segment-item.kind-textarea .lego-ghost-field.tall{
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 64px;
  box-sizing: border-box;
  resize: none;
}
.lego-segment-box.vertical .lego-seg-quick-btn{
  width: 100%;
  justify-content: center;
  margin-top: 4px;
}

/* Divisores / Linhas para o Canvas e Grupos */
.lego-row.is-divider {
  background: transparent !important;
  border: 1px solid transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  overflow: visible !important;
  cursor: pointer !important;
}
.lego-row.is-divider.kind-hdivider {
  min-height: 16px;
}
.lego-row.is-divider.kind-vdivider {
  min-width: 16px;
}
.lego-row.is-divider:hover {
  border-color: rgba(255, 255, 255, 0.12) !important;
  background: rgba(255, 255, 255, 0.02) !important;
}
.lego-row.is-divider.selected {
  outline: 1.5px dashed var(--lego-accent, #38bdf8) !important;
  outline-offset: 1px;
}
.lego-segment-item.is-divider {
  position: relative !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-sizing: border-box !important;
  overflow: visible !important;
  cursor: pointer !important;
  background: transparent !important;
  border-radius: 4px;
}
.lego-segment-item.is-divider:hover {
  background: rgba(255, 255, 255, 0.04) !important;
}
.lego-segment-item.is-divider.selected {
  outline: 1.5px dashed var(--lego-accent, #38bdf8) !important;
  outline-offset: 1px;
}
.lego-segment-item.is-divider.kind-hdivider {
  width: 100%;
  min-height: 16px;
  height: 16px;
  padding: 0 4px;
}
.lego-segment-item.is-divider.kind-vdivider {
  width: 16px;
  min-height: 20px;
  height: 100%;
  padding: 4px 0;
}
.lego-segment-item.is-divider.has-custom-w {
  align-self: flex-start !important;
}
.lego-divider {
  background: rgba(255, 255, 255, 0.18);
  pointer-events: none;
}
.lego-divider.h {
  width: 100%;
  height: 1px;
}
.lego-divider.v {
  width: 1px;
  height: 100%;
}
.lego-segment-item{
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.lego-segment-item.kind-toggle{
  flex: none;
}
.lego-segment-item.kind-text{
  flex: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--lego-dim, #94a3b8);
  white-space: nowrap;
}
.lego-segment-item.kind-combo{
  flex: 1;
  min-width: 80px;
}
.lego-segment-item.kind-number{
  flex: none;
  width: auto;
  min-width: 100px;
}

/* Number input com increase e decrease (+ e -) */
.lego-step-number{
  display: inline-flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  overflow: hidden;
  height: 28px;
  box-sizing: border-box;
}
.lego-step-btn{
  width: 24px;
  height: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 0;
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all .12s ease;
  user-select: none;
  padding: 0;
}
.lego-step-btn:hover{
  background: var(--lego-accent, #3b82f6);
  color: #ffffff;
}
.lego-step-btn:active{
  transform: scale(0.92);
}
.lego-step-input{
  width: 50px;
  height: 100%;
  background: transparent;
  border: 0;
  color: #ffffff;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  padding: 0 4px;
  outline: none;
}
.lego-step-input:focus{
  background: rgba(255, 255, 255, 0.08);
}

/* Modal de Configuração do Segmento */









/* ── Paleta de Componentes ── */
.lego-palette{width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;padding:10px 14px;background:rgba(20,20,30,0.92);border:1.5px solid var(--lego-accent);border-radius:10px;margin-bottom:10px;box-shadow:0 4px 18px rgba(0,0,0,0.45)}
.lego-palette-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;
  font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--lego-accent)}
.lego-palette-hint{font-size:11px;color:var(--lego-dim);font-weight:400;text-transform:none}
.lego-palette-items{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.lego-pal-group{display:flex;align-items:center;gap:6px;padding:3px 7px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:9px}
.lego-pal-cat-tag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#38bdf8;padding:0 3px;user-select:none;opacity:1}
.lego-pal-item{display:flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(255,255,255,0.06);
  border:1px solid var(--lego-line);border-radius:7px;cursor:grab;user-select:none;font-size:12.5px;font-weight:600;
  color:var(--lego-text);transition:all .15s ease}
.lego-pal-item:hover{background:rgba(59,130,246,0.22);border-color:var(--lego-accent);transform:translateY(-1px);color:#fff}
.lego-pal-item:active{cursor:grabbing}
.lego-pal-icon{font-size:14px;line-height:1}

/* ── Ações de Aba e Menu de Contexto ── */
.lego-tab-title{flex:1;white-space:nowrap}
.lego-tab-actions{display:inline-flex;align-items:center;gap:3px;margin-left:6px;opacity:0.5;transition:opacity .15s}
.lego-tab:hover .lego-tab-actions{opacity:1}
.lego-tab-btn{background:transparent;border:0;padding:2px 4px;border-radius:4px;cursor:pointer;
  font-size:11px;color:var(--lego-dim);line-height:1;transition:all .12s}
.lego-tab-btn:hover{color:#fff;background:rgba(255,255,255,0.12)}
.lego-tab-btn.del:hover{color:#ef4444;background:rgba(239,68,68,0.18)}

.lego-subtab-title{flex:1;white-space:nowrap}
.lego-subtab-actions{display:inline-flex;align-items:center;gap:3px;margin-left:6px;opacity:0.5;transition:opacity .15s}
.lego-subtab:hover .lego-subtab-actions{opacity:1}
.lego-subtab-btn{background:transparent;border:0;padding:2px 4px;border-radius:4px;cursor:pointer;
  font-size:10.5px;color:var(--lego-dim);line-height:1;transition:all .12s}
.lego-subtab-btn:hover{color:#fff;background:rgba(255,255,255,0.12)}
.lego-subtab-btn.del:hover{color:#ef4444;background:rgba(239,68,68,0.18)}

.lego-ctx-menu{position:fixed;background:#1a1a24;border:1px solid var(--lego-line);border-radius:8px;
  padding:5px;box-shadow:0 8px 25px rgba(0,0,0,0.7);z-index:9999999;display:flex;flex-direction:column;gap:2px;min-width:145px}
.lego-ctx-item{display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:5px;
  cursor:pointer;font-size:12px;color:var(--lego-text);border:0;background:transparent;text-align:left;transition:all .12s}
.lego-ctx-item:hover{background:var(--lego-accent);color:#fff}
.lego-ctx-item.danger:hover{background:#ef4444;color:#fff}

/* ── Sub-Abas Internas de Zona (Estilo Idêntico às Abas Principais) ── */
.lego-subtabs{display:flex;gap:4px;border-bottom:2px solid var(--lego-line);overflow-x:auto;
  scrollbar-width:none;margin:2px 0 8px 0;background:transparent;padding:0}
.lego-subtabs::-webkit-scrollbar{display:none}
.lego-subtab{flex:none;padding:7px 16px;cursor:pointer;color:var(--lego-dim);
  border-bottom:2.5px solid transparent;margin-bottom:-2px;white-space:nowrap;user-select:none;
  font-size:12.5px;font-weight:600;transition:all .15s ease;background:transparent;border-radius:0}
.lego-subtab:hover{color:var(--lego-text)}
.lego-subtab.sel{color:#fff;border-bottom-color:var(--lego-accent);font-weight:700;background:transparent}
.lego-subtab-add{flex:none;padding:7px 12px;cursor:pointer;color:var(--lego-dim);
  border-bottom:2.5px solid transparent;margin-bottom:-2px;font-size:15px;font-weight:700;transition:all .15s;background:transparent}
.lego-subtab-add:hover{color:var(--lego-accent)}

/* ── Section Actions ── */
.lego-sec-actions{display:flex;align-items:center;gap:4px}
/* ── Botão + Adicionar Componente no Card ── */
.lego-ctrl-add-btn{
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1.5px dashed var(--lego-line);
  background: rgba(255,255,255,0.02);
  color: var(--lego-dim);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all .15s ease;
  user-select: none;
  box-sizing: border-box;
  margin-top: 4px;
}
.lego-ctrl-add-btn:hover, .lego-ctrl-add-btn.over{
  border-color: var(--lego-accent);
  color: #fff;
  background: rgba(59,130,246,0.12);
}

.lego-zone-add{width:100%;flex:1 1 100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 16px;
  border:2px dashed var(--lego-line);border-radius:9px;background:rgba(255,255,255,0.02);
  color:var(--lego-dim);font-size:13px;font-weight:700;letter-spacing:.04em;cursor:pointer;transition:all .15s;margin-top:8px}
.lego-zone-add:hover{border-color:var(--lego-accent);color:#fff;background:rgba(59,130,246,0.12);transform:scale(1.005)}
.lego-zone-dropzone{padding:14px;border:1.5px dashed rgba(255,255,255,0.1);border-radius:8px;display:flex;align-items:center;
  justify-content:center;gap:8px;font-size:12px;color:var(--lego-dim);font-style:italic}

/* ── Botões e Inspector Modal ── */
.lego-btn{padding:7px 16px;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;
  border:1px solid var(--lego-line);background:rgba(255,255,255,0.06);color:var(--lego-text);transition:all .15s}
.lego-btn:hover{background:rgba(255,255,255,0.12);color:#fff}
.lego-btn-primary{background:var(--lego-accent);border-color:var(--lego-accent);color:#fff}
.lego-btn-primary:hover{background:#2563eb}

/* ── Visual Workflow Explorer (HUD & Picker) ── */
.lego-btn-explore{
  width:100%;box-sizing:border-box;display:flex;align-items:center;gap:12px;
  padding:10px 14px;border-radius:9px;border:1px solid rgba(59,130,246,0.4);
  background:linear-gradient(135deg, rgba(37,99,235,0.25), rgba(59,130,246,0.12));
  color:#fff;cursor:pointer;transition:all .18s ease;margin-bottom:10px;text-align:left;
}
.lego-btn-explore:hover{
  background:linear-gradient(135deg, rgba(37,99,235,0.45), rgba(59,130,246,0.25));
  border-color:var(--lego-accent);box-shadow:0 4px 16px rgba(59,130,246,0.3);transform:translateY(-1px);
}

.lego-picker-hud{
  position:fixed;top:18px;left:50%;transform:translateX(-50%);
  background:rgba(18,18,24,0.96);backdrop-filter:blur(14px);
  border:1.5px solid var(--lego-accent);border-radius:12px;
  padding:10px 20px;box-shadow:0 12px 36px rgba(0,0,0,0.8), 0 0 20px rgba(59,130,246,0.35);
  z-index:99999999;display:flex;align-items:center;gap:24px;color:#fff;font-family:inherit;
  animation:legoSlideDown .2s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes legoSlideDown{from{top:-40px;opacity:0}to{top:18px;opacity:1}}

.lego-pulse-icon{display:inline-block;animation:legoPulse 1.4s infinite ease-in-out}
@keyframes legoPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.22)}}

.lego-picker-cancel-btn{
  background:rgba(239,68,68,0.18);border:1px solid rgba(239,68,68,0.4);color:#fca5a5;
  padding:6px 14px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;
}
.lego-picker-cancel-btn:hover{background:#ef4444;color:#fff;border-color:#ef4444}

.lego-node-picker-popup{
  position:fixed;background:#161620;border:1.5px solid var(--lego-accent);
  border-radius:12px;padding:14px;box-shadow:0 16px 48px rgba(0,0,0,0.9);
  z-index:100000000;min-width:320px;max-width:440px;display:flex;flex-direction:column;
  gap:10px;font-family:inherit;color:#fff;animation:legoPopIn .15s ease-out;
}
@keyframes legoPopIn{from{transform:scale(0.92);opacity:0}to{transform:scale(1);opacity:1}}

.lego-node-picker-header{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid var(--lego-line);padding-bottom:8px}
.lego-node-picker-title{font-weight:700;font-size:14px;color:#fff}
.lego-node-picker-sub{font-size:11px;color:var(--lego-dim)}

.lego-node-widget-btn{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  width:100%;box-sizing:border-box;padding:8px 12px;border-radius:8px;
  background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);
  color:#fff;cursor:pointer;font-family:inherit;font-size:12.5px;transition:all .15s ease;text-align:left;
}
.lego-node-widget-btn:hover{
  background:rgba(59,130,246,0.22);border-color:var(--lego-accent);
  transform:translateX(3px);box-shadow:0 2px 8px rgba(59,130,246,0.3);
}

.lego-ins-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.72);backdrop-filter:blur(5px);
  z-index:999999;display:grid;place-items:center;padding:20px}
.lego-inspector{width:100%;max-width:540px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;
  background:#181822;border:1.5px solid var(--lego-accent);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.8)}
.lego-ins-header{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;
  border-bottom:1px solid var(--lego-line);background:rgba(0,0,0,0.25)}
.lego-ins-title{font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#fff}
.lego-ins-body{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:14px}
.lego-ins-field{display:flex;flex-direction:column;gap:6px}
.lego-ins-field label{font-size:11.5px;font-weight:700;color:var(--lego-dim);text-transform:uppercase;letter-spacing:.04em}
.lego-ins-bind-list{display:flex;flex-direction:column;gap:3px;max-height:200px;overflow-y:auto;
  border:1px solid var(--lego-line);border-radius:6px;background:rgba(0,0,0,0.35);padding:6px}
.lego-ins-bind-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;
  border-radius:5px;cursor:pointer;font-size:12px;color:var(--lego-text);transition:all .12s}
.lego-ins-bind-item:hover{background:rgba(59,130,246,0.2);color:#fff}
.lego-ins-bind-item.selected{background:var(--lego-accent);color:#fff;font-weight:600}
.lego-ins-footer{display:flex;justify-content:flex-end;gap:10px;padding:12px 18px;
  border-top:1px solid var(--lego-line);background:rgba(0,0,0,0.25)}
`;

const CSS_FORM = `
/* ══════════════════════════════════════════════════════════════════════════
   MODO FORMULARIO: paleta de ferramentas e Inspetor de Objetos
   ══════════════════════════════════════════════════════════════════════════ */

/* Botoes de glifo: o SVG nunca encolhe e o texto fica na linha de base. */
.lego-card button svg, .lego-oi button svg, .lego-comfy-dialog button svg { flex: none; display: block; }
.lego-card button, .lego-oi button { display: inline-flex; align-items: center; gap: 6px; }
.lego-iconbtn { justify-content: center; gap: 0; }

/* Ferramenta armada: o formulario inteiro vira alvo de clique. */
.lego-card.armed .lego-sec-controls { cursor: crosshair; }
.lego-card.armed .lego-sec-controls::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  border: 1.5px dashed rgba(59,130,246,0.55); border-radius: 8px;
}
/* Caixa de seleção em área (Marquee Selection) estilo ComfyUI / Figma */
.lego-selection-box {
  position: absolute;
  pointer-events: none;
  border: 1px solid #38bdf8;
  background: rgba(56, 189, 248, 0.18);
  border-radius: 3px;
  z-index: 10000;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.35);
}
/* Linhas-Guia Inteligentes de Alinhamento (Smart Guides estilo Figma) */
.lego-align-guide {
  position: absolute;
  pointer-events: none;
  z-index: 99998;
  background: #f43f5e;
  box-shadow: 0 0 5px rgba(244, 63, 94, 0.85);
}
.lego-align-guide.v {
  width: 1px;
}
.lego-align-guide.h {
  height: 1px;
}
.lego-pal-item.armed {
  background: #3b82f6; border-color: #93c5fd; color: #fff;
  box-shadow: 0 0 0 2px rgba(59,130,246,0.35);
}
.lego-pal-item.alt { background: rgba(255,255,255,0.03); }
.lego-pal-sep { width: 1px; align-self: stretch; background: rgba(255,255,255,0.14); margin: 0 4px; }

/* ── Inspetor de Objetos: janela flutuante, fora do no ── */
.lego-oi {
  position: fixed; z-index: 9999999; width: 324px; max-height: 76vh;
  display: flex; flex-direction: column;
  background: #1b1b22; color: #e8e8ef;
  border: 1px solid rgba(255,255,255,0.16); border-radius: 10px;
  box-shadow: 0 22px 58px rgba(0,0,0,0.72);
  font-size: 12px; overflow: hidden;
}
.lego-oi-bar {
  flex: none; display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 7px 8px 7px 12px; cursor: move; user-select: none;
  background: #24242d; border-bottom: 1px solid rgba(255,255,255,0.1);
}
.lego-oi-bar-t { font-size: 11px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; opacity: .82; }
.lego-oi-picker { flex: none; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.lego-oi-pick {
  width: 100%; justify-content: space-between;
  background: rgba(0,0,0,0.34); color: #e8e8ef;
  border: 1px solid rgba(255,255,255,0.14); border-radius: 6px;
  padding: 6px 8px; font-size: 12px; cursor: pointer; text-align: left;
}
.lego-oi-pick:hover { border-color: #3b82f6; }
.lego-oi-pick span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lego-oi-sec {
  flex: none; padding: 7px 12px 5px; font-size: 10px; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,0.46);
  background: rgba(255,255,255,0.03);
}
.lego-oi-grid { flex: none; overflow-y: auto; }
.lego-oi-row {
  display: grid; grid-template-columns: 96px 1fr; align-items: center;
  gap: 8px; padding: 3px 12px; min-height: 28px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.lego-oi-key { color: rgba(255,255,255,0.58); font-size: 11.5px; }
.lego-oi-val { min-width: 0; }
.lego-oi-in {
  width: 100%; box-sizing: border-box;
  background: rgba(0,0,0,0.34); color: #e8e8ef;
  border: 1px solid rgba(255,255,255,0.12); border-radius: 5px;
  padding: 4px 7px; font-size: 12px; font-family: inherit; outline: none;
}
.lego-oi-in:focus { border-color: #3b82f6; background: rgba(0,0,0,0.5); }
.lego-oi-fn {
  width: 100%; justify-content: flex-start;
  background: rgba(245,158,11,0.12); color: #fbbf24;
  border: 1px dashed rgba(245,158,11,0.5); border-radius: 5px;
  padding: 5px 8px; font-size: 11.5px; cursor: pointer; text-align: left;
}
.lego-oi-fn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lego-oi-fn.bound {
  background: rgba(34,197,94,0.12); color: #6ee7a8;
  border: 1px solid rgba(34,197,94,0.42);
}
.lego-oi-fn.broken {
  background: rgba(239,68,68,0.14); color: #fca5a5;
  border: 1px solid rgba(239,68,68,0.45);
}
.lego-oi-empty { padding: 18px 14px; color: rgba(255,255,255,0.42); line-height: 1.5; }
.lego-oi-foot {
  flex: none; display: flex; gap: 8px; padding: 9px 12px;
  border-top: 1px solid rgba(255,255,255,0.09); background: rgba(0,0,0,0.2);
}
.lego-oi-foot .lego-btn { flex: 1; justify-content: center; font-size: 11.5px; }
/* ── Componente sem função: a cara do tipo, inerte ── */
.lego-row.unbound {
  /* Visual 100% normal nativo, sem contorno tracejado amarelo */
}
.lego-row.unbound .lego-floating-actions {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

/* Posição do rótulo em relação ao componente. */
.lego-row-top { display: flex; align-items: center; width: 100%; margin-bottom: 4px; }
.lego-row-top.to-right { justify-content: flex-end; }
.lego-row.lbl-right > .lego-lbl { flex: none; min-width: 0; text-align: right; }
/* .lego-grp nasce com width:100%; com o rotulo ao lado isso empurra o
   rotulo para fora e as duas coisas se sobrepoem. */
.lego-row.lbl-right > .lego-grp,
.lego-row.lbl-none > .lego-grp { flex: 1 1 0; min-width: 0; width: auto; overflow: hidden; }
/* Com o rotulo do lado, o que sobra de largura e menor: os controles que
   aguentam encolher encolhem, e o overflow acima garante que nada pinte por
   cima do rotulo quando nem isso basta — ai o caminho e alargar o componente. */
.lego-row.lbl-right > .lego-grp > .lego-cell.k-slider,
.lego-row.lbl-right > .lego-grp > .lego-cell.k-number { flex: 1 1 90px; width: auto; min-width: 70px; }
.lego-row.lbl-right > .lego-lbl.grp-n { flex: none; min-width: 0; text-align: right; padding-left: 6px; }
.lego-row.lbl-right > .lego-in,
.lego-row.lbl-right > .lego-slider,
.lego-row.lbl-right > .lego-combo-btn { flex: 1; }
.lego-row.lbl-none > .lego-in,
.lego-row.lbl-none > .lego-slider,
.lego-row.lbl-none > .lego-combo-btn { flex: 1; }
.lego-ghost { flex: 1; min-width: 0; display: flex; align-items: center; opacity: .78; pointer-events: none; }
.lego-ghost.shrink { flex: none; }
.lego-ghost-fill { flex: 1; min-width: 0; }
.lego-ghost-sw {
  width: 38px; height: 20px; border-radius: 10px;
  background: rgba(0,0,0,0.42); border: 1px solid rgba(255,255,255,0.18); position: relative;
}
.lego-ghost-sw::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
  border-radius: 50%; background: rgba(255,255,255,0.45);
}
.lego-ghost-track {
  flex: 1; height: 7px; border-radius: 4px; background: rgba(0,0,0,0.42); position: relative;
}
.lego-ghost-knob {
  position: absolute; left: 30%; top: 50%; transform: translate(-50%,-50%);
  width: 13px; height: 13px; border-radius: 50%; background: rgba(255,255,255,0.5);
}
.lego-ghost-field {
  flex: 1; min-width: 0; display: flex; align-items: center; justify-content: space-between;
  gap: 6px; height: 26px; padding: 0 8px;
  background: rgba(0,0,0,0.34);
  border: 1px solid rgba(255,255,255,0.2); border-radius: 5px;
}
.lego-ghost-field.tall { height: 100%; align-items: flex-start; padding-top: 6px; }
.lego-ghost-media {
  flex: 1; display: flex; align-items: center; justify-content: center;
  min-height: 46px; border-radius: 6px;
  background: rgba(0,0,0,0.3); border: 1px dashed rgba(255,255,255,0.18);
}
.lego-unbound-tag {
  position: absolute; left: 5px; top: 50%; transform: translateY(-50%); display: flex;
  color: #fbbf24; opacity: .7; cursor: pointer; pointer-events: auto;
}
.lego-unbound-tag:hover { opacity: 1; }

.lego-btn.danger { color: #fca5a5; border-color: rgba(239,68,68,0.4); }
.lego-btn.danger:hover { background: rgba(239,68,68,0.18); }

/* Toast de feedback para ações rápidas de teclado (Undo, Redo, Copy, Paste) */
.lego-action-toast{
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: rgba(15, 23, 42, 0.94);
  border: 1px solid rgba(56, 189, 248, 0.5);
  color: #38bdf8;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.6);
  pointer-events: none;
  opacity: 0;
  transform: translateY(8px);
  transition: all .15s ease;
  z-index: 10000;
}
.lego-action-toast.visible{
  opacity: 1;
  transform: translateY(0);
}
`;

/* ── Toast de Feedback Rápido ── */
/* Exibição de saídas (Image / Video / Audio Output) */
const CSS_OUTPUT = `
.lego-row.is-output{flex-direction:column;align-items:stretch;gap:4px}
.lego-row.is-output>.lego-out-box{flex:1;min-height:0}
.lego-out-box{display:flex;flex-direction:column;gap:4px;width:100%;height:100%;min-height:0;box-sizing:border-box}
.lego-out-stage{flex:1;min-height:0;position:relative;display:flex;align-items:center;justify-content:center;
  border-radius:8px;background:rgba(0,0,0,0.55);border:1.5px solid var(--lego-line);overflow:hidden;
  box-shadow:inset 0 2px 10px rgba(0,0,0,0.6)}
.lego-out-stage img,.lego-out-stage video{width:100%;height:100%;object-fit:contain;display:block}
.lego-out-stage img{cursor:zoom-in}
.lego-sec-controls.in-edit .lego-out-stage img{cursor:inherit}
.lego-out-box.is-audio .lego-out-stage{flex-direction:column;gap:6px;padding:8px;box-sizing:border-box}
.lego-out-stage audio{width:100%;height:32px}
.lego-out-audio-name{font-size:11px;color:var(--lego-dim);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lego-out-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
  padding:8px;text-align:center;font-size:11px;color:var(--lego-dim);opacity:.75}
.lego-out-bar{display:flex;align-items:center;justify-content:center;gap:8px;flex:none}
.lego-out-nav{display:inline-flex;align-items:center;justify-content:center;background:var(--lego-surface,#222);
  color:inherit;border:1px solid var(--lego-line);border-radius:5px;width:24px;height:20px;line-height:1;
  font-size:16px;cursor:pointer;padding:0 0 2px}
.lego-out-nav:hover{background:var(--lego-surface-hover,#2a2a2a)}
.lego-out-count{font-size:11px;color:var(--lego-dim);min-width:40px;text-align:center;font-variant-numeric:tabular-nums}
.lego-out-caption{font-size:11.5px;font-weight:600;color:var(--lego-dim);flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lego-segment-item.kind-outimage,.lego-segment-item.kind-outvideo,.lego-segment-item.kind-outaudio{flex-direction:column;align-items:stretch}
`;

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
  s.textContent = CSS + CSS_FORM + CSS_OUTPUT;
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
function usable(w) {
  if (!w || w.__lego) return false;
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
  if (host.subgraph?.nodes) {
    const fn = host.subgraph.nodes.find((n) => String(n.id) === sid);
    if (fn) return fn;
  }
  if (host.subgraph?._nodes) {
    const fn = host.subgraph._nodes.find((n) => String(n.id) === sid);
    if (fn) return fn;
  }
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
  for (const n of node.subgraph?._nodes || node.subgraph?.nodes || []) {
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

  const isSub = typeof node.isSubgraphNode === "function" ? node.isSubgraphNode() : !!node.subgraph;

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
  const raw = String(name || "");
  const i = raw.lastIndexOf("/");
  const sub = i > 0 ? raw.slice(0, i) : "";
  const file = i > 0 ? raw.slice(i + 1) : raw;
  return api.apiURL(
    `/view?filename=${encodeURIComponent(file)}&type=input&subfolder=${encodeURIComponent(sub)}&rand=${Math.random()}`
  );
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
  const nodes = host.subgraph?._nodes || host.subgraph?.nodes || [];
  return nodes.some((n) => String(n.id) === String(id));
}

/** Output mais recente com arquivos do tipo `media` para o controle. */
function latestOutputFor(host, ctrl, media) {
  const src = ctrl.source != null && ctrl.source !== "" ? String(ctrl.source) : "";
  let match;
  if (!src) {
    const pre = `${host.id}:`;
    match = host.subgraph ? (k) => k.startsWith(pre) : (k) => k === String(host.id);
  } else {
    const base = isInsideHost(host, src) ? `${host.id}:${src}` : src;
    match = (k) => k === base || k.startsWith(`${base}:`);
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
  for (const n of host.subgraph?._nodes || host.subgraph?.nodes || []) push(n, "sub");
  for (const n of host.graph?._nodes || host.graph?.nodes || []) push(n, "graph");
  // Nós de saída primeiro; o resto fica disponível para nós customizados.
  out.sort((a, b) => (b.isOutput - a.isOutput) || (a.scope === b.scope ? 0 : a.scope === "sub" ? -1 : 1));
  return out;
}

function outputSourceLabel(host, ctrl) {
  const src = ctrl.source != null && ctrl.source !== "" ? String(ctrl.source) : "";
  if (!src) return host.subgraph ? "Auto — latest inside this subgraph" : "Auto — this node";
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
  const autoLabel = host.subgraph ? "Auto — latest inside this subgraph" : "Auto — this node";
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
function buildSegment(host, ctrl, state, sectionCtrls) {
  const isVertical = ctrl.kind === "vsegment";
  const box = el("div", `lego-segment-box ${isVertical ? "vertical" : "horizontal"}${state?.edit ? " in-edit" : ""}`);
  if (!Array.isArray(ctrl.items)) ctrl.items = [];

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
    const isSelected = (state?.selectedName && state.selectedName === item.name) || (state?.selectedNames && state.selectedNames.has(item.name));

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

    const editBtn = glyphTextBtn("lego-seg-quick-btn", "plus", "Add", 12);
    editBtn.title = `Add element to ${isVertical ? "vertical group" : "horizontal group"} (opens selector)`;
    if (!isVertical) editBtn.style.marginLeft = "auto";
    editBtn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });
    editBtn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openInspector({
        host,
        layout: host.properties[PROP],
        section: { controls: sectionCtrls },
        state,
        segmentCtrl: ctrl
      });
    });
    box.append(editBtn);
  }

  if (ctrl.items.length === 0 && !state?.edit) {
    const emptyHint = el("div", null, isVertical ? "Empty Vertical Group" : "Empty Group");
    emptyHint.style.cssText = "font-size:11.5px; color:#64748b; font-style:italic;";
    box.append(emptyHint);
  }

  return box;
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
    row = el("div", `lego-row is-divider ${ctrl.kind}`);
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
  const isSlider = ctrl.kind === "slider" || (!isGroup && !isCosmetic && hit && describeWidget(hit.widget).kind === "slider");
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
  if ((state.selectedName && state.selectedName === ctrl.name) || state.selectedNames.has(ctrl.name)) {
    row.classList.add("selected");
    state.selectedNames.add(ctrl.name);
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
      row.append(el("div", "lego-lbl", ctrl.label || ctrl.bind || ctrl.kind || "Element"));
      const miss = el("div", "lego-in", "widget missing");
      miss.style.opacity = ".5";
      row.append(miss);
    }

    // NÃO retorna aqui — deixa cair até a barra de ações e arraste
  } else {

  const { node, widget: w } = hit;
  const isVideo = ctrl.kind === "video" || isVideoCombo(w) || (w.name && /video/i.test(w.name) && typeof w.value === "string" && RE_VIDEO.test(w.value));
  const isAudio = ctrl.kind === "audio" || isAudioCombo(w) || (w.name && /(audio|sound)/i.test(w.name) && typeof w.value === "string" && RE_AUDIO.test(w.value));
  const isMedia = ctrl.kind === "media" || isImageCombo(w) || (w.name && w.name.toLowerCase().includes("image") && typeof w.value === "string" && (w.value.endsWith(".png") || w.value.endsWith(".jpg") || w.value.endsWith(".webp")));
  const kind = isVideo ? "video" : isAudio ? "audio" : isMedia ? "media" : describeWidget(w).kind;

  let control;
  if (kind === "media" || kind === "video" || kind === "audio") {
    control = mkMediaControl(node, w, ctrl, state, row, kind);
    row.style.minHeight = "64px";
  }
  else if (kind === "toggle") control = mkToggle(node, w, ctrl, state);
  else if (kind === "slider") control = mkSlider(node, w, ctrl, state);
  else if (kind === "number") control = mkNumber(node, w, ctrl, state);
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

    // Botão direito abre o Inspetor de Objetos (com suporte a multi-seleção)
    row.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".lego-segment-item")) return;
      e.preventDefault();
      e.stopPropagation();
      const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
      marcar(isMulti);
      selectComponent(host, state, ctrl, sectionCtrls, true, isMulti);
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

        if (updateBoundsFn) {
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

  return row;
}


function detectMediaKind(w, desc) {
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
        kind: detectMediaKind(w, desc),
        node: host,
        widget: w,
        scope: "Promoted / Host Node",
        detail: `[Host] ${w.name} (${w.type || desc.kind})`
      });
    }
  }

  // 2. Nós internos do Subgrafo (se existirem)
  const subNodes = host.subgraph?._nodes || host.subgraph?.nodes || [];
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
          kind: detectMediaKind(w, desc),
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
            kind: detectMediaKind(w, desc),
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
function startVisualWorkflowPicker({ host, backdrop, onSelect, pickNode = false }) {
  backdrop.style.display = "none";

  const canvas = app.canvas;
  const originGraph = canvas.getCurrentGraph?.() || canvas.graph || app.graph;
  let isInsideSubgraph = false;

  // Abre o Subgrafo descompactado no canvas (se existir)
  if (host.subgraph) {
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
        <div style="font-size:12px;color:rgba(255,255,255,0.75);">${pickNode ? "Click the node whose output this component should show" : "Click any node on the canvas to pick the parameter to control"}</div>
      </div>
    </div>
  `;

  const cleanup = () => {
    hud.remove();
    document.querySelector(".lego-node-picker-popup")?.remove();
    window.removeEventListener("pointerdown", onCanvasPointerDown, true);

    // Retorna para o grafo principal se entrou no subgrafo
    if (isInsideSubgraph) {
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

  const cancelBtn = glyphTextBtn("lego-picker-cancel-btn", "close", "Cancel and return", 14);
  cancelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    cleanup();
  });
  hud.append(cancelBtn);
  document.body.append(hud);

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

    if (!usableWidgets.length) {
      wList.append(el("div", "lego-empty", "This node has no configurable parameters."));
    } else {
      for (const w of usableWidgets) {
        const desc = describeWidget(w);
        const kind = detectMediaKind(w, desc);

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

    const hitNode = getNodeAtEvent(canvas, e);
    if (!hitNode) return; // Clicou no fundo do canvas: permite pan/zoom nativo!

    e.stopPropagation();
    e.preventDefault();
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

function openInspector({ host, layout, section, ctrl, state, defaultKind, insertIndex, initialWidth, initialPos, targetCallback, forFilterKind, segmentCtrl, sourceFor }) {
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
  const runTargetPicker = () => {
    startVisualWorkflowPicker({
      host,
      backdrop,
      pickNode: !!sourceFor,
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
  }

  // Executa a inserção / salvamento
  function insertSelectedTarget() {
    if (!selectedTarget) return;

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
        pushUndo(host);
        fn();
        state.refresh();
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

    alignRow.append(
      mkAlignBtn("⇤ Left", "Align left edges (Figma)", () => {
        const ctrls = getSelCtrls();
        if (!ctrls.length) return;
        const minX = Math.min(...ctrls.map((c) => (typeof c.x === "number" ? c.x : 0)));
        ctrls.forEach((c) => { c.x = minX; });
      }),
      mkAlignBtn("⤒ Top", "Align top edges (Figma)", () => {
        const ctrls = getSelCtrls();
        if (!ctrls.length) return;
        const minY = Math.min(...ctrls.map((c) => (typeof c.y === "number" ? c.y : 0)));
        ctrls.forEach((c) => { c.y = minY; });
      }),
      mkAlignBtn("⇥ Right", "Align right edges (Figma)", () => {
        const ctrls = getSelCtrls();
        if (!ctrls.length) return;
        const maxR = Math.max(...ctrls.map((c) => (typeof c.x === "number" ? c.x : 0) + (typeof c.w === "number" ? c.w : 100)));
        ctrls.forEach((c) => {
          const w = typeof c.w === "number" ? c.w : 100;
          c.x = Math.max(0, Math.round((maxR - w) / 16) * 16);
        });
      }),
      mkAlignBtn("⤓ Bottom", "Align bottom edges (Figma)", () => {
        const ctrls = getSelCtrls();
        if (!ctrls.length) return;
        const maxB = Math.max(...ctrls.map((c) => (typeof c.y === "number" ? c.y : 0) + (typeof c.h === "number" ? c.h : 46)));
        ctrls.forEach((c) => {
          const h = typeof c.h === "number" ? c.h : 46;
          c.y = Math.max(0, Math.round((maxB - h) / 16) * 16);
        });
      })
    );

    multiBox.append(alignLabel, alignRow);

    if (selCount >= 3) {
      const distRow = el("div", "lego-oi-align-row");
      distRow.style.display = "grid";
      distRow.style.gridTemplateColumns = "1fr 1fr";
      distRow.style.gap = "4px";

      distRow.append(
        mkAlignBtn("⇋ Distribute X", "Distribute horizontal spacing evenly", () => {
          const ctrls = getSelCtrls();
          if (ctrls.length < 3) return;
          ctrls.sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
          const first = ctrls[0];
          const last = ctrls[ctrls.length - 1];
          const totalSpan = (last.x ?? 0) - (first.x ?? 0);
          const step = totalSpan / (ctrls.length - 1);
          ctrls.forEach((c, idx) => {
            c.x = Math.max(0, Math.round((first.x + idx * step) / 16) * 16);
          });
        }),
        mkAlignBtn("⇅ Distribute Y", "Distribute vertical spacing evenly", () => {
          const ctrls = getSelCtrls();
          if (ctrls.length < 3) return;
          ctrls.sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
          const first = ctrls[0];
          const last = ctrls[ctrls.length - 1];
          const totalSpan = (last.y ?? 0) - (first.y ?? 0);
          const step = totalSpan / (ctrls.length - 1);
          ctrls.forEach((c, idx) => {
            c.y = Math.max(0, Math.round((first.y + idx * step) / 16) * 16);
          });
        })
      );
      multiBox.append(distRow);
    }

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
  const root = el("div", "lego-card");
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

  const pencil = glyphBtn(`lego-iconbtn${state.edit ? " on" : ""}`, "pencil", 12);
  pencil.title = "Edit layout mode";
  pencil.addEventListener("pointerdown", eatPointer);
  pencil.addEventListener("click", (e) => {
    e.stopPropagation();
    state.edit = !state.edit;
    if (!state.edit) {
      state.armedTool = null;
      state.selectedName = null;
      closeObjectInspector();
    }
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
      const sec = el("div", "lego-sec");
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
        sec.append(subBar);
      }

      // ── ÁREA DE CANVAS 2D DA ZONA (SEM TEXTURA DE BOLINHAS, TOTALMENTE DISCRETO) ──
      const CTRL_GRID = 16;
      const ctrlsBox = el("div", `lego-sec-controls${state.edit ? " in-edit" : ""}`);

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
          ctrlsBox.append(el("div", "lego-empty", hasSubTabs ? `sub-tab "${activeTarget.name}" empty` : "empty zone"));
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
      state.outputViews = [];
      host.replaceChildren(buildCard(node, state));
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
          for (const n of ATTACHED) {
            const fns = n.__legoState?.watchers?.get(w);
            if (fns) fns.forEach((f) => { try { f(); } catch {} });
          }
          return r;
        };
      }
      if (!state.watchers.has(w)) state.watchers.set(w, []);
      state.watchers.get(w).push(fn);
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
 * Dimensiona o nó a partir do cartão com histerese (mínimo 8px) para evitar flickering.
 */
function resize(node, host) {
  if (!node || !host) return;
  const h = cardHeight(host);
  if (!h || h < 40) return;
  const top = node.__legoWidget?.y ?? 46;
  const minW = MIN_W;
  const curW = Math.ceil(node.size?.[0] || minW);
  const curH = Math.ceil(node.size?.[1] || 0);
  const targetW = Math.max(minW, curW);
  const targetH = Math.ceil(top + h + PAD);

  if (Math.abs(curH - targetH) >= 8 || curW < minW) {
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
    if (node?.properties?.[PROP]) {
      try { attach(node); } catch (e) { console.error(LOG, "nodeCreated attach failed", node.id, e); }
    }
  },

  async loadedGraphNode(node) {
    if (node.properties?.[PROP]) {
      try { attach(node); } catch (e) { console.error(LOG, "attach failed", node.id, e); }
    }
  },

  getNodeMenuItems(node) {
    if (!node) return [];
    const has = !!node.properties?.[PROP];
    const items = [];

    if (!has) {
      items.push({
        content: "Convert to Super-Subgraph",
        callback: () => {
          node.properties = node.properties || {};
          node.properties[PROP] = autoLayout(node);
          attach(node);
        },
      });
    } else {
      items.push({
        content: "Edit Layout",
        callback: () => {
          const s = node.__legoState || attach(node);
          s.edit = !s.edit;
          s.refresh();
        },
      });
      items.push({
        content: "Recreate Layout from Widgets",
        callback: () => {
          const keepEdit = node.__legoState?.edit;
          node.properties[PROP] = autoLayout(node);
          if (node.__legoState) { node.__legoState.edit = !!keepEdit; node.__legoState.refresh(); }
          else attach(node);
        },
      });
      items.push({
        content: "Remove Super-Subgraph UI",
        callback: () => detach(node),
      });
    }
    return items;
  },
});

console.log(`${LOG} v2 (DOM) loaded`);


/**
 * Interactive dialog to assemble Custom Segment element
 * Allows adding Checkbox, Text, Dropdown, and Number (+/-) in the same element.
 */
