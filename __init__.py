"""
ComfyUI-SuperSubgraph — "Lego UI" + motor próprio de subgrafo.

Frontend: o cartão é um DOM widget e o layout mora em
`node.properties.ui_layout`, que o LiteGraph serializa com o workflow.

Backend: o nó `SuperSubgraph` (super_subgraph_node.py) é o motor
independente — guarda o grafo de dentro e o desdobra na execução com o
"node expansion" do ComfyUI, sem depender do subgraph nativo.
"""

from .super_subgraph_node import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
