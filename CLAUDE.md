# ComfyUI-SuperSubgraph

ComfyUI extension. UI logic lives in `web/js/super_subgraph.js` (code comments
are in Portuguese; match that). The `SuperSubgraph` backend node (its own
subgraph engine, via ComfyUI node expansion) lives in `super_subgraph_node.py`
and is exported by `__init__.py` together with `WEB_DIRECTORY`.

## Workflow

- The owner wants every change delivered end to end: commit, push, open a
  pull request against `main`, and merge it yourself — no need to ask for
  approval before merging.
- Before merging, at least run `node --check web/js/super_subgraph.js` and
  `python3 -m py_compile super_subgraph_node.py __init__.py`.
- The owner is a beginner: explain results in simple Portuguese and remind
  them to `git pull` in `ComfyUI/custom_nodes/ComfyUI-SuperSubgraph`. Changes
  to the Python files need a ComfyUI restart; JS-only changes need Ctrl+F5.
