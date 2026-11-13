# Print check that opens without freezing the page

**Status:** built on autopilot; decisions recorded here, no review conversation
**Date:** 2026-11-13

## Why

Opening Print check on a large model stopped the page before its card could draw. The Playwright test that opens a 240,000-triangle sphere ("cancelling a running check stops it") needed more than 5 s for the card on CI's software renderer, and was given 20 s and `test.slow()` in #263. People print models of 100,000 to 2,000,000 triangles.

## What it cost, measured first

Measured in Chromium with SwiftShader (the renderer CI uses) on an Apple M-series Mac, with a Playwright script that records long tasks, frame gaps and when the card appears, plus a CPU profile mapped through the build's source maps. The per-triangle functions were also timed in Node.

| Step on the page's thread | 240k triangles | 1M triangles |
|---|---|---|
| `modelExtentMm` | 9 ms | 27–55 ms |
| `overhangShare` | 10–12 ms | 38–40 ms |
| `positionsOf` + copy for the closed check | 3–4 ms | 11–15 ms |
| `modelVolumeAndArea` (when the closed check returns) | 15 ms | 36–40 ms |
| First draw of the three new shaders (box, bed, overhang shading) | **450–850 ms** | hidden behind slow frames |

So on 240k triangles the freeze was mostly not the arithmetic: it was the first frame after the click compiling three shaders synchronously (`getProgramInfoLog` in the profile). Switching to Z up cost 770–990 ms for the same reason: the build box and bed were thrown away and remade, their shaders freed and compiled again. On 1M triangles the arithmetic itself held the page for 130–160 ms per click on a fast machine, and more on a slow one.

## Goals

- The card appears at once, and nothing Print check runs holds the page longer than a frame's work.
- Changing the angle, Z up, the printer, the unit or moving the model never freezes it.
- Results identical to before: the same fit, overhang share, estimate and shading.
- Closing, or opening another model, mid-measurement stops the work and leaves nothing behind.

## Decisions

| Question | Decision |
|---|---|
| Where the per-triangle work goes | The existing print-check worker, as a session: Print check sends each part's positions and index once when it opens (transferred, not cloned twice), and every later measurement is a small request with world matrices, axes, angle and bed tolerance. A new angle, Z up, a new unit or a moved model does not send the model again. |
| Same results | `surfaceMeasures.js` does the same arithmetic in the same order as `Vector3.applyMatrix4`, `crossVectors`, `length`, `divideScalar` and the old loops, on copies holding exactly what `getX/Y/Z` return (float attributes copied as they are, interleaved or quantised ones read into doubles). Jest compares old and new with `toBe` on a Z-up STL sphere, a scaled and turned two-part indexed T, quantised + interleaved + broken geometry beside a line and points, and a matrix with a perspective row, at both up axes and several angles and units. |
| What needs no measuring | A new printer (fit = stored extent against the new box), infill or material (stored volume and area). A new unit rescales the fit and estimate at once and asks again only for the overhangs, whose bed tolerance is in millimetres. |
| Stale answers | Each request is numbered; only the newest answer is applied, and none after Print check closed. |
| Estimate after scaling | Measured with every measurement, so it now follows the transform tool. Before, it was measured only when infill, material or unit changed. |
| What the card shows meanwhile | "Measuring…" in place of the fit and the overhang share; "Could not measure the model" if the worker fails. After Z up the old Y-up numbers are not shown, since they describe a different bed. |
| The shader stall | One shader instead of three: the box and bed use the overhang material in a flat-colour mode (`uFlat`), and the bed's back face is triangles of its own rather than `DoubleSide`, which would be another shader. The box and bed are made once per opening and moved afterwards. The shader is compiled when Print check opens, and the box, bed and shading are held out of sight until it is ready. |
| Knowing when it is ready | With `KHR_parallel_shader_compile`, `renderer.compileAsync` says when. Without it (SwiftShader, llvmpipe) there is no non-blocking question: tried a fence after the compile, and `validateProgram` plus a fence; neither predicted the stall. A fixed 1.5 s was enough on SwiftShader with the model on screen (300 ms was not, 2 s was too). Under heavy load the first frame that draws a new shader still waits once for the software renderer to finish the frames queued before it: any first use of a new shader asks the GPU process a question that waits behind them. That wait is logged by the Playwright test, not held to its limit. |
| Thickness colours | The same hold-until-compiled. The thickness measurement itself was already in a worker. |
| Bundle | Print-check worker raw +2.5 KB (138.4 → 140.9 KB of the 156,000-byte budget). No budget change. |
| Memory | The worker holds one copy of the model's positions while Print check is open, where before a copy existed only during the closed check. |

## Rejected

- Slicing the work into chunks between frames on the page: the arithmetic was not the main cost on 240k triangles, and it would have stretched the measurement over many frames while still running on the page.
- One worker per measurement (as the closed check had): every angle change would copy and transfer the whole model again.
- Keeping shaders alive between openings: would need a hidden keeper material; reopening compiles again but stays out of sight until ready.

## Tests

- Jest: `surfaceMeasures.test.js` (bit-identical to the old functions), `printCheckClient.test.js` (one worker per session, model sent once and transferred, close rejects waiting requests), `usePrintCheck.test.js` (the card's state at once, held until compiled with and without the extension, close mid-measurement, newest answer wins, failure, Z up, a new angle debounced, a new printer measuring nothing, the estimate after scaling), `overhang.test.js`, `printCheckCard.test.js`.
- Playwright: on the 240k sphere, the card within 1 s of the click and no script longer than 200 ms (Long Animation Frames, which exclude compositor waits) until the numbers are in, and none for Z up and a new angle. On the old code this measured 765–874 ms. Closing while the worker's script is held back leaves no overlays and no worker. The #263 workaround is gone.
