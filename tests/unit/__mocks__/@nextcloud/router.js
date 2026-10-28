export function generateUrl(url, params = {}) {
	return '/index.php' + url.replace(/{(\w+)}/g, (_, k) => params[k])
}

export function generateOcsUrl(url, params = {}) {
	return '/ocs/v2.php/' + url.replace(/{(\w+)}/g, (_, k) => params[k])
}

export function generateRemoteUrl(service) {
	return '/remote.php/' + service
}

export function imagePath(app, p) {
	return `/apps/${app}/img/${p}`
}

// This manual mock applies to every test, not only the ones that ask for it. The asset
// paths of the WASM and decoder runtimes depend on the app's real web root (#188), and
// the tests for them set `_oc_appswebroots`, so this one is the real implementation.
export function generateFilePath(app, type, file) {
	return jest.requireActual('@nextcloud/router').generateFilePath(app, type, file)
}
