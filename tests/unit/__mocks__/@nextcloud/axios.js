export default {
	get: jest.fn(),
	post: jest.fn(),
	put: jest.fn(),
	patch: jest.fn(),
	delete: jest.fn(),
	// WebDAV verbs (PROPFIND) go through request()
	request: jest.fn(),
}
