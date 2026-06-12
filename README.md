# Agent Skills

Central repository and promotion tooling for curated AI agent skills.

## Install the CLI

```bash
npm install -g git+ssh://git@github.com/bacnh85/agent-skills.git
```

Node.js 20 or later is required.

For a local checkout, install and verify the linked binary with:

```bash
npm install -g .
agent-skills --help
```

To run through npm without a global install after publishing this package, use
the package name:

```bash
npx @bacnh85/agent-skills list --scope all
```

Exact `npx agent-skills ...` support requires publishing an npm package named
`agent-skills` with the same `bin.agent-skills` entry. If this package remains
scoped as `@bacnh85/agent-skills`, the equivalent short-lived npm execution is
`npx @bacnh85/agent-skills ...`.

Configure the central checkout in a project `.env` or the shared agent
configuration at `~/.agents/.env`:

```dotenv
AGENT_SKILLS_REPO=/absolute/path/to/agent-skills
```

An explicit `--repo` flag and the process environment take precedence.

## Promote Skills

List skills installed by the upstream `skills` command:

```bash
agent-skills list --scope all
agent-skills list --scope all --json
```

Preview and promote a skill:

```bash
agent-skills promote obsidian --scope project --category productivity --dry-run
agent-skills promote obsidian --scope project --category productivity --yes
```

Running `agent-skills promote` in a terminal without skill names opens the
branded interactive flow. It discovers project and global installations,
auto-selects a sole match or presents a multiselect, then shows destination,
category, and source provenance for review before writing. Press `Esc` or
`Ctrl+C` at a prompt to cancel without changes.

`promote` searches project and global installations by default. Use `--scope`
when the same skill name exists in both locations.

Automation remains available through positional skill names and `--yes`.
`--yes` skips confirmation but does not select every installed skill when no
names are supplied. Use `--json` for undecorated machine-readable results.

For global skills without lock-file provenance, supply the original source:

```bash
agent-skills promote find-skills --scope global --category agent-tooling \
  --source git@github.com:vercel-labs/skills.git --yes
```

Promoted skills are stored at `skills/<category>/<name>`. Current metadata is
kept in `skill-registry.json`; append-only promotion events are recorded in
`skill-history.jsonl`.
