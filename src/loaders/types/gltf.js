import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { BaseLoader } from '../BaseLoader.js'

/**
 * GLTF/GLB loader class
 */
class GltfLoader extends BaseLoader {

	constructor() {
		super('GLTFLoader', ['glb', 'gltf'])
		this.loader = null
	}

	/**
	 * Load GLTF/GLB model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {object} context - Loading context
	 * @return {Promise<object>} Load result
	 */
	async loadModel(arrayBuffer, context) {
		const { renderer, hasDraco, hasKtx2, hasMeshopt, additionalFiles } = context

		// Detect if we're in modal viewer context (CSP restrictions)
		// Check if we're in an iframe or if blob: URLs are likely to be blocked
		const isModalContext = this.detectModalContext()

		// Patch texture loading to handle CSP restrictions in modal context
		// Must be done BEFORE creating the GLTFLoader
		let textureLoaderPatch = null
		if (isModalContext) {
			textureLoaderPatch = await this.patchTextureLoaderForCSP()
			this.logInfo('GLTFLoader', 'Modal context detected - texture loader patched for CSP compatibility')
		}

		// Create loader (after patching)
		this.loader = new GLTFLoader()

		// Configure decoders
		await this.configureDecoders(renderer, hasDraco, hasKtx2, hasMeshopt)

		// Set up resource manager for multi-file loading
		if (additionalFiles && additionalFiles.length > 0) {
			await this.setupResourceManager(additionalFiles, isModalContext)
		}

		try {
			// Parse the model (pass extension for format detection)
			const extension = context.fileExtension || 'gltf'
			const gltf = await this.parseModel(arrayBuffer, extension)

			// Process the result
			const result = this.processModel(gltf.scene, context)

			// Add animations if available
			if (gltf.animations && gltf.animations.length > 0) {
				result.animations = gltf.animations
				this.logInfo('GLTF animations extracted', {
					count: gltf.animations.length,
					names: gltf.animations.map(clip => clip.name || 'unnamed'),
				})
			}

			return result
		} finally {
			// Restore original texture loader if we patched it
			if (textureLoaderPatch && textureLoaderPatch.restore) {
				textureLoaderPatch.restore()
			}
		}
	}

	/**
	 * Detect if we're in modal viewer context (where CSP might block blob URLs)
	 * @return {boolean} True if in modal context
	 */
	detectModalContext() {
		// Always log detection attempt for debugging
		this.logInfo('GLTFLoader', 'Checking for modal context...', {
			isIframe: window.self !== window.top,
			hasWrapper: !!document.querySelector('.threedviewer-wrapper'),
			hasAppRoot: !!document.getElementById('threedviewer'),
			appRootHasFileId: !!(document.getElementById('threedviewer')?.dataset?.fileId),
			hasViewerModal: !!document.querySelector('.viewer-modal'),
			locationHref: window.location.href,
		})

		// Check if we're in an iframe (modal viewer is typically in an iframe)
		if (window.self !== window.top) {
			this.logInfo('GLTFLoader', 'Modal context detected: iframe detected')
			return true
		}

		// Check if ViewerComponent is present (modal viewer uses ViewerComponent)
		// ViewerComponent creates .threedviewer-wrapper but NOT #threedviewer
		// Standalone App.vue creates #threedviewer with data-fileId
		const hasWrapper = document.querySelector('.threedviewer-wrapper')
		const appRoot = document.getElementById('threedviewer')
		const hasViewerModal = document.querySelector('.viewer-modal')

		// Also check if we're in Nextcloud's viewer (URL contains /apps/files/files/)
		const isNextcloudViewer = window.location.href.includes('/apps/files/files/')

		if (hasWrapper && (!appRoot || !appRoot.dataset?.fileId)) {
			this.logInfo('GLTFLoader', 'Modal context detected: ViewerComponent present without standalone app root')
			return true
		}

		if (hasViewerModal) {
			this.logInfo('GLTFLoader', 'Modal context detected: viewer-modal element found')
			return true
		}

		if (isNextcloudViewer) {
			this.logInfo('GLTFLoader', 'Modal context detected: Nextcloud viewer URL detected')
			return true
		}

		this.logInfo('GLTFLoader', 'Standalone context detected - CSP patch not needed')
		return false
	}

