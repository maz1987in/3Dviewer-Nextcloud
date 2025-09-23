module.exports = {
	extends: [
		'@nextcloud/stylelint-config',
		'stylelint-config-recommended-vue',
		'stylelint-config-standard-scss'
	],
	plugins: [
		'stylelint-scss',
		'stylelint-order'
	],
	rules: {
		// Disable some rules that conflict with Nextcloud standards
		'at-rule-no-unknown': null,
		'scss/at-rule-no-unknown': [
			true,
			{
				ignoreAtRules: [
					'extend',
					'at-root',
					'debug',
					'warn',
					'error',
					'if',
					'else',
					'each',
					'for',
					'while',
					'mixin',
					'include',
					'content',
					'return',
					'function',
					'tailwind',
					'apply',
					'responsive',
					'variants',
					'screen'
				]
			}
		],
		'scss/dollar-variable-pattern': null,
		'scss/percent-placeholder-pattern': null,
		'scss/at-mixin-pattern': null,
		'scss/at-function-pattern': null,
		
		// Order rules
		'order/properties-alphabetical-order': true,
		'order/order': [
			'declarations',
			{
				type: 'at-rule',
				name: 'media'
			}
		],
		
		// Custom rules for better code quality
		'color-no-invalid-hex': true,
		'font-family-no-duplicate-names': true,
		'font-family-no-missing-generic-family-keyword': true,
		'function-calc-no-unspaced-operator': true,
		'function-linear-gradient-no-nonstandard-direction': true,
		'string-no-newline': true,
		'unit-no-unknown': true,
		'property-no-unknown': [
			true,
			{
				ignoreProperties: [
					'composes',
					'/^--/'
				]
			}
		],
		'keyframe-declaration-no-important': true,
		'declaration-block-no-duplicate-properties': [
			true,
			{
				ignore: ['consecutive-duplicates-with-different-values']
			}
		],
		'declaration-block-no-redundant-longhand-properties': true,
		'declaration-block-no-shorthand-property-overrides': true,
		'block-no-empty': true,
		'selector-pseudo-class-no-unknown': [
			true,
			{
				ignorePseudoClasses: ['global', 'local', 'export', 'import']
			}
		],
		'selector-pseudo-element-no-unknown': true,
		'selector-type-no-unknown': [
			true,
			{
				ignore: ['custom-elements']
			}
		],
		'media-feature-name-no-unknown': true,
		'at-rule-no-unknown': [
			true,
			{
				ignoreAtRules: [
					'tailwind',
					'apply',
					'variants',
					'responsive',
					'screen'
				]
			}
		],
		'comment-no-empty': true,
		'no-duplicate-at-import-rules': true,
		'no-duplicate-selectors': true,
		'no-empty-source': null,
		'no-extra-semicolons': true,
		'no-invalid-double-slash-comments': true,
		
		// Vue specific rules
		'selector-pseudo-element-colon-notation': 'double',
		'selector-pseudo-class-colon-notation': 'double',
		
		// SCSS specific rules
		'scss/at-import-no-partial-leading-underscore': true,
		'scss/at-import-partial-extension-blacklist': ['scss'],
		'scss/dollar-variable-colon-space-after': 'always',
		'scss/dollar-variable-colon-space-before': 'never',
		'scss/at-mixin-argumentless-call-parentheses': 'always',
		'scss/at-function-parentheses-space-before': 'never',
		'scss/at-rule-no-unknown': true,
		'scss/at-rule-conditional-no-parentheses': true,
		'scss/at-rule-else-empty-line-before': 'never',
		'scss/at-rule-else-no-newline-after': true,
		'scss/at-extend-no-missing-placeholder': true,
		'scss/at-function-named-arguments': 'never',
		'scss/at-if-closing-brace-newline-after': 'always-last-in-chain',
		'scss/at-if-closing-brace-space-after': 'always-intermediate',
		'scss/at-import-no-partial-leading-underscore': true,
		'scss/at-import-partial-extension-blacklist': ['scss'],
		'scss/at-rule-no-unknown': true,
		'scss/dollar-variable-no-namespaced-assignment': true,
		'scss/percent-placeholder-pattern': '^[a-z]+(-[a-z]+)*$',
		'scss/at-mixin-pattern': '^[a-z]+(-[a-z]+)*$',
		'scss/at-function-pattern': '^[a-z]+(-[a-z]+)*$',
		'scss/dollar-variable-pattern': '^[a-z]+(-[a-z]+)*$',
		
		// Disable rules that are too strict for this project
		'max-nesting-depth': null,
		'scss/at-rule-no-unknown': null,
		'scss/dollar-variable-pattern': null,
		'scss/percent-placeholder-pattern': null,
		'scss/at-mixin-pattern': null,
		'scss/at-function-pattern': null
	},
	ignoreFiles: [
		'**/node_modules/**',
		'**/vendor/**',
		'**/dist/**',
		'**/build/**',
		'**/coverage/**'
	]
}
