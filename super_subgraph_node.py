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
import logging

import nodes as comfy_nodes
from comfy_execution.graph_utils import GraphBuilder, is_link

MAX_IO = 32


def _required_inputs(class_type):
    """Nomes das entradas obrigatórias do tipo de nó (vazio se não der para saber)."""
    cls = comfy_nodes.NODE_CLASS_MAPPINGS.get(class_type)
    try:
        spec = cls.INPUT_TYPES() if cls is not None else {}
        return set((spec or {}).get("required", {}) or {})
    except Exception:
        return set()


def _prune_incomplete(inner, fed_from_outside, host_id):
    """
    Tira os nós de dentro que ficaram com uma entrada obrigatória sem nada
    ligado (e, em cascata, os que dependiam deles) — como o ComfyUI faz com um
    nó incompleto num workflow comum: ele fica de fora e o resto roda, em vez
    de a execução inteira falhar.
    """
    alive = dict(inner)
    changed = True
    while changed:
        changed = False
        for nid, info in list(alive.items()):
            inputs = info.get("inputs") or {}
            missing = []
            for name in _required_inputs(info.get("class_type")):
                value = inputs.get(name)
                if (nid, name) in fed_from_outside:
                    continue
                if value is None or (is_link(value) and str(value[0]) not in alive):
                    missing.append(name)
            if missing:
                title = (info.get("_meta") or {}).get("title") or info.get("class_type")
                logging.warning(
                    "SuperSubgraph #%s: skipping '%s' (#%s) inside it: required input %s not connected",
                    host_id, title, nid, ", ".join(f"'{m}'" for m in missing),
                )
                del alive[nid]
                changed = True
    return alive


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

        # Entradas ligadas de fora (in_N com fio) contam como ligadas.
        fed = set()
        for i, targets in enumerate(data.get("inputs") or []):
            if kwargs.get(f"in_{i + 1}") is None:
                continue
            for target in targets or []:
                fed.add((str(target[0]), target[1]))
        inner = _prune_incomplete({str(k): v for k, v in inner.items()}, fed, unique_id)
        if not inner:
            return empty

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
