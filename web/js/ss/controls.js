/* Controles do cartão: glifos, toggle, slider, stepper, dropdown, texto, botão, mídia e modo da seed. */
// Parte do ComfyUI-SuperSubgraph (ver web/js/super_subgraph.js e CLAUDE.md).
// Só declarações: nada roda ao carregar este arquivo.

import { app } from "../../../../scripts/app.js";
import { api } from "../../../../scripts/api.js";
import { LOG } from "./constants.js";
import { showLegoToast } from "./core.js";
import { RE_AUDIO, RE_IMAGE, RE_VIDEO, fmtNum, isAudioCombo, isIntWidget, isVideoCombo, numDecimals, prettify, realStep, valuesOf, writeWidget } from "./widgets.js";
import { applyLabelStyle } from "./panels.js";

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
  left: '<path d="M14.2 6.5L8.6 12l5.6 5.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',
  right: '<path d="M9.8 6.5L15.4 12l-5.6 5.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',

  // Ações de criação de zona na coluna ou linha
  addBelow: '<path d="M12 4v8M8.5 8.5L12 12l3.5-3.5M5 16.5h14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',
  addBeside: '<path d="M4 12h8M8.5 8.5L12 12l-3.5 3.5M16.5 5v14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',

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
  // Três pontos: menu.
  more:
    '<circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/>',
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
  eye:
    '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.9"/>',
  eyeSlash:
    '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
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

/**
 * Ao entrar no campo (clique ou Tab) o valor inteiro fica selecionado: digitar
 * já substitui, sem apagar antes. O mouseup logo depois do foco desfaria a
 * seleção no Chrome/Safari, então ele é ignorado uma vez.
 */
