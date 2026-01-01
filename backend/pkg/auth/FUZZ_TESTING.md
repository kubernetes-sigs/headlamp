# Fuzz Testing for Auth Package

This package includes fuzz tests using Go's native fuzzing support (Go 1.18+).

## Overview

Fuzz testing is an automated testing technique that provides random, unexpected, or invalid data as input to a function to discover bugs, crashes, or security vulnerabilities.

## Available Fuzz Tests

### FuzzSanitizeClusterName

Tests the `SanitizeClusterName` function with various inputs to ensure it:
- Never returns strings longer than 50 characters
- Only returns alphanumeric characters, hyphens, and underscores
- Produces valid UTF-8 strings
- Is idempotent (calling it twice on the same input gives the same result)
- Handles edge cases like empty strings, unicode characters, and special characters

## Running Fuzz Tests

### Quick Test (uses seed corpus only)
```bash
cd backend
go test ./pkg/auth/
```

### Run Fuzzing for a Specific Duration
```bash
cd backend
go test -fuzz=FuzzSanitizeClusterName -fuzztime=30s ./pkg/auth/
```

### Run Fuzzing Until a Failure is Found
```bash
cd backend
go test -fuzz=FuzzSanitizeClusterName ./pkg/auth/
```
Press `Ctrl+C` to stop the fuzzer.

### Run with Custom Execution Count
```bash
cd backend
go test -fuzz=FuzzSanitizeClusterName -fuzztime=100000x ./pkg/auth/
```

## Understanding Fuzz Test Output

When running fuzz tests, you'll see output like:
```
fuzz: elapsed: 3s, execs: 7142 (2380/sec), new interesting: 20 (total: 34)
```

- `elapsed`: Time spent fuzzing
- `execs`: Number of test executions
- `new interesting`: Inputs that increased code coverage in this interval
- `total`: Total number of interesting inputs found

## Corpus Storage

Go automatically maintains a corpus of interesting test cases in `testdata/fuzz/FuzzSanitizeClusterName/`. 
These are inputs that increased code coverage and will be run as regression tests in future test runs.

## Adding More Fuzz Tests

To add a new fuzz test:

1. Create a function starting with `Fuzz` that takes `*testing.F` as parameter
2. Add seed corpus with `f.Add()` calls
3. Implement the fuzz function with invariant checks
4. Run the test with `-fuzz` flag

Example:
```go
func FuzzMyFunction(f *testing.F) {
    // Seed corpus
    f.Add("example input")
    
    // Fuzz function
    f.Fuzz(func(t *testing.T, input string) {
        result := MyFunction(input)
        // Check invariants
        if !isValid(result) {
            t.Errorf("invalid result: %v", result)
        }
    })
}
```

## References

- [Go Fuzzing Documentation](https://go.dev/security/fuzz/)
- [Tutorial: Getting started with fuzzing](https://go.dev/doc/tutorial/fuzz)
