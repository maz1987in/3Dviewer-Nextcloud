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
 */

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
		prepare: (camera) => spark.update({ scene, camera }),
		dispose: () => {
			spark.removeFromParent()
			spark.dispose()
		},
	}
}
