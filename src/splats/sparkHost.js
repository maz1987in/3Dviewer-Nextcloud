/**
 * Spark's renderer for a scene that holds a splat. Each place that draws a scene (the full
 * viewer, the light viewer, the thumbnailer) attaches one with its own WebGLRenderer when
 * a splat opens, and disposes it when the splat goes.
 *
 * It joins the scene, never the model root: a SparkRenderer is a Mesh, and inside the root
 * it would be measured with the model.
 *
 * Spark sorts the splats for the view in a worker and draws the last sort it has, so in an
 * ordinary render loop the order lags a frame. A frame drawn on purpose (a turntable frame,
 * a thumbnail) awaits `prepare(camera)` first, which finishes the sort for that camera.
 * Spark's update returns at once while a sort is already running, and that sort is for the
 * view it began with: prepare waits it out and sorts again, for as long as SETTLE_MS.
 */

/** The longest prepare waits for the sorts to settle; a frame is drawn either way. */
const SETTLE_MS = 2000

/** How often prepare looks again while a sort runs. */
const POLL_MS = 16

/**
 * @param {object} spark - Spark's renderer
 * @param {import('three').Scene} scene - The scene the splat is in
 * @param {import('three').Camera} camera - The view to sort for
 * @return {Promise<void>} Once a sort for this view is done
 */
async function settle(spark, scene, camera) {
	const until = Date.now() + SETTLE_MS
	await spark.update({ scene, camera })
	while ((spark.sorting || spark.sortDirty) && Date.now() < until) {
		await new Promise((resolve) => setTimeout(resolve, POLL_MS))
		await spark.update({ scene, camera })
	}
}

/**
 * @param {import('three').Scene} scene - The scene the splat is in
 * @param {import('three').WebGLRenderer} renderer - The renderer that draws it
 * @return {Promise<{spark: object, prepare: function(import('three').Camera): Promise<void>, dispose: function(): void}>} The attachment
 */
export async function attachSpark(scene, renderer) {
	const { SparkRenderer } = await import('@sparkjsdev/spark')
	const spark = new SparkRenderer({ renderer })
	spark.name = 'tdv-spark'
	scene.add(spark)
	return {
		spark,
		prepare: (camera) => settle(spark, scene, camera),
		dispose: () => {
			spark.removeFromParent()
			spark.dispose()
		},
	}
}