	/**
	 * Patch FileLoader to handle blob URLs that may be blocked by CSP
	 * GLTFLoader uses FileLoader internally, so we need to patch FileLoader
	 * The key insight: We need to intercept blob URLs BEFORE they're used,
	 * but since CSP blocks fetch/XHR to blob URLs, we need a different approach.
	 * Solution: Patch URL.createObjectURL to track blobs and their URLs,
	 * then when FileLoader tries to load a blob URL, we can get the original blob
	 * and convert it to a data URI.
	 * @return {object} Patch object with restore method
	 */
	async patchTextureLoaderForCSP() {
		this.logInfo('GLTFLoader', 'Modal viewer detected - patching texture loader to convert blob URLs to data URIs')

		// Store original methods and blob tracking
		const patches = {
			originalFileLoaderLoad: null,
			originalCreateObjectURL: null,
			originalFetch: null,
			originalXHROpen: null,
			originalXHRSend: null,
			originalImageSrcSetter: null,
			blobUrlMap: new Map(), // Map blob URLs to their original blobs
			dataURICache: new Map(), // Map blob URLs to their data URIs (for synchronous access)
		}

		// Patch URL.createObjectURL to track blob-to-URL mappings
		// Note: We can't make this async, so we'll track and convert later when the URL is used
		if (typeof URL !== 'undefined' && URL.createObjectURL) {
			patches.originalCreateObjectURL = URL.createObjectURL
			const self = this

			URL.createObjectURL = function(blob) {
				const url = patches.originalCreateObjectURL.call(URL, blob)
				// Store mapping so we can retrieve the blob later
				patches.blobUrlMap.set(url, blob)
				const isImage = blob.type && blob.type.startsWith('image/')
				self.logInfo('GLTFLoader', 'Tracking blob URL creation', {
					url: url.substring(0, 50),
					blobType: blob.type,
					blobSize: blob.size,
					isImage,
				})

				// Pre-convert blob to data URI asynchronously for synchronous access later
				// This allows Image.src setter to work synchronously
				if (isImage) {
					self.blobToDataURI(blob).then((dataURI) => {
						patches.dataURICache.set(url, dataURI)
						self.logInfo('GLTFLoader', 'Pre-cached data URI for blob URL', {
							url: url.substring(0, 50),
							dataURILength: dataURI.length,
						})
					}).catch((error) => {
						self.logWarning('GLTFLoader', 'Failed to pre-cache data URI for blob URL', {
							url: url.substring(0, 50),
							error: error.message,
						})
					})
				}

				return url
			}
		}

		// Patch Image.prototype.src setter to intercept blob URLs
		// THREE.js GLTFLoader uses Image objects directly for texture loading
		// This is the most critical patch for CSP compliance
		if (typeof Image !== 'undefined' && Image.prototype) {
			const self = this
			const imageSrcDescriptor = Object.getOwnPropertyDescriptor(Image.prototype, 'src')
			                           || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Image.prototype), 'src')

