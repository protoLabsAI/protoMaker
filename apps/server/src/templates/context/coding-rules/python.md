# Python Coding Rules

## Type Hints

- All function signatures must have type hints
- Use `from __future__ import annotations` for forward references
- Use `TypedDict` for structured dictionaries
- Use `Protocol` for structural typing

## Naming

- **Files/modules**: snake_case (`my_service.py`)
- **Classes**: PascalCase (`MyService`)
- **Functions/variables**: snake_case (`my_function`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- **Private**: prefix with `_` (`_internal_helper`)

## Error Handling

- Use specific exception types
- Never bare `except:` — always specify the exception
- Use custom exception classes for domain errors
- Log errors with context

## Testing

- Use pytest (not unittest)
- Name test files `test_*.py` or `*_test.py`
- Use fixtures for setup/teardown
- Use parametrize for data-driven tests
- Aim for >80% coverage on business logic

## Formatting & Linting

- Use Ruff for both linting and formatting
- Line length: 100 characters
- Follow PEP 8 conventions
- Sort imports with isort (via Ruff)
