/*!
 * ESLint configuration, in the flat format ESLint 9 introduced and ESLint 10 requires.
 *
 * Replaces `.eslintrc.cjs` and `.eslintignore`, which ESLint 10 does not read at all — it
 * exits with "couldn't find an eslint.config.(js|mjs|cjs)" and lints nothing, which is how
 * `@nextcloud/eslint-config` v9 announced itself in CI.
 *
 * v9 also stops taking its plugins as peer dependencies and brings its own, at newer
 * majors, with a wider recommended set. On this repository that is 3072 findings where
 * there were 295, and not one of them is from a line that changed. So the migration moves
 * the format and holds the behaviour: what failed the build before still fails it, what v9
 * newly reports is recorded below with its count, and the source is left alone — one dead
 * `/* global THREE *​/` in `utils/validation.js` aside, which declared a name used only in
 * JSDoc types and which ESLint 10 now reports as unused.
 *
 * The counts are the point. Each block says what adopting that family would cost, so
 * turning one on later is a decision with a size attached rather than an experiment.
 */
import { recommendedJavascript } from '@nextcloud/eslint-config'
import n from 'eslint-plugin-n'

/** Everything ESLint lints here: the shared config registers its plugins per extension. */
const SCRIPTS = ['**/*.js', '**/*.mjs', '**/*.cjs', '**/*.vue']

export default [
	{
		/*
		 * What `.eslintignore` used to say, trimmed to what can still match: the old file
		 * listed build output, vendor trees and a long tail of extensions, and the lint
		 * script only ever pointed at `src`.
		 */
		ignores: [
			'js/',
			'css/',
			'build/',
			'dist/',
			'vendor/',
			'vendor-bin/',
			'l10n/',
			'node_modules/',
		],
	},

	...recommendedJavascript,

	{
		/*
		 * The unit tests that live beside the code they cover. The old config declared
		 * `env: { jest: true }`; flat config has no `env`, so the globals are named here —
		 * without them `describe`, `it`, `expect` and `jest` are 38 undefined variables.
		 */
		files: ['src/**/__tests__/**', 'src/**/*.spec.js', 'src/**/*.test.js'],
		languageOptions: {
			globals: {
				afterAll: 'readonly',
				afterEach: 'readonly',
				beforeAll: 'readonly',
				beforeEach: 'readonly',
				describe: 'readonly',
				expect: 'readonly',
				it: 'readonly',
				jest: 'readonly',
				test: 'readonly',
			},
		},
	},

	{
		/*
		 * `eslint-plugin-n` came with the old shared config and v9 dropped it, which turns
		 * eleven `eslint-disable-next-line n/no-extraneous-import` comments into errors for
		 * a rule that no longer exists — and stops checking the imports they were written
		 * about. Registered here so both the rule and the comments keep meaning what they
		 * meant.
		 */
		files: SCRIPTS,
		plugins: { n },
		rules: {
			'n/no-extraneous-import': 'error',
		},
	},

	{
		files: SCRIPTS,

		languageOptions: {
			globals: {
				// `logger.js` reads `process.env.NODE_ENV` behind a `typeof` guard, which the
				// bundler replaces at build time. It is not a Node script.
				process: 'readonly',
			},
		},

		rules: {
			// ---- Carried over from `.eslintrc.cjs` ----
			'no-console': ['warn', { allow: ['error'] }],
			'jsdoc/require-jsdoc': 'off',

			/*
			 * Still an error, as it was, and scoped to what the old setup actually reported.
			 *
			 * Under v8 this rule found nothing. Two things changed underneath it: ESLint 9
			 * flipped `caughtErrors` from "none" to "all", which turned 31 `catch (e)`
			 * bindings into errors, and the newer Vue parser surfaces unused arguments in
			 * SFC handlers that the old one did not — 28 of them, all signatures written for
			 * an API that passes something the body ignores. Neither is a defect that
			 * appeared; both are the linter seeing further.
			 *
			 * Unused *variables* are still errors, which is the part that catches mistakes.
			 */
			'no-unused-vars': ['error', {
				args: 'none', // 28 unused arguments, none of them new
				caughtErrors: 'none', // 31 unused catch bindings, none of them new
				varsIgnorePattern: '^_',
			}],

			/*
			 * ---- Families v9 added, off ----
			 *
			 * Formatting and ordering. 737 and 185 findings, none of which is a defect:
			 * indentation, arrow parentheses, blank lines inside blocks, and the order of
			 * imports and named specifiers. Adopting either is a repo-wide reformat and
			 * wants to be its own change, where the diff is the whole review.
			 */
			'@stylistic/arrow-parens': 'off',
			'@stylistic/exp-list-style': 'off',
			'@stylistic/function-call-argument-newline': 'off',
			'@stylistic/function-paren-newline': 'off',
			'@stylistic/implicit-arrow-linebreak': 'off',
			'@stylistic/indent': 'off',
			'@stylistic/indent-binary-ops': 'off',
			'@stylistic/max-statements-per-line': 'off',
			'@stylistic/padded-blocks': 'off',
			'perfectionist/sort-imports': 'off',
			'perfectionist/sort-named-imports': 'off',

			/*
			 * ---- Rules v9 newly raised to error, kept as warnings ----
			 *
			 * These come from plugins the old config already used, at newer majors that
			 * promoted them. They are reported rather than hidden — a warning does not fail
			 * `npm run lint`, so the gate keeps meaning what it meant — and the count beside
			 * each says what fixing it involves.
			 */
			'antfu/top-level-function': 'warn', // 1
			curly: 'warn', // 434 — single-statement ifs written without braces
			eqeqeq: 'warn', // 8
			'no-empty': 'warn', // 2
			'no-use-before-define': 'warn', // 125 — hoisted helpers inside composables
			'no-useless-assignment': 'warn', // 6
			'object-shorthand': 'warn', // 1
			'prefer-object-has-own': 'warn', // 1
			'preserve-caught-error': 'warn', // 8
			'@nextcloud/l10n-enforce-ellipsis': 'warn', // 24 — "..." should be "…"
			'@nextcloud/no-deprecated-library-props': 'warn', // 12
		},
	},

	{
		// The `vue` plugin is registered for Vue files alone, so its rules can only be
		// configured against the same files.
		files: ['**/*.vue'],
		rules: {
			// ---- Carried over from `.eslintrc.cjs` ----
			'vue/first-attribute-linebreak': 'off',
			// This app is Vue 3, where a template may have several root nodes. The rule
			// comes from the shared config's Vue 2 lineage and flags valid fragments —
			// App.vue teleports its skip link alongside <NcContent>.
			'vue/no-multiple-template-root': 'off',

			// ---- Newly raised to error by eslint-plugin-vue 10, kept as warnings ----
			'vue/attribute-hyphenation': 'warn', // 105
			'vue/comma-spacing': 'warn', // 68
			'vue/custom-event-name-casing': 'warn', // 105
			'vue/new-line-between-multi-line-property': 'warn', // 235
			'vue/no-useless-v-bind': 'warn', // 1
			'vue/order-in-components': 'warn', // 1
			'vue/quote-props': 'warn', // 66
			'vue/v-on-event-hyphenation': 'warn', // 102
		},
	},
]
