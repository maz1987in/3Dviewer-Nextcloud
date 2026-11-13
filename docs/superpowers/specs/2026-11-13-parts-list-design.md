# Parts list

**Status:** built on autopilot; decisions recorded here, no review conversation
**Date:** 2026-11-13

## Why

The app opens assembly formats (STEP, IGES, BREP, FreeCAD, 3MF, IFC, glTF, FBX, Rhino 3DM) but has no way to work with the individual parts of one. Exploded view moves every part at once. People who open a CAD assembly or a building expect a part tree first: see what is in it, hide the cover to see inside, look at one part alone, find the part they are pointing at.

## Goals

- A **Parts** section in the tools panel with a tree of the model's parts. Each part can be chosen, hidden and shown, isolated (shown alone) and zoomed to.
- Choosing works both ways: a part chosen in the list is tinted in the model, and a part clicked in the model is chosen in the list.
- For IFC files, choosing an element shows its type, storey and property sets and quantities.
- Big models cost nothing until used. A building with thousands of elements opens as fast as a bracket, and the panel code is not downloaded until the section is opened.
- The standard of the tools panel (#234): every control works from the keyboard and says its name and state. Every string is translatable, and the layout works in RTL and on a phone.

## Non-goals

- Editing: renaming, deleting, re-parenting or moving parts, or changing their colours.
- Selecting several parts at once.
- Part properties for formats other than IFC. glTF extras, STEP product data and FreeCAD properties may come later; the panel has a place for them.
- Saving which parts are hidden, with the file or in a bookmark (see "Follow-ups").

## Anti-goals

- Highlighting that changes the model's materials, so it can fight a render mode, the cross-section or the export.
- A hidden part leaking into a file someone downloads or a thumbnail everyone sees.
- A list that builds a DOM row, or reads a property, for every node of the model.

## Decisions

| Question | Decision |
|---|---|
| Where the tree comes from | The loaded scene graph as it is. Nothing is added to the model; no loader needs to know about the panel; an IFC's elements are named from its file when the list is first shown (below). |
| What a row is | A node and the chain of single-child nodes below it, as one row ("Assembly › Bolt"). A model wrapped in one-child groups starts at the first node with a choice. Lights, cameras and empty groups are not parts. |
| Names | The node's own name when it tells parts apart. Otherwise "Mesh 3" or "Group 2" (kind, and place among its siblings), with the mesh's material name beside it when it has one. Generic names loaders make up (`Mesh_3`, `mesh_3_instance_0`, `Object3D`, `Scene`) count as no name. |
| Hiding | Sets `visible` on the part's node, recorded in `utils/viewerHidden.js` with the G-code layer slider's hidden layers. Render modes change materials and Exploded view changes positions, so neither touches it. A part the file itself hides (FreeCAD stores which bodies were hidden) is restored as the file had it by Show all. |
| A part under a hidden group | Shown dimmed, and its own Show is off: showing it would mean showing the group and everything else in it. |
| Isolate | Hides everything beside the part and beside the groups it is inside; a second press puts back what was showing before, including parts the user had hidden. Isolating another part moves it. |
| Show all | Restores every part the panel changed, and ends an isolation. It is the panel's "Reset". Reset View is the camera's and is not changed; Zoom to does not move the place Reset View goes back to. |
| Highlight | A translucent accent-coloured copy of each mesh of the part, sharing its geometry, in the scene beside the model (not under it). It follows its mesh by copying the mesh's world matrix as it is drawn, so Exploded view and animations carry it along, and a render mode swapping the mesh's material cannot touch it. It is marked `userData.tdvHelper`, so measurement, annotations and sizing skip it. Up to 400 meshes are tinted; skinned and instanced meshes are not tinted (the row and Zoom to still work). |
| Picking | `raycastObject` in `modelScaleUtils.js`, which shares its ray casting with `raycastIntersection` (measurement, annotation). It now skips a mesh with a hidden ancestor, which also stops measurement landing on a part the panel hid. A click chooses a part only while the Parts list is on screen and no tool (measurement, annotation, transform, comparison) is using clicks, and not after a drag. A click on nothing chooses nothing. |
| Exports and thumbnails | Every part, whatever is hidden. STL and OBJ already show viewer-hidden parts (`withExportState`); GLB, PLY, 3MF and USDZ are written asynchronously, so the viewer shows everything for the export and hides it again after (`suspend`/`resume`, counted like Exploded view's). Hiding parts to export a sub-assembly is a different feature. |
| Statistics, Print check, Fit to View | Unchanged: they read the whole model. A hidden part still counts. |
| Which other tools respect hidden parts | Render modes and Exploded view (they leave `visible` alone), measurement and annotation picking (they skip hidden parts), the cross-section (it clips what is drawn). Comparison hides the whole model's root, which the panel never touches. |
| Point clouds and splats | No parts. The Parts row stays in place, `aria-disabled`, described by a line saying why (`tdv-unavailable-parts`), as the other tools they cannot use are. G-code has its layer slider and gets no Parts section. |
| The tree's size | Records are made as rows are opened; the number of parts under each node is counted once in a single pass; the list draws only the rows in view (fixed row height, absolute positioning). A filter lists matching names from anywhere in the tree as a flat list, with where each is, up to 300. |
| Keyboard | The WAI-ARIA tree pattern with one tab stop and `aria-activedescendant`: Up, Down, Home, End, PageUp and PageDown move; Right and Left open, close and go in and out; Enter and Space choose; H, I and Z hide, isolate and zoom. Moving does not choose, so arrowing through a thousand rows does not tint, zoom or read properties for each. The same actions are buttons under the list (Hide/Show, Isolate with `aria-pressed`, Zoom to, Show all), which is what a screen reader's own commands reach. The eye in each row is for a pointer. |
| Lazy loading | `PartsTree.vue`, `usePartsTree.js` and the IFC properties reader are three chunks, loaded when the section is first opened; the App chunk holds the section's slot, the click and export hooks and two icons. |
| App bundle budget | Raw raised from 397000 to 399000 bytes (2.8 KB raw, 0.8 KB gzip came in). The gzip budget holds. |

## IFC

- **Loader.** Unchanged in what it reads: geometry, one mesh per (element x geometry), each carrying its express ID in `userData.ifc`. Naming elements at load was tried first (one `GetLine` per element, plus the spatial relations) and measured on generated models of 2,000 to 30,000 walls, each with its own geometry, in Node with web-ifc: it added 11 ms (56%) at 2,000 elements, 50 ms (58%) at 10,000 and 121 ms (47%) at 30,000 to streaming the meshes, of which naming alone was 9, 39 and 112 ms. The percentage is large because the generated geometry is simple; a real model's meshes cost more, and so the share is smaller, but the cost would be paid by every IFC user on every open, whether or not they open Parts. So it is not in the load path.
- **Naming and grouping, when the list is first shown.** `usePartsTree` opens the model's own source file with `loaders/ifcProperties.js` and asks it to `describe` the elements the model drew: name, type and global ID per element, and the storey, building or space that contains each (a handful of relation lines). `loaders/ifcStructure.js` then names the meshes and puts each element under its container, in groups that carry no transform. The list shows "Reading the model's elements…" meanwhile, and no state exists to lose. Measured the same way, this costs 4 + 11 ms at 2,000 elements, 18 + 36 ms at 10,000 and 53 + 105 ms at 30,000 (opening the file, then naming), paid only by someone who opens Parts on an IFC. If the file cannot be read, the elements are listed by their express IDs.
- **Properties.** Read only when an element is chosen, by the same reader, which stays open while the model is shown (its memory is the file's, which only Parts users on an IFC pay) and is freed when another model opens. A chosen element shows "Reading properties…", then its sets, or says it has none, or that they could not be read.
- **Rejected:** naming per row as it renders (the same file open, and rows that change name as they scroll into view, which breaks the filter and the storey grouping); grouping at load.
- web-ifc 0.0.78's `getPropertySets(…, includeTypes)` returns only the type's sets when `includeTypes` is true, and throws for a type with none; the reader calls it twice and ignores the throw.

## Follow-ups

- **Hidden and isolated parts in view links and bookmarks.** Not done. A part's identity would be its path of child indices from the model's root, which is stable for the same file and version but not across versions, and a link for an isolated part in a building would list thousands of hidden siblings. It needs a compact form (the shown set, or the isolated part, rather than the hidden list) and a decision on public links, whose light viewer has no panel. Bookmarks keep only the camera, as today.
- Properties for other formats (glTF `extras`, STEP and FreeCAD product data).
- Choosing several parts, and a hidden-parts-excluded export.
- Hiding by IFC type or storey (an IFC "layer" filter) and a tint of the whole storey.