function selectOnFocus(inp) {
  let justFocused = false;
  inp.addEventListener("focus", () => {
    justFocused = true;
    inp.select();
    setTimeout(() => { justFocused = false; }, 250);
  });
  inp.addEventListener("mouseup", (e) => {
    if (justFocused) { e.preventDefault(); justFocused = false; }
  });
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
      // Combo de duas opções: alterna para a OUTRA opção dele (valor sempre válido).
      const opts = valuesOf(w, node);
      if (opts.length === 2 && opts.includes(w.value)) {
        nextVal = opts[0] === w.value ? opts[1] : opts[0];
      } else {
        // Mantém a mesma família de palavra: enable↔disable, enabled↔disabled…
        const low = w.value.toLowerCase();
        const PAIRS = { true: "false", yes: "no", enable: "disable", enabled: "disabled", on: "off" };
        const flip = PAIRS[low] ?? Object.keys(PAIRS).find((k) => PAIRS[k] === low);
        nextVal = flip ?? !isValOn();
      }
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
  const isInt = isIntWidget(o, step, w);
  const dec = numDecimals(o, step, isInt);

  const wrap = el("div", "lego-slider");
  const track = el("div", "lego-track");
  const fill = el("div", "lego-fill");
  const knob = el("div", "lego-knob");
  track.append(fill, knob);
  const num = el("input", "lego-in lego-num");
  selectOnFocus(num);
  num.type = "text";
  wrap.append(track, num);

  wrap.track = track;
  wrap.num = num;

  const clamp = (v) => Math.min(max, Math.max(min, v));
  const snap = (v) => {
    const s = clamp(Math.round((v - min) / step) * step + min);
    return isInt ? Math.round(s) : Number(s.toFixed(dec));
  };
  // `force`: repinta o campo mesmo com o cursor nele (depois do Enter), para
  // o que foi digitado (".2") aparecer já normalizado ("0.2").
  const paint = (force = false) => {
    const v = clamp(Number(w.value) || 0);
    const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
    fill.style.width = `${pct}%`;
    knob.style.left = `${pct}%`;
    if (force === true || document.activeElement !== num) num.value = fmtNum(v, dec);
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
    paint(true);
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
  const isInt = isIntWidget(o, step, w);

  const wrap = el("div", "lego-slider");
  const num = el("input", "lego-in");
  selectOnFocus(num);
  num.type = "text";
  wrap.append(num);

  const dec = numDecimals(o, step, isInt);
  const paint = (force = false) => {
    if (force === true || document.activeElement !== num) num.value = typeof w.value === "number" ? fmtNum(w.value, dec) : String(w.value ?? "");
  };
  paint();

  num.addEventListener("pointerdown", eatPointer);
  num.addEventListener("keydown", (e) => e.stopPropagation());
  num.addEventListener("change", () => {
    let v = parseFloat(num.value);
    if (!Number.isFinite(v)) { paint(true); return; }
    if (Number.isFinite(o.min)) v = Math.max(o.min, v);
    if (Number.isFinite(o.max)) v = Math.min(o.max, v);
    writeWidget(node, w, isInt ? Math.round(v) : v);
    paint(true);
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
/** Pastas abertas nas listas (vale para a sessão toda, em todos os dropdowns). */
const DROPDOWN_OPEN = new Set();

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

  const entryOf = (v) => {
    const rawVal = (typeof v === "object" && v !== null && "value" in v) ? v.value : v;
    const displayLabel = (typeof v === "object" && v !== null) ? (v.content || v.text || v.label || v.value) : v;
    return { rawVal, text: String(displayLabel ?? "") };
  };
  const pickRow = (it, rawVal, idx) => {
    it.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePopup();
      onPick(rawVal, idx);
    });
  };

  // Sem filtro e com caminhos ("sdxl/loras/x.safetensors"): árvore de pastas,
  // como o seletor nativo. Pastas primeiro; a do valor atual já vem aberta.
  const SEP = /[\\/]/;
  const hasFolders = values.some((v) => SEP.test(entryOf(v).text));
  const renderTree = () => {
    const root = { dirs: new Map(), files: [] };
    values.forEach((v, vi) => {
      const { rawVal, text } = entryOf(v);
      const parts = text.split(SEP);
      let node = root, path = "";
      for (const p of parts.slice(0, -1)) {
        path += p + "/";
        if (!node.dirs.has(p)) node.dirs.set(p, { path, dirs: new Map(), files: [], count: 0 });
        node = node.dirs.get(p);
        node.count++;
      }
      node.files.push({ vi, rawVal, text, leaf: parts[parts.length - 1] });
    });
    const cur = String(current ?? "");
    const curParts = cur.split(SEP);
    for (let i = 1; i < curParts.length; i++) DROPDOWN_OPEN.add(curParts.slice(0, i).join("/") + "/");
    let selEl = null;
    const draw = (node, depth) => {
      for (const [name, d] of node.dirs) {
        const open = DROPDOWN_OPEN.has(d.path);
        const row = el("div", `lego-list-item lego-list-dir${open ? " open" : ""}`);
        row.style.paddingLeft = `${8 + depth * 14}px`;
        row.append(el("span", "lego-list-caret", open ? "\u25BE" : "\u25B8"), el("span", "lego-list-leaf", name), el("span", "lego-list-count", String(d.count)));
        row.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) DROPDOWN_OPEN.delete(d.path); else DROPDOWN_OPEN.add(d.path);
          const top = listEl.scrollTop;
          render();
          listEl.scrollTop = top;
        });
        listEl.append(row);
        if (open) draw(d, depth + 1);
      }
      for (const f of node.files) {
        const it = el("div", `lego-list-item${String(f.rawVal) === cur ? " sel" : ""}`);
        it.style.paddingLeft = `${8 + depth * 14 + (depth ? 12 : 0)}px`;
        it.append(el("span", "lego-list-leaf", f.leaf));
        it.title = f.text;
        pickRow(it, f.rawVal, f.vi);
        if (String(f.rawVal) === cur) selEl = it;
        listEl.append(it);
      }
    };
    draw(root, 0);
    return selEl;
  };

  let firstRender = true;
  const render = () => {
    const q = searchBox.value.toLowerCase();
    listEl.replaceChildren();
    if (!q && hasFolders) {
      const selEl = renderTree();
      if (firstRender && selEl) requestAnimationFrame(() => selEl.scrollIntoView({ block: "nearest" }));
      firstRender = false;
      return;
    }
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
      pickRow(it, rawVal, idx);
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
  // change e blur disparam juntos: grava uma vez, e só se o texto mudou.
  const commit = () => { if (inp.value !== String(w.value ?? "")) writeWidget(node, w, inp.value); };
  inp.addEventListener("change", commit);
  inp.addEventListener("blur", commit);
  state.watch(w, paint);
  return inp;
}

