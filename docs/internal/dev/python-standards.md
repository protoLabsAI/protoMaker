# Python Standards

The protoLabs velocity stack for Python projects. Applies to agents, scrapers, data pipelines, and any Docker-deployed Python service.

## The Velocity Stack

| Layer            | Tool                  | Replaces                |
| ---------------- | --------------------- | ----------------------- |
| Package config   | `pyproject.toml`      | `requirements.txt`      |
| Linting          | ruff                  | flake8 + isort + pylint |
| Formatting       | ruff format           | black                   |
| Testing          | pytest + pytest-cov   | unittest                |
| Type checking    | Pylance (editor only) | mypy CI gate            |
| Containerization | Dockerfile + compose  | —                       |
| CI/CD            | GitHub Actions        | —                       |

---

## Package Config: pyproject.toml over requirements.txt

Use `pyproject.toml` (PEP 621) as the single source of truth for project metadata, dependencies, and tool configuration.

```toml
[project]
name = "my-agent"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "anthropic>=0.20.0",
    "httpx>=0.27.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-cov>=5.0",
    "ruff>=0.4.0",
]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "UP"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "--cov=src --cov-report=term-missing"
```

**Why not requirements.txt?** It only lists dependencies — no metadata, no dev/prod split, no tool config. `pyproject.toml` consolidates everything and is the current Python standard (PEP 621, adopted by pip, uv, hatch, poetry).

---

## Linting & Formatting: ruff

ruff is a single tool that replaces black, flake8, isort, and more. 177M+ downloads/month, written in Rust, ~100x faster than the tools it replaces.

```bash
# Lint
ruff check src/ tests/

# Format
ruff format src/ tests/

# Lint + fix auto-fixable issues
ruff check --fix src/ tests/
```

**Why ruff over black + flake8?**

- One config block in `pyproject.toml` instead of three separate config files
- Format + lint in a single pass — faster CI, fewer tools to pin
- Drop-in compatible with black's formatting style
- Active development, excellent editor integration

---

## Testing: pytest outside the container

Tests run on the host machine against mocked external services — not inside Docker. This keeps the feedback loop fast and avoids Docker build overhead during development.

```
tests/
  unit/
    test_classifier.py
    test_parser.py
  integration/
    test_pipeline.py
conftest.py
```

**Pattern: mock external services at the boundary**

```python
# tests/unit/test_classifier.py
from unittest.mock import AsyncMock, patch

import pytest

from src.classifier import Classifier


@pytest.fixture
def classifier():
    return Classifier(api_key="test-key")


async def test_classify_returns_label(classifier):
    with patch.object(classifier, "_call_api", new_callable=AsyncMock) as mock_api:
        mock_api.return_value = {"label": "actionable"}
        result = await classifier.classify("test failure message")
    assert result.label == "actionable"
```

**Coverage:** aim for 80%+ on business logic. Use `pytest-cov` with `--cov-fail-under=80` once coverage is established.

```bash
pytest --cov=src --cov-report=term-missing
```

---

## Containerization

Every Python service ships with a `Dockerfile` and `docker-compose.yml`.

**Dockerfile pattern:**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY src/ src/

CMD ["python", "-m", "src.main"]
```

**docker-compose.yml pattern:**

```yaml
services:
  agent:
    build: .
    env_file: .env
    restart: unless-stopped
    volumes:
      - ./data:/app/data
```

Keep the image lean: use `-slim` base, avoid dev dependencies in production image, use multi-stage builds for larger services.

---

## CI Template

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
  pull_request:

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install .[dev]
      - run: ruff check src/ tests/
      - run: ruff format --check src/ tests/
      - run: pytest

  docker-build:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    needs: lint-and-test
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t ${{ github.repository }}:latest .
```

**Key decisions:**

- Lint + test runs on every push and PR — fast feedback
- Docker build runs on `main` only — avoids expensive builds on feature branches
- No type checking CI gate initially (see below)

---

## Type Checking: When to Add

Start with Pylance in the editor. Add a CI gate only after interfaces stabilize.

**Phase 1 (default):** Pylance in VS Code / Cursor for inline feedback. No `mypy` in CI. This avoids fighting the type checker while the API is still changing.

**Phase 2 (after interfaces stabilize):** Add `mypy` or `pyright` to CI with `--ignore-missing-imports` to avoid false positives from untyped third-party packages.

```toml
# pyproject.toml — add when ready
[tool.mypy]
python_version = "3.11"
ignore_missing_imports = true
strict = false  # enable incrementally
```

Don't block PRs on type errors until the codebase has consistent type annotations. Informational-only is fine early on.

---

## Gap Detection Signals

When setuplab scans a Python project, it looks for:

| Signal              | Indicates                        |
| ------------------- | -------------------------------- |
| `.py` files present | Python project                   |
| No `package.json`   | Not a Node.js project            |
| `requirements.txt`  | Gap: migrate to `pyproject.toml` |
| No `pyproject.toml` | Gap: add PEP 621 config          |
| `black` or `flake8` | Gap: consolidate to ruff         |
| No `Dockerfile`     | Gap: containerize                |
| No `pytest` config  | Gap: add pytest + pytest-cov     |
| No GitHub Actions   | Gap: add CI workflow             |
