const path = require('path')
const { createAppConfig } = require('@nextcloud/vite-config')

module.exports = createAppConfig(
	{
		main: path.resolve('src/main.js'),
		files: path.resolve('src/files.js'),
		viewer: path.resolve('src/viewer-entry.js'),
	},
	{
		createEmptyCSSEntryPoints: true,
		extractLicenseInformation: true,
		thirdPartyLicense: false,
		mode: 'development',
		build: {
			target: 'es2022',
			esbuild: {
				target: 'es2022'
			},
			minify: false,
			sourcemap: true
		},
		server: {
			port: 3000,
			host: 'localhost',
			hmr: true
		}
	}
)
