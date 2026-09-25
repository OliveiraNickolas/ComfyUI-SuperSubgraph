/**
 * ComfyUI-SuperSubgraph — estilos (CSS) do cartão, do Inspetor e dos diálogos.
 *
 * Separado do super_subgraph.js só para o arquivo principal ficar legível.
 * O ComfyUI carrega todo .js de web/ como extensão: este módulo só exporta
 * strings, sem efeito colateral nenhum ao ser carregado sozinho.
 */

/* ══════════════════════════════════════════════════════════════════════════
   Estilo
   ══════════════════════════════════════════════════════════════════════════ */

export const CSS = `
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
  font-size: 23.1px;
  color: var(--lego-dim);
  display: flex;
  align-items: center;
}
.lego-comfy-search-input{
  flex: 1;
  background: transparent;
  border: none;
  color: #ffffff;
  font-size: 17.9px;
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
  font-size: 15.8px;
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
  font-size: 13.7px;
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
  font-size: 14.2px;
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
  font-size: 13.7px;
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
  font-size: 14.2px;
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
  font-size: 11.6px;
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
  font-size: 13.7px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.82);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lego-comfy-cat-badge{
  font-size: 11.6px;
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
  font-size: 15.2px;
  font-weight: 600;
  color: #ffffff;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
.lego-comfy-node-sub{
  font-size: 13.1px;
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
  font-size: 11.6px;
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
  border-radius:6px;padding:7px 10px;font:inherit;font-size:13.1px;outline:none}
.lego-list-search:focus{border-color:#3b82f6}
.lego-list-items{overflow-y:auto;display:flex;flex-direction:column;gap:1px;min-height:0}
/* flex:none — filho de flex encolhe por padrão, e com a lista rolando os
   itens ficavam espremidos uns sobre os outros. */
.lego-list-item{flex:none;display:flex;align-items:baseline;gap:0;padding:7px 10px;border-radius:5px;
  cursor:pointer;font-size:13.1px;line-height:1.35;color:#f2f2f6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lego-list-item:hover{background:#3b82f6;color:#fff}
.lego-list-item.sel{background:rgba(59,130,246,0.22);font-weight:600}
.lego-list-folder{opacity:.5;font-size:12.1px;flex:none}
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
  font-size: 14.7px;
  font-weight: 700;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}
.lego-faithful-id-badge{
  font-size: 11.6px;
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
  font-size: 12.6px;
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
  font-size: 12.6px;
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
  font-size: 10.0px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: #0284c7;
  color: #ffffff;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.lego-faithful-widget-ctrl{
  font-size: 12.6px;
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
  font-size: 12.6px;
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
  font-size: 13.7px;
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
    font-size: 12.6px !important;
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
  font-size: 18.9px;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.3;
}
.lego-comfy-det-category{
  font-size: 13.1px;
  color: #38bdf8;
  font-weight: 600;
}
.lego-comfy-det-desc{
  font-size: 13.1px;
  line-height: 1.5;
  color: #a1a1aa;
}
.lego-comfy-det-field{
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lego-comfy-det-label{
  font-size: 12.1px;
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
  font-size: 14.2px;
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
  font-size: 15.8px;
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
  font-size: 10.5px;
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
  font-size: 13.7px;
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
  font-size: 18.9px;
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
  font-size: 13.7px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--lego-text);
}
.lego-search-item-desc{
  font-size: 11.6px;
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
  font-size: 10.5px;
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
  font:13.5px/1.5 Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
.lego-head.compact{justify-content:flex-end;gap:6px;margin-bottom:2px}
/* Cartão fundido ao nó: sem moldura própria, o título fica só na barra do nó. */
.lego-card.merged,.lego-card.merged.has-node-color{border:0;box-shadow:none;background:transparent;padding:4px 2px 2px}
/* Num grupo horizontal o rótulo nunca fica menor que o próprio texto: sem
   espaço, o conteúdo vaza e o grupo cresce (fitGroupToContent). */
.lego-segment-box.horizontal > .lego-segment-item.is-label{flex-shrink:0;min-width:max-content}
.lego-head-tools{display:inline-flex;align-items:center;gap:6px;flex:none;margin-left:auto}
.lego-sec-h > .lego-head-tools{order:2;margin-left:8px}
.lego-sec-h::after{order:1}
.lego-tabs > .lego-head-tools{align-self:center;padding-left:8px}
.lego-head-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.lego-title-row{display:flex;align-items:center;gap:8px;min-width:0}
.lego-title{font-size:15.8px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff}
.lego-title.editable{cursor:pointer;transition:color .15s ease}
.lego-title.editable:hover{color:var(--lego-accent,#38bdf8)}
.lego-title-edit-btn{flex:none;width:22px;height:22px;border-radius:5px;
  background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.4);
  color:#38bdf8;cursor:pointer;display:inline-flex;align-items:center;
  justify-content:center;padding:0;transition:all .15s ease}
.lego-title-edit-btn:hover{background:var(--lego-accent,#38bdf8);color:#fff;
  border-color:var(--lego-accent,#38bdf8);box-shadow:0 0 8px rgba(56,189,248,0.4)}
.lego-sub{font-size:12.6px;color:var(--lego-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lego-badge{flex:none;font-size:11.6px;font-weight:600;padding:3px 9px;border-radius:999px;
  background:rgba(255,255,255,0.06);border:1px solid var(--lego-line);color:var(--lego-dim);white-space:nowrap}
.lego-iconbtn{flex:none;width:28px;height:28px;border-radius:7px;cursor:pointer;
  display:grid;place-items:center;background:rgba(255,255,255,0.04);color:var(--lego-dim);
  border:1px solid var(--lego-line);font-size:14.7px;line-height:1;padding:0;transition:all .15s ease}
.lego-iconbtn:hover{color:var(--lego-text);background:rgba(255,255,255,0.08);border-color:var(--lego-accent)}
.lego-iconbtn.on{color:#fff;background:var(--lego-accent);border-color:var(--lego-accent)}
.lego-scale-btn{
  font-size: 11px !important;
  font-weight: 700 !important;
  padding: 2px 7px !important;
  width: auto !important;
  min-width: 38px !important;
  height: 24px !important;
  border-radius: 6px !important;
  background: rgba(255, 255, 255, 0.08) !important;
  border: 1px solid var(--lego-line) !important;
  color: var(--lego-text) !important;
  letter-spacing: 0.02em;
  cursor: pointer;
  user-select: none;
}
.lego-scale-btn:hover{
  background: var(--lego-accent) !important;
  color: #fff !important;
  border-color: var(--lego-accent) !important;
}

.lego-tabs{display:flex;gap:4px;border-bottom:2px solid var(--lego-line);overflow-x:auto;
  scrollbar-width:none;margin:2px 0 4px 0}
.lego-tabs::-webkit-scrollbar{display:none}
.lego-tab{flex:none;padding:8px 16px;cursor:pointer;color:var(--lego-dim);
  border-bottom:2.5px solid transparent;margin-bottom:-2px;white-space:nowrap;user-select:none;
  font-size:13.7px;font-weight:600;transition:all .15s ease}
.lego-tab:hover{color:var(--lego-text)}
.lego-tab.sel{color:#fff;border-bottom-color:var(--lego-accent);font-weight:700}
.lego-tab-add{flex:none;padding:8px 12px;cursor:pointer;color:var(--lego-dim);
  border-bottom:2.5px solid transparent;margin-bottom:-2px;font-size:15.8px;font-weight:700}
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
  min-width: 0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  transition: border-color .15s, box-shadow .15s;
}
/* Realces azuis (hover e seleção) são ferramentas de montagem: só existem
   com o cartão em modo de edição (.lego-card.editing). */
.lego-card.editing .lego-sec:hover{
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
/* Destaque de hover só no modo de edição: fora dele o label é só texto. */
.lego-sec-controls.in-edit .lego-row.is-label:hover{
  border-color: rgba(255, 255, 255, 0.2) !important;
}
.lego-row.is-label.selected{
  border-color: var(--lego-accent) !important;
  box-shadow: 0 0 0 1px var(--lego-accent) !important;
}
.lego-canvas-label{
  font-size: 13.7px;
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
  font-size: 10.5px;
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
.lego-width-badge{flex:none;font-size:11.6px;font-weight:700;padding:2px 7px;border-radius:5px;
  background:rgba(255,255,255,0.06);border:1px solid var(--lego-line);color:var(--lego-dim);
  cursor:pointer;user-select:none;transition:all .15s;display:inline-flex;align-items:center;gap:3px}
.lego-width-badge:hover{color:#fff;background:rgba(59,130,246,0.2);border-color:var(--lego-accent)}

/* Tooltip flutuante de Resize */
.lego-resize-tooltip{position:fixed;background:var(--lego-accent);color:#fff;font-size:12.6px;font-weight:700;
  padding:4px 9px;border-radius:5px;box-shadow:0 4px 15px rgba(0,0,0,0.6);pointer-events:none;z-index:99999999}
.lego-sec-h{display:flex;align-items:center;gap:8px;font-size:12.8px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:var(--lego-dim)}
.lego-sec-h::after{content:"";flex:1;height:1px;background:var(--lego-line)}
.lego-sec-h .lego-iconbtn{width:22px;height:22px;font-size:12.6px;border-radius:5px}

/* ── Internal widgets container ── */
.lego-row.resizing, .lego-sec.resizing{transition:none !important;user-select:none !important}

/* Componente do formulário — a ÚNICA regra base. A posição vem inline do JS
   (absoluta, com snap à grade); o resto mora aqui. */
.lego-row{position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:6px 12px;border-radius:8px;background:var(--lego-panel);min-height:44px;
  width:100%;min-width:0;box-sizing:border-box;user-select:none;
  border:1px solid var(--lego-line-strong);box-shadow:0 2px 8px rgba(0,0,0,0.35);
  transition:background .15s ease,border-color .15s ease}
.lego-card.editing .lego-row:hover{background:var(--lego-panel-hover);border-color:rgba(59,130,246,0.45)}
.lego-card:not(.editing) .lego-row.selected::before{display:none}
.lego-row .lego-lbl{flex:1;min-width:60px;color:var(--lego-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  font-size:14px;font-weight:500}
.lego-row .lego-in, .lego-row .lego-slider{flex:1;min-width:80px}
.lego-row .lego-sw{flex:none}
.lego-row.wide{flex-direction:column;align-items:stretch}
.lego-row.wide .lego-in{width:100%}
.lego-row.drag{opacity:.4}
.lego-row.over{outline:2px dashed var(--lego-accent)}


.lego-row.missing .lego-lbl{color:#ef4444;text-decoration:line-through}
.lego-missing-box{display:flex;align-items:center;gap:6px;min-width:0}
.lego-missing-txt{opacity:.55;font-size:11.6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.lego-missing-btn{flex:none;padding:2px 8px;border-radius:5px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#e5e7eb;font:600 11px/16px system-ui,sans-serif;cursor:pointer}
.lego-missing-btn:hover{background:rgba(168,85,247,.3);border-color:rgba(168,85,247,.7)}
.lego-missing-btn.danger:hover{background:rgba(239,68,68,.3);border-color:rgba(239,68,68,.7)}
.lego-grip{cursor:grab;color:var(--lego-dim);padding:0 4px;user-select:none;font-size:14.7px}

.lego-in{width:100%;min-width:0;background:var(--lego-well,rgba(0,0,0,0.34));color:var(--lego-text);
  border:1px solid var(--lego-line);border-radius:6px;padding:6px 10px;font:inherit;font-size:13.7px;
  transition:border-color .15s,background .15s}
.lego-in:focus{outline:none;border-color:var(--lego-accent);background:rgba(0,0,0,0.35)}
.lego-in[disabled]{opacity:.45}
select.lego-in{cursor:pointer}
select.lego-in option{background:#1f1f26;color:#fff}
textarea.lego-in{resize:vertical;min-height:75px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:13.1px;line-height:1.45}

.lego-slider{display:flex;align-items:center;gap:8px;min-width:0;width:100%;box-sizing:border-box}
.lego-track{position:relative;flex:1;height:8px;border-radius:99px;background:rgba(0,0,0,0.45);
  cursor:pointer;min-width:32px;box-sizing:border-box}
.lego-fill{position:absolute;inset:0 auto 0 0;border-radius:99px;background:var(--lego-accent)}
.lego-knob{position:absolute;top:50%;width:16px;height:16px;border-radius:50%;
  background:#ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.6);transform:translate(-50%,-50%);pointer-events:none;transition:transform .08s}
.lego-track:hover .lego-knob{transform:translate(-50%,-50%) scale(1.15)}
.lego-num{flex:none;width:58px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;box-sizing:border-box;height:26px;line-height:24px;padding:2px 6px;font-size:12.6px}

/* ── Slider Empilhado / Responsivo quando estreito ou alto ── */
.lego-row.is-slider{box-sizing:border-box}
.lego-row.is-slider.slider-stacked{flex-direction:column !important;align-items:stretch !important;justify-content:center !important;gap:4px !important;padding:6px 10px !important}
.lego-row.is-slider.slider-stacked > .lego-row-top{display:flex !important;align-items:center !important;justify-content:space-between !important;width:100% !important;min-width:0 !important;gap:8px !important}
.lego-row.is-slider.slider-stacked > .lego-row-top > .lego-lbl{flex:1 !important;min-width:0 !important;white-space:nowrap !important;overflow:hidden !important;text-overflow:ellipsis !important;font-size:13.1px !important}
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
  font-size: 13.1px;
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
  font-size: 12.6px;
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
.lego-slot .ph{color:var(--lego-dim);font-size:12.1px;font-weight:500;text-align:center;padding:6px;word-break:break-word}
.lego-slot .cap{position:absolute;left:0;right:0;bottom:0;padding:4px 6px;font-size:11.0px;font-weight:600;
  background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.lego-row.grp{grid-template-columns:28px 1fr auto}

/* Mosaico de mídia dentro de uma zona em grade: tudo empilhado, miniatura
   ocupando a folga vertical. Lado a lado só cabe em linha larga. */
.lego-row.grp.grp-media{flex-direction:column;align-items:stretch;gap:4px;padding:6px 8px}
.lego-row.grp.grp-media > .lego-lbl.grp-n{flex:none;text-align:left;font-size:10.5px;opacity:.55}
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
  font-size: 11.6px;
  font-weight: 500;
  color: var(--lego-dim, rgba(255, 255, 255, 0.6));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  letter-spacing: -0.2px;
}


.lego-lbl.grp-n{text-align:center;font-variant-numeric:tabular-nums;font-weight:700;color:var(--lego-dim);font-size:12.6px}
.lego-grp{display:flex;align-items:center;gap:8px;min-width:0;width:100%}
.lego-cell{min-width:0}
.lego-cell.k-combo{flex:1;min-width:80px}
.lego-cell.k-toggle,.lego-cell.k-button{flex:none}
.lego-cell.k-slider{flex:1;min-width:90px}
.lego-cell.k-number{flex:none;width:120px}
.lego-cell.k-text{flex:1;min-width:70px}

.lego-cols{display:grid;gap:8px;align-items:start}
.lego-cols .lego-row.wide{grid-column:1/-1}

.lego-empty{color:var(--lego-dim);font-size:12.6px;font-style:italic;padding:12px;text-align:center}
.lego-empty-cta{display:flex;flex-direction:column;align-items:center;gap:8px}
.lego-promote-cta{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;border:1px solid rgba(168,85,247,.55);background:rgba(168,85,247,.16);color:#e9d5ff;font:600 12px/1 inherit;font-style:normal;cursor:pointer}
.lego-promote-cta:hover{background:rgba(168,85,247,.3)}
.lego-empty-hint{font-size:11.6px;opacity:.7}
.lego-pick{display:flex;flex-direction:column;gap:5px;max-height:240px;overflow:auto;
  padding:8px;background:#1f1f26;border:1px solid var(--lego-line);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,0.4)}
.lego-pick button{text-align:left;background:transparent;border:0;color:var(--lego-text);
  font:inherit;font-size:12.6px;padding:5px 8px;border-radius:5px;cursor:pointer;transition:background .12s}
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
  font-size: 9.5px;
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
  font-size: 9.5px;
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
  font-size: 12.1px;
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
/* A barra de ações do GRUPO fica acima da borda dele, por fora: no canto de
   dentro ela cobria os botões (elo, X) do item que estivesse ali. O
   padding-bottom faz a ponte até a borda, para o hover não cair no vão. */
.lego-row.is-segment > .lego-floating-actions{
  top: auto;
  bottom: 100%;
  right: 0;
  padding-bottom: 4px;
}
/* Ponte de hover: enquanto o ponteiro está no grupo, a faixa logo acima dele
   (onde fica a barra) continua contando como grupo — ir até a barra na
   diagonal não a faz sumir no meio do caminho. Só existe durante o hover,
   então não bloqueia nada acima do grupo no resto do tempo. */
.lego-sec-controls.in-edit .lego-row.is-segment:hover::after{
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  height: 30px;
}
/* Cabeçalho do grupo: o nome do nó quando ele veio como "nó inteiro". */
.lego-row.is-segment.has-header{
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}
.lego-row.is-segment.has-header > .lego-segment-box{
  flex: 1;
  min-height: 0;
  height: auto;
}
.lego-seg-header{
  flex: none;
  padding: 0 4px;
  font-size: 12.8px;
  font-weight: 700;
  letter-spacing: .04em;
  color: var(--lego-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
.lego-segment-item.kind-segment,
.lego-segment-item.kind-vsegment,
.lego-segment-item.kind-group{
  height: auto !important;
  overflow: visible;
  align-items: stretch;
}
.lego-segment-item.kind-segment > .lego-segment-box,
.lego-segment-item.kind-vsegment > .lego-segment-box,
.lego-segment-item.kind-group > .lego-segment-box{
  overflow: visible;
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
  font-size: 11.6px;
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
/* Fora do modo de edição o divisor é só a linha: sem caixa no hover, sem
   cursor de clique e sem capturar o ponteiro (que passa para o que estiver
   por baixo da área dele). */
.lego-sec-controls.in-edit .lego-row.is-divider:hover {
  border-color: rgba(255, 255, 255, 0.12) !important;
  background: rgba(255, 255, 255, 0.02) !important;
}
.lego-sec-controls:not(.in-edit) .lego-row.is-divider {
  cursor: default !important;
  pointer-events: none;
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
.lego-segment-box.in-edit .lego-segment-item.is-divider:hover {
  background: rgba(255, 255, 255, 0.04) !important;
}
.lego-segment-box:not(.in-edit) .lego-segment-item.is-divider {
  cursor: default !important;
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
  font-size: 12.6px;
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
  font-size: 13.7px;
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
  font-size: 12.6px;
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
.lego-palette-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.6px;
  font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--lego-accent)}
.lego-palette-hint{font-size:11.6px;color:var(--lego-dim);font-weight:400;text-transform:none}
.lego-palette-items{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.lego-pal-group{display:flex;align-items:center;gap:6px;padding:3px 7px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:9px}
.lego-pal-cat-tag{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#38bdf8;padding:0 3px;user-select:none;opacity:1}
.lego-pal-item{display:flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(255,255,255,0.06);
  border:1px solid var(--lego-line);border-radius:7px;cursor:grab;user-select:none;font-size:13.1px;font-weight:600;
  color:var(--lego-text);transition:all .15s ease}
.lego-pal-item:hover{background:rgba(59,130,246,0.22);border-color:var(--lego-accent);transform:translateY(-1px);color:#fff}
.lego-pal-item:active{cursor:grabbing}
.lego-pal-icon{font-size:14.7px;line-height:1}

/* ── Ações de Aba e Menu de Contexto ── */
.lego-tab-title{flex:1;white-space:nowrap}
.lego-tab-actions{display:inline-flex;align-items:center;gap:3px;margin-left:6px;opacity:0.5;transition:opacity .15s}
.lego-tab:hover .lego-tab-actions{opacity:1}
.lego-tab-btn{background:transparent;border:0;padding:2px 4px;border-radius:4px;cursor:pointer;
  font-size:11.6px;color:var(--lego-dim);line-height:1;transition:all .12s}
.lego-tab-btn:hover{color:#fff;background:rgba(255,255,255,0.12)}
.lego-tab-btn.del:hover{color:#ef4444;background:rgba(239,68,68,0.18)}

.lego-subtab-title{flex:1;white-space:nowrap}
.lego-subtab-actions{display:inline-flex;align-items:center;gap:3px;margin-left:6px;opacity:0.5;transition:opacity .15s}
.lego-subtab:hover .lego-subtab-actions{opacity:1}
.lego-subtab-btn{background:transparent;border:0;padding:2px 4px;border-radius:4px;cursor:pointer;
  font-size:11.0px;color:var(--lego-dim);line-height:1;transition:all .12s}
.lego-subtab-btn:hover{color:#fff;background:rgba(255,255,255,0.12)}
.lego-subtab-btn.del:hover{color:#ef4444;background:rgba(239,68,68,0.18)}

.lego-ctx-menu{position:fixed;background:#1a1a24;border:1px solid var(--lego-line);border-radius:8px;
  padding:5px;box-shadow:0 8px 25px rgba(0,0,0,0.7);z-index:9999999;display:flex;flex-direction:column;gap:2px;min-width:145px}
.lego-ctx-item{display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:5px;
  cursor:pointer;font-size:12.6px;color:var(--lego-text);border:0;background:transparent;text-align:left;transition:all .12s}
.lego-ctx-item:hover{background:var(--lego-accent);color:#fff}
.lego-ctx-item.danger:hover{background:#ef4444;color:#fff}
.lego-ctx-label{flex:1}
.lego-align-bar{display:inline-flex;align-items:center;gap:2px;padding:2px 4px;border-radius:7px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.3);letter-spacing:0;order:0}
.lego-align-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:22px;padding:0;border:0;border-radius:5px;background:transparent;color:#7dd3fc;cursor:pointer}
.lego-align-btn:hover:not(:disabled){background:rgba(56,189,248,.22);color:#fff}
.lego-align-btn:disabled{opacity:.3;cursor:default}
.lego-align-sep{width:1px;height:14px;margin:0 3px;background:rgba(56,189,248,.3)}
.lego-color-grid{display:grid;grid-template-columns:repeat(5,24px);gap:6px;padding:4px}
.lego-color-swatch{width:24px;height:24px;border-radius:6px;border:2px solid rgba(255,255,255,.12);cursor:pointer;padding:0}
.lego-color-swatch.on{border-color:#fff}
.lego-color-swatch.none,.lego-color-dot.none{background:repeating-linear-gradient(45deg,rgba(255,255,255,.18) 0 3px,transparent 3px 6px)}
.lego-color-dot{display:block;width:11px;height:11px;border-radius:50%;border:1px solid rgba(255,255,255,.35)}
.lego-sec.tinted{border-color:color-mix(in srgb,var(--lego-zone-c) 55%,transparent);background:color-mix(in srgb,var(--lego-zone-c) 14%,var(--lego-panel,transparent))}
.lego-sec.tinted > .lego-sec-h{color:var(--lego-zone-c)}
.lego-row.tinted,.lego-segment-item.tinted{background-image:linear-gradient(90deg,color-mix(in srgb,var(--lego-c) 55%,transparent),transparent 85%)}
.lego-row.tinted-solid,.lego-segment-item.tinted-solid{background:var(--lego-c)}
.lego-seed-mode{flex:none;min-width:30px;height:24px;margin-left:4px;padding:0 6px;border-radius:6px;border:1px solid var(--lego-line);background:rgba(255,255,255,.05);color:var(--lego-dim);font:700 10.5px/22px system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.lego-seed-mode:hover{border-color:var(--lego-accent);color:var(--lego-text)}
.lego-seed-mode[data-mode="randomize"],.lego-seed-mode[data-mode="increment"],.lego-seed-mode[data-mode="decrement"]{color:#c4b5fd;border-color:rgba(168,85,247,.5)}
.lego-run{display:flex;flex-direction:column;gap:5px;margin:0 0 10px}
.lego-run-label{font-size:11.6px;color:var(--lego-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lego-run-track{height:4px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden}
.lego-run-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#a855f7,#22c55e);transition:width .25s}
.lego-run-error{display:flex;align-items:flex-start;gap:0;padding:7px 10px;border-radius:8px;background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.5);color:#fecaca;font-size:12.1px;line-height:1.35;max-height:64px;overflow:hidden}
.lego-run-error b{white-space:nowrap}
.lego-run-error span{flex:1;min-width:0;word-break:break-word}
.lego-run-close{flex:none;border:0;background:none;color:inherit;opacity:.7;cursor:pointer;padding:0 0 0 6px}
.lego-ctx-hint{margin-left:18px;font-size:11.0px;opacity:.5}
.lego-ctx-sep{height:1px;margin:3px 6px;background:var(--lego-line)}

/* ── Sub-Abas Internas de Zona (Estilo Idêntico às Abas Principais) ── */
.lego-subtabs{display:flex;gap:4px;border-bottom:2px solid var(--lego-line);overflow-x:auto;
  scrollbar-width:none;margin:2px 0 8px 0;background:transparent;padding:0}
.lego-subtabs::-webkit-scrollbar{display:none}
.lego-subtab{flex:none;padding:7px 16px;cursor:pointer;color:var(--lego-dim);
  border-bottom:2.5px solid transparent;margin-bottom:-2px;white-space:nowrap;user-select:none;
  font-size:13.1px;font-weight:600;transition:all .15s ease;background:transparent;border-radius:0}
.lego-subtab:hover{color:var(--lego-text)}
.lego-subtab.sel{color:#fff;border-bottom-color:var(--lego-accent);font-weight:700;background:transparent}
.lego-subtab-add{flex:none;padding:7px 12px;cursor:pointer;color:var(--lego-dim);
  border-bottom:2.5px solid transparent;margin-bottom:-2px;font-size:15.8px;font-weight:700;transition:all .15s;background:transparent}
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
  font-size: 12.1px;
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
  color:var(--lego-dim);font-size:13.7px;font-weight:700;letter-spacing:.04em;cursor:pointer;transition:all .15s;margin-top:8px}
.lego-zone-add:hover{border-color:var(--lego-accent);color:#fff;background:rgba(59,130,246,0.12);transform:scale(1.005)}
.lego-zone-dropzone{padding:14px;border:1.5px dashed rgba(255,255,255,0.1);border-radius:8px;display:flex;align-items:center;
  justify-content:center;gap:8px;font-size:12.6px;color:var(--lego-dim);font-style:italic}

/* ── Botões e Inspector Modal ── */
.lego-btn{padding:7px 16px;border-radius:6px;font-size:13.1px;font-weight:600;cursor:pointer;
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
  padding:6px 14px;border-radius:7px;font-size:12.6px;font-weight:600;cursor:pointer;transition:all .15s;
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
.lego-node-picker-title{font-weight:700;font-size:14.7px;color:#fff}
.lego-node-picker-sub{font-size:11.6px;color:var(--lego-dim)}

.lego-node-widget-btn{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  width:100%;box-sizing:border-box;padding:8px 12px;border-radius:8px;
  background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);
  color:#fff;cursor:pointer;font-family:inherit;font-size:13.1px;transition:all .15s ease;text-align:left;
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
.lego-ins-title{font-size:13.7px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#fff}
.lego-ins-body{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:14px}
.lego-ins-field{display:flex;flex-direction:column;gap:6px}
.lego-ins-field label{font-size:12.1px;font-weight:700;color:var(--lego-dim);text-transform:uppercase;letter-spacing:.04em}
.lego-ins-bind-list{display:flex;flex-direction:column;gap:3px;max-height:200px;overflow-y:auto;
  border:1px solid var(--lego-line);border-radius:6px;background:rgba(0,0,0,0.35);padding:6px}
.lego-ins-bind-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;
  border-radius:5px;cursor:pointer;font-size:12.6px;color:var(--lego-text);transition:all .12s}
.lego-ins-bind-item:hover{background:rgba(59,130,246,0.2);color:#fff}
.lego-ins-bind-item.selected{background:var(--lego-accent);color:#fff;font-weight:600}
.lego-ins-footer{display:flex;justify-content:flex-end;gap:10px;padding:12px 18px;
  border-top:1px solid var(--lego-line);background:rgba(0,0,0,0.25)}
`;

