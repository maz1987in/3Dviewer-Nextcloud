import { createApp } from 'vue'
import { translate, translatePlural } from '@nextcloud/l10n'
import AdminSettings from './views/AdminSettings.vue'
import './css/design-system.css'

const app = createApp(AdminSettings)
app.config.globalProperties.t = translate
app.config.globalProperties.n = translatePlural
app.mount('#threedviewer-admin-settings')
