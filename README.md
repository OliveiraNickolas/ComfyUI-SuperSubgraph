# ComfyUI-SuperSubgraph

Custom node for [ComfyUI](https://github.com/comfyanonymous/ComfyUI) providing a high-performance, modular 2D canvas UI layer ("Lego UI") for subgraphs and complex workflows.

## Features

- **Interactive 2D Canvas Layout**: Position, group, and align widgets with magnetic 16px grid snapping.
- **Raw UI Elements**: Add modular switches, number steppers, dropdowns, text inputs, sliders, and dividers directly to the canvas.
- **Segment Element**: Group multiple controls into composite units inline.
- **Workflow Parameter Binding**: Bind controls to node parameters in real-time with visual target selection.
- **Native HiDPI**: Faithful node previews without scaling compression.
- **Layout in the workflow**: Layout and state persist in `node.properties.ui_layout`, serializing natively with your workflow.
- **Independent Super Subgraph node**: select nodes and use **Convert Selection to SuperSubgraph** (selection toolbar — the native subgraph icon with a purple "SS" badge, canvas or node right-click menu). The nodes move inside a `SuperSubgraph` node with its own engine — no native subgraph involved. Links crossing the selection become its inputs/outputs; the card starts empty (nothing is promoted automatically) and binds straight to the inner widgets you choose — **Recreate Layout from Widgets** builds a default layout on demand. To explore or edit the nodes inside, click the **enter** button in the card header (or right-click → **Open SuperSubgraph**); a bar at the top shows where you are and **Back** (or **Esc**) returns (nested SuperSubgraphs work too). **Unpack Super Subgraph** (node right-click) puts the nodes back into the workflow.

## Promoting parameters

Quickest way: on an empty card, click **Promote parameters** — the selector opens straight away. Otherwise double-click an empty spot of a zone (this also switches to edit mode) or use a zone's **+**, then **Target Picker**. On the canvas (inside the SuperSubgraph):

- click a node **title** to pick the whole node (purple border) — it becomes a whole-node widget;
- click a **parameter** to pick just it (green border) — it becomes its own component;
- click again to unpick; clicking a parameter of a whole-picked node unpicks just that parameter;
- **Promote (N)** (or Enter) adds everything at once, stacked from where you opened the selector; **Cancel** (or Esc) leaves without changes. Opened from a group's **+ Add**, the picks become items of that group.

If a promoted parameter disappears (its node was deleted or changed), the component shows **widget missing** with **Rebind** (link it to another parameter) and **Remove**.

## How the Super Subgraph engine works

- **Frontend:** the inner nodes live in their own graph, off the canvas, saved in `node.properties.ss_inner`. When you queue, ComfyUI's own `graphToPrompt` turns that graph into the API format (bypass, mute, reroutes and primitives behave as usual).
- **Backend** (`super_subgraph_node.py`): the node expands that graph at execution time with ComfyUI's *node expansion*. Outside links are wired straight into the inner nodes (`rawLink`), and inner Preview/Save nodes run and show their results on the Super Subgraph node.

## Installation

Clone into your `ComfyUI/custom_nodes` directory:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/OliveiraNickolas/ComfyUI-SuperSubgraph.git
```

Restart ComfyUI and refresh your browser. Updates that change `super_subgraph_node.py` or `__init__.py` need a ComfyUI restart; frontend-only updates just need a browser refresh (Ctrl+F5).

## Tests

```bash
npm ci
npm test            # jsdom unit tests + Chromium UI tests
npm run test:e2e    # needs ComfyUI running with this extension (COMFY_URL, default http://127.0.0.1:8188/)
```

Set `CHROME_PATH` if Chromium is not found automatically. GitHub Actions runs every suite,
including the end-to-end suite against a real ComfyUI on CPU.