function mkButton(node, w, ctrl) {
  const text = ctrl?.text || ctrl?.label || prettify(w?.name || "Button");
  const b = el("button", "lego-in lego-btn-ctrl", text);
  b.type = "button";
  b.style.cursor = "pointer";
  b.style.width = "100%";
  b.style.height = "100%";
  b.style.boxSizing = "border-box";
  b.style.justifyContent = ctrl?.align === "left" ? "flex-start" : ctrl?.align === "right" ? "flex-end" : "center";
  b.style.textAlign = ctrl?.align || "center";
  if (ctrl) applyLabelStyle(b, ctrl);

  b.addEventListener("pointerdown", (e) => {
    eatPointer(e);
    b.classList.add("lego-btn-clicked");
    // Só enquanto pressionado: um listener fixo na window vazava a cada redesenho.
    window.addEventListener("pointerup", () => b.classList.remove("lego-btn-clicked"), { once: true });
  });
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    b.classList.remove("lego-btn-clicked");
    void b.offsetWidth;
    b.classList.add("lego-btn-clicked");
    setTimeout(() => b.classList.remove("lego-btn-clicked"), 160);
    try { w?.callback?.call(node, w, app.canvas, node, [0, 0], {}); } catch {}
  });
  return b;
}

/* ── Media grid ─────────────────────────────────────────────────────────── */

const MEDIA_VERSIONS = new Map();
const MEDIA_ELEMENT_CACHE = new Map();

/** Compara duas URLs normalizando caminhos relativos para evitar reatribuições redundantes. */
function sameUrl(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a === b) return true;
  try {
    let base = "http://127.0.0.1:8188/";
    if (typeof location !== "undefined" && location?.origin && location.origin !== "null" && !location.origin.startsWith("about:")) {
      base = location.origin + "/";
    }
    const ua = new URL(a, base);
    const ub = new URL(b, base);
    return ua.pathname === ub.pathname && ua.search === ub.search;
  } catch {
    return a === b;
  }
}