			if (imageSrcDescriptor && imageSrcDescriptor.set) {
				patches.originalImageSrcSetter = imageSrcDescriptor.set

				Object.defineProperty(Image.prototype, 'src', {
					set(value) {
						if (typeof value === 'string' && value.startsWith('blob:')) {
							self.logInfo('GLTFLoader', 'Intercepting blob URL in Image.src setter', { url: value.substring(0, 50) })

							// Check if we have a cached data URI (for synchronous access)
							const cachedDataURI = patches.dataURICache.get(value)
							if (cachedDataURI) {
								// Use cached data URI synchronously - this maintains THREE.js's expected behavior
								self.logInfo('GLTFLoader', 'Using cached data URI for Image.src (synchronous)', {
									url: value.substring(0, 50),
									dataURILength: cachedDataURI.length,
								})
								patches.originalImageSrcSetter.call(this, cachedDataURI)
								return
							}

							// If not cached, try to convert asynchronously (fallback for edge cases)
							const originalBlob = patches.blobUrlMap.get(value)
							if (originalBlob) {
								// Convert blob to data URI asynchronously
								self.blobToDataURI(originalBlob).then((dataURI) => {
									// Cache it for future use
									patches.dataURICache.set(value, dataURI)
									self.logInfo('GLTFLoader', 'Converted blob URL to data URI for Image.src (async fallback)', {
										url: value.substring(0, 50),
										dataURILength: dataURI.length,
									})
									// Set the data URI instead
									patches.originalImageSrcSetter.call(this, dataURI)
								}).catch((error) => {
									self.logWarning('GLTFLoader', 'Failed to convert blob to data URI for Image.src', {
										url: value.substring(0, 50),
										error: error.message,
									})
									// Don't set the blob URL as it will be blocked by CSP
									patches.originalImageSrcSetter.call(this, '')
									if (this.onerror) {
										this.onerror(new Error('Failed to convert blob URL - CSP violation prevented'))
									}
								})
								return
							} else {
								self.logWarning('GLTFLoader', 'Blob not found in tracking map for Image.src - cannot convert, will not set blob URL to prevent CSP violation', { url: value.substring(0, 50) })
								// Don't set the blob URL as it will be blocked by CSP
								// Set an empty src or trigger an error to indicate failure
								patches.originalImageSrcSetter.call(this, '')
								// Trigger error event to notify the loader
								if (this.onerror) {
									this.onerror(new Error('Blob URL not tracked - CSP violation prevented'))
								}
								return
							}
						}
						// For non-blob URLs, use original setter
						patches.originalImageSrcSetter.call(this, value)
					},
					get: imageSrcDescriptor.get || function() {
						return this._src || ''
					},
					configurable: true,
					enumerable: true,
				})
			} else {
				// Fallback: patch using __defineSetter__ if available
				if (Image.prototype.__defineSetter__) {
					const originalSrc = Image.prototype.src
					patches.originalImageSrcSetter = function(value) {
						originalSrc = value
					}

					Image.prototype.__defineSetter__('src', function(value) {
						if (typeof value === 'string' && value.startsWith('blob:')) {
							self.logInfo('GLTFLoader', 'Intercepting blob URL in Image.src (fallback)', { url: value.substring(0, 50) })

							// Check if we have a cached data URI (for synchronous access)
							const cachedDataURI = patches.dataURICache.get(value)
							if (cachedDataURI) {
								// Use cached data URI synchronously
								self.logInfo('GLTFLoader', 'Using cached data URI for Image.src (fallback, synchronous)', {
									url: value.substring(0, 50),
									dataURILength: cachedDataURI.length,
								})
								this._src = cachedDataURI
								return
							}

							// If not cached, try to convert asynchronously (fallback for edge cases)
							const originalBlob = patches.blobUrlMap.get(value)
							if (originalBlob) {
								self.blobToDataURI(originalBlob).then((dataURI) => {
									// Cache it for future use
									patches.dataURICache.set(value, dataURI)
									self.logInfo('GLTFLoader', 'Converted blob URL to data URI for Image.src (fallback, async)', {
										url: value.substring(0, 50),
										dataURILength: dataURI.length,
									})
									this._src = dataURI
								}).catch((error) => {
									self.logWarning('GLTFLoader', 'Failed to convert blob to data URI for Image.src (fallback)', {
										url: value.substring(0, 50),
										error: error.message,
									})
									// Don't set the blob URL as it will be blocked by CSP
									this._src = ''
									if (this.onerror) {
										this.onerror(new Error('Failed to convert blob URL - CSP violation prevented'))
									}
								})
								return
							} else {
								self.logWarning('GLTFLoader', 'Blob not found in tracking map for Image.src (fallback) - cannot convert, will not set blob URL', { url: value.substring(0, 50) })
								// Don't set the blob URL as it will be blocked by CSP
								this._src = ''
								if (this.onerror) {
									this.onerror(new Error('Blob URL not tracked - CSP violation prevented'))
								}
								return
							}
						}
						this._src = value
					})

					Image.prototype.__defineGetter__('src', function() {
						return this._src || ''
					})
				} else {
					this.logWarning('GLTFLoader', 'Cannot patch Image.prototype.src - property descriptor not available')
				}
			}
		}

		// Also patch fetch and XHR to intercept blob URLs at a lower level
		// This catches cases where THREE.js uses fetch/XHR directly
		if (typeof fetch !== 'undefined') {
			patches.originalFetch = window.fetch
			const self = this

			window.fetch = async function(input, init) {
				const url = typeof input === 'string' ? input : (input?.url || '')

				// Handle blob URLs
				if (typeof url === 'string' && url.startsWith('blob:')) {
					self.logInfo('GLTFLoader', 'Intercepting blob URL in fetch', { url: url.substring(0, 50) })

					const originalBlob = patches.blobUrlMap.get(url)
					if (originalBlob) {
						// Convert blob to data URI and return as Response
						return self.blobToDataURI(originalBlob).then((dataURI) => {
							const { buffer, type } = self.dataURIToArrayBuffer(dataURI)
							return new Response(buffer, {
								status: 200,
								statusText: 'OK',
								headers: {
									'Content-Type': type || originalBlob.type || 'application/octet-stream',
								},
							})
						}).catch((error) => {
							self.logWarning('GLTFLoader', 'Failed to convert blob to data URI in fetch', {
								url: url.substring(0, 50),
								error: error.message,
							})
							// Return error response instead of falling through to original fetch
							return Promise.reject(new Error('Failed to convert blob URL - CSP violation prevented'))
						})
					} else {
						self.logWarning('GLTFLoader', 'Blob not found in tracking map for fetch - cannot convert, will not fetch to prevent CSP violation', { url: url.substring(0, 50) })
						// Return rejected promise instead of falling through to original fetch
						return Promise.reject(new Error('Blob URL not tracked - CSP violation prevented'))
					}
				}

				// Handle data URIs - CSP blocks fetch() on data URIs, so we need to decode them manually
				if (typeof url === 'string' && url.startsWith('data:')) {
					self.logInfo('GLTFLoader', 'Intercepting data URI in fetch (CSP workaround)', { url: url.substring(0, 50) })

					try {
						// Parse data URI: data:[<mediatype>][;base64],<data>
						const dataUriMatch = url.match(/^data:([^;]*)?(;base64)?,(.*)$/)
						if (dataUriMatch) {
							const contentType = dataUriMatch[1] || 'application/octet-stream'
							const isBase64 = !!dataUriMatch[2]
							const data = dataUriMatch[3]

							let arrayBuffer
							if (isBase64) {
								// Decode base64
								const binaryString = atob(data)
								const bytes = new Uint8Array(binaryString.length)
								for (let i = 0; i < binaryString.length; i++) {
									bytes[i] = binaryString.charCodeAt(i)
								}
								arrayBuffer = bytes.buffer
							} else {
								// URL-encoded data
								const decoded = decodeURIComponent(data)
								const bytes = new Uint8Array(decoded.length)
								for (let i = 0; i < decoded.length; i++) {
									bytes[i] = decoded.charCodeAt(i)
								}
								arrayBuffer = bytes.buffer
							}

							self.logInfo('GLTFLoader', 'Decoded data URI to ArrayBuffer', {
								url: url.substring(0, 50),
								contentType,
								size: arrayBuffer.byteLength,
							})

							return new Response(arrayBuffer, {
								status: 200,
								statusText: 'OK',
								headers: {
									'Content-Type': contentType,
								},
							})
						}

						// If parsing fails, fall through to original fetch (will likely fail)
						self.logWarning('GLTFLoader', 'Failed to parse data URI', { url: url.substring(0, 50) })
					} catch (error) {
						self.logWarning('GLTFLoader', 'Error decoding data URI', {
							url: url.substring(0, 50),
							error: error.message,
						})
					}
				}

				return patches.originalFetch.call(window, input, init)
			}
		}

		// Patch XMLHttpRequest to intercept blob URLs
		// We need to patch both open() and send() because open() is synchronous
		if (typeof XMLHttpRequest !== 'undefined') {
			patches.originalXHROpen = XMLHttpRequest.prototype.open
			patches.originalXHRSend = XMLHttpRequest.prototype.send
			const self = this

			XMLHttpRequest.prototype.open = function(method, url, ...args) {
				// Store the URL for later processing in send()
				if (typeof url === 'string' && url.startsWith('blob:')) {
					this._blobUrlToConvert = url
					this._xhrMethod = method
					this._xhrArgs = args
					self.logInfo('GLTFLoader', 'XHR open() called with blob URL, will convert in send()', { url: url.substring(0, 50) })
					// Call original open with a placeholder - we'll change it in send()
					return patches.originalXHROpen.call(this, method, url, ...args)
				}
				return patches.originalXHROpen.call(this, method, url, ...args)
			}

			XMLHttpRequest.prototype.send = function(...sendArgs) {
				// Check if we need to convert a blob URL
				if (this._blobUrlToConvert) {
					const blobUrl = this._blobUrlToConvert
					const method = this._xhrMethod
					const args = this._xhrArgs
					const originalBlob = patches.blobUrlMap.get(blobUrl)

					// Clear the flag
					this._blobUrlToConvert = null
					this._xhrMethod = null
					this._xhrArgs = null

					if (originalBlob) {
						self.logInfo('GLTFLoader', 'Converting blob URL to data URI in XHR send()', { url: blobUrl.substring(0, 50) })

						// Convert to data URI asynchronously
						self.blobToDataURI(originalBlob).then((dataURI) => {
							// Create a new XHR with the data URI
							const newXHR = new XMLHttpRequest()
							patches.originalXHROpen.call(newXHR, method, dataURI, ...args)

							// Copy over event handlers and properties
							if (this.onload) newXHR.onload = this.onload
							if (this.onerror) newXHR.onerror = this.onerror
							if (this.onprogress) newXHR.onprogress = this.onprogress
							if (this.ontimeout) newXHR.ontimeout = this.ontimeout
							newXHR.responseType = this.responseType

							// Replace this XHR's methods with the new one's
							Object.setPrototypeOf(this, newXHR)

							// Send the new XHR
							patches.originalXHRSend.call(newXHR, ...sendArgs)
						}).catch((error) => {
							self.logWarning('GLTFLoader', 'Failed to convert blob to data URI in XHR', {
								url: blobUrl.substring(0, 50),
								error: error.message,
							})
							// Don't send with blob URL as it will be blocked by CSP
							// Trigger error event instead
							if (this.onerror) {
								this.onerror(new Error('Failed to convert blob URL - CSP violation prevented'))
							}

						})
						return
					} else {
						// Blob not found in tracking map - cannot convert
						self.logWarning('GLTFLoader', 'Blob not found in tracking map for XHR - cannot convert, will not send request to prevent CSP violation', {
							url: blobUrl.substring(0, 50),
						})
						// Trigger error event instead of sending the request
						if (this.onerror) {
							this.onerror(new Error('Blob URL not tracked - CSP violation prevented'))
						}
						return
					}
				}

				// Normal send (for non-blob URLs)
				return patches.originalXHRSend.call(this, ...sendArgs)
			}
		}

		// Patch THREE.js FileLoader to intercept blob URLs and convert to data URIs
		if (typeof THREE !== 'undefined' && THREE.FileLoader) {
			const FileLoader = THREE.FileLoader
			const originalLoad = FileLoader.prototype.load
			const self = this

			patches.originalFileLoaderLoad = originalLoad

			FileLoader.prototype.load = function(url, onLoad, onProgress, onError) {
				// Check if URL is a blob URL
				if (typeof url === 'string' && url.startsWith('blob:')) {
					self.logInfo('GLTFLoader', 'Intercepting blob URL in FileLoader, converting to data URI', { url: url.substring(0, 50) })

					// Try to get the original blob from our tracking map
					const originalBlob = patches.blobUrlMap.get(url)

					if (originalBlob) {
						// We have the original blob - convert it to data URI directly
						self.blobToDataURI(originalBlob).then((dataURI) => {
							self.logInfo('GLTFLoader', 'Converted blob URL to data URI using tracked blob', {
								url: url.substring(0, 50),
								dataURILength: dataURI.length,
							})
							// Call original load with data URI
							originalLoad.call(this, dataURI, onLoad, onProgress, onError)
						}).catch((error) => {
							self.logWarning('GLTFLoader', 'Failed to convert tracked blob to data URI', {
								url: url.substring(0, 50),
								error: error.message,
							})
							// Fallback: try to use original load with blob URL (might work if CSP allows)
							try {
								originalLoad.call(this, url, onLoad, onProgress, onError)
							} catch (fallbackError) {
								if (onError) onError(fallbackError)
							}
						})
						return
					}

					// Blob not in our map - try to fetch it (might fail due to CSP)
					self.logInfo('GLTFLoader', 'Blob URL not in tracking map, attempting fetch', { url: url.substring(0, 50) })

					// Try fetch first
					fetch(url).then(async (response) => {
						if (response.ok) {
							const blob = await response.blob()
							const dataURI = await self.blobToDataURI(blob)
							originalLoad.call(this, dataURI, onLoad, onProgress, onError)
						} else {
							throw new Error('Fetch response not OK')
						}
					}).catch((fetchError) => {
						// Fetch failed - likely CSP blocking
						self.logWarning('GLTFLoader', 'Fetch failed for blob URL (likely CSP), trying XHR', {
							url: url.substring(0, 50),
							error: fetchError.message,
						})

						// Try XHR as fallback
						try {
							const xhr = new XMLHttpRequest()
							xhr.open('GET', url)
							xhr.responseType = 'blob'

							xhr.onload = async () => {
								try {
									const blob = xhr.response
									const dataURI = await self.blobToDataURI(blob)
									originalLoad.call(this, dataURI, onLoad, onProgress, onError)
								} catch (conversionError) {
									self.logWarning('GLTFLoader', 'Failed to convert blob to data URI', {
										url: url.substring(0, 50),
										error: conversionError.message,
									})
									if (onError) onError(conversionError)
								}
							}

							xhr.onerror = () => {
								// Both fetch and XHR failed - CSP is blocking
								self.logWarning('GLTFLoader', 'Blob URL blocked by CSP, cannot convert to data URI', {
									url: url.substring(0, 50),
								})
								if (onError) onError(new Error('CSP blocked blob URL and conversion failed'))
							}

							xhr.send()
						} catch (xhrError) {
							// XHR setup failed
							self.logWarning('GLTFLoader', 'Failed to setup XHR for blob URL', {
								url: url.substring(0, 50),
								error: xhrError.message,
							})
							if (onError) onError(xhrError)
						}
					})
					return
				}

				// For non-blob URLs, use original load
				return originalLoad.call(this, url, onLoad, onProgress, onError)
			}
		} else {
			this.logWarning('GLTFLoader', 'THREE.FileLoader not available, cannot patch texture loading')
		}

		// Return restore function
		return {
			restore: () => {
				if (patches.originalFileLoaderLoad && typeof THREE !== 'undefined' && THREE.FileLoader) {
					THREE.FileLoader.prototype.load = patches.originalFileLoaderLoad
				}
				if (patches.originalCreateObjectURL && typeof URL !== 'undefined') {
					URL.createObjectURL = patches.originalCreateObjectURL
				}
				if (patches.originalFetch && typeof fetch !== 'undefined') {
					window.fetch = patches.originalFetch
				}
				if (patches.originalXHROpen && typeof XMLHttpRequest !== 'undefined') {
					XMLHttpRequest.prototype.open = patches.originalXHROpen
				}
				if (patches.originalXHRSend && typeof XMLHttpRequest !== 'undefined') {
					XMLHttpRequest.prototype.send = patches.originalXHRSend
				}
				if (patches.originalImageSrcSetter && typeof Image !== 'undefined' && Image.prototype) {
					// Restore Image.prototype.src setter
					try {
						Object.defineProperty(Image.prototype, 'src', {
							set: patches.originalImageSrcSetter,
							get() {
								return this._src || ''
							},
							configurable: true,
							enumerable: true,
						})
					} catch (error) {
						this.logWarning('GLTFLoader', 'Failed to restore Image.prototype.src', { error: error.message })
					}
				}
				patches.blobUrlMap.clear()
				this.logInfo('GLTFLoader', 'Texture loader patches restored')
			},
		}
	}

	/**
	 * Set up resource manager for multi-file loading
	 * @param {Array<File>} additionalFiles - Array of dependency files
	 * @param {boolean} useDataURIs - Whether to use data URIs for images (buffers always use blob URLs)
	 */
	async setupResourceManager(additionalFiles, useDataURIs = false) {
		try {
			// Create a map of URLs (blob URLs or data URIs) for each file
			const resourceMap = new Map()

			// Convert each File to a blob URL or data URI
			for (const file of additionalFiles) {
				let url
				const isImage = file.type && file.type.startsWith('image/')
				const isBuffer = file.type === 'application/octet-stream'
				                 || file.name.endsWith('.bin')
				                 || file.name.endsWith('.draco')
				                 || !file.type

				// In modal context (CSP restrictions), use data URIs for both images and buffers
				// Data URIs are allowed by CSP, blob URLs are not
				if (useDataURIs) {
					// Convert to data URI for CSP compatibility (both images and buffers)
					const blob = new Blob([file], { type: file.type || 'application/octet-stream' })
					url = await this.blobToDataURI(blob)
					this.logInfo('Created data URI for resource:', file.name, {
						type: file.type,
						size: file.size,
						isBuffer,
						isImage,
					})
				} else {
					// Use blob URL when not in modal context (more efficient for large files)
					const blob = new Blob([file], { type: file.type || 'application/octet-stream' })
					url = URL.createObjectURL(blob)
					this.logInfo('Created blob URL for resource:', file.name, {
						type: file.type,
						size: file.size,
						isBuffer,
						isImage,
					})
				}
				resourceMap.set(file.name, url)
			}

			// Create a custom LoadingManager with URL modifier
			const manager = new THREE.LoadingManager()

			manager.setURLModifier((url) => {
				// Extract filename from URL
				const filename = url.split('/').pop().split('?')[0]

				// Check if we have this file
				if (resourceMap.has(filename)) {
					const resourceUrl = resourceMap.get(filename)
					this.logInfo('Resolving resource:', filename, { useDataURI: useDataURIs })
					return resourceUrl
				}

				// Return original URL if not found
				this.logWarning('Resource not found in map, using original URL:', filename)
				return url
			})

			// Set the custom manager on the loader
			this.loader.manager = manager

			this.logInfo('Resource manager setup complete', {
				resources: additionalFiles.length,
				files: Array.from(resourceMap.keys()),
				useDataURIs,
			})
		} catch (error) {
			this.logWarning('Failed to setup resource manager', {
				error: error.message,
			})
		}
	}

	/**
	 * Convert a Blob to a data URI
	 * @param {Blob} blob - Blob to convert
	 * @return {Promise<string>} Data URI string
	 */
	blobToDataURI(blob) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onloadend = () => resolve(reader.result)
			reader.onerror = reject
			reader.readAsDataURL(blob)
		})
	}

	/**
	 * Configure decoders for compressed formats
	 * @param {THREE.WebGLRenderer} renderer - WebGL renderer
	 * @param {boolean} hasDraco - Whether DRACO is available
	 * @param {boolean} hasKtx2 - Whether KTX2 is available
	 * @param {boolean} hasMeshopt - Whether Meshopt is available
	 */
	async configureDecoders(renderer, hasDraco, hasKtx2, hasMeshopt) {
		// Configure DRACO loader
		if (hasDraco) {
			try {
				const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js')
				const dracoLoader = new DRACOLoader()
				dracoLoader.setDecoderPath('/apps/threedviewer/draco/')
				this.loader.setDRACOLoader(dracoLoader)
				this.logInfo('DRACO loader configured', { path: '/apps/threedviewer/draco/' })
			} catch (error) {
				this.logWarning('DRACO loader unavailable', { error: error.message })
			}
		}

		// Configure KTX2 loader
		if (hasKtx2) {
			try {
				const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js')
				const ktx2Loader = new KTX2Loader()
				ktx2Loader.setTranscoderPath('/apps/threedviewer/basis/')
				ktx2Loader.detectSupport(renderer)
				this.loader.setKTX2Loader(ktx2Loader)
				this.logInfo('KTX2 loader configured', { path: '/apps/threedviewer/basis/' })
			} catch (error) {
				this.logWarning('KTX2 loader unavailable', { error: error.message })
			}
		}

		// Configure Meshopt decoder
		if (hasMeshopt) {
			try {
				const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js')
				if (MeshoptDecoder) {
					this.loader.setMeshoptDecoder(MeshoptDecoder)
					this.logInfo('Meshopt decoder configured')
				}
			} catch (error) {
				this.logWarning('Meshopt decoder unavailable', { error: error.message })
			}
		}
	}

	/**
	 * Parse the GLTF model
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {string} extension - File extension (glb or gltf)
	 * @return {Promise<object>} Parsed GLTF
	 */
	async parseModel(arrayBuffer, extension = null) {
		return new Promise((resolve, reject) => {
			try {
				// Check if this is a GLB file (binary format)
				// GLB files start with magic number 0x46546C67 ("glTF" in ASCII)
				const isGLB = this.isGLBFormat(arrayBuffer, extension)

				if (isGLB) {
					this.logInfo('Detected GLB binary format', { size: arrayBuffer.byteLength })
				} else {
					this.logInfo('Detected GLTF JSON format', { size: arrayBuffer.byteLength })
				}

				this.loader.parse(arrayBuffer, '', (gltf) => {
					this.logInfo('GLTF model parsed successfully', {
						scenes: gltf.scenes?.length || 0,
						animations: gltf.animations?.length || 0,
						materials: gltf.materials?.length || 0,
					})
					resolve(gltf)
				}, (error) => {
					this.logError('Failed to parse GLTF model', error)
					reject(error)
				})
			} catch (error) {
				this.logError('Error in parseModel', error)
				reject(error)
			}
		})
	}

	/**
	 * Detect if arrayBuffer is GLB format (binary) or GLTF format (JSON)
	 * @param {ArrayBuffer} arrayBuffer - File data
	 * @param {string} extension - File extension hint
	 * @return {boolean} True if GLB (binary), false if GLTF (JSON)
	 */
	isGLBFormat(arrayBuffer, extension = null) {
		// Check file extension first
		if (extension) {
			return extension.toLowerCase() === 'glb'
		}

		// Check magic number: GLB files start with 0x46546C67 ("glTF" in ASCII)
		if (arrayBuffer.byteLength < 4) {
			return false
		}

		const view = new DataView(arrayBuffer)
		const magic = view.getUint32(0, true) // Little-endian
		const GLB_MAGIC = 0x46546C67 // "glTF" in ASCII

		return magic === GLB_MAGIC
	}

}

export { GltfLoader }
