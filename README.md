# ComfyUI-SuperSubgraph

Custom node for [ComfyUI](https://github.com/comfyanonymous/ComfyUI) providing a high-performance, modular 2D canvas UI layer ("Lego UI") for subgraphs and complex workflows.

## Features

- **Interactive 2D Canvas Layout**: Position, group, and align widgets with magnetic 16px grid snapping.
- **Raw UI Elements**: Add modular switches, number steppers, dropdowns, text inputs, sliders, and dividers directly to the canvas.
- **Segment Element**: Group multiple controls into composite units inline.
- **Workflow Parameter Binding**: Bind controls to node parameters in real-time with visual target selection.
- **Native HiDPI**: Faithful node previews without scaling compression.
- **Pure Frontend Architecture**: Layout and state persist cleanly in `node.properties.ui_layout`, serializing natively with your workflow.

## Installation

Clone into your `ComfyUI/custom_nodes` directory:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/OliveiraNickolas/ComfyUI-SuperSubgraph.git
```

Restart ComfyUI and refresh your browser.
