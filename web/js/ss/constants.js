// Constantes compartilhadas. Não importa nada (é carregado antes de tudo).

const EXT = "ComfyUI.SuperSubgraph";
const PROP = "ui_layout";
const SCHEMA = 2;
const MIN_W = 320;
const PAD = 24;        // folga abaixo do cartão
const TICK_MS = 250;   // intervalo mínimo entre conferências de tamanho
const SWEEP_MS = 1000; // varredura de manutenção dos cartões
const GRID = 16;       // passo do snap dos componentes na zona
const LOG = "[SuperSubgraph]";

export { EXT, PROP, SCHEMA, MIN_W, PAD, TICK_MS, SWEEP_MS, GRID, LOG };
