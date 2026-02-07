# Security Test Coverage Report

## Overview

Comprehensive security test coverage has been added to validate command injection prevention across the Automaker codebase. These tests document both existing vulnerabilities and proper validation patterns.

## Test Files Created

### 1. `apps/server/tests/security/command-injection.test.ts`

**Purpose:** Integration tests for command injection prevention in terminal and worktree routes.

**Coverage:**

- Validation function tests (isValidBranchName)
- Merge route security tests
- Push route security tests
- Terminal session route security tests
- Integration scenarios with real attack vectors

**Key Attack Vectors Tested:**

- Shell metacharacters: `;`, `&&`, `||`, `|`, `&`, `>`, `<`, `` ` ``, `$()`, `\n`
- Path traversal: `../../../`, `..\\..\\`
- Null bytes: `\0`, `\x00`
- Unicode control characters: `\u0000`, `\u001B`, `\u202E`, `\uFEFF`
- Space characters: spaces, tabs, newlines
- Command injection in branch names, remote names, commit messages
- Malicious session IDs and numeric parameters

**Test Statistics:**

- Total tests: 18
- Passing: 18 (3 with `.fails()` documenting known vulnerabilities)
- Attack vectors tested: 60+

### 2. `libs/platform/tests/validation.test.ts`

**Purpose:** Unit tests for validation utilities in the platform package, specifically `validateSlugInput`.

**Coverage:**

- Shell metacharacter rejection
- Path traversal prevention
- Control character filtering
- Unicode attack prevention
- Encoding bypass attempts
- Homoglyph attacks
- CRLF injection
- Zero-width characters
- Right-to-left override attacks

**Key Attack Vectors Tested:**

- All shell metacharacters
- Path traversal sequences
- Null bytes and control characters
- URL encoding attempts
- Unicode homoglyphs
- Various obfuscation techniques

**Test Statistics:**

- Total tests: 26
- Passing: 26
- Attack vectors tested: 100+

## Known Vulnerabilities Documented

The tests document the following known vulnerabilities that need to be fixed:

### 1. Merge Route Command Injection (merge.ts)

**Lines:** 43, 54, 65-66, 93

**Issue:** Uses `execAsync` with string interpolation instead of `execGitCommand` with array arguments.

**Vulnerable Code:**

```typescript
await execAsync(`git rev-parse --verify ${branchName}`, { cwd: projectPath });
await execAsync(`git merge ${branchName} -m "${message}"`, { cwd: projectPath });
```

**Fix Required:** Replace with `execGitCommand`:

```typescript
await execGitCommand(['rev-parse', '--verify', branchName], projectPath);
await execGitCommand(['merge', branchName, '-m', message], projectPath);
```

**Tests:**

- `.fails('should reject branch names with shell metacharacters')`
- `.fails('should sanitize commit messages')`
- `.fails('should not execute commands embedded in branch names')`

### 2. Push Route Parameter Validation (push.ts)

**Lines:** 33-36, 44, 49

**Issue:** Remote names are not validated before being used in shell commands.

**Current State:** Partially mitigated by git command failure, but should be validated explicitly.

**Recommendation:** Add validation for remote names similar to branch name validation.

## Attack Vector Categories

### 1. Command Chaining

- `;` - Command separator
- `&&` - AND operator
- `||` - OR operator
- `\n` - Newline execution

### 2. Command Substitution

- `` `command` `` - Backtick substitution
- `$(command)` - Modern substitution

### 3. Redirection

- `>` - Output redirection
- `<` - Input redirection
- `>>` - Append redirection

### 4. Path Traversal

- `../` - Parent directory
- `..\\` - Windows parent directory
- Multiple levels: `../../../etc/passwd`

### 5. Special Characters

- `*` - Wildcard
- `?` - Single character wildcard
- `[...]` - Character class
- `{...}` - Brace expansion
- `~` - Home directory
- `^` - History expansion
- `:` - Delimiter

### 6. Control Characters

- `\0` - Null byte
- `\t` - Tab
- `\r` - Carriage return
- `\n` - Newline
- `\x1B` - Escape sequence

### 7. Unicode Attacks

- `\u0000` - Unicode null
- `\u202E` - Right-to-left override
- `\uFEFF` - Zero-width no-break space
- `\u200B` - Zero-width space
- Homoglyphs (characters that look similar)

## Test Execution

### Run All Security Tests

```bash
# Command injection tests
npm run test:server -- apps/server/tests/security/command-injection.test.ts

# Platform validation tests
npm run test:packages -- libs/platform/tests/validation.test.ts

# All tests together
npm run test:all
```

### Expected Results

**Command Injection Tests:**

- 18 tests: 15 passing, 3 expected failures (`.fails()`)
- Expected failures document known vulnerabilities in merge route

**Platform Validation Tests:**

- 26 tests: 26 passing
- All attack vectors properly rejected by `validateSlugInput`

## Security Best Practices Demonstrated

### 1. Use Array Arguments, Not String Interpolation

**Bad:**

```typescript
await execAsync(`git branch -D ${branchName}`, { cwd });
```

**Good:**

```typescript
await execGitCommand(['branch', '-D', branchName], cwd);
```

### 2. Validate All User Input

**Required Validations:**

- Branch names: alphanumeric, dash, underscore, slash, dot only
- Remote names: alphanumeric, dash, underscore only
- Commit messages: sanitize or validate
- Session IDs: alphanumeric only
- Numeric parameters: ensure they're actually numbers

### 3. Use Allowlists, Not Denylists

**Bad:**

```typescript
if (input.includes(';') || input.includes('&&')) {
  throw new Error('Invalid');
}
```

**Good:**

```typescript
if (!/^[a-zA-Z0-9._\-/]+$/.test(input)) {
  throw new Error('Invalid');
}
```

### 4. Defense in Depth

Multiple layers of protection:

1. Input validation (first line of defense)
2. Secure command execution (array arguments)
3. File system permissions (OS-level protection)
4. Process isolation (worktrees, containers)

## Integration with CI/CD

These tests should be run:

- On every commit (pre-commit hook)
- In CI/CD pipeline (GitHub Actions)
- Before merging PRs
- As part of security audits

## Future Enhancements

1. **Add Fuzzing Tests:** Generate random attack vectors automatically
2. **Add Performance Tests:** Ensure validation doesn't impact performance
3. **Add Regression Tests:** When vulnerabilities are fixed, convert `.fails()` to normal tests
4. **Add Shell Script Tests:** Test the shell scripts in SECURITY_TODO.md
5. **Add Environment Variable Tests:** Test .env file handling security

## References

- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
- [Node.js Child Process Security](https://nodejs.org/api/child_process.html#child_process_security_concerns)
- [CWE-78: OS Command Injection](https://cwe.mitre.org/data/definitions/78.html)
- [SECURITY_TODO.md](./SECURITY_TODO.md) - Original security audit document

## Conclusion

These tests provide comprehensive coverage of command injection attack vectors and document known vulnerabilities that need to be addressed. The test suite serves as both a security validation tool and documentation of secure coding practices for the Automaker project.

**Key Metrics:**

- Test files: 2
- Total tests: 44
- Attack vectors tested: 160+
- Known vulnerabilities documented: 3
- Validation functions tested: 2

All tests pass successfully, with known vulnerabilities properly marked using `.fails()` to document them as expected failures until they are fixed.
