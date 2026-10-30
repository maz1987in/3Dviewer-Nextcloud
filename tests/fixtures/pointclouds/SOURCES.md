# Point-cloud fixtures

Most files here are written by `scripts/make-point-fixtures.mjs` (with
`scripts/pointFixtureWriters.mjs`); run it to make them again. The ones below come
from elsewhere, unchanged.

| File | Source | Licence |
|---|---|---|
| `simple.laz` | PDAL, [`test/data/laz/simple.laz`](https://github.com/PDAL/PDAL/blob/537aeeb55bc8e45864d6b5006ab8dfa195cae1d3/test/data/laz/simple.laz) at `537aeeb55bc8` | BSD-3-Clause (PDAL's `LICENSE.txt`) |
| `simple.las` | PDAL, [`test/data/las/simple.las`](https://github.com/PDAL/PDAL/blob/537aeeb55bc8e45864d6b5006ab8dfa195cae1d3/test/data/las/simple.las) at `537aeeb55bc8`: `simple.laz` uncompressed | BSD-3-Clause |
| `point-time-1.4.laz` | laz-perf, [`cpp/test/raw-sets/point-time-1.4.las.laz`](https://github.com/hobuinc/laz-perf/blob/1548cda33ce843bf1c56831e23e229f7e81342df/cpp/test/raw-sets/point-time-1.4.las.laz) at `1548cda33ce8` | Apache-2.0 (laz-perf's `COPYING`) |

`simple.laz` and `simple.las` are LAS 1.2, point format 3, 1,065 points.
`point-time-1.4.laz` is LAS 1.4, point format 1, 1,065 points, with its coordinate
system in WKT.