function viewURL(name, bust = false) {
  // O Mask Editor grava "clipspace/clipspace-mask-123.png [input]": o sufixo
  // diz a pasta (input/output/temp) e não faz parte do nome do arquivo.
  let raw = String(name || "");
  let type = "input";
  const m = /\s*\[(input|output|temp)\]$/.exec(raw);
  if (m) { type = m[1]; raw = raw.slice(0, m.index); }
  const i = raw.lastIndexOf("/");
  const sub = i > 0 ? raw.slice(0, i) : "";
  const file = i > 0 ? raw.slice(i + 1) : raw;
  const cacheKey = `${type}/${sub}/${file}`;
  if (bust) {
    MEDIA_VERSIONS.set(cacheKey, Date.now());
  }
  const v = MEDIA_VERSIONS.get(cacheKey);
  const vParam = v ? `&v=${v}` : "";
  return api.apiURL(
    `/view?filename=${encodeURIComponent(file)}&type=${type}&subfolder=${encodeURIComponent(sub)}${vParam}`
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
  viewURL(name, true);
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

  const hostId = state?.hostNode?.id || node?.id || "h";
  const ctrlKey = ctrl?.name || ctrl?.bind || (ctrl?.id != null ? String(ctrl.id) : "") || (w ? w.name : "media");
  const cacheKey = `${hostId}:${node?.id || "n"}:${ctrlKey}`;

  let cached = MEDIA_ELEMENT_CACHE.get(cacheKey);
  if (cached && cached.kind !== mediaTypeName) {
    cached = null;
  }

  let img, video, audioEl, audioWrap, playBtn;

  if (isVideo) {
    if (cached?.video) {
      video = cached.video;
    } else {
      video = el("video");
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      video.preload = "metadata";
      video.style.width = "100%";
      video.style.height = "100%";
      video.style.objectFit = "cover";
      cached = { kind: "video", video, lastLoadedUrl: "" };
      MEDIA_ELEMENT_CACHE.set(cacheKey, cached);
    }

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
    if (cached?.audioEl && cached?.audioWrap) {
      audioEl = cached.audioEl;
      audioWrap = cached.audioWrap;
      playBtn = cached.playBtn;
    } else {
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

      cached = { kind: "audio", audioEl, audioWrap, playBtn, lastLoadedUrl: "" };
      MEDIA_ELEMENT_CACHE.set(cacheKey, cached);
    }
  } else {
    if (cached?.img) {
      img = cached.img;
    } else {
      img = el("img");
      cached = { kind: "image", img, lastLoadedUrl: "" };
      MEDIA_ELEMENT_CACHE.set(cacheKey, cached);
    }
  }

  // Define os estados visuais antes da inserção no DOM para eliminar qualquer flash
  let initialVal = w?.value;
  if ((!initialVal || typeof initialVal !== "string") && Array.isArray(node?.imgs) && node.imgs.length > 0) {
    const firstImg = node.imgs[0];
    if (firstImg) {
      initialVal = firstImg.src || firstImg.filename || "";
    }
  }
  const hasInitialVal = !!(initialVal && typeof initialVal === "string");
  const initialUrl = hasInitialVal
    ? (initialVal.startsWith("http") || initialVal.startsWith("data:") || initialVal.startsWith("/") ? initialVal : viewURL(initialVal))
    : "";

  const ph = el("div");
  ph.style.flexDirection = "column";
  ph.style.alignItems = "center";
  ph.style.justifyContent = "center";
  ph.innerHTML = `<span class="lego-glyph-wrap" style="opacity:0.4;">${glyph(mediaGlyph, 30)}</span><span class="lego-media-ph-hint" style="font-size:11px;opacity:0.6;margin-top:6px;font-weight:500;">Drop or click to load ${mediaTypeName}</span>`;

  // Erro ao carregar (arquivo apagado, 404) mostra o placeholder DESTE
  // desenho. Definido aqui, a cada render: o elemento vem do cache e o
  // handler antigo apontava para o placeholder de um cartão já descartado.
  const mediaEl = isVideo ? video : isAudio ? audioEl : img;
  const shownEl = isAudio ? audioWrap : mediaEl;
  mediaEl.onerror = () => {
    shownEl.style.display = "none";
    ph.style.display = "flex";
  };

  if (hasInitialVal) {
    ph.style.display = "none";
    if (isVideo) {
      video.style.display = "block";
      if (!sameUrl(video.src, initialUrl)) video.src = initialUrl;
    } else if (isAudio) {
      audioWrap.style.display = "flex";
      if (!sameUrl(audioEl.src, initialUrl)) audioEl.src = initialUrl;
    } else {
      img.style.display = "block";
      if (!sameUrl(img.src, initialUrl)) img.src = initialUrl;
    }
  } else {
    ph.style.display = "flex";
    if (isVideo) {
      video.style.display = "none";
    } else if (isAudio) {
      audioWrap.style.display = "none";
    } else {
      img.style.display = "none";
    }
  }

  if (isVideo) {
    thumb.append(video, ph);
  } else if (isAudio) {
    thumb.append(audioWrap, audioEl, ph);
  } else {
    thumb.append(img, ph);
  }

  if (!isAudio) {
    const censorOverlay = el("div", "lego-media-censor-overlay");
    censorOverlay.innerHTML = `<span class="lego-censor-icon">${glyph("eyeSlash", 20)}</span><span class="lego-censor-label">Preview hidden</span>`;

    const hideBtn = el("button", "lego-media-hide-btn");
    hideBtn.type = "button";

    const updateCensorUI = () => {
      const censored = !!ctrl.hidePreview;
      thumb.classList.toggle("is-censored", censored);
      hideBtn.innerHTML = glyph(censored ? "eyeSlash" : "eye", 12);
      hideBtn.title = censored ? "Show preview" : "Hide / Censor preview";
    };

    hideBtn.addEventListener("pointerdown", eatPointer);
    hideBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      ctrl.hidePreview = !ctrl.hidePreview;
      node.graph?.setDirtyCanvas?.(true, true);
      app.canvas?.setDirty?.(true, true);
      updateCensorUI();
    });

    updateCensorUI();
    thumb.append(censorOverlay, hideBtn);
  }

  let lastLoadedUrl = cached?.lastLoadedUrl || initialUrl;
  const updateThumb = (bust = false) => {
    let val = w?.value;
    if ((!val || typeof val !== "string") && Array.isArray(node?.imgs) && node.imgs.length > 0) {
      const firstImg = node.imgs[0];
      if (firstImg) {
        val = firstImg.src || firstImg.filename || "";
      }
    }
    if (val && typeof val === "string") {
      const url = val.startsWith("http") || val.startsWith("data:") || val.startsWith("/") ? val : viewURL(val, bust);
      if (sameUrl(url, lastLoadedUrl) && !bust) {
        return;
      }
      lastLoadedUrl = url;
      if (cached) cached.lastLoadedUrl = url;
      if (isVideo) {
        if (!sameUrl(video.src, url)) video.src = url;
        video.style.display = "block";
        ph.style.display = "none";
      } else if (isAudio) {
        if (!sameUrl(audioEl.src, url)) audioEl.src = url;
        audioWrap.style.display = "flex";
        ph.style.display = "none";
      } else {
        if (!sameUrl(img.src, url)) img.src = url;
        img.style.display = "block";
        ph.style.display = "none";
      }
    } else {
      lastLoadedUrl = "";
      if (cached) cached.lastLoadedUrl = "";
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

  // Setas ◀ ▶ em volta do nome, como o combo nativo do Load Image: trocam
  // para o arquivo anterior/seguinte da lista (dando a volta nas pontas).
  const picker = el("div", "lego-media-picker");
  const stepFile = (dir) => {
    const vals = valuesOf(w, node).map((v) => (v && typeof v === "object" && "value" in v ? v.value : v));
    if (!w || !vals.length) return;
    const i = vals.findIndex((v) => String(v) === String(w.value));
    const next = vals[((i < 0 ? (dir > 0 ? -1 : 0) : i) + dir + vals.length) % vals.length];
    writeWidget(node, w, next);
    populateOptions();
    updateThumb();
  };
  const arrow = (dir) => {
    const b = el("button", `lego-media-arrow ${dir < 0 ? "prev" : "next"}`, dir < 0 ? "\u25C0" : "\u25B6");
    b.type = "button";
    b.title = dir < 0 ? `Previous ${mediaTypeName}` : `Next ${mediaTypeName}`;
    b.addEventListener("pointerdown", eatPointer);
    b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); stepFile(dir); });
    return b;
  };
  picker.append(arrow(-1), sel, arrow(1));

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
      await uploadTo(node, w, file);
      populateOptions();
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
      await uploadTo(node, w, file);
      populateOptions();
      updateThumb();
    } catch (err) {
      console.error(LOG, "Upload failed", err);
    } finally {
      uploadBtn.innerHTML = glyph("folderSearch", 15);
    }
  });

  // 4. Barra de Controles Inferior
  const bar = el("div", "lego-media-bar");
  bar.append(picker, uploadBtn);

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
      const h = parentRow.offsetHeight || parseInt(ctrl?.h || ctrl?.height || "0");
      box.classList.toggle("tall", h >= thresholdH || isAudio);
    };

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          box.classList.toggle("tall", entry.contentRect.height >= thresholdH || isAudio);
        }
      });
      ro.observe(parentRow);
      state?.observers?.push(ro);   // desligado no próximo refresh
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

