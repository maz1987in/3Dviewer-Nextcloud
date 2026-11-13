/**
 * Registers the card for 3D model links where apps render link previews.
 *
 * Its own entry, loaded by RenderReferenceListener only on pages that fire
 * RenderReferenceEvent (Talk, Text, Collectives, Files). It registers one widget and holds no
 * three.js and no viewer code, so a page showing a preview never downloads the viewer; the
 * card's button is a plain link that opens the viewer in its own tab.
 *
 * The widget goes into the registry `@nextcloud/vue` keeps on `window` for exactly this, the
 * way its own `registerWidget` does, rather than through that function: importing it from
 * `@nextcloud/vue/functions/reference` drags the whole reference picker (about 570 KB, with
 * its Vue components) into this entry, because the package's chunk for the registry is the
 * picker's. The registry is shared by every copy of the library on the page, which is why
 * Talk's and Text's own renderers find a widget registered from here, and
 * tests/unit/modelCardRegistration.test.js renders one through the real `renderWidget`.
 */

import './css/design-system.css'
import './css/reference-card.css'
import { WIDGET_ID, renderModelCard, destroyModelCard } from './reference/modelCard.js'
import { registerModelWidget } from './reference/registerWidget.js'

registerModelWidget(WIDGET_ID, renderModelCard, destroyModelCard)
