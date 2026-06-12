# Agent Skills

Repository-based management for curated AI agent skills.

## Install

```bash
npm install -g git+ssh://git@github.com/bacnh85/agent-skills.git
```

Node.js 20 or later is required.

By default, commands manage the current working directory. Set
`AGENT_SKILLS_REPO` to manage another checkout:

```bash
export AGENT_SKILLS_REPO=/absolute/path/to/agent-skills
```

## Commands

Add skills from GitHub shorthand, a GitHub tree URL, any git URL, or a local
path:

```bash
agent-skills add vercel-labs/skills
agent-skills add https://github.com/acme/skills/tree/main/skills/demo
agent-skills add ssh://git@github.com/acme/skills.git
agent-skills add ./my-local-skills
```

A direct skill source or a source containing one skill is selected
automatically. Sources containing multiple skills open a terminal multiselect.
Non-interactive callers must use a direct skill URL or path.

List registered skills:

```bash
agent-skills list
```

Remove named skills or select them interactively:

```bash
agent-skills remove demo
agent-skills remove
```

Update selected skills, or all registered skills when no names are supplied:

```bash
agent-skills update demo
agent-skills update
```

Git skills track the branch or ref recorded when added. Local skills are
recopied from their original absolute path.

## Metadata

`skill-registry.json` records each skill's repository-relative destination,
source, source-relative path, tracked ref and commit, content hash, and
timestamps. `skill-history.jsonl` contains append-only `add`, `update`, and
`remove` events.

Version 1 registries are migrated in memory and written as version 2 on the
next mutation. Legacy entries without enough source provenance remain listable
and removable, but must be re-added before they can be updated.