function mkStepNumber(node, w, ctrl, state) {
  const o = w?.options || {};
  const step = ctrl.step ?? realStep(o);
  const isInt = isIntWidget(o, step, w);
  const min = Number.isFinite(o.min) ? o.min : -Infinity;
  const max = Number.isFinite(o.max) ? o.max : Infinity;

  const wrap = el("div", "lego-step-number");
  const btnDec = el("button", "lego-step-btn", "−");
  btnDec.title = "Decrease (-" + step + ")";
  const inp = el("input", "lego-step-input");
  selectOnFocus(inp);
  inp.type = "text";
  const btnInc = el("button", "lego-step-btn", "+");
  btnInc.title = "Increase (+" + step + ")";

  wrap.append(btnDec, inp, btnInc);

  const paint = (force = false) => {
    if (force === true || document.activeElement !== inp) {
      inp.value = fmtNum(w.value, numDecimals(o, step, isInt));
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
    if (!Number.isFinite(v)) { paint(true); return; }
    if (Number.isFinite(min)) v = Math.max(min, v);
    if (Number.isFinite(max)) v = Math.min(max, v);
    writeWidget(node, w, isInt ? Math.round(v) : v);
    paint(true);
  });

  const seedMode = seedModeButton(node, w, state);
  if (seedMode) wrap.append(seedMode);

  state.watch(w, paint);
  return wrap;
}

export { el, esc, PILL, GLYPHS, shortLabel, glyph, glyphEl, glyphBtn, glyphTextBtn, selectOnFocus, eatPointer, mkToggle, mkSlider, SEED_MODE_INFO, controlWidgetOf, seedModeButton, mkNumber, DROPDOWN_OPEN, openDropdown, mkCombo, mkText, mkButton, MEDIA_VERSIONS, MEDIA_ELEMENT_CACHE, sameUrl, viewURL, openMaskEditorFor, uploadTo, mkMediaControl, mkStepNumber };