export const CSS_FORM = `
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
  font-size: 12.6px; overflow: hidden;
}
.lego-oi-bar {
  flex: none; display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 7px 8px 7px 12px; cursor: move; user-select: none;
  background: #24242d; border-bottom: 1px solid rgba(255,255,255,0.1);
}
.lego-oi-bar-t { font-size: 11.6px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; opacity: .82; }
.lego-oi-picker { flex: none; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.lego-oi-pick {
  width: 100%; justify-content: space-between;
  background: rgba(0,0,0,0.34); color: #e8e8ef;
  border: 1px solid rgba(255,255,255,0.14); border-radius: 6px;
  padding: 6px 8px; font-size: 12.6px; cursor: pointer; text-align: left;
}
.lego-oi-pick:hover { border-color: #3b82f6; }
.lego-oi-pick span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lego-oi-style-btn{padding:4px 8px;border-radius:5px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.34);color:var(--lego-dim);font-size:12px;font-weight:600;cursor:pointer;transition:all .12s;font-family:inherit;line-height:1}
.lego-oi-style-btn:hover{border-color:#3b82f6;color:var(--lego-text)}
.lego-oi-style-btn.on{background:var(--lego-accent);color:#fff;border-color:var(--lego-accent)}
.lego-oi-sec {
  flex: none; padding: 7px 12px 5px; font-size: 10.5px; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,0.46);
  background: rgba(255,255,255,0.03);
}
.lego-oi-grid { flex: none; overflow-y: auto; }
.lego-oi-row {
  display: grid; grid-template-columns: 96px 1fr; align-items: center;
  gap: 8px; padding: 3px 12px; min-height: 28px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.lego-oi-key { color: rgba(255,255,255,0.58); font-size: 12.1px; }
.lego-oi-val { min-width: 0; }
.lego-oi-in {
  width: 100%; box-sizing: border-box;
  background: rgba(0,0,0,0.34); color: #e8e8ef;
  border: 1px solid rgba(255,255,255,0.12); border-radius: 5px;
  padding: 4px 7px; font-size: 12.6px; font-family: inherit; outline: none;
}
.lego-oi-in:focus { border-color: #3b82f6; background: rgba(0,0,0,0.5); }
.lego-oi-fn {
  width: 100%; justify-content: flex-start;
  background: rgba(245,158,11,0.12); color: #fbbf24;
  border: 1px dashed rgba(245,158,11,0.5); border-radius: 5px;
  padding: 5px 8px; font-size: 12.1px; cursor: pointer; text-align: left;
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
.lego-oi-foot .lego-btn { flex: 1; justify-content: center; font-size: 12.1px; }
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
  font-size: 12.6px;
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
export const CSS_OUTPUT = `
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
.lego-out-audio-name{font-size:11.6px;color:var(--lego-dim);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lego-out-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
  padding:8px;text-align:center;font-size:11.6px;color:var(--lego-dim);opacity:.75}
