---
name: promote-skills
description: Promote skills installed by the upstream skills CLI into the configured central agent-skills repository with category placement and verified provenance. Use when asked to collect, centralize, curate, categorize, or promote globally or project-installed agent skills.
---

# Promote Skills

Use the `agent-skills` CLI for all discovery, validation, copying, and history updates.

## Workflow

1. List candidates with `agent-skills list --scope all --json`.
2. Identify the requested skills and inspect each suggested category.
3. Use one of: `agent-tooling`, `development`, `research`, `productivity`, `content`, or `operations`.
4. If a global skill has no discoverable lock metadata, obtain its original repository URL and pass `--source`.
5. Preview with:

```bash
agent-skills promote <skill> --scope all --category <category> --source <url-if-needed> --dry-run --json
```

6. Review the destination, source, category, and hash.
7. Promote with the same command without `--dry-run`. Add `--yes` only after reviewing the preview.
8. Report the action, central destination, category, source, and resulting hash.

## Rules

- Do not copy skill directories manually.
- Do not invent missing source provenance.
- Do not change an existing skill's source unless the user explicitly approves `--allow-source-change`.
- Do not commit or push the central repository unless separately requested.
- Configure the repository with `AGENT_SKILLS_REPO` in the project `.env`, `~/.agents/.env`, or the process environment.
