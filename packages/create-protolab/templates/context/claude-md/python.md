## Python Services

This project includes Python services alongside the Node.js monorepo.

### Python Conventions

- Use type hints for all function signatures
- Use Ruff for linting and formatting
- Use pytest for testing
- Follow PEP 8 naming conventions

### Service Locations

{{#pythonServices}}

- `{{path}}` — {{name}} ({{framework}})
  {{/pythonServices}}

### Running Python Services

```bash
# Install dependencies
cd {{servicePath}} && pip install -e .

# Run tests
pytest

# Lint
ruff check .

# Format
ruff format .
```
