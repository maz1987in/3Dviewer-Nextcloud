module.exports = {
	extends: [
		'@nextcloud',
	],
	rules: {
		'no-unused-vars': 'error',
		'no-console': ['warn', { allow: ['error'] }],
		'jsdoc/require-jsdoc': 'off',
		'vue/first-attribute-linebreak': 'off',
	},
}
