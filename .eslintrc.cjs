module.exports = {
	extends: [
		'@nextcloud',
	],
	rules: {
		'no-unused-vars': 'error',
		'no-console': ['warn', { allow: ['error'] }],
		'jsdoc/require-jsdoc': 'off',
		'vue/first-attribute-linebreak': 'off',
		// This app is Vue 3, where a template may have several root nodes. The rule
		// comes from the shared config's Vue 2 lineage and flags valid fragments —
		// App.vue teleports its skip link alongside <NcContent>.
		'vue/no-multiple-template-root': 'off',
	},
}
