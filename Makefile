# 3D Viewer Nextcloud App Makefile

.PHONY: help install build dev test lint clean

# Default target
help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	composer install
	npm install

install-dev: ## Install development dependencies
	composer install --dev
	npm install

build: ## Build the application
	npm run build

dev: ## Start development server
	npm run dev

watch: ## Start development server with watch mode
	npm run watch

test: ## Run all tests
	composer test:unit
	npm run test:smoke

test-unit: ## Run PHP unit tests
	composer test:unit

test-integration: ## Run integration tests
	composer test:integration

test-migration: ## Run migration tests
	composer test:migration

test-e2e: ## Run end-to-end tests
	npm run test:e2e

test-e2e-headed: ## Run end-to-end tests with browser UI
	npm run test:e2e:headed

lint: ## Run all linting
	composer cs:check
	npm run lint
	npm run stylelint

lint-fix: ## Fix linting issues
	composer cs:fix
	npm run lint -- --fix

psalm: ## Run static analysis
	composer psalm

rector: ## Run code modernization
	composer rector

size-check: ## Check bundle size
	npm run size:check

clean: ## Clean build artifacts
	rm -rf node_modules/.cache
	rm -rf dist
	rm -rf .phpunit.cache
	rm -rf coverage
	rm -rf test-results
	rm -rf playwright-report

clean-all: clean ## Clean everything including dependencies
	rm -rf node_modules
	rm -rf vendor
	rm -rf vendor-bin/*/vendor

setup: install-dev ## Setup development environment
	@echo "Development environment setup complete!"

install-hooks: ## Install git hooks for code quality checks
	@echo "Installing git hooks..."
	@chmod +x .hooks/pre-commit
	@if [ -d .git ]; then \
		ln -sf ../../.hooks/pre-commit .git/hooks/pre-commit; \
		echo "✓ Pre-commit hook installed"; \
	fi
	@chmod +x .hook-checkout/post-checkout
	@if [ -d .git ]; then \
		ln -sf ../../.hook-checkout/post-checkout .git/hooks/post-checkout; \
		echo "✓ Post-checkout hook installed"; \
	fi
	@echo "✅ Git hooks installed successfully!"
	@echo "Pre-commit: Runs linting before commits"
	@echo "Post-checkout: Auto-installs dependencies when package files change"

ci: ## Run CI pipeline locally
	composer cs:check
	composer psalm
	npm run lint
	npm run stylelint
	npm run build
	npm run size:check
	composer test:unit
	npm run test:smoke

release-check: ## Check if ready for release
	composer cs:check
	composer psalm
	npm run lint
	npm run stylelint
	npm run build
	npm run size:check
	composer test:unit
	npm run test:smoke
	@echo "✅ Ready for release!"

# Development helpers
copy-decoders: ## Copy decoder files
	npm run copy-decoders

openapi: ## Generate OpenAPI spec
	composer openapi
