# petra-agent

Python implementation of Petra's agent service. The behaviour it implements is
specified in [`docs/agent-spec.md`](../../docs/agent-spec.md); the wire contract
is [`packages/agent-contract`](../../packages/agent-contract).

```bash
uv sync
make lint typecheck test
make contract   # regenerate src/petra_agent/contract.py (needs pnpm install at the repo root)
```
