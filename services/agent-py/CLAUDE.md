# Petra agent (Python)

## Commands
- uv sync | uv run pytest | uv run ruff check . | uv run ruff format . | uv run mypy src tests
- make contract: regenerate src/petra_agent/contract.py from packages/agent-contract

## Architecture
- Ports and adapters: core logic depends only on Protocols in ports.py; vendor SDKs live in adapters/.
- contract.py holds generated camelCase wire models; convert to snake_case domain models at the HTTP edge.
- Reference behaviour: docs/agent-spec.md.

## Rules
- Never edit contract.py by hand. Change the zod contract, then run make contract.
- Never lower eval thresholds, skip tests or add type: ignore to make CI pass. Stop and explain instead.
- Every behaviour change needs a test. LLM and embedding calls are faked in unit tests.
- No secrets in code or logs. Never log prompts, allergies or profile data unredacted.
- Allergen and diet filtering is a safety control. Any change needs a property-based test.