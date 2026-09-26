import { app } from "../../../scripts/app.js";

/**
 * "Queue Selected Output Nodes" de dentro de um Super Subgraph.
 *
 * O comando nativo acha o caminho de execução de cada nó selecionado
 * procurando, a partir da raiz, um nó de subgrafo NATIVO cujo `.subgraph` seja
 * o grafo onde o nó está (findPartialExecutionPathToGraph). O grafo de dentro
 * do Super Subgraph é um LGraph próprio e o nó dono dele não tem `.subgraph` —
 * de propósito —, então para qualquer nó de saída lá dentro o caminho dava
 * vazio e o ComfyUI respondia "Could not resolve path to selected nodes".
 *
 * O backend não enxerga os nós de dentro na validação: o nó SuperSubgraph é o
 * OUTPUT_NODE e desdobra o grafo interno na execução. Então a unidade que dá
 * para enfileirar é o próprio nó dono. Este arquivo ensina o comando a trocar
 * "nó selecionado dentro do SS" por "o nó SS que o contém" — o que roda o
 * grafo de dentro inteiro, não só a saída selecionada.
 *
 * Arquivo separado de super_subgraph.js de propósito: só embrulha um comando
 * do frontend e não depende de nada daquele módulo.
 */

const CMD_ID = "Comfy.QueueSelectedOutputNodes";
const LOG = "[SuperSubgraph/queue]";

const rootGraph = () => app.rootGraph || app.graph?.rootGraph || app.graph;

/** Nós selecionados no canvas, seja qual for a API de seleção da versão. */
function selectedNodes() {
  const c = app.canvas;
  const out = new Set();
  for (const it of c?.selectedItems || []) if (it && Array.isArray(it.inputs)) out.add(it);
  for (const n of Object.values(c?.selected_nodes || {})) if (n) out.add(n);
  return [...out];
}

const isOutputNode = (n) => !!n?.constructor?.nodeData?.output_node;

/** O nó Super Subgraph dono do grafo onde `n` mora, ou null. */
function ssHostOf(n) {
  return n?.graph?.__ssHostNode || null;
}

/** Caminho nativo até `graph` (mesma busca do frontend), ou undefined. */
function nativePathTo(graph, from) {
  for (const n of from?.nodes || from?._nodes || []) {
    if (!n.isSubgraphNode?.()) continue;
    if (n.subgraph === graph) return `${n.id}`;
    const deeper = nativePathTo(graph, n.subgraph);
    if (deeper !== undefined) return `${n.id}:${deeper}`;
  }
  return undefined;
}

/** Id de execução que o backend reconhece para o nó (subindo SS aninhados). */
function executionIdOf(n, depth = 0) {
  if (!n?.graph || depth > 16) return null;
  const host = ssHostOf(n);
  if (host) return executionIdOf(host, depth + 1);
  const root = rootGraph();
  if (n.graph === root || n.graph.isRootGraph) return String(n.id);
  const path = nativePathTo(n.graph, root);
  return path === undefined ? null : `${path}:${n.id}`;
}

function wrapCommand() {
  const store = app.extensionManager?.command;
  const cmd = store?.getCommand?.(CMD_ID) || store?.commands?.find?.((c) => c.id === CMD_ID);
  if (!cmd || typeof cmd.function !== "function") return false;
  if (cmd.function.__ssWrapped) return true;

  const original = cmd.function;
  const wrapped = async function (...args) {
    const sel = selectedNodes();
    const insideSS = sel.filter((n) => ssHostOf(n));
    // Nada de dentro de um SS: o comando nativo segue exatamente como era.
    if (!insideSS.length) return original.apply(this, args);

    // Mesma regra do nativo: sem nó de saída selecionado, nada para enfileirar.
    if (!sel.some(isOutputNode)) return original.apply(this, args);

    const ids = new Set();
    for (const n of sel) {
      if (!isOutputNode(n)) continue;
      const id = executionIdOf(n);
      if (id) ids.add(id);
    }
    if (!ids.size) return original.apply(this, args);

    const batch = app.extensionManager?.queueSettings?.batchCount || 1;
    console.info(LOG, "enfileirando o(s) Super Subgraph(s) dono(s) da seleção:", [...ids]);
    return app.queuePrompt(0, batch, { queueNodeIds: [...ids] });
  };
  wrapped.__ssWrapped = true;
  cmd.function = wrapped;
  return true;
}

app.registerExtension({
  name: "ComfyUI.SuperSubgraph.QueueSelected",
  setup() {
    // O comando nativo é registrado pelo próprio frontend; em algumas versões
    // ele ainda não existe no setup das extensões — tenta até achar.
    if (wrapCommand()) return;
    let tries = 0;
    const t = setInterval(() => {
      if (wrapCommand() || ++tries > 40) clearInterval(t);
    }, 250);
  },
});
