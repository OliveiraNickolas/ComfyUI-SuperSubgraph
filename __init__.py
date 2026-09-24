"""
ComfyUI-SuperSubgraph — "Lego UI"

All functionality lives in the frontend: the card is a DOM widget rendered over
the node's real widgets, and the layout resides in `node.properties.ui_layout`,
which LiteGraph serializes with the workflow.

There is no Python node. The previous version registered a dummy node that
returned (None,) — a misleading node that did nothing. It was removed cleanly.
"""

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
