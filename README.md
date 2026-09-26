# ComfyUI-SuperSubgraph

Custom node for [ComfyUI](https://github.com/comfyanonymous/ComfyUI) providing a high-performance, modular 2D canvas UI layer ("Lego UI") for subgraphs and complex workflows.

## Features

- **Interactive 2D Canvas Layout**: Position, group, and align widgets with magnetic 16px grid snapping.
- **Raw UI Elements**: Add modular switches, number steppers, dropdowns, text inputs, sliders, and dividers directly to the canvas.
- **Segment Element**: Group multiple controls into composite units inline.
- **Workflow Parameter Binding**: Bind controls to node parameters in real-time with visual target selection.
- **Native HiDPI**: Faithful node previews without scaling compression.
- **Layout in the workflow**: Layout and state persist in `node.properties.ui_layout`, serializing natively with your workflow.
- **Super Subgraph = native subgraph + card**: select nodes and use **Convert Selection to SuperSubgraph** (selection toolbar — the native subgraph icon with a purple "SS" badge, canvas or node right-click menu). It uses ComfyUI's own **Convert to Subgraph** and puts the card on top, so running, entering (the card's **enter** button, **Open Inside**, the native breadcrumb, Esc), inputs/outputs, undo and **Unpack Subgraph** are all ComfyUI's. The card starts empty (nothing is promoted automatically) — **SuperSubgraph ▸ More ▸ Rebuild Card from Widgets** builds a default layout on demand.
- **Classic and Super side by side**: a classic subgraph stays classic. Right-click one → **SuperSubgraph ▸ Turn into SuperSubgraph** to put the card on it, or **Copy as SuperSubgraph (independent)** to get a separate copy with a card (changing one doesn't change the other). **More ▸ Turn back into a classic Subgraph** removes the card.

## Promoting parameters

Quickest way: on an empty card, click **Promote parameters** — the selector opens straight away. Otherwise double-click an empty spot of a zone (this also switches to edit mode) or use a zone's **+**, then **Target Picker**. On the canvas (inside the SuperSubgraph):

- click a node **title** to pick the whole node (purple border) — it becomes a whole-node widget;
- click a **parameter** to pick just it (green border) — it becomes its own component;
- click again to unpick; clicking a parameter of a whole-picked node unpicks just that parameter;
- **Promote (N)** (or Enter) adds everything at once, arranged side by side in rows that fit the zone (in the order the nodes sit on the canvas, top to bottom and left to right), starting where you opened the selector — or below what the zone already has; **Cancel** (or Esc) leaves without changes. Opened from a group's **+ Add**, the picks become items of that group.

If a promoted parameter disappears (its node was deleted or changed), the component shows **widget missing** with **Rebind** (link it to another parameter) and **Remove**.

## Editing components

In edit mode, right-click a component for **Properties**, **Duplicate** (Ctrl+D), **Group** / **Group vertically** (Ctrl+G / Ctrl+Shift+G group the selected components), **Ungroup**, **Change to Slider/Stepper** (same parameter, other look), **Rebind…** and **Remove** (Del). Ctrl/Shift + right-click still just adds to the selection.

## Reuse and share

- To reuse a whole Super Subgraph, use ComfyUI's own subgraph publishing / copy-paste: the card travels with the node.
- Colors: in edit mode, the dot next to a zone title picks the zone color; right-click a component → **Color…** for components.

## While it runs

The card shows a progress bar with the inner node that is running, and if something fails, a red strip says which inner node failed and why (✕ dismisses it; the next run clears it).
Numbers with ComfyUI's *control after generate* (seeds) get a small mode button next to them — **FIX**, **+1**, **−1** or 🎲 random — click to cycle. It works for nodes inside a SuperSubgraph too.

## Mask Editor

Image upload components (Load Image, including one inside a SuperSubgraph) have a **mask** button next to the folder button. It opens ComfyUI's Mask Editor for that image; **Save** writes the masked image back to the inner Load Image and the card's thumbnail updates.

## Groups

Horizontal/vertical groups grow by themselves when their items don't fit (they never shrink on their own).
In edit mode, a group's action bar has a **flip** button (horizontal ↔ vertical; also **Make Vertical / Make Horizontal** in its right-click menu) and a **color** dot.

## Menus and card layouts

Everything this extension adds is under one menu, **SuperSubgraph**. Open it by right-clicking anywhere on the node or card (except on a component, which has its own menu), or with the **⋯** button on the card.

- **Open Inside** / **Edit Card**
- **Save Card Layout…** / **Load Card Layout ▸**: only the card (tabs, zones, components), kept in `user/default/supersubgraph/layouts/`. If you load a layout on a different SuperSubgraph, each component re-links to the node of the same type inside it.
- **Files ▸**: **Export Card Layout…**, **Import Card Layout…** (files to share).
- **More ▸**: **Rebuild Card from Widgets**, **Delete a Saved Card Layout**, **Turn back into a classic Subgraph**.

## ComfyUI groups

When you convert, ComfyUI groups that contain selected nodes move inside the SuperSubgraph, and each group becomes a **tab** of the card, with the group's name and color. Nodes that are not in any group go to an **Other** tab.
Selecting a group and converting takes all the nodes inside it. **Rebuild Card from Widgets** fills each group's tab with its nodes, and ComfyUI's **Unpack Subgraph** puts the groups back.

## Aligning components

In edit mode, select 2 or more components of a zone (Shift/Ctrl + click, or drag a box) and alignment buttons appear at the top of the zone:
align left / center / right, top / middle / bottom, **arrange in a row** or **in a column** (16px apart), distribute horizontally / vertically (3+),
and same width / height / size (taken from the last one selected). Resizing one of the selected components by its corner resizes all of them by the same amount.

## Promoted parameters

ComfyUI may promote some inner parameters to the subgraph node itself (for example a Load Image's image). A promoted parameter has its own value on each subgraph node and that is the value that runs — the card reads and writes that one automatically.

## Installation

Clone into your `ComfyUI/custom_nodes` directory:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/OliveiraNickolas/ComfyUI-SuperSubgraph.git
```

Restart ComfyUI and refresh your browser. The extension is frontend-only: updates just need a browser refresh (Ctrl+F5); only a change to `__init__.py` needs a ComfyUI restart.

## Tests

```bash
npm ci
npm test            # jsdom unit tests + Chromium UI tests
npm run test:e2e    # needs ComfyUI running with this extension (COMFY_URL, default http://127.0.0.1:8188/)
```

Set `CHROME_PATH` if Chromium is not found automatically. GitHub Actions runs every suite,
including the end-to-end suite against a real ComfyUI on CPU.
