import { createApp } from 'vue'
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate, translatePlural } from '@nextcloud/l10n'
import AdminSettings from './views/AdminSettings.vue'
import './css/design-system.css'

const app = createApp(AdminSettings)
app.config.globalProperties.t = translate
app.config.globalProperties.n = translatePlural
app.mount('#threedviewer-admin-settings')