.lego-out-bar{display:flex;align-items:center;justify-content:center;gap:8px;flex:none}
.lego-out-nav{display:inline-flex;align-items:center;justify-content:center;background:var(--lego-surface,#222);
  color:inherit;border:1px solid var(--lego-line);border-radius:5px;width:24px;height:20px;line-height:1;
  font-size:16.8px;cursor:pointer;padding:0 0 2px}
.lego-out-nav:hover{background:var(--lego-surface-hover,#2a2a2a)}
.lego-out-count{font-size:11.6px;color:var(--lego-dim);min-width:40px;text-align:center;font-variant-numeric:tabular-nums}
.lego-out-caption{font-size:12.1px;font-weight:600;color:var(--lego-dim);flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lego-segment-item.kind-outimage,.lego-segment-item.kind-outvideo,.lego-segment-item.kind-outaudio{flex-direction:column;align-items:stretch}
`;

/* Arraste entre grupos, zonas e sub-abas: feedback de entrada e saída */
export const CSS_DRAG = `
.lego-pick-overlay{position:fixed;inset:0;pointer-events:none;z-index:9990}
.lego-ss-boundary{position:fixed;inset:0;pointer-events:none;z-index:40}
.lego-ss-io{position:fixed;transform:translateY(-50%);padding:1px 6px;border-radius:9px;background:#a855f7;color:#fff;font:700 10px/14px system-ui,sans-serif;white-space:nowrap;box-shadow:0 1px 6px rgba(0,0,0,.45);pointer-events:auto;cursor:help}
.lego-ss-io.in{transform:translate(calc(-100% - 8px),-50%)}
.lego-ss-io.out{transform:translate(8px,-50%)}
.lego-pick-box{position:fixed;box-sizing:border-box;border-radius:8px;pointer-events:none}
.lego-pick-box.whole{border:2.5px solid #a855f7;box-shadow:0 0 0 3px rgba(168,85,247,0.25),0 0 18px rgba(168,85,247,0.55)}
.lego-pick-box.widget{border:2px solid #22c55e;border-radius:6px;background:rgba(34,197,94,0.12);box-shadow:0 0 10px rgba(34,197,94,0.45)}
.lego-picker-promote-btn{display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;border:none;cursor:pointer;
  background:#a855f7;color:#fff;font:700 13px system-ui,sans-serif}
.lego-picker-promote-btn:disabled{opacity:.45;cursor:default}
.lego-picker-promote-btn:not(:disabled):hover{background:#9333ea}
.lego-ss-enter{margin-left:auto;margin-right:6px}
.lego-ss-nav{position:fixed;top:50px;left:220px;z-index:1000;display:flex;align-items:center;gap:8px;height:32px;box-sizing:border-box;
  padding:0 10px 0 6px;border-radius:8px;background:rgba(24,24,28,0.94);border:1px solid rgba(168,85,247,0.55);
  box-shadow:0 8px 24px rgba(0,0,0,0.45);color:#e5e7eb;font:500 13px system-ui,sans-serif;backdrop-filter:blur(6px)}
.lego-ss-nav-badge{padding:2px 5px;border-radius:4px;background:#a855f7;color:#fff;font:800 10px/1.2 system-ui,sans-serif}
.lego-ss-nav-back{display:flex;align-items:center;gap:4px;padding:3px 9px 3px 5px;border-radius:7px;border:1px solid rgba(255,255,255,0.14);
  background:rgba(255,255,255,0.06);color:inherit;font:600 12.5px system-ui,sans-serif;cursor:pointer}
.lego-ss-nav-back:hover{background:rgba(168,85,247,0.28);border-color:rgba(168,85,247,0.7)}
.lego-ss-nav-kbd{margin-left:4px;padding:0 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);font:600 9px/14px monospace;opacity:.7}
.lego-ss-nav-crumbs{display:flex;align-items:center;gap:6px;min-width:0}
.lego-ss-nav-crumb{background:none;border:none;color:#a1a1aa;font:500 12.5px system-ui,sans-serif;cursor:pointer;padding:2px 3px;border-radius:4px;
  white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
button.lego-ss-nav-crumb:hover{color:#fff;background:rgba(255,255,255,0.08)}
.lego-ss-nav-crumb.current{color:#fff;font-weight:700;cursor:default}
.lego-ss-nav-sep{color:#71717a}
.lego-ss-icon{position:relative;display:inline-block;width:16px;height:16px;flex:none}
.lego-ss-icon::before{content:"";position:absolute;inset:0;background-color:currentColor;
  -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m15 15 6 6m-6-6v4.8m0-4.8h4.8'/%3E%3Cpath d='M9 19.8V15m0 0H4.2M9 15l-6 6'/%3E%3Cpath d='M15 4.2V9m0 0h4.8M15 9l6-6'/%3E%3Cpath d='M9 4.2V9m0 0H4.2M9 9 3 3'/%3E%3C/svg%3E") center/contain no-repeat;
  mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m15 15 6 6m-6-6v4.8m0-4.8h4.8'/%3E%3Cpath d='M9 19.8V15m0 0H4.2M9 15l-6 6'/%3E%3Cpath d='M15 4.2V9m0 0h4.8M15 9l6-6'/%3E%3Cpath d='M9 4.2V9m0 0H4.2M9 9 3 3'/%3E%3C/svg%3E") center/contain no-repeat}
.lego-ss-icon::after{content:"SS";position:absolute;right:-6px;bottom:-5px;padding:1px 2px;border-radius:3px;
  background:#a855f7;color:#fff;font:800 7px/1 system-ui,sans-serif;letter-spacing:-.02em;
  box-shadow:0 0 0 1.5px var(--comfy-menu-bg,#1e1e1e)}
.lego-whole-node{display:flex;flex-direction:column;gap:6px;margin:8px 0 4px;padding:8px;border-radius:8px;
  background:rgba(59,130,246,0.10);border:1px solid rgba(59,130,246,0.35)}
.lego-whole-node-title{font-size:12.6px;font-weight:700;color:#e5e7eb}
.lego-whole-node-opts{display:flex;gap:6px}
.lego-whole-node-opts.in-details{margin-top:8px}
.lego-whole-node-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 10px;
  border-radius:6px;border:1px solid rgba(59,130,246,0.5);background:rgba(59,130,246,0.18);color:#e5e7eb;
  font-size:12.6px;font-weight:600;cursor:pointer}
.lego-whole-node-btn:hover{background:rgba(59,130,246,0.32)}
.lego-whole-node-or{font-size:12.1px;color:var(--lego-dim,#a0a0a0);font-weight:600;margin:6px 0 2px}
.lego-segment-box{position:relative}
.lego-segment-box.drop-into{outline:2px dashed var(--lego-accent,#3b82f6)!important;outline-offset:2px;
  background:rgba(59,130,246,0.12)!important}
.lego-drop-line{position:absolute;pointer-events:none;background:var(--lego-accent,#3b82f6);border-radius:2px;
  box-shadow:0 0 8px rgba(59,130,246,0.8);z-index:60}
.lego-drop-line.v{top:4px;bottom:4px;width:3px}
.lego-drop-line.h{left:6px;right:6px;height:3px}
.lego-sec-controls.drop-out{outline:2px dashed rgba(34,197,94,0.85)!important;outline-offset:-2px;
  background:rgba(34,197,94,0.07)!important}
.lego-drag-ghost{position:fixed!important;margin:0!important;pointer-events:none!important;z-index:100000;
  opacity:.9;transform-origin:0 0;box-shadow:0 10px 28px rgba(0,0,0,0.55);border-radius:6px;
  background:#26262b;color:#e5e7eb;font-family:inherit;display:flex;align-items:center;gap:6px;
  padding:2px 6px;box-sizing:border-box;overflow:hidden}
.lego-drag-ghost .lego-item-actions,.lego-drag-ghost .lego-resizer-corner{display:none!important}
.lego-segment-item.drag-source{opacity:.3}
.lego-segment-item.editable{cursor:grab}
.lego-row.entering-group{opacity:.45!important}
.lego-seg-empty-hint{font-size:11.6px;color:var(--lego-dim);font-style:italic;pointer-events:none;padding:2px 4px}
.lego-subtab.dragging{opacity:.4}
.lego-tab.drop-into,.lego-subtab.drop-into{outline:2px dashed rgba(34,197,94,0.9);outline-offset:-2px;
  background:rgba(34,197,94,0.18)!important;border-radius:6px}
.lego-subtab.drop-before{box-shadow:inset 3px 0 0 var(--lego-accent,#3b82f6)}
.lego-subtab.drop-after{box-shadow:inset -3px 0 0 var(--lego-accent,#3b82f6)}
.lego-subtabs.drop-into,.lego-sec-h.drop-into{outline:2px dashed var(--lego-accent,#3b82f6);outline-offset:2px;border-radius:6px}
`;
