# View links, file units, embedding, point clouds and Gaussian splats

**Status:** design agreed in conversation; awaiting approval
**Date:** 2026-10-28

## Why

The app aims to be the one viewer everyday Nextcloud users need for 3D files, whoever they are. Five gaps remain:

1. **View links:** there is no way to send someone *this* view of a model. Bookmarks (`useBookmarks`) live in one browser's `localStorage`.
2. **File units:** STL, OBJ, PLY, OFF and 3DS files don't record a unit. Print check assumes millimetres (`assumesMm`), so a model drawn in inches comes out 25.4× too small, and nobody can say otherwise.
3. **Embedding:** a public 3D share can't be shown inside another website, such as a shop page or a blog.
4. **Point clouds:** scans from laser scanners, drones and phones (LAS/LAZ, E57, PCD, XYZ) don't open at all.
5. **Gaussian splats:** the photo-real captures that phone apps now produce (`.splat`, `.spz`, splat `.ply`) don't open at all.

Point clouds and splats serve two groups equally: surveyors and architects with LiDAR or drone exports, and people capturing objects and rooms with phone apps.

## Goals

- Nothing here slows opening an ordinary model. New loaders and renderers load only when a file needs them; the bundle budgets (`scripts/check-bundle-size.mjs`) hold for the main entry.
- Every new control works from the keyboard and is announced to screen readers, to the tools panel's standard (#234), and every string goes through `t('threedviewer', …)`.
- Nextcloud 31–35, the range the app supports today.
- Every route that changes data checks Nextcloud's request token (#235) and the user's permission on the file, as the notes routes do (`NoteAccess`).

## Non-goals

- Turning scans into meshes, or cleaning, cropping or editing points.
- Streaming multi-gigabyte survey datasets (server-side tiling, octrees such as Potree or 3D Tiles).
- Converting a scan or a splat to STL or any other mesh format.
- Georeferencing: showing coordinates in a map projection, or placing a scan on a map. Reading only the length unit from a scan's coordinate system is in scope (section 2).
- Comparing scans: Compare and version comparison stay off for point clouds and splats. Comparing scans may come later as its own feature.
- Embedding on any site the admin hasn't listed.
- Storing views on the server.

## Anti-goals

- A view link or an embed revealing that a file exists to someone who can't see it.
- Embedding weakening the security of any page other than the embed page itself. Nextcloud's own pages must keep refusing to be framed.
- A file's unit setting changing the file.
- A scan or splat freezing the tab. Parsing runs off the main thread and can be cancelled.

## Decisions

| Question | Decision | Whose |
|---|---|---|
| Who view links are for | Colleagues on this Nextcloud **and** visitors of a public share | User |
| What a view link restores | Camera, shading and lighting, cross-section, exploded view, a highlighted annotation | User |
| Who a unit setting applies to | That file, for everyone who can see it; only people who can edit the file can change it | User |
| Which sites may embed | Only sites the Nextcloud admin lists; off until then | User |
| Who point clouds and splats are for | Surveyors and architects, and phone-capture users, equally | User |
| Largest scan that opens smoothly | About 200 MB, loaded whole in the browser; bigger files open thinned, with a note | User |
| Compare for scans | Not now: off for point clouds and splats, with a note | User |
| Build order | View links, units, embedding, point clouds, splats; one PR each | My call |

## 1. View links

### Behaviour

- **"Copy link to this view"** in the tools panel, with a keyboard shortcut, and on each bookmark. It copies a link and shows a toast.
- The link reopens the file as the sender saw it: camera position, target and projection; shading (Standard, Clay, Normals, X-ray), wireframe and lighting preset; the cross-section's plane or box; the exploded view's amount; and, if one was selected, an annotation with its note showing. For a point cloud it also restores the point size and the colour-by choice.
- **Logged in:** the link is the viewer's file route (`/apps/threedviewer/f/{fileId}`) with the view added. It must survive Nextcloud's login redirect. Nextcloud's normal access rules decide whether the recipient can open the file; someone who can't gets Nextcloud's ordinary "not found", nothing that hints the file exists.
- **Public share page:** the link is the share link with the view added, so anyone with the share sees the view. On a folder share it opens the same file.
- Opening a view link never changes the recipient's own preferences (default shading, lighting and so on). The view is applied once, on top of them.
- If the file has changed since the link was made, the link still opens and applies what still makes sense. A deleted annotation is skipped. A camera that no longer frames anything falls back to the usual framing.

### Constraints

- The view is written into the link itself. Nothing is stored on the server, and the link shares nothing the recipient can't already open.
- The encoding carries a version number, so links made today keep opening after the format changes.
- Links stay short enough to paste in chat and email (well under 2,000 characters). Numbers are rounded to what the eye can see.
- A malformed or hand-edited view is ignored, never an error, and can't run code or reach outside the viewer: every value is validated and clamped.

