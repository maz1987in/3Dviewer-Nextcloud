// Entry point for Nextcloud Viewer API integration
// This file is specifically for modal/embedded viewer functionality

import Vue from 'vue'
import { initViewerAPI } from './viewer-api.js'

// Initialize the viewer API integration

// Wait for DOM to be ready and initialize
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => {
		setTimeout(() => {
			initViewerAPI()
		}, 500)
	})
} else {
	setTimeout(() => {
		initViewerAPI()
	}, 500)
}

// Export for manual initialization if needed
export { initViewerAPI }

// Make Vue available globally for Viewer API components
if (typeof window !== 'undefined') {
	window.Vue = Vue
}
