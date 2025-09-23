module.exports = {
	testEnvironment: 'jsdom',
	roots: ['<rootDir>/src', '<rootDir>/tests'],
	testMatch: [
		'**/__tests__/**/*.(js|ts|vue)',
		'**/*.(test|spec).(js|ts|vue)'
	],
	testPathIgnorePatterns: [
		'/node_modules/',
		'/tests/playwright/',
		'/tests/smoke/'
	],
	transform: {
		'^.+\\.vue$': '@vue/vue2-jest',
		'^.+\\.(js|ts)$': 'babel-jest'
	},
	moduleFileExtensions: ['js', 'ts', 'vue', 'json'],
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
		'^@/components/(.*)$': '<rootDir>/src/components/$1',
		'^@/composables/(.*)$': '<rootDir>/src/composables/$1',
		'^@/utils/(.*)$': '<rootDir>/src/utils/$1',
		'^@/loaders/(.*)$': '<rootDir>/src/loaders/$1'
	},
	collectCoverageFrom: [
		'src/**/*.{js,ts,vue}',
		'!src/**/*.d.ts',
		'!src/main.js'
	],
	coverageDirectory: 'coverage',
	coverageReporters: ['text', 'lcov', 'html'],
	coverageThreshold: {
		global: {
			branches: 70,
			functions: 70,
			lines: 70,
			statements: 70
		}
	},
	testTimeout: 10000,
	clearMocks: true,
	restoreMocks: true
}
