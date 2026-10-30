# Point-cloud fixtures

Most files here are written by `scripts/make-point-fixtures.mjs` (with
`scripts/pointFixtureWriters.mjs`); run it to make them again. The ones below come
from elsewhere, unchanged.

| File | Source | Licence |
|---|---|---|
| `simple.laz` | PDAL, [`test/data/laz/simple.laz`](https://github.com/PDAL/PDAL/blob/537aeeb55bc8e45864d6b5006ab8dfa195cae1d3/test/data/laz/simple.laz) at `537aeeb55bc8` | BSD-3-Clause (PDAL's `LICENSE.txt`) |
| `simple.las` | PDAL, [`test/data/las/simple.las`](https://github.com/PDAL/PDAL/blob/537aeeb55bc8e45864d6b5006ab8dfa195cae1d3/test/data/las/simple.las) at `537aeeb55bc8`: `simple.laz` uncompressed | BSD-3-Clause |
| `point-time-1.4.laz` | laz-perf, [`cpp/test/raw-sets/point-time-1.4.las.laz`](https://github.com/hobuinc/laz-perf/blob/1548cda33ce843bf1c56831e23e229f7e81342df/cpp/test/raw-sets/point-time-1.4.las.laz) at `1548cda33ce8` | Apache-2.0 (laz-perf's `COPYING`) |
| `tinyCartesianFloatRgb.e57` | e57 crate, [`testdata/tinyCartesianFloatRgb.e57`](https://github.com/cry-inc/e57/blob/c759b1da81184bea3db5e093e7416729cb77cd27/testdata/tinyCartesianFloatRgb.e57) at `c759b1da8118` | MIT (the crate's `LICENSE`) |
| `scaled_integer_intensity.e57` | e57 crate, [`testdata/scaled_integer_intensity.e57`](https://github.com/cry-inc/e57/blob/c759b1da81184bea3db5e093e7416729cb77cd27/testdata/scaled_integer_intensity.e57) at `c759b1da8118` | MIT (the crate's `LICENSE`) |
| `integer_intensity.e57` | e57 crate, [`testdata/integer_intensity.e57`](https://github.com/cry-inc/e57/blob/c759b1da81184bea3db5e093e7416729cb77cd27/testdata/integer_intensity.e57) at `c759b1da8118` | MIT (the crate's `LICENSE`) |
| `cartesian_invalid_state_single.e57` | e57 crate, [`testdata/cartesian_invalid_state_single.e57`](https://github.com/cry-inc/e57/blob/c759b1da81184bea3db5e093e7416729cb77cd27/testdata/cartesian_invalid_state_single.e57) at `c759b1da8118` | MIT (the crate's `LICENSE`) |
| `tiny_spherical.e57` | e57 crate, [`testdata/tiny_spherical.e57`](https://github.com/cry-inc/e57/blob/c759b1da81184bea3db5e093e7416729cb77cd27/testdata/tiny_spherical.e57) at `c759b1da8118` | MIT (the crate's `LICENSE`) |
| `autzen-7.las` | The first 2,000 points of PDAL's [`test/data/las/autzen_trim_7.las`](https://github.com/PDAL/PDAL/blob/537aeeb55bc8e45864d6b5006ab8dfa195cae1d3/test/data/las/autzen_trim_7.las) at `537aeeb55bc8`, written by laspy 2.7.0 | BSD-3-Clause |
| `autzen-7.laz` | The same points, compressed by laspy 2.7.0 with lazrs 0.8.2 (laz-rs, LASzip's layered compressor) | BSD-3-Clause |

`simple.laz` and `simple.las` are LAS 1.2, point format 3, 1,065 points.
`point-time-1.4.laz` is LAS 1.4, point format 1, 1,065 points, with its coordinate
system in WKT.
`autzen-7.las` and `autzen-7.laz` are LAS 1.4, point format 7 (colours, GPS time), 2,000
points, with the source's WKT coordinate system: the layered compression modern LiDAR
archives use, written by laz-rs rather than by the decoder under test.

The E57 files are from the e57 crate's own test data, written by its generator or by
libE57Format; its reader tests say what each holds (2,090 coloured points; two points
at both ends of their intensity limits, as integers and as scaled integers; three
points, one valid, one a direction only, one invalid; a spherical scan).
