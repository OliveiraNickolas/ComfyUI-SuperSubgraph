"""
SuperSubgraph — motor próprio de subgrafo.

O nó guarda o grafo de dentro no formato da API (o mesmo que o frontend manda
para /prompt) e, ao executar, o DESDOBRA no grafo real com o "node expansion"
do ComfyUI: cada nó de dentro vira um nó efêmero, e as entradas que vinham de
fora são ligadas direto nos fios originais (`rawLink`), sem materializar o
valor aqui. Os nós de saída de dentro (Preview/Save) executam normalmente e
mostram o resultado neste nó (display node).

Formato de `ss_graph` (JSON, gerado pelo frontend na hora de enfileirar):
    {
      "nodes":   { "<id>": {"class_type": ..., "inputs": {...}}, ... },
      "inputs":  [ [["<id>", "<input_name>"], ...], ... ],   # alvos de in_1, in_2...
      "outputs": [ ["<id>", <slot>], ... ]                     # fonte de out_1, out_2...
    }
"""

import json

import nodes as comfy_nodes
from comfy_execution.graph_utils import GraphBuilder, is_link

MAX_IO = 32


class SuperSubgraph:
    @classmethod
    def INPUT_TYPES(cls):
        optional = {f"in_{i}": ("*", {"rawLink": True}) for i in range(1, MAX_IO + 1)}
        return {
            "required": {
                "ss_graph": ("STRING", {"default": "", "multiline": False}),
            },
            "optional": optional,
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("*",) * MAX_IO
    RETURN_NAMES = tuple(f"out_{i}" for i in range(1, MAX_IO + 1))
    FUNCTION = "run"
    CATEGORY = "utils"
    # Roda mesmo sem nada ligado nas saídas: os Preview/Save de dentro dependem disso.
    OUTPUT_NODE = True
    DESCRIPTION = "Super Subgraph: a self-contained group of nodes with its own card UI."

    @classmethod
    def VALIDATE_INPUTS(cls, input_types=None, **kwargs):
        # Entradas e saídas são genéricas ("*"); o tipo real é checado pelos
        # nós de dentro quando o grafo é desdobrado.
        return True

    def run(self, ss_graph, unique_id=None, **kwargs):
        empty = {"result": (None,) * MAX_IO}
        if not ss_graph:
            return empty
        try:
            data = json.loads(ss_graph)
        except (TypeError, ValueError) as e:
            raise ValueError(f"SuperSubgraph: invalid inner graph ({e})")

        inner = data.get("nodes") or {}
        if not inner:
            return empty

        for nid, info in inner.items():
            ct = info.get("class_type")
            if ct not in comfy_nodes.NODE_CLASS_MAPPINGS:
                title = (info.get("_meta") or {}).get("title") or ct
                raise ValueError(f"SuperSubgraph: node type '{ct}' ({title}, #{nid}) is not installed")

        # Prefixo fixo por nó: ids efêmeros previsíveis ("<este>.<id de dentro>"),
        # que o frontend usa para achar o output de um nó de dentro específico.
        g = GraphBuilder(prefix=f"{unique_id}.")
        for nid, info in inner.items():
            g.node(info["class_type"], str(nid))

        for nid, info in inner.items():
            node = g.lookup_node(str(nid))
            for name, value in (info.get("inputs") or {}).items():
                if is_link(value):
                    src = g.lookup_node(str(value[0]))
                    if src is not None:
                        node.set_input(name, src.out(int(value[1])))
                else:
                    node.set_input(name, value)

        # Entradas de fora: o fio original vai direto para cada nó de dentro.
        for i, targets in enumerate(data.get("inputs") or []):
            link = kwargs.get(f"in_{i + 1}")
            if link is None:
                continue
            for target in targets or []:
                node = g.lookup_node(str(target[0]))
                if node is not None:
                    node.set_input(target[1], link)

        result = []
        for src in (data.get("outputs") or [])[:MAX_IO]:
            node = g.lookup_node(str(src[0])) if src else None
            result.append(node.out(int(src[1])) if node is not None else None)
        result += [None] * (MAX_IO - len(result))

        return {"result": tuple(result), "expand": g.finalize()}


NODE_CLASS_MAPPINGS = {"SuperSubgraph": SuperSubgraph}
NODE_DISPLAY_NAME_MAPPINGS = {"SuperSubgraph": "Super Subgraph"}
