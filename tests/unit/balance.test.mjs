// Balance Slider: a conta que divide o total entre os dois lados.
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
for (const k of ["window","document","HTMLElement","Event","MouseEvent","KeyboardEvent","MutationObserver","getComputedStyle","URLSearchParams"]) globalThis[k] = dom.window[k] ?? globalThis[k];
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.ResizeObserver = class { observe(){} disconnect(){} };
globalThis.__app = { canvas: { ds: { scale: 1 }, setDirty(){} }, graph: { _nodes: [], setDirtyCanvas(){} } };
globalThis.__api = { apiURL: (p) => "/api" + p, fetchApi: async () => ({ ok: false }), addEventListener(){} };
const M = await import("../.build/mod.mjs");
let ok = 0, fail = 0;
const t = (name, cond) => { cond ? ok++ : fail++; console.log(cond ? "PASS" : "FAIL", name); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

t("default range is 0-1 with step 0.01", eq(M.balanceRange({}), { min: 0, max: 1, step: 0.01, dec: 2 }));
t("0.3 on the left gives 0.7 on the right", eq(M.balanceSplit({}, 0.3), { a: 0.3, b: 0.7 }));
t("no float noise (0.1 -> 0.9)", eq(M.balanceSplit({}, 0.1), { a: 0.1, b: 0.9 }));
t("clamped to the range", eq(M.balanceSplit({}, 1.4), { a: 1, b: 0 }) && eq(M.balanceSplit({}, -2), { a: 0, b: 1 }));
t("snaps to the step", eq(M.balanceSplit({ step: 0.05 }, 0.33), { a: 0.35, b: 0.65 }));
t("custom range 0-10: 4 -> 6", eq(M.balanceSplit({ min: 0, max: 10 }, 4), { a: 4, b: 6 }));
t("range 0-2 sums to 2", (() => { const r = M.balanceSplit({ min: 0, max: 2 }, 0.75); return r.a + r.b === 2; })());
t("invalid max falls back to min+1", eq(M.balanceRange({ min: 0, max: 0 }).max, 1));
console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
