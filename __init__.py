"""
ComfyUI-SuperSubgraph — cartão ("Lego UI") por cima dos subgrafos nativos.

Só frontend: o Super Subgraph é um subgrafo nativo do ComfyUI com o cartão
por cima (um DOM widget cujo layout mora em `node.properties.ui_layout`,
serializado com o workflow). A execução é 100% a do ComfyUI.
"""

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
