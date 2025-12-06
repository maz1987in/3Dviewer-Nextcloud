# Test Compliance with Nextcloud Guidelines

This document compares our test implementation with [Nextcloud's official unit testing guidelines](https://docs.nextcloud.com/server/stable/developer_manual/server/unit-testing.html).

## Current Implementation vs Nextcloud Guidelines

### ✅ What We're Doing Correctly

1. **Test Directory Structure** ✅
   - Tests are in `tests/` directory at top level
   - Tests organized in `tests/unit/Controller/` and `tests/unit/Service/`
   - Matches Nextcloud convention

2. **Namespace** ✅
   - Using `OCA\ThreeDViewer\Tests\Unit\Controller` and `OCA\ThreeDViewer\Tests\Unit\Service`
   - Follows Nextcloud pattern: `OCA\AppName\Tests\...`

3. **Parent Method Calls** ✅
   - All tests call `parent::setUp()` in `setUp()` method
   - Follows Nextcloud requirement

4. **Bootstrap** ✅
   - `tests/bootstrap.php` handles Nextcloud bootstrapping if available
   - Falls back gracefully if running standalone
   - Matches Nextcloud's bootstrap approach

5. **PHPUnit Configuration** ✅
   - `tests/phpunit.xml` properly configured
   - Bootstrap file specified
   - Test suite properly defined

### ⚠️ Differences from Nextcloud Guidelines

1. **TestCase Base Class**
   - **Nextcloud Guideline**: Use `\Test\TestCase` (Nextcloud's base class)
   - **Our Implementation**: Uses `PHPUnit\Framework\TestCase` (standalone PHPUnit)
   - **Reason**: Our tests are designed to run standalone (outside full Nextcloud server)
   - **Impact**: Tests can run in CI/CD without full Nextcloud installation
   - **Note**: This is acceptable for app-level unit tests that mock dependencies

2. **Test Execution**
   - **Nextcloud Guideline**: Run with `phpunit --bootstrap tests/bootstrap.php`
   - **Our Implementation**: Uses `composer test:unit` which runs `phpunit tests -c tests/phpunit.xml`
   - **Impact**: Same result, just wrapped in composer script (better DX)

## Test Structure Comparison

### Nextcloud Example (from docs):
```php
<?php
namespace OCA\Myapp\Tests;

class TestAddTwo extends \Test\TestCase {
    protected function setUp() {
        parent::setUp();
        $this->testMe = new \OCA\Myapp\TestMe();
    }

    public function testAddTwo(){
        $this->assertEquals(5, $this->testMe->addTwo(3));
    }
}
```

### Our Implementation:
```php
<?php
namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use PHPUnit\Framework\TestCase;

class SettingsControllerTest extends TestCase {
    protected function setUp(): void {
        parent::setUp();
        // Setup mocks...
    }

    public function testGetSettingsReturnsEmptyArrayWhenNoSettings(): void {
        // Test implementation...
    }
}
```

## Key Differences Explained

### Why We Use `PHPUnit\Framework\TestCase`

1. **Standalone Testing**: Our tests can run without a full Nextcloud server installation
2. **CI/CD Friendly**: Easier to run in automated pipelines
3. **Mocking**: We use mocks for all Nextcloud dependencies (IRootFolder, IUserSession, etc.)
4. **Consistency**: All existing tests in the project use this approach

### When to Use `\Test\TestCase`

According to Nextcloud docs, use `\Test\TestCase` when:
- You need to use Nextcloud functions directly (i.e., `OC::getUser()`)
- You're testing server-level code (not app-level)
- You're running tests within a full Nextcloud installation

### Our Approach: Dependency Injection + Mocking

We use dependency injection and mock all Nextcloud dependencies:
- `IRootFolder` → Mocked
- `IUserSession` → Mocked
- `IConfig` → Mocked
- `LoggerInterface` → Mocked

This allows tests to run standalone while still testing the actual business logic.

## Recommendations

### ✅ Current Approach is Valid

Our tests follow best practices for:
- **Unit Testing**: Isolated, fast, deterministic
- **CI/CD**: Can run without full Nextcloud setup
- **Maintainability**: Clear structure, good coverage

### 🔄 Optional Improvements (if needed)

If you want to align more closely with Nextcloud guidelines:

1. **Add Integration Tests**: Create separate integration tests using `\Test\TestCase` that run within Nextcloud
2. **Documentation**: Add note in README explaining test approach
3. **CI Configuration**: Ensure tests run in both standalone and Nextcloud environments

## Test Coverage

### Controllers Tested ✅
- `SettingsController` - Full coverage (get, save, reset)
- `SlicerController` - Full coverage (save, get, delete, lifecycle)
- `FileController` - Already had tests
- `PublicFileController` - Already had tests
- `ApiController` - Already had tests

### Services Tested ✅
- `FileIndexService` - Full coverage (index, remove, reindex)
- `FileService` - Already had tests
- `ShareFileService` - Already had tests
- `ModelFileSupport` - Already had tests

## Running Tests

### Standalone (Current Approach)
```bash
composer test:unit
```

### With Nextcloud Bootstrap (if needed)
```bash
phpunit --bootstrap tests/bootstrap.php tests/unit
```

### Specific Test File
```bash
./vendor/bin/phpunit tests/unit/Controller/SettingsControllerTest.php
```

## Conclusion

Our test implementation is **compliant with Nextcloud guidelines** for app-level unit testing, with the intentional difference of using standalone PHPUnit instead of Nextcloud's `\Test\TestCase`. This is a valid approach that:

- ✅ Follows Nextcloud directory structure
- ✅ Uses proper namespacing
- ✅ Calls parent methods correctly
- ✅ Has proper bootstrap handling
- ✅ Provides good test coverage
- ✅ Works in CI/CD environments

The tests are production-ready and follow industry best practices for unit testing.

