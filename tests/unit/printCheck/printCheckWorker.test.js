/**
 * The print-check worker's handler for the mesh jobs, run on the page: its messages in,
 * its answers out. The real worker is bundled by Vite and cannot be started under Jest, so
 * `self` is a stand-in that collects what it posts.
 */
const posted = []

beforeAll(async () => {
	self.postMessage = (message, transfer) => posted.push({ message, transfer })
	await import('../../../src/printCheck/printCheck.worker.js')
})

beforeEach(() => { posted.length = 0 })

/** A cube missing its top face, as a part. */
function openCube() {
	const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1])
	const index = Uint32Array.from([0, 3, 2, 0, 2, 1, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7])
	return { positions, index, surface: true }
}

const send = (data) => self.onmessage({ data })

test('analyze answers with what is wrong with each surface part, and leaves points out', () => {
	send({ id: 1, type: 'load', parts: [openCube(), { positions: new Float32Array(9), index: null, surface: false }] })
	send({ id: 2, type: 'analyze', scales: [1, 1] })
	const answer = posted.find(({ message }) => message.id === 2).message
	expect(answer.type).toBe('result')
	expect(answer.result).toHaveLength(1)
	expect(answer.result[0]).toMatchObject({ openEdges: 4, closed: false, fixable: true, holes: { count: 1, fillable: 1 } })
})

test('repair answers with each part repaired, its closed check run, and the buffers transferred', () => {
	const part = openCube()
	send({ id: 3, type: 'repair', parts: [{ positions: part.positions, index: part.index }], millimetresPerUnit: 1 })
	const progress = posted.filter(({ message }) => message.id === 3 && message.type === 'progress')
	expect(progress.length).toBeGreaterThan(0)
	expect(progress.at(-1).message).toMatchObject({ done: 1000, total: 1000 })
	const { message, transfer } = posted.find(({ message: m }) => m.id === 3 && m.type === 'result')
	expect(message.result).toHaveLength(1)
	const [repaired] = message.result
	expect(repaired.summary).toMatchObject({ filledHoles: 1, addedFaces: 2 })
	expect(repaired.after.closed).toBe(true)
	expect(repaired.closedReport).toMatchObject({ closed: true, boundaryEdges: 0 })
	expect(transfer).toEqual([repaired.positions.buffer, repaired.index.buffer])
})

test('a job that fails answers with its message', () => {
	send({ id: 4, type: 'repair', parts: [null], millimetresPerUnit: 1 })
	expect(posted.find(({ message }) => message.id === 4).message.type).toBe('error')
	send({ id: 5, type: 'nonsense' })
	expect(posted.find(({ message }) => message.id === 5).message).toMatchObject({ type: 'error', message: 'Unknown print-check job: nonsense' })
})
