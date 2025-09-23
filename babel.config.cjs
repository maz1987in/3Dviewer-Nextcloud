module.exports = {
	presets: [
		[
			'@babel/preset-env',
			{
				targets: {
					browsers: [
						'last 2 versions',
						'ie >= 11'
					]
				},
				modules: false
			}
		]
	],
	plugins: [
		'@babel/plugin-syntax-dynamic-import',
		'@babel/plugin-proposal-object-rest-spread'
	],
	env: {
		test: {
			presets: [
				[
					'@babel/preset-env',
					{
						targets: {
							node: 'current'
						},
						modules: 'commonjs'
					}
				]
			]
		}
	}
}
