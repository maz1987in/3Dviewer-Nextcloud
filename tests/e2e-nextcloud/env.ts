/**
 * Where the server is, which models are uploaded to it, and what is remembered between the
 * setup and the specs. Kept apart from helpers.ts so the config and the setup can import it
 * without loading the test fixtures.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const PROJECT_ROOT = path.resolve(HERE, '..', '..')
const STATE_DIR = path.join(HERE, '.state')
export const AUTH_FILE = path.join(STATE_DIR, 'auth.json')
export const STATE_FILE = path.join(STATE_DIR, 'state.json')

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080'
export const USER = process.env.E2E_USER ?? 'e2e-user'
export const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-user-Pass-Aa1'

// Nextcloud is served by `php -S`, which applies no .htaccess, so every page is addressed
// through index.php, as a server without pretty URLs would be.
export const INDEX = `${BASE_URL}/index.php`

/**
 * Where the app's own files are served from. The app is installed in custom_apps/, as the App
 * Store installs it, so this is the only prefix a file of the app may be requested under.
 */
export const APP_ASSET_ROOT = '/custom_apps/threedviewer/'

export type ModelKind = 'stl' | 'step' | '3dm'

export type ModelSpec = {
	kind: ModelKind
	/** File under tests/fixtures */
	fixture: string
	/** Name it is uploaded under, in the user's root folder */
	remote: string
	/** The decoder the loader must fetch from the app's own directory, if it has one */
	decoder?: string
}

export const MODELS: Record<ModelKind, ModelSpec> = {
	stl: { kind: 'stl', fixture: 'triangle.stl', remote: 'e2e-triangle.stl' },
	step: { kind: 'step', fixture: 'cube.step', remote: 'e2e-cube.step', decoder: `${APP_ASSET_ROOT}occt/occt-import-js.wasm` },
	'3dm': { kind: '3dm', fixture: 'shapes.3dm', remote: 'e2e-shapes.3dm', decoder: `${APP_ASSET_ROOT}rhino3dm/rhino3dm.wasm` },
}

/** What global-setup recorded about the uploaded models */
export type State = {
	fileIds: Record<ModelKind, number>
	/** Public link tokens, for the models that are shared */
	shares: Partial<Record<ModelKind, string>>
}

export function readState(): State {
	return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
}

export function writeState(state: State) {
	fs.mkdirSync(STATE_DIR, { recursive: true })
	fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}
