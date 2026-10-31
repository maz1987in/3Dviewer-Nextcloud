# Splat fixtures

Every file here is written by `scripts/make-splat-fixtures.mjs` (with
`scripts/splatFixtureWriters.mjs`); run it to make them again. Nothing is downloaded.

Each holds the same grid of 1,000 splats: 10 × 10 × 10, 2 m wide (x), 1 m tall (y) and
0.5 m deep (z), the first at (−1, 0, −0.25). Each splat is coloured by where it is, with
opacity 0.9, size 0.02 m and no rotation.

| File | Layout | Reference |
|---|---|---|
| `grid.splat` | 32 bytes a splat: position, scale, RGBA, rotation | [antimatter15/splat](https://github.com/antimatter15/splat) (MIT) |
| `grid.ply` | Binary little-endian 3D Gaussian Splatting PLY, spherical-harmonic degree 0 | [graphdeco-inria/gaussian-splatting](https://github.com/graphdeco-inria/gaussian-splatting) |
| `grid-sh3.ply` | The same, with the 45 degree-3 coefficients (all zero) | as above |
| `grid.spz` | SPZ version 2, degree 0, 12 fractional bits, gzipped | [nianticlabs/spz](https://github.com/nianticlabs/spz) (MIT) |
