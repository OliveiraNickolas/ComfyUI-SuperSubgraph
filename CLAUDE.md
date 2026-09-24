# ComfyUI-SuperSubgraph

Frontend-only ComfyUI extension: all logic lives in `web/js/super_subgraph.js`
(code comments are in Portuguese; match that). `__init__.py` only exposes
`WEB_DIRECTORY`.

## Workflow

- The owner wants every change delivered end to end: commit, push, open a
  pull request against `main`, and merge it yourself — no need to ask for
  approval before merging.
- Before merging, at least run `node --check web/js/super_subgraph.js`.
- The owner is a beginner: explain results in simple Portuguese and remind
  them to `git pull` in `ComfyUI/custom_nodes/ComfyUI-SuperSubgraph` and
  restart ComfyUI to get the changes.