## 2. File units

### Behaviour

- A file that doesn't record a unit (STL, OBJ, PLY, OFF, 3DS, an FBX without a unit scale, and point clouds without one) shows a **Units** control in the model statistics and in the Print check card: mm, cm, m, inches, feet and US survey feet. Feet are there for US survey and LiDAR data, which is very often in feet.
- The default stays what it is today: millimetres for meshes, as slicers assume. Point clouds default to metres, the unit scanners write in.
- A LAS, LAZ or E57 file whose coordinate system names a length unit (metres, feet, US survey feet) records a unit: it's read from the file, shown, and can't be changed. Only the unit is read from the coordinate system, nothing else.
- Choosing a unit saves it with the file for everyone who can see it. Only people who can edit the file can change it; everyone else sees it read-only, including on public links.
- The unit rescales numbers, never the model and never the file: statistics, measurement, Print check's fit, overhang and filament, and what Send to Slicer sends (a slicer reads an STL as millimetres, so a model in inches is scaled to millimetres on the way out).
- Files that record a unit (3MF, glTF, STEP, IGES, IFC, 3DM, AMF, DAE, X3D) show it, and it can't be changed.
- This is the file's *source* unit. The measurement tool's own unit menu (`VIEWER_CONFIG.measurement.unitScales`) stays the unit numbers are *shown* in.

### Server

- Stored per file ID, readable by anyone who can read the file (and by a public share's visitors for that file) and writable by users with update permission. The notes code (`NotesService`, `NoteAccess`, `PublicNotesController`) is the model to follow, including cleanup when the file is deleted (`CleanupOrphanNotes`).
- It follows the file through renames and moves, as notes do.

## 3. Embedding

### Behaviour

- **Admin setting:** a new admin settings section lists the sites allowed to embed, as origins (`https://myshop.com`). Empty means embedding is off, which is the default. Only `https` origins are accepted, except `localhost` for testing.
- **Embed code:** once at least one site is listed, **"Copy embed code"** appears in the viewer's tools panel, beside "Copy link to this view", for users who can manage a link share of the file (the shares Nextcloud's sharing API returns to them). It copies a ready-to-paste `<iframe>` snippet with a size and optionally the current view.
  - With one eligible share, that share is used. With several, the user picks one, listed by its label and creation date.
  - With none, it says the file needs a public link without a password and points to Nextcloud's Sharing sidebar. The app never creates shares itself.
- **Eligible shares:** a link share of a single supported file, readable, not expired, and not password-protected (a password prompt can't work inside someone else's page). Other shares don't offer the code, and the embed page refuses them.
- **The embedded viewer** is pared down: the model, orbit and zoom, a full-screen button and a small "Open in Nextcloud" link to the share. There's no tools panel, file browser or notes panel. Download is offered only if the share allows downloads. A view in the embed code is applied as in a view link. Multi-file models (OBJ with MTL and textures, glTF with `.bin`) load in the embed exactly as they do on the share page today.
- **Gone shares:** an expired, deleted or no-longer-eligible share shows a plain "This model is no longer shared" in the frame.

### Server and security

- A new public route in this app serves the embed page by share token. Only that response carries a `Content-Security-Policy` with `frame-ancestors` set to the listed origins. Every other page in Nextcloud keeps refusing to be framed. The app must not widen the policy through `AddContentSecurityPolicyEvent`, which applies everywhere.
- Inside a third-party frame the browser sends no Nextcloud cookies. The embed page and every endpoint it calls (the public file, dependency and notes routes) must work without a session or same-site cookie, which Nextcloud otherwise insists on (`#[NoSameSiteCookieRequired]` and friends).
- Many installs set `X-Frame-Options: SAMEORIGIN` in the web server. Browsers ignore it when `frame-ancestors` is present, but the builder must confirm this on Nextcloud's Apache image and on nginx, and the admin section must say what to change if a setup still blocks it.
- Share tokens are checked and throttled as `PublicFileController` does.

## 4. Point clouds

### Formats

- **LAS** 1.2–1.4 and **LAZ** (compressed LAS), **E57**, **PCD** (ASCII, binary and binary-compressed), **XYZ** (text: x y z, optionally r g b or intensity).
- A **PLY** with vertices and no faces opens as a point cloud.
- `.xyz` is also a chemistry format (an atom count, a comment line, then element symbols and coordinates). Those files must not be mistaken for scans; they are left alone, as they are today.
- New extensions are registered as MIME types the way `RegisterThreeDMimeTypes` and `SupportedFormats` do today.
- **E57 risk:** there may be no maintained JavaScript reader. If one has to be written and that proves out of proportion, E57 is the format to defer, and the builder says so rather than dropping it silently.

