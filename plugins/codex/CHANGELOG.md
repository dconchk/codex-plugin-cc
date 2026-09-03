# Changelog

## 1.0.7

- `codex-companion.mjs task --output-schema <file>`: a JSON Schema the app-server enforces on the task's final response (`turn/start` `outputSchema`, the path `review` already uses for its own schema). Read once before a turn is spent, so a missing or invalid file fails first; the path travels with a background job's request. Motivation: HOPPER decision 0040 — the receipt schema is enforced at the provider, not asked for in the prompt.

## 1.0.0

- Initial version of the Codex plugin for Claude Code
