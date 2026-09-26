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
  -webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);
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
  border-radius: 6px;
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
  gap: 6px;
  padding: 10px 16px;
  background: #24242b;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
}
.lego-comfy-search-icon{
  font-size: 18px;
  color: var(--lego-dim);
  display: flex;
  align-items: center;
}
.lego-comfy-search-input{
  flex: 1;
  background: transparent;
  border: none;
  color: #ffffff;
  font-size: 14px;
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
  height: 20px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--lego-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
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
  gap: 5px;
  padding: 6px 14px;
  background: #19191e;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  overflow-x: auto;
}
.lego-comfy-pill{
  padding: 6px 14px;
  border-radius: 18px;
  font-size: 11px;
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
  gap: 5px;
  padding: 5px 12px;
  border-radius: 6px;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: #ffffff;
  font-size: 11px;
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
  gap: 5px;
  padding: 5px 8px;
  margin-bottom: 8px;
  border-radius: 6px;
  background: rgba(37, 99, 235, 0.16);
  border: 1px solid rgba(59, 130, 246, 0.4);
  color: #93c5fd;
  font-size: 11px;
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
  padding: 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
}
.lego-comfy-cat-top-btn{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.09);
  font-size: 11px;
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
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #38bdf8;
  padding: 8px 8px 4px;
}
.lego-comfy-cat-item{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 7px;
  cursor: pointer;
  user-select: none;
  border: 1px solid transparent;
  transition: background .1s, color .1s, border-color .1s;
}
.lego-comfy-cat-label{
  flex: 1;
  min-width: 0;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.82);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lego-comfy-cat-badge{
  font-size: 9px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 7px;
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
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: #141418;
}
.lego-comfy-node-row{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
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
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
.lego-comfy-node-sub{
  font-size: 10px;
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
  font-size: 9px;
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
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 10px 8px;
  gap: 5px;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
}

/* O Nó Fiel do ComfyUI */
.lego-combo-btn{display:flex;align-items:center;gap:4px;justify-content:space-between;
  text-align:left;cursor:pointer;overflow:hidden;height:22px;min-height:22px;padding:2px 8px;font-size:11px;border-radius:4px;box-sizing:border-box}
.lego-combo-label{flex:1;min-width:2.5em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lego-combo-chevron{flex:none;display:inline-flex;opacity:.6}
.lego-combo-btn:hover{border-color:var(--lego-accent)}

.lego-list-pop{position:fixed;z-index:10000000;display:flex;flex-direction:column;gap:6px;
  padding:8px;background:#1c1c24;border:1px solid #4a4a5c;border-radius:9px;
  box-shadow:0 12px 34px rgba(0,0,0,0.65);max-height:min(60vh,420px)}
.lego-list-search{flex:none;background:rgba(0,0,0,0.4);color:#f2f2f6;border:1px solid #3f3f4e;
  border-radius:6px;padding:7px 10px;font:inherit;font-size:10px;outline:none}
.lego-list-search:focus{border-color:#3b82f6}
.lego-list-items{overflow-y:auto;display:flex;flex-direction:column;gap:1px;min-height:0}
/* flex:none — filho de flex encolhe por padrão, e com a lista rolando os
   itens ficavam espremidos uns sobre os outros. */
.lego-list-item{flex:none;display:flex;align-items:baseline;gap:0;padding:7px 10px;border-radius:5px;
  cursor:pointer;font-size:10px;line-height:1.35;color:#f2f2f6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lego-list-item:hover{background:#3b82f6;color:#fff}
.lego-list-item.sel{background:rgba(59,130,246,0.22);font-weight:600}
.lego-list-dir{align-items:center;gap:6px;color:var(--lego-dim,#94a3b8);font-weight:600}
.lego-list-dir:hover{background:rgba(255,255,255,0.08);color:var(--lego-text)}
.lego-list-caret{flex:none;width:10px;font-size:9px;opacity:.8}
.lego-list-count{margin-left:auto;flex:none;font-size:9px;opacity:.55;font-weight:500}
.lego-list-folder{opacity:.5;font-size:9.5px;flex:none}
.lego-list-leaf{flex:none}

.lego-glyph{display:block;flex:none;vertical-align:middle}
.lego-glyph-wrap{display:inline-flex;align-items:center;justify-content:center;flex:none}

.lego-real-node{display:block;margin:0 auto;border-radius:6px;image-rendering:auto}

.lego-faithful-node{
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  background: #242429;
  border: 1.5px solid #3c3c46;
  border-radius: 6px;
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
  padding: 6px 10px;
  background: #2e3038;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.lego-faithful-title-wrap{
  display: flex;
  align-items: center;
  gap: 6px;
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
  font-size: 11px;
  font-weight: 700;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}
.lego-faithful-id-badge{
  font-size: 9px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  flex-shrink: 0;
}

/* Corpo do Nó */
.lego-faithful-body{
  padding: 5px 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #242429;
}

/* Sockets de Entrada e Saída */
.lego-faithful-slot-row{
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 18px;
  font-size: 10px;
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
  gap: 6px;
  position: relative;
  transition: all .15s ease;
}
.lego-faithful-widget.selected{
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  box-shadow: 0 0 0 1.5px #38bdf8, 0 0 16px rgba(56, 189, 248, 0.45);
}
.lego-faithful-widget-name{
  font-size: 10px;
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
  font-size: 8px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: #0284c7;
  color: #ffffff;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.lego-faithful-widget-ctrl{
  font-size: 10px;
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
  padding: 6px 10px;
  background: rgba(20, 20, 24, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 10px;
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
  border-radius: 6px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.lego-raw-preview-ctrl{
  width: 100%;
  max-width: 320px;
}
.lego-raw-desc-text{
  font-size: 11px;
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
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow-y: auto;
  box-sizing: border-box;
}

/* ── Responsividade Inteligente do Seletor de Nós (Classes de Contêiner + Media Queries) ── */
.lego-comfy-dialog.dlg-compact .lego-comfy-sidebar,
@media (max-width: 1080px) {
  .lego-comfy-sidebar {
    flex: 0 0 190px !important;
    min-width: 160px !important;
    padding: 6px 6px !important;
  }
  .lego-comfy-details {
    flex: 0 0 270px !important;
    min-width: 220px !important;
    padding: 8px !important;
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
    font-size: 10px !important;
  }
  .lego-comfy-details {
    flex: 0 0 230px !important;
    min-width: 200px !important;
    padding: 6px !important;
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
  font-size: 14px;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.3;
}
.lego-comfy-det-category{
  font-size: 10px;
  color: #38bdf8;
  font-weight: 600;
}

.lego-comfy-det-btn{
  margin-top: auto;
  padding: 5px 8px;
  border-radius: 6px;
  background: var(--lego-accent);
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
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
  display:flex; flex-direction:column; gap:6px;
  padding:8px 10px; border-radius:7px;
  background:var(--lego-bg); color:var(--lego-text);
  font:11px/1.5 Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
  margin: -8px -10px 4px -10px;
  padding: 6px 10px;
  border-radius: 9px 9px 0 0;
  border-bottom: 1px solid var(--lego-line);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.lego-head{display:flex;align-items:center;gap:6px}
.lego-head.compact{justify-content:flex-end;gap:6px;margin-bottom:2px}
/* Cartão fundido ao nó: sem moldura própria, o título fica só na barra do nó. */
.lego-card.merged,.lego-card.merged.has-node-color{border:0;box-shadow:none;background:transparent;padding:4px 2px 2px}
/* Num grupo horizontal o rótulo nunca fica menor que o próprio texto: sem
   espaço, o conteúdo vaza e o grupo cresce (fitGroupToContent). */
.lego-segment-box.horizontal > .lego-segment-item.is-label{flex-shrink:0;min-width:max-content}

.lego-sec-h::after{order:1}

.lego-head-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.lego-title-row{display:flex;align-items:center;gap:5px;min-width:0}
.lego-title{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff}
.lego-title.editable{cursor:pointer;transition:color .15s ease}
.lego-title.editable:hover{color:var(--lego-accent,#38bdf8)}
.lego-title-edit-btn{flex:none;width:22px;height:18px;border-radius:5px;
  background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.4);
  color:#38bdf8;cursor:pointer;display:inline-flex;align-items:center;
  justify-content:center;padding:0;transition:all .15s ease}
.lego-title-edit-btn:hover{background:var(--lego-accent,#38bdf8);color:#fff;
  border-color:var(--lego-accent,#38bdf8);box-shadow:0 0 8px rgba(56,189,248,0.4)}

.lego-iconbtn{flex:none;width:28px;height:18px;border-radius:7px;cursor:pointer;
  display:grid;place-items:center;background:rgba(255,255,255,0.04);color:var(--lego-dim);
  border:1px solid var(--lego-line);font-size:11px;line-height:1;padding:0;transition:all .15s ease}
.lego-iconbtn:hover{color:var(--lego-text);background:rgba(255,255,255,0.08);border-color:var(--lego-accent)}
.lego-iconbtn.on{color:#fff;background:var(--lego-accent);border-color:var(--lego-accent)}

.lego-tabs{display:flex;gap:4px;border-bottom:2px solid var(--lego-line);overflow-x:auto;
  scrollbar-width:none;margin:2px 0 4px 0}
.lego-tabs::-webkit-scrollbar{display:none}
.lego-tab{flex:none;padding:8px 16px;cursor:pointer;color:var(--lego-dim);
  border-bottom:2.5px solid transparent;margin-bottom:-2px;white-space:nowrap;user-select:none;
  font-size:11px;font-weight:600;transition:all .15s ease}
.lego-tab:hover{color:var(--lego-text)}
.lego-tab.sel{color:#fff;border-bottom-color:var(--lego-accent);font-weight:700}
.lego-tab-add{flex:none;padding:5px 8px;cursor:pointer;color:var(--lego-dim);
  border-bottom:2.5px solid transparent;margin-bottom:-2px;font-size:12px;font-weight:700}
.lego-tab-add:hover{color:var(--lego-accent)}

/* ── Layout Geral de Cards no Subgrafo ── */
.lego-body{
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}

.lego-cols-row{
  display: flex;
  align-items: stretch;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
}

.lego-col{
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  box-sizing: border-box;
}

.lego-col > .lego-sec{
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box;
}

.lego-col > .lego-sec.lego-sec-stretch,
.lego-col > .lego-sec:only-child{
  flex: 1 1 auto;
  min-height: 100%;
}

.lego-col > .lego-sec.lego-sec-stretch > .lego-sec-controls,
.lego-col > .lego-sec:only-child > .lego-sec-controls{
  flex: 1 1 auto;
}

.lego-sec{
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 5px;
  border-radius: 7px;
  padding: 8px;
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
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  background: transparent;
  border-radius: 6px;
  min-height: 50px;
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: thin;
  scrollbar-color: var(--lego-line) transparent;
  transition: min-height .15s ease, height .15s ease;
}
.lego-sec-controls::-webkit-scrollbar{
  height: 5px;
}
.lego-sec-controls::-webkit-scrollbar-thumb{
  background: var(--lego-line);
  border-radius: 3px;
}

/* In edit mode, subtle dashed border marks the canvas area */
.lego-sec-controls.in-edit{
  background: rgba(0, 0, 0, 0.15);
  border: 1.5px dashed rgba(255, 255, 255, 0.12);
  padding: 6px;
  min-height: 44px;
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
  font-size: 11px;
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
  font-size: 8px;
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
.lego-sec-resizer{position:absolute;top:0;right:-5px;bottom:8px;width:10px;cursor:col-resize;
  z-index:30;user-select:none;border-radius:4px;transition:background .15s}
.lego-sec-resizer::after{content:"";position:absolute;top:0;bottom:0;left:4px;width:2px;
  background:transparent;border-radius:1px;transition:background .15s, box-shadow .15s}
.lego-sec-resizer:hover::after, .lego-sec-resizer.active::after{background:var(--lego-accent);
  box-shadow:0 0 10px rgba(59,130,246,0.9), 0 0 2px #fff}
.lego-sec-resizer:hover, .lego-sec-resizer.active{background:rgba(59,130,246,0.15)}

.lego-sec-resizer-bottom{position:absolute;left:0;right:8px;bottom:-5px;height:10px;cursor:row-resize;
  z-index:30;user-select:none;border-radius:4px;transition:background .15s}
.lego-sec-resizer-bottom::after{content:"";position:absolute;left:0;right:0;top:4px;height:2px;
  background:transparent;border-radius:1px;transition:background .15s, box-shadow .15s}
.lego-sec-resizer-bottom:hover::after, .lego-sec-resizer-bottom.active::after{background:var(--lego-accent);
  box-shadow:0 0 10px rgba(59,130,246,0.9), 0 0 2px #fff}
.lego-sec-resizer-bottom:hover, .lego-sec-resizer-bottom.active{background:rgba(59,130,246,0.15)}

/* Divisor de Colunas Interativo (Aresta entre colunas) */
.lego-col-divider{
  position: relative;
  width: 12px;
  /* Ocupa exatamente o vão entre as colunas (gap de 12px): as zonas têm a
     mesma largura na edição e fora dela (antes a edição ficava 12px menor). */
  margin: 0 -12px;
  flex: 0 0 12px;
  cursor: col-resize;
  z-index: 35;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  touch-action: none;
}
.lego-col-divider::before{
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 5px;
  width: 2px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 1px;
  transition: background .15s, box-shadow .15s;
}
.lego-col-divider::after{
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 14px;
  height: 18px;
  border-radius: 4px;
  background: var(--lego-surface, #2d2e32);
  border: 1px solid var(--lego-line, rgba(255,255,255,0.15));
  opacity: 0;
  transition: opacity .15s, background .15s, border-color .15s;
  pointer-events: none;
  box-shadow: 0 2px 6px rgba(0,0,0,0.4);
}
.lego-col-divider:hover::before,
.lego-col-divider.active::before{
  background: #a855f7;
  box-shadow: 0 0 12px rgba(168, 85, 247, 0.9), 0 0 2px #fff;
}
.lego-col-divider:hover::after,
.lego-col-divider.active::after{
  opacity: 1;
  border-color: #a855f7;
  background: var(--lego-panel-hover, #313235);
  box-shadow: 0 0 10px rgba(168, 85, 247, 0.5), 0 2px 6px rgba(0,0,0,0.4);
}

/* ── Linhas de Nível e Overlay de Alinhamento em Tempo Real ── */
.lego-guide-overlay{
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1000;
  overflow: visible;
}
.lego-level-line-v{
  position: absolute;
  top: -6px;
  bottom: -6px;
  width: 2px;
  background: var(--lego-accent, #3b82f6);
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.8), 0 0 2px #fff;
  pointer-events: none;
  z-index: 1001;
}
.lego-level-line-v.snap{
  width: 2.5px;
  background: #38bdf8;
  box-shadow: 0 0 14px rgba(56, 189, 248, 0.95), 0 0 4px #fff;
}
.lego-level-line-v.col-divider{
  background: #a855f7;
  box-shadow: 0 0 10px rgba(168, 85, 247, 0.85), 0 0 2px #fff;
}
.lego-level-line-v.col-divider.snap{
  background: #c084fc;
  box-shadow: 0 0 14px rgba(192, 132, 252, 0.95), 0 0 4px #fff;
}
.lego-level-line-h{
  position: absolute;
  left: -6px;
  right: -6px;
  height: 2px;
  background: var(--lego-accent, #3b82f6);
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.8), 0 0 2px #fff;
  pointer-events: none;
  z-index: 1001;
}
.lego-level-line-h.snap{
  height: 2.5px;
  background: #38bdf8;
  box-shadow: 0 0 14px rgba(56, 189, 248, 0.95), 0 0 4px #fff;
}
.lego-guide-badge{
  position: absolute;
  transform: translate(-50%, -100%);
  margin-top: -10px;
  background: rgba(15, 23, 42, 0.94);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  color: #f8fafc;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
  pointer-events: none;
  border: 1px solid rgba(59, 130, 246, 0.55);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55), 0 0 8px rgba(59, 130, 246, 0.35);
  z-index: 1005;
  display: flex;
  align-items: center;
  gap: 6px;
}
.lego-guide-badge.snap{
  border-color: #38bdf8;
  background: rgba(12, 74, 110, 0.96);
  color: #e0f2fe;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.65), 0 0 12px rgba(56, 189, 248, 0.55);
}
.lego-guide-badge.col-divider{
  border-color: rgba(168, 85, 247, 0.65);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55), 0 0 10px rgba(168, 85, 247, 0.45);
}
.lego-guide-badge.col-divider.snap{
  border-color: #c084fc;
  background: rgba(88, 28, 135, 0.96);
  color: #f3e8ff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.65), 0 0 14px rgba(192, 132, 252, 0.55);
}

.lego-sec.resizing{
  outline: 2px solid var(--lego-accent, #3b82f6) !important;
  box-shadow: 0 0 16px rgba(59, 130, 246, 0.35) !important;
}

/* Alças de Redimensionamento de Componente (Largura ↔ e Altura ↕) */

/* Alça de Canto Elegante (Bordinha em Negrito) */
.lego-resizer-corner{position:absolute;right:2px;bottom:2px;width:12px;height:12px;cursor:nwse-resize;
  z-index:35;user-select:none;box-sizing:border-box;
  border-right:2.5px solid rgba(255,255,255,0.42);border-bottom:2.5px solid rgba(255,255,255,0.42);
  border-bottom-right-radius:5px;transition:border-color .15s, box-shadow .15s, transform .12s}
.lego-resizer-corner:hover, .lego-resizer-corner.active{border-color:var(--lego-accent);
  box-shadow:2px 2px 8px rgba(59,130,246,0.7);transform:scale(1.2)}

/* ── Botão / Chip de Largura ── */

/* Tooltip flutuante de Resize */

.lego-sec-h{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:var(--lego-dim)}
.lego-sec-h::after{content:"";flex:1;height:1px;background:var(--lego-line)}
.lego-sec-h .lego-iconbtn{width:22px;height:18px;font-size:10px;border-radius:5px}

/* ── Internal widgets container ── */
.lego-row.resizing, .lego-sec.resizing{transition:none !important;user-select:none !important}

/* Componente do formulário — a ÚNICA regra base. A posição vem inline do JS
   (absoluta, com snap à grade); o resto mora aqui. */
.lego-row{position:relative;display:flex;align-items:center;justify-content:space-between;gap:6px;
  padding:3px 8px;border-radius:4px;background:var(--lego-panel);min-height:24px;
  width:100%;min-width:0;box-sizing:border-box;user-select:none;
  border:1px solid var(--lego-line-strong);box-shadow:0 2px 8px rgba(0,0,0,0.35);
  transition:background .15s ease,border-color .15s ease}
.lego-card.editing .lego-row:hover{background:var(--lego-panel-hover);border-color:rgba(59,130,246,0.45)}
.lego-card:not(.editing) .lego-row.selected::before{display:none}
.lego-row .lego-lbl{flex:0 0 auto;width:auto;max-width:60%;min-width:0;color:var(--lego-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  font-size:11px;font-weight:500}
.lego-row .lego-in, .lego-row .lego-slider, .lego-row .lego-combo-btn{flex:1 1 0;min-width:0}
.lego-row .lego-sw{flex:none}
.lego-row.wide{flex-direction:column;align-items:stretch}
.lego-row.wide .lego-in{width:100%}
.lego-row.drag{opacity:.4}
.lego-row.over{outline:2px dashed var(--lego-accent)}

.lego-row.missing .lego-lbl{color:#ef4444;text-decoration:line-through}
.lego-missing-box{display:flex;align-items:center;gap:6px;min-width:0}
.lego-missing-txt{opacity:.55;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.lego-missing-btn{flex:none;padding:2px 8px;border-radius:5px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#e5e7eb;font:600 9px/14px system-ui,sans-serif;cursor:pointer}
.lego-missing-btn:hover{background:rgba(168,85,247,.3);border-color:rgba(168,85,247,.7)}
.lego-missing-btn.danger:hover{background:rgba(239,68,68,.3);border-color:rgba(239,68,68,.7)}
.lego-grip{cursor:grab;color:var(--lego-dim);padding:0 4px;user-select:none;font-size:11px}

.lego-in{width:100%;min-width:0;background:var(--lego-well,rgba(0,0,0,0.34));color:var(--lego-text);
  border:1px solid var(--lego-line);border-radius:4px;padding:2px 8px;height:22px;min-height:22px;box-sizing:border-box;font:inherit;font-size:11px;
  transition:border-color .15s,background .15s}
.lego-in:focus{outline:none;border-color:var(--lego-accent);background:rgba(0,0,0,0.35)}
.lego-in[disabled]{opacity:.45}
select.lego-in{cursor:pointer}
select.lego-in option{background:#1f1f26;color:#fff}
textarea.lego-in{height:auto;resize:vertical;min-height:50px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:10px;line-height:1.45;padding:4px 6px}

.lego-slider{display:flex;align-items:center;gap:5px;min-width:0;width:100%;box-sizing:border-box;height:22px}
.lego-track{position:relative;flex:1;height:4px;border-radius:99px;background:rgba(0,0,0,0.45);
  cursor:pointer;min-width:32px;box-sizing:border-box}
.lego-fill{position:absolute;inset:0 auto 0 0;border-radius:99px;background:var(--lego-accent)}
.lego-knob{position:absolute;top:50%;width:10px;height:10px;border-radius:50%;
  background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.6);transform:translate(-50%,-50%);pointer-events:none;transition:transform .08s}
.lego-track:hover .lego-knob{transform:translate(-50%,-50%) scale(1.15)}
.lego-num{flex:none;width:52px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;box-sizing:border-box;height:22px;line-height:20px;padding:2px 6px;font-size:10px}

/* ── Slider Empilhado / Responsivo quando estreito ou alto ── */
.lego-row.is-slider{box-sizing:border-box}
.lego-row.is-slider.slider-stacked{flex-direction:column !important;align-items:stretch !important;justify-content:center !important;gap:4px !important;padding:4px 8px !important}
.lego-row.is-slider.slider-stacked > .lego-row-top{display:flex !important;align-items:center !important;justify-content:space-between !important;width:100% !important;min-width:0 !important;gap:5px !important}
.lego-row.is-slider.slider-stacked > .lego-row-top > .lego-lbl{flex:1 !important;min-width:0 !important;white-space:nowrap !important;overflow:hidden !important;text-overflow:ellipsis !important;font-size:10px !important}
.lego-row.is-slider.slider-stacked > .lego-slider{width:100% !important;display:flex !important;align-items:center !important;gap:5px !important}
.lego-row.is-slider.slider-stacked > .lego-slider > .lego-track{width:100% !important;flex:1 !important}

.lego-sw{position:relative;flex:none;width:28px;height:16px;border-radius:99px;
  background:rgba(0,0,0,0.5);cursor:pointer;transition:background .15s ease;border:1px solid rgba(255,255,255,0.08);box-sizing:border-box}
.lego-sw::after{content:"";position:absolute;top:1.5px;left:2px;width:11px;height:11px;
  border-radius:50%;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.4);transition:transform .15s cubic-bezier(0.4,0,0.2,1)}
.lego-sw.on{background:var(--lego-on);border-color:rgba(34,197,94,0.4)}
.lego-sw.on::after{transform:translateX(12px)}

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
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
}

.lego-media-box{
  display: flex;
  gap: 5px;
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
  transition: border-color .15s ease, box-shadow .15s ease;
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
  border-radius: 6px;
  background: rgba(0,0,0,0.6);
  border: 1.5px solid var(--lego-line);
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color .15s ease, box-shadow .15s ease;
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
  min-height: 18px;
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
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 18px;
  height: 18px;
  box-sizing: border-box;
  transition: border-color .15s, background .15s;
}
/* Seletor de arquivo com setas, num elemento só (como o combo nativo) */
.lego-media-picker{
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: stretch;
  height: 18px;
  border: 1px solid var(--lego-line);
  border-radius: 6px;
  background: var(--lego-well,rgba(0,0,0,0.34));
  overflow: hidden;
  box-sizing: border-box;
}
.lego-media-picker:hover{ border-color: var(--lego-accent); }
.lego-media-picker .lego-media-select{
  border: 0;
  border-radius: 0;
  background: transparent;
  height: 100%;
  min-height: 0;
  padding: 0 4px;
}
.lego-media-picker .lego-combo-chevron{ display: none; }
.lego-media-picker .lego-media-select{ justify-content: center; }
.lego-media-picker .lego-combo-label{ flex: 1; text-align: center; }
.lego-media-arrow{
  flex: none;
  width: 16px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--lego-dim, #94a3b8);
  font-size: 8px;
  line-height: 1;
  cursor: pointer;
}
.lego-media-arrow:hover{ color: var(--lego-text); background: rgba(255,255,255,0.08); }
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
  height: 18px;
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

.lego-row.grp{grid-template-columns:28px 1fr auto}

/* Mosaico de mídia dentro de uma zona em grade: tudo empilhado, miniatura
   ocupando a folga vertical. Lado a lado só cabe em linha larga. */
.lego-row.grp.grp-media{flex-direction:column;align-items:stretch;gap:4px;padding:6px 8px}
.lego-row.grp.grp-media > .lego-lbl.grp-n{flex:none;text-align:left;font-size:8px;opacity:.55}
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
.lego-row.grp.grp-media .lego-media-picker{flex:1;min-width:0}

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
  padding: 5px 8px;
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
  height: 18px;
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
  gap: 5px;
  width: 100%;
  min-width: 0;
  flex: none;
}
.lego-audio-play-btn{
  flex: none;
  width: 28px;
  height: 18px;
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
  font-size: 9px;
  font-weight: 500;
  color: var(--lego-dim, rgba(255, 255, 255, 0.6));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  letter-spacing: -0.2px;
}

.lego-lbl.grp-n{text-align:center;font-variant-numeric:tabular-nums;font-weight:700;color:var(--lego-dim);font-size:10px}
.lego-grp{display:flex;align-items:center;gap:5px;min-width:0;width:100%}
.lego-cell{min-width:0}
.lego-cell.k-combo{flex:1;min-width:80px}
.lego-cell.k-toggle,.lego-cell.k-button{flex:none}
.lego-cell.k-slider{flex:1;min-width:90px}
.lego-cell.k-number{flex:none;width:120px}
.lego-cell.k-text{flex:1;min-width:70px}

.lego-empty{color:var(--lego-dim);font-size:10px;font-style:italic;padding:8px;text-align:center}
.lego-empty-cta{display:flex;flex-direction:column;align-items:center;gap:5px}
.lego-promote-cta{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:6px;border:1px solid rgba(168,85,247,.55);background:rgba(168,85,247,.16);color:#e9d5ff;font:600 12px/1 inherit;font-style:normal;cursor:pointer}
.lego-promote-cta:hover{background:rgba(168,85,247,.3)}
.lego-empty-hint{font-size:9px;opacity:.7}

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
  /* Sem folga vertical: editar não pode deixar o grupo mais alto que o modo normal. */
  padding: 0 4px;
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
  font-size: 7.5px;
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
  font-size: 7.5px;
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
  font-size: 11px;
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
  width: 100%;
  box-sizing: border-box;
  padding: 0 4px;
  font-size: 10px;
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
  gap: 5px;
  background: var(--lego-well, rgba(0, 0, 0, 0.35));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 4px 10px;
  overflow: hidden;
  user-select: none;
}
.lego-segment-box.vertical{
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  padding: 4px 8px;
  overflow-y: auto;
}
.lego-segment-box.vertical .lego-segment-item{
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 5px;
}
/* Empilhado: cada item na altura dele (não divide a sobra do grupo entre si);
   só os 2D (texto longo, mídia, painéis) com altura própria crescem. */
.lego-segment-box.vertical > .lego-segment-item:not(.has-custom-h){
  flex: none;
}
.lego-segment-box.vertical > .lego-segment-item.has-inline-label{
  justify-content: space-between;
  min-height: 24px;
}
.lego-segment-box.vertical > .lego-segment-item.has-inline-label > .lego-item-label{
  flex: 0 1 auto;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lego-segment-box.vertical > .lego-segment-item.has-inline-label > :not(.lego-item-label){
  flex: 1 1 0;
  min-width: 0;
  max-width: 60%;
}
.lego-segment-box.vertical > .lego-segment-item.has-inline-label.kind-toggle > :not(.lego-item-label){
  flex: none;
}
.lego-segment-box.vertical > .lego-segment-item.has-inline-label .lego-step-number{
  width: 100%;
}
.lego-segment-box.vertical > .lego-segment-item.has-inline-label .lego-step-input{
  flex: 1 1 0;
  width: auto;
  min-width: 0;
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
  font-size: 9px;
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
  min-height: 18px;
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
  font-size: 10px;
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
  border-radius: 4px;
  overflow: hidden;
  height: 22px;
  min-height: 22px;
  box-sizing: border-box;
}
.lego-step-btn{
  width: 20px;
  height: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 0;
  color: #cbd5e1;
  font-size: 11px;
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
  font-size: 10px;
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
.lego-palette{width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:5px;padding:6px 10px;background:rgba(20,20,30,0.92);border:1.5px solid var(--lego-accent);border-radius:7px;margin-bottom:10px;box-shadow:0 4px 18px rgba(0,0,0,0.45)}
.lego-palette-head{display:flex;align-items:center;justify-content:space-between;gap:5px;font-size:9px;
  font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--lego-accent)}
.lego-palette-hint{font-size:9px;color:var(--lego-dim);font-weight:400;text-transform:none}
.lego-palette-items{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.lego-pal-group{display:flex;align-items:center;gap:6px;padding:3px 7px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:9px}
.lego-pal-cat-tag{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#38bdf8;padding:0 3px;user-select:none;opacity:1}
.lego-pal-item{display:flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(255,255,255,0.06);
  border:1px solid var(--lego-line);border-radius:7px;cursor:grab;user-select:none;font-size:10px;font-weight:600;
  color:var(--lego-text);transition:all .15s ease}
.lego-pal-item:hover{background:rgba(59,130,246,0.22);border-color:var(--lego-accent);transform:translateY(-1px);color:#fff}
.lego-pal-item:active{cursor:grabbing}

/* ── Ações de Aba e Menu de Contexto ── */
.lego-tab-title{flex:1;white-space:nowrap}
.lego-tab-actions{display:inline-flex;align-items:center;gap:3px;margin-left:6px;opacity:0.5;transition:opacity .15s}
.lego-tab:hover .lego-tab-actions{opacity:1}
.lego-tab-btn{background:transparent;border:0;padding:2px 4px;border-radius:4px;cursor:pointer;
  font-size:9px;color:var(--lego-dim);line-height:1;transition:all .12s}
.lego-tab-btn:hover{color:#fff;background:rgba(255,255,255,0.12)}
.lego-tab-btn.del:hover{color:#ef4444;background:rgba(239,68,68,0.18)}

.lego-subtab-title{flex:1;white-space:nowrap}
.lego-subtab-actions{display:inline-flex;align-items:center;gap:3px;margin-left:6px;opacity:0.5;transition:opacity .15s}
.lego-subtab:hover .lego-subtab-actions{opacity:1}
.lego-subtab-btn{background:transparent;border:0;padding:2px 4px;border-radius:4px;cursor:pointer;
  font-size:8.5px;color:var(--lego-dim);line-height:1;transition:all .12s}
.lego-subtab-btn:hover{color:#fff;background:rgba(255,255,255,0.12)}
.lego-subtab-btn.del:hover{color:#ef4444;background:rgba(239,68,68,0.18)}

.lego-ctx-menu{position:fixed;background:#1a1a24;border:1px solid var(--lego-line);border-radius:6px;
  padding:5px;box-shadow:0 8px 25px rgba(0,0,0,0.7);z-index:9999999;display:flex;flex-direction:column;gap:2px;min-width:145px}
.lego-ctx-item{display:flex;align-items:center;gap:5px;padding:7px 12px;border-radius:5px;
  cursor:pointer;font-size:10px;color:var(--lego-text);border:0;background:transparent;text-align:left;transition:all .12s}
.lego-ctx-item:hover{background:var(--lego-accent);color:#fff}
.lego-ctx-item.danger:hover{background:#ef4444;color:#fff}
.lego-ctx-label{flex:1}
.lego-align-bar{display:inline-flex;align-items:center;gap:2px;padding:2px 4px;border-radius:7px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.3);letter-spacing:0;order:0}
.lego-align-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:18px;padding:0;border:0;border-radius:5px;background:transparent;color:#7dd3fc;cursor:pointer}
.lego-align-btn:hover:not(:disabled){background:rgba(56,189,248,.22);color:#fff}
.lego-align-btn:disabled{opacity:.3;cursor:default}
.lego-align-sep{width:1px;height:14px;margin:0 3px;background:rgba(56,189,248,.3)}
.lego-color-grid{display:grid;grid-template-columns:repeat(5,24px);gap:6px;padding:4px}
.lego-color-swatch{width:24px;height:20px;border-radius:6px;border:2px solid rgba(255,255,255,.12);cursor:pointer;padding:0}
.lego-color-swatch.on{border-color:#fff}
.lego-color-swatch.none,.lego-color-dot.none{background:repeating-linear-gradient(45deg,rgba(255,255,255,.18) 0 3px,transparent 3px 6px)}
.lego-color-dot{display:block;width:11px;height:11px;border-radius:50%;border:1px solid rgba(255,255,255,.35)}
.lego-sec.tinted{border-color:color-mix(in srgb,var(--lego-zone-c) 55%,transparent);background:color-mix(in srgb,var(--lego-zone-c) 14%,var(--lego-panel,transparent))}
.lego-sec.tinted > .lego-sec-h{color:var(--lego-zone-c)}
.lego-row.tinted,.lego-segment-item.tinted{background-image:linear-gradient(90deg,color-mix(in srgb,var(--lego-c) 55%,transparent),transparent 85%)}
.lego-row.tinted-solid,.lego-segment-item.tinted-solid{background:var(--lego-c)}
.lego-seed-mode{flex:none;min-width:30px;height:20px;margin-left:4px;padding:0 6px;border-radius:6px;border:1px solid var(--lego-line);background:rgba(255,255,255,.05);color:var(--lego-dim);font:700 8px/18px system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.lego-seed-mode:hover{border-color:var(--lego-accent);color:var(--lego-text)}
.lego-seed-mode[data-mode="randomize"],.lego-seed-mode[data-mode="increment"],.lego-seed-mode[data-mode="decrement"]{color:#c4b5fd;border-color:rgba(168,85,247,.5)}
.lego-run{display:flex;flex-direction:column;gap:5px;margin:0 0 10px}
.lego-run-label{font-size:9px;color:var(--lego-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lego-run-track{height:4px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden}
.lego-run-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#a855f7,#22c55e);transition:width .25s}
.lego-run-error{display:flex;align-items:flex-start;gap:0;padding:7px 10px;border-radius:6px;background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.5);color:#fecaca;font-size:9.5px;line-height:1.35;max-height:64px;overflow:hidden}
.lego-run-error b{white-space:nowrap}
.lego-run-error span{flex:1;min-width:0;word-break:break-word}
.lego-run-close{flex:none;border:0;background:none;color:inherit;opacity:.7;cursor:pointer;padding:0 0 0 6px}
.lego-ctx-hint{margin-left:18px;font-size:8.5px;opacity:.5}
.lego-ctx-sep{height:1px;margin:3px 6px;background:var(--lego-line)}

/* ── Sub-Abas Internas de Zona (Estilo Idêntico às Abas Principais) ── */
.lego-subtabs{display:flex;gap:4px;border-bottom:2px solid var(--lego-line);overflow-x:auto;
  scrollbar-width:none;margin:2px 0 8px 0;background:transparent;padding:0}
.lego-subtabs::-webkit-scrollbar{display:none}
.lego-subtab{flex:none;padding:7px 16px;cursor:pointer;color:var(--lego-dim);
  border-bottom:2.5px solid transparent;margin-bottom:-2px;white-space:nowrap;user-select:none;
  font-size:10px;font-weight:600;transition:all .15s ease;background:transparent;border-radius:0}
.lego-subtab:hover{color:var(--lego-text)}
.lego-subtab.sel{color:#fff;border-bottom-color:var(--lego-accent);font-weight:700;background:transparent}
.lego-subtab-add{flex:none;padding:7px 12px;cursor:pointer;color:var(--lego-dim);
  border-bottom:2.5px solid transparent;margin-bottom:-2px;font-size:12px;font-weight:700;transition:all .15s;background:transparent}
.lego-subtab-add:hover{color:var(--lego-accent)}

/* ── Section Actions ── */
.lego-sec-actions{display:flex;align-items:center;gap:4px}
/* ── Botão + Adicionar Componente no Card ── */

.lego-zone-add{width:100%;flex:1 1 100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:5px;padding:5px 8px;
  border:2px dashed var(--lego-line);border-radius:9px;background:rgba(255,255,255,0.02);
  color:var(--lego-dim);font-size:11px;font-weight:700;letter-spacing:.04em;cursor:pointer;transition:all .15s;margin-top:8px}
.lego-zone-add:hover{border-color:var(--lego-accent);color:#fff;background:rgba(59,130,246,0.12);transform:scale(1.005)}
.lego-zone-dropzone{padding:6px;border:1.5px dashed rgba(255,255,255,0.1);border-radius:6px;display:flex;align-items:center;
  justify-content:center;gap:5px;font-size:10px;color:var(--lego-dim);font-style:italic}

/* ── Botões e Inspector Modal ── */
.lego-btn{padding:7px 16px;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;
  border:1px solid var(--lego-line);background:rgba(255,255,255,0.06);color:var(--lego-text);transition:all .15s}
.lego-btn:hover{background:rgba(255,255,255,0.12);color:#fff}
.lego-btn-primary{background:var(--lego-accent);border-color:var(--lego-accent);color:#fff}
.lego-btn-primary:hover{background:#2563eb}

.lego-row.is-btn-row{
  padding:0 !important;
  background:transparent !important;
  border-color:transparent !important;
  box-shadow:none !important;
}
.lego-btn-ctrl{
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  text-align:center !important;
  cursor:pointer !important;
  user-select:none !important;
  height:100% !important;
  min-height:22px !important;
  width:100% !important;
  font-size:11px !important;
  font-weight:600 !important;
  border-radius:4px !important;
  box-sizing:border-box !important;
  padding:2px 8px !important;
  background:rgba(255,255,255,0.08) !important;
  border:1px solid var(--lego-line, rgba(255,255,255,0.15)) !important;
  color:var(--lego-text, #cbd5e1) !important;
  outline:none !important;
  transition:transform .08s cubic-bezier(0.2, 0.9, 0.3, 1), background .12s ease, border-color .12s ease, box-shadow .12s ease, filter .08s ease !important;
}
.lego-btn-ctrl:hover{
  background:rgba(255,255,255,0.14) !important;
  border-color:var(--lego-accent, #3b82f6) !important;
  color:#ffffff !important;
}
.lego-btn-ctrl:active, .lego-btn-ctrl.lego-btn-clicked{
  transform:scale(0.96) translateY(1.5px) !important;
  background:var(--lego-accent, #3b82f6) !important;
  border-color:#60a5fa !important;
  color:#ffffff !important;
  box-shadow:0 0 12px rgba(59,130,246,0.65), inset 0 2px 4px rgba(0,0,0,0.5) !important;
  filter:brightness(1.15) !important;
}

/* ── Visual Workflow Explorer (HUD & Picker) ── */

.lego-picker-hud{
  position:fixed;top:18px;left:50%;transform:translateX(-50%);
  background:rgba(18,18,24,0.96);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);
  border:1.5px solid var(--lego-accent);border-radius:6px;
  padding:6px 14px;box-shadow:0 12px 36px rgba(0,0,0,0.8), 0 0 20px rgba(59,130,246,0.35);
  z-index:99999999;display:flex;align-items:center;gap:6px;color:#fff;font-family:inherit;
  animation:legoSlideDown .2s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes legoSlideDown{from{top:-40px;opacity:0}to{top:18px;opacity:1}}

.lego-pulse-icon{display:inline-block;animation:legoPulse 1.4s infinite ease-in-out}
@keyframes legoPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.22)}}

.lego-picker-cancel-btn{
  background:rgba(239,68,68,0.18);border:1px solid rgba(239,68,68,0.4);color:#fca5a5;
  padding:6px 14px;border-radius:7px;font-size:10px;font-weight:600;cursor:pointer;transition:all .15s;
}
.lego-picker-cancel-btn:hover{background:#ef4444;color:#fff;border-color:#ef4444}

.lego-node-picker-popup{
  position:fixed;background:#161620;border:1.5px solid var(--lego-accent);
  border-radius:6px;padding:6px;box-shadow:0 16px 48px rgba(0,0,0,0.9);
  z-index:100000000;min-width:320px;max-width:440px;display:flex;flex-direction:column;
  gap:6px;font-family:inherit;color:#fff;animation:legoPopIn .15s ease-out;
}
@keyframes legoPopIn{from{transform:scale(0.92);opacity:0}to{transform:scale(1);opacity:1}}

.lego-node-picker-header{display:flex;align-items:center;justify-content:space-between;gap:6px;border-bottom:1px solid var(--lego-line);padding-bottom:8px}

.lego-node-picker-sub{font-size:9px;color:var(--lego-dim)}

.lego-node-widget-btn{
  display:flex;align-items:center;justify-content:space-between;gap:6px;
  width:100%;box-sizing:border-box;padding:5px 8px;border-radius:6px;
  background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);
  color:#fff;cursor:pointer;font-family:inherit;font-size:10px;transition:all .15s ease;text-align:left;
}
.lego-node-widget-btn:hover{
  background:rgba(59,130,246,0.22);border-color:var(--lego-accent);
  transform:translateX(3px);box-shadow:0 2px 8px rgba(59,130,246,0.3);
}

.lego-ins-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.72);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);
  z-index:999999;display:grid;place-items:center;padding:20px}
.lego-inspector{width:100%;max-width:540px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;
  background:#181822;border:1.5px solid var(--lego-accent);border-radius:6px;box-shadow:0 12px 40px rgba(0,0,0,0.8)}
.lego-ins-header{display:flex;align-items:center;justify-content:space-between;padding:5px 8px;
  border-bottom:1px solid var(--lego-line);background:rgba(0,0,0,0.25)}
.lego-ins-title{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#fff}
.lego-ins-body{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:6px}
.lego-ins-field{display:flex;flex-direction:column;gap:6px}
.lego-ins-field label{font-size:9.5px;font-weight:700;color:var(--lego-dim);text-transform:uppercase;letter-spacing:.04em}

.lego-ins-footer{display:flex;justify-content:flex-end;gap:6px;padding:5px 8px;
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
  border: 1.5px dashed rgba(59,130,246,0.55); border-radius: 6px;
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

/* ── Inspetor de Objetos: janela flutuante, fora do no ── */
.lego-oi {
  position: fixed; z-index: 9999999; width: 324px; max-height: 76vh;
  display: flex; flex-direction: column;
  background: #1b1b22; color: #e8e8ef;
  border: 1px solid rgba(255,255,255,0.16); border-radius: 7px;
  box-shadow: 0 22px 58px rgba(0,0,0,0.72);
  font-size: 10px; overflow: hidden;
}
.lego-oi-bar {
  flex: none; display: flex; align-items: center; justify-content: space-between;
  gap: 5px; padding: 7px 8px 7px 12px; cursor: move; user-select: none;
  background: #24242d; border-bottom: 1px solid rgba(255,255,255,0.1);
}
.lego-oi-bar-t { font-size: 9px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; opacity: .82; }
.lego-oi-picker { flex: none; padding: 5px 8px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.lego-oi-pick {
  width: 100%; justify-content: space-between;
  background: rgba(0,0,0,0.34); color: #e8e8ef;
  border: 1px solid rgba(255,255,255,0.14); border-radius: 6px;
  padding: 6px 8px; font-size: 10px; cursor: pointer; text-align: left;
}
.lego-oi-pick:hover { border-color: #3b82f6; }
.lego-oi-pick span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lego-oi-style-btn{padding:4px 8px;border-radius:5px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.34);color:var(--lego-dim);font-size:12px;font-weight:600;cursor:pointer;transition:all .12s;font-family:inherit;line-height:1}
.lego-oi-style-btn:hover{border-color:#3b82f6;color:var(--lego-text)}
.lego-oi-style-btn.on{background:var(--lego-accent);color:#fff;border-color:var(--lego-accent)}
.lego-oi-sec {
  flex: none; padding: 7px 12px 5px; font-size: 8px; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,0.46);
  background: rgba(255,255,255,0.03);
}
.lego-oi-grid { flex: none; overflow-y: auto; }
.lego-oi-row {
  display: grid; grid-template-columns: 96px 1fr; align-items: center;
  gap: 5px; padding: 3px 12px; min-height: 18px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.lego-oi-key { color: rgba(255,255,255,0.58); font-size: 9.5px; }
.lego-oi-val { min-width: 0; }
.lego-oi-in {
  width: 100%; box-sizing: border-box;
  background: rgba(0,0,0,0.34); color: #e8e8ef;
  border: 1px solid rgba(255,255,255,0.12); border-radius: 5px;
  padding: 4px 7px; font-size: 10px; font-family: inherit; outline: none;
}
.lego-oi-in:focus { border-color: #3b82f6; background: rgba(0,0,0,0.5); }
.lego-oi-fn {
  width: 100%; justify-content: flex-start;
  background: rgba(245,158,11,0.12); color: #fbbf24;
  border: 1px dashed rgba(245,158,11,0.5); border-radius: 5px;
  padding: 5px 8px; font-size: 9.5px; cursor: pointer; text-align: left;
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
  flex: none; display: flex; gap: 5px; padding: 9px 12px;
  border-top: 1px solid rgba(255,255,255,0.09); background: rgba(0,0,0,0.2);
}
.lego-oi-foot .lego-btn { flex: 1; justify-content: center; font-size: 9.5px; }
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
  width: 28px; height: 16px; border-radius: 99px;
  background: rgba(0,0,0,0.42); border: 1px solid rgba(255,255,255,0.18); position: relative;
  box-sizing: border-box;
}
.lego-ghost-sw::after {
  content: ""; position: absolute; top: 1.5px; left: 2px; width: 11px; height: 11px;
  border-radius: 50%; background: rgba(255,255,255,0.45);
}
.lego-ghost-track {
  flex: 1; height: 4px; border-radius: 99px; background: rgba(0,0,0,0.42); position: relative;
}
.lego-ghost-knob {
  position: absolute; left: 30%; top: 50%; transform: translate(-50%,-50%);
  width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.5);
}
.lego-ghost-field {
  flex: 1; min-width: 0; display: flex; align-items: center; justify-content: space-between;
  gap: 4px; height: 22px; padding: 0 8px;
  background: rgba(0,0,0,0.34);
  border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; box-sizing: border-box;
}
.lego-ghost-field.tall { height: 100%; align-items: flex-start; padding-top: 6px; }

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
  font-size: 10px;
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
  border-radius:6px;background:rgba(0,0,0,0.55);border:1.5px solid var(--lego-line);overflow:hidden;
  box-shadow:inset 0 2px 10px rgba(0,0,0,0.6)}
.lego-out-stage img,.lego-out-stage video{width:100%;height:100%;object-fit:contain;display:block}
.lego-out-stage img{cursor:zoom-in}
.lego-sec-controls.in-edit .lego-out-stage img{cursor:inherit}
.lego-out-box.is-audio .lego-out-stage{flex-direction:column;gap:6px;padding:8px;box-sizing:border-box}
.lego-out-stage audio{width:100%;height:20px}
.lego-out-audio-name{font-size:9px;color:var(--lego-dim);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lego-out-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
  padding:8px;text-align:center;font-size:9px;color:var(--lego-dim);opacity:.75}
.lego-out-bar{display:flex;align-items:center;justify-content:center;gap:5px;flex:none}
.lego-out-nav{display:inline-flex;align-items:center;justify-content:center;background:var(--lego-surface,#222);
  color:inherit;border:1px solid var(--lego-line);border-radius:5px;width:24px;height:20px;line-height:1;
  font-size:13px;cursor:pointer;padding:0 0 2px}
.lego-out-nav:hover{background:var(--lego-surface-hover,#2a2a2a)}
.lego-out-count{font-size:9px;color:var(--lego-dim);min-width:40px;text-align:center;font-variant-numeric:tabular-nums}
.lego-out-caption{font-size:9.5px;font-weight:600;color:var(--lego-dim);flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lego-segment-item.kind-outimage,.lego-segment-item.kind-outvideo,.lego-segment-item.kind-outaudio{flex-direction:column;align-items:stretch}

/* Media Censor / Hide Preview */
.lego-media-thumb.is-censored > img,
.lego-media-thumb.is-censored > video,
.lego-out-stage.is-censored > img,
.lego-out-stage.is-censored > video {
  filter: blur(28px) grayscale(40%);
  transform: scale(1.12);
  pointer-events: none;
}
.lego-media-thumb.is-censored,
.lego-out-stage.is-censored {
  overflow: hidden !important;
}
.lego-media-censor-overlay,
.lego-out-censor-overlay {
  display: none;
  position: absolute;
  inset: 0;
  background: rgba(18, 18, 24, 0.65);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.85);
  z-index: 5;
  pointer-events: none;
  user-select: none;
}
.lego-media-thumb.is-censored .lego-media-censor-overlay,
.lego-out-stage.is-censored .lego-out-censor-overlay {
  display: flex;
}
.lego-censor-icon {
  opacity: 0.85;
}
.lego-censor-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  opacity: 0.9;
  text-transform: uppercase;
}
.lego-media-hide-btn,
.lego-out-hide-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  z-index: 8;
  transition: all 0.15s ease;
}
.lego-media-hide-btn:hover,
.lego-out-hide-btn:hover {
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.35);
}
.lego-oi-toggle {
  width: 34px;
  height: 18px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.15);
  position: relative;
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
  display: inline-flex;
  align-items: center;
}
.lego-oi-toggle.on {
  background: var(--lego-accent, #3b82f6);
  border-color: var(--lego-accent, #3b82f6);
}
.lego-oi-toggle-knob {
  position: absolute;
  left: 2px;
  top: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s ease;
}
.lego-oi-toggle.on .lego-oi-toggle-knob {
  transform: translateX(16px);
}
.lego-row.is-preview-override {
  flex-direction: column !important;
  align-items: stretch !important;
  min-height: 120px;
  height: 100%;
}
.lego-row.is-preview-override .lego-preview-override-box {
  flex: 1 1 0;
  width: 100%;
  height: 100%;
  min-height: 120px;
}
/* Elemento DOM vivo do nó montado no cartão (editores, listas de LoRA, previews) */
.lego-panel-box { width: 100%; height: 100%; min-height: 120px; display: flex; flex-direction: column;
  position: relative; overflow: hidden; border-radius: 6px; box-sizing: border-box; }
.lego-panel-box > * { flex: 1 1 auto; min-width: 0; }
.lego-sec-controls.in-edit .lego-panel-box > :not(.lego-out-hide-btn):not(.lego-media-censor-overlay) { pointer-events: none; }
/* Seletor de cor */
.lego-color-ctrl { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; }
.lego-color-pick { flex: none; width: 28px; height: 22px; padding: 0; border: 1px solid var(--lego-line);
  border-radius: 5px; background: none; cursor: pointer; }
.lego-color-ctrl .lego-in { flex: 1; min-width: 0; }
/* Espelho de interface desenhada no canvas (botões do Allma, painel do Resolution Master) */
.lego-canvas-mirror { position: relative; width: 100%; box-sizing: border-box; }
.lego-canvas-mirror canvas { display: block; width: 100%; touch-action: none; cursor: default; }
.lego-canvas-mirror.is-widget { min-height: 20px; }
.lego-canvas-mirror.is-node { height: 100%; min-height: 120px; overflow: hidden; border-radius: 6px; }
.lego-canvas-mirror.is-node canvas { position: absolute; top: 0; left: 0; }
.lego-sec-controls.in-edit .lego-canvas-mirror canvas { pointer-events: none; }
.lego-preview-override-box {
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid var(--lego-line);
  position: relative;
  overflow: hidden;
  border-radius: 6px;
  box-sizing: border-box;
}
.lego-preview-override-box.is-censored {
  overflow: hidden !important;
}
.lego-preview-override-box.is-censored .kj-pov-image-area,
.lego-preview-override-box.is-censored canvas,
.lego-preview-override-box.is-censored img,
.lego-preview-override-box.is-censored video {
  filter: blur(28px) grayscale(40%);
  transform: scale(1.12);
  pointer-events: none;
}
.lego-preview-override-box.is-censored .lego-media-censor-overlay {
  display: flex;
}
`;

/* Arraste entre grupos, zonas e sub-abas: feedback de entrada e saída */
export const CSS_DRAG = `
.lego-pick-overlay{position:fixed;inset:0;pointer-events:none;z-index:9990}
.lego-ss-boundary{position:fixed;inset:0;pointer-events:none;z-index:40}
.lego-ss-io{position:fixed;transform:translateY(-50%);padding:1px 6px;border-radius:9px;background:#a855f7;color:#fff;font:700 8px/12px system-ui,sans-serif;white-space:nowrap;box-shadow:0 1px 6px rgba(0,0,0,.45);pointer-events:auto;cursor:help}
.lego-ss-io.in{transform:translate(calc(-100% - 8px),-50%)}
.lego-ss-io.out{transform:translate(8px,-50%)}
.lego-pick-box{position:fixed;box-sizing:border-box;border-radius:6px;pointer-events:none}
.lego-pick-box.whole{border:2.5px solid #a855f7;box-shadow:0 0 0 3px rgba(168,85,247,0.25),0 0 18px rgba(168,85,247,0.55)}
.lego-pick-box.widget{border:2px solid #22c55e;border-radius:6px;background:rgba(34,197,94,0.12);box-shadow:0 0 10px rgba(34,197,94,0.45)}
.lego-picker-promote-btn{display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:6px;border:none;cursor:pointer;
  background:#a855f7;color:#fff;font:700 10px system-ui,sans-serif}
.lego-picker-promote-btn:disabled{opacity:.45;cursor:default}
.lego-picker-promote-btn:not(:disabled):hover{background:#9333ea}
.lego-ss-enter{margin-left:auto;margin-right:6px}
.lego-ss-nav{position:fixed;top:50px;left:220px;z-index:1000;display:flex;align-items:center;gap:5px;height:20px;box-sizing:border-box;
  padding:0 10px 0 6px;border-radius:6px;background:rgba(24,24,28,0.94);border:1px solid rgba(168,85,247,0.55);
  box-shadow:0 8px 24px rgba(0,0,0,0.45);color:#e5e7eb;font:500 10px system-ui,sans-serif;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.lego-ss-nav-badge{padding:2px 5px;border-radius:4px;background:#a855f7;color:#fff;font:800 8px/1.2 system-ui,sans-serif}
.lego-ss-nav-back{display:flex;align-items:center;gap:4px;padding:3px 9px 3px 5px;border-radius:7px;border:1px solid rgba(255,255,255,0.14);
  background:rgba(255,255,255,0.06);color:inherit;font:600 10px system-ui,sans-serif;cursor:pointer}
.lego-ss-nav-back:hover{background:rgba(168,85,247,0.28);border-color:rgba(168,85,247,0.7)}
.lego-ss-nav-kbd{margin-left:4px;padding:0 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);font:600 7.5px/12px monospace;opacity:.7}
.lego-ss-nav-crumbs{display:flex;align-items:center;gap:6px;min-width:0}
.lego-ss-nav-crumb{background:none;border:none;color:#a1a1aa;font:500 10px system-ui,sans-serif;cursor:pointer;padding:2px 3px;border-radius:4px;
  white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
button.lego-ss-nav-crumb:hover{color:#fff;background:rgba(255,255,255,0.08)}
.lego-ss-nav-crumb.current{color:#fff;font-weight:700;cursor:default}
.lego-ss-nav-sep{color:#71717a}
.lego-ss-icon{position:relative;display:inline-block;width:13px;height:13px;flex:none}
.lego-ss-icon::before{content:"";position:absolute;inset:0;background-color:currentColor;
  -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m15 15 6 6m-6-6v4.8m0-4.8h4.8'/%3E%3Cpath d='M9 19.8V15m0 0H4.2M9 15l-6 6'/%3E%3Cpath d='M15 4.2V9m0 0h4.8M15 9l6-6'/%3E%3Cpath d='M9 4.2V9m0 0H4.2M9 9 3 3'/%3E%3C/svg%3E") center/contain no-repeat;
  mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m15 15 6 6m-6-6v4.8m0-4.8h4.8'/%3E%3Cpath d='M9 19.8V15m0 0H4.2M9 15l-6 6'/%3E%3Cpath d='M15 4.2V9m0 0h4.8M15 9l6-6'/%3E%3Cpath d='M9 4.2V9m0 0H4.2M9 9 3 3'/%3E%3C/svg%3E") center/contain no-repeat}
.lego-ss-icon::after{content:"SS";position:absolute;right:-6px;bottom:-5px;padding:1px 2px;border-radius:3px;
  background:#a855f7;color:#fff;font:800 6px/1 system-ui,sans-serif;letter-spacing:-.02em;
  box-shadow:0 0 0 1.5px var(--comfy-menu-bg,#1e1e1e)}
.lego-whole-node{display:flex;flex-direction:column;gap:6px;margin:8px 0 4px;padding:8px;border-radius:6px;
  background:rgba(59,130,246,0.10);border:1px solid rgba(59,130,246,0.35)}
.lego-whole-node-title{font-size:10px;font-weight:700;color:#e5e7eb}
.lego-whole-node-opts{display:flex;gap:6px}
.lego-whole-node-opts.in-details{margin-top:8px}
.lego-whole-node-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 10px;
  border-radius:6px;border:1px solid rgba(59,130,246,0.5);background:rgba(59,130,246,0.18);color:#e5e7eb;
  font-size:10px;font-weight:600;cursor:pointer}
.lego-whole-node-btn:hover{background:rgba(59,130,246,0.32)}
.lego-whole-node-or{font-size:9.5px;color:var(--lego-dim,#a0a0a0);font-weight:600;margin:6px 0 2px}
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
.lego-seg-empty-hint{font-size:9px;color:var(--lego-dim);font-style:italic;pointer-events:none;padding:2px 4px}
.lego-subtab.dragging{opacity:.4}
.lego-tab.drop-into,.lego-subtab.drop-into{outline:2px dashed rgba(34,197,94,0.9);outline-offset:-2px;
  background:rgba(34,197,94,0.18)!important;border-radius:6px}
.lego-subtab.drop-before{box-shadow:inset 3px 0 0 var(--lego-accent,#3b82f6)}
.lego-subtab.drop-after{box-shadow:inset -3px 0 0 var(--lego-accent,#3b82f6)}
.lego-subtabs.drop-into,.lego-sec-h.drop-into{outline:2px dashed var(--lego-accent,#3b82f6);outline-offset:2px;border-radius:6px}
`;

export const CSS_CAPTION_ALIGN = `
/* Caption Align (Inspetor): centro/direita. À esquerda do controle, o caption
   ocupa a coluna dele e o texto se alinha dentro dela. */
.lego-row.lbl-align-center .lego-lbl{text-align:center}
.lego-row.lbl-align-right .lego-lbl{text-align:right}
.lego-row.lbl-align-center > .lego-lbl,
.lego-row.lbl-align-right > .lego-lbl{flex:1 1 0;min-width:0}
.lego-row.lbl-align-center > .lego-row-top{justify-content:center}
.lego-row.lbl-align-right > .lego-row-top{justify-content:flex-end}
.lego-segment-item.lbl-align-center .lego-item-label{text-align:center;flex:1 1 0;min-width:0}
.lego-segment-item.lbl-align-right .lego-item-label{text-align:right;flex:1 1 0;min-width:0}
.lego-segment-box.vertical > .lego-segment-item.has-inline-label.lbl-align-center > .lego-item-label,
.lego-segment-box.vertical > .lego-segment-item.has-inline-label.lbl-align-right > .lego-item-label{flex:1 1 0}
.lego-segment-item.lbl-align-center > .lego-item-top{justify-content:center}
.lego-segment-item.lbl-align-right > .lego-item-top{justify-content:flex-end}
`;
