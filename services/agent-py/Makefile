.PHONY: lint typecheck test contract

CONTRACT_DIR := ../../packages/agent-contract

lint:
	uv run ruff check .
	uv run ruff format --check .

typecheck:
	uv run mypy src tests

test:
	uv run pytest

# zod (packages/agent-contract) -> contract.schema.json -> pydantic models.
# --strict-nullable: a field with a zod default rejects null, as zod does,
# rather than arriving as None (e.g. `allergies`).
contract:
	pnpm --dir $(CONTRACT_DIR) run export-json-schema
	uv run datamodel-codegen \
		--input $(CONTRACT_DIR)/contract.schema.json \
		--input-file-type jsonschema \
		--output src/petra_agent/contract.py \
		--output-model-type pydantic_v2.BaseModel \
		--use-annotated \
		--field-constraints \
		--target-python-version 3.12 \
		--use-standard-collections \
		--use-union-operator \
		--set-default-enum-member \
		--strict-nullable \
		--disable-timestamp \
		--formatters ruff-format