### Behaviour

- Files up to about **200 MB** load whole. Bigger files open thinned to a point budget, read so that memory stays bounded, with a note such as "Showing 1 in 4 points". Past a hard ceiling, the file is refused with a message saying why.
- **Colour by:** the file's own colours, height, intensity, or classification (ground, buildings, vegetation, using the standard LAS classes) when the file records it, and a single colour. The default is the file's colours when it has them, otherwise height.
- **Point size** slider.
- Files up to about 200 MB load whole on a desktop. Phones and tablets get a smaller point budget, based on the device, through the same thinning path and with the same note.
- **Measurement** snaps to points. **Cross-section** works. **Model statistics** show the point count, the extent (in the file's unit, see section 2) and which attributes the file has.
- **Print check is off** for point clouds, with a note saying why: a scan has no closed surface to check.
- **Transform** works. **Exploded view**, the **shading modes** (Clay, Normals, X-ray) and **wireframe** are off, with a note: colour-by takes the shading modes' place. **Compare** and **version comparison** are off, with a note (not now, by decision).
- **Which way is up:** set as for splats (section 5). LAS, LAZ and E57 default to Z up; other formats to Y up.
- **Exports stay mesh-only:** export is unavailable for point clouds, with a note. Snapshots, turntable videos, bookmarks, view links, embedding, public links and thumbnails all work. AR works where the existing WebXR path can show points.
- Survey files often use very large coordinates (UTM values in the millions). The cloud is re-centred in double precision before it becomes 32-bit GPU data, so it doesn't shimmer or snap into bands.
- Thumbnails come from the background thumbnailer within its existing size and time limits (2026-10-26 design), thinned.

## 5. Gaussian splats

### Formats

- **`.splat`**, **`.spz`** and **splat `.ply`**. A PLY is a splat when its header has the splat properties (`f_dc_0`, `scale_0`, `rot_0`, `opacity`); otherwise it stays a mesh or a point cloud.

### Behaviour

- A splat opens as the photo-real capture it is, with the same 200 MB guidance and thinning note as point clouds.
- **For looking at:** measurement, cross-section, Print check, transform, exploded view, shading modes, wireframe, comparison and version comparison are unavailable for a splat, each with a note saying why: a splat has no real surface.
- **What works:** orbit and zoom, bookmarks, view links, snapshots, turntable videos, thumbnails, public links and embedding. AR is off for splats.
- **Which way is up:** captures often come out upside down or on their side, depending on the app that made them. A **Which way is up** control offers +Y, −Y, +Z and −Z up. The choice turns the model for viewing and is saved with the file for everyone, like the unit, under the same permissions. It applies to point clouds too (section 4). Splats default to Y up.
- **Model statistics** show the splat count and extent.

### Constraints

- The renderer is a three.js-compatible splat library loaded only when a splat opens. Its licence must be compatible with AGPL-3.0.
- Splats are sorted by depth every frame, off the main thread. The turntable recorder renders each frame explicitly, so the sort must be finished for the frame being recorded, not lag a frame behind.
- A splat has a memory budget on phones; above it, it's thinned like a point cloud, with the same note.

## Left to the builder

- How a view is encoded in the link, within the constraints above.
- Where the unit and the up direction are stored: one table for both, or separate ones.
- The point budget, the hard ceiling and how thinning reads a file.
- Which libraries parse LAS/LAZ, E57 and PCD and render splats, within the licence and bundle constraints.
- The keyboard shortcut for "Copy link to this view", provided it doesn't clash with the existing shortcuts or Help's `?`.

## My calls, for review

- Build order and one PR per feature.
- Point clouds default to metres; meshes keep millimetres.
- Send to Slicer scales a model in inches or centimetres to millimetres.
- Embed code lives in the viewer's tools panel, not in Nextcloud's sharing sidebar.
- Embedding allows only single-file link shares, and only `https` origins (plus `localhost`).
- Print check and export are off for point clouds; AR is off for splats.
- Feet and US survey feet on the unit list; LAS, LAZ and E57 use the unit their coordinate system names.
- "Which way is up" (+Y, −Y, +Z, −Z) for splats and point clouds, saved with the file, rather than auto-detection.
- Point clouds: transform on; exploded view, shading modes and wireframe off; a smaller point budget on phones and tablets.
- Copy embed code is for users who can manage a link share. With several shares they pick one, and with none the app points to Nextcloud's Sharing sidebar rather than creating a share.
- View links also restore a point cloud's point size and colour-by choice.
- Multi-file models embed the way the share page loads them today.
- `.xyz` chemistry files are left alone.
