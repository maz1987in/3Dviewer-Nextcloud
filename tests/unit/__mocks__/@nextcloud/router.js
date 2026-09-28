export function generateUrl(url, params = {}) {
	return '/index.php' + url.replace(/{(\w+)}/g, (_, k) => params[k])
}

export function generateOcsUrl(url, params = {}) {
	return '/ocs/v2.php/' + url.replace(/{(\w+)}/g, (_, k) => params[k])
}

export function imagePath(app, p) {
	return `/apps/${app}/img/${p}`
}
