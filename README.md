# Agent Skills

`agent-skills` manages a curated repository of AI agent skills and installs
those skills into project or user directories.

## Requirements

- Node.js 20 or later
- Git for adding or updating skills from remote repositories

## Install the CLI

The package is published on npm. The recommended install paths use the npm
registry.

Install the CLI globally from npm:

```bash
npm install -g @bacnh85/agent-skills
```

Verify the installed CLI:

```bash
agent-skills --help
agent-skills version
```

Use it in a project:

```bash
npm install @bacnh85/agent-skills
npx agent-skills --help
```

Run the CLI without installing it first:

```bash
npx @bacnh85/agent-skills --help
```

Pin a specific version, tag, or commit:

```bash
npm install -g @bacnh85/agent-skills@0.1.1
npm install -g @bacnh85/agent-skills@latest
```

GitHub-shorthand installs (`bacnh85/agent-skills`) and SSH/Git installs are
still supported but are no longer the primary install path:

```bash
npm install -g bacnh85/agent-skills
npm install -g git+ssh://git@github.com/bacnh85/agent-skills.git
```

Set `AGENT_SKILLS_REPO` to the local checkout that contains the curated
`skills/` directory and its registry:

```bash
export AGENT_SKILLS_REPO=/absolute/path/to/agent-skills
```

PowerShell on Windows:

```powershell
$env:AGENT_SKILLS_REPO = "C:\path\to\agent-skills"
```

To persist it for future PowerShell sessions:

```powershell
[Environment]::SetEnvironmentVariable("AGENT_SKILLS_REPO", "C:\path\to\agent-skills", "User")
```

You can also set `AGENT_SKILLS_REPO` in dotenv files. The CLI checks these
locations in order, after the real environment variable:

1. `<current-directory>/.env.local`
2. `<current-directory>/.env`
3. `<current-directory>/.agents/.env.local`
4. `<current-directory>/.agents/.env`
5. `~/.agents/.env.local`
6. `~/.agents/.env`

Example:

```env
AGENT_SKILLS_REPO=/absolute/path/to/agent-skills
```

When the variable is not set anywhere, `agent-skills` uses the current working
directory as the repository.

## Install Skills for Agents

Run this command from a project directory to select skills interactively:

```bash
agent-skills install
```

Selected skills are installed in:

```text
<current-directory>/.agents/skills/
```

Install every skill without a prompt:

```bash
agent-skills install --all
```

Install selected skills for the current user:

```bash
agent-skills install -g
agent-skills install --global
```

Install every skill for the current user:

```bash
agent-skills install -g --all
agent-skills install --global --all
```

Global skills are installed in:

```text
~/.agents/skills/
```

Installing a selected skill replaces its existing directory with the
repository version. Skills in the destination that were not selected are left
untouched.

Interactive selection requires a terminal. Use `--all` in scripts, CI, and
other non-interactive environments.

## Uninstall Skills for Agents

Remove named skills from the current project:

```bash
agent-skills uninstall --skill demo --skill notes
agent-skills uninstall -s demo -s notes
```

Run without names to select installed project skills interactively:

```bash
agent-skills uninstall
```

Remove every installed project skill:

```bash
agent-skills uninstall --all
```

Use `-g` or `--global` with named, interactive, or `--all` forms to remove
skills from `~/.agents/skills/`:

```bash
agent-skills uninstall --skill demo -g
agent-skills uninstall -s demo --global
agent-skills uninstall -g
agent-skills uninstall --all -g
```

Only valid immediate skill directories are candidates. Uninstall leaves the
`.agents/skills` directory and all unselected or unrelated entries intact.

## Manage the Curated Repository

The following commands read and update the repository selected by
`AGENT_SKILLS_REPO`, or the current directory when it is unset.

### Add

Add skills from GitHub shorthand, a GitHub tree URL, any Git URL, or a local
path:

```bash
agent-skills add vercel-labs/skills
agent-skills add https://github.com/acme/skills/tree/main/skills/demo
agent-skills add ssh://git@github.com/acme/skills.git
agent-skills add ./my-local-skills
agent-skills add vercel-labs/skills --skill frontend-design
agent-skills add vercel-labs/skills -s frontend-design
agent-skills add vercel-labs/skills --skill frontend-design --skill web-design-guidelines
```

A direct skill source or a source containing one skill is selected
automatically. Sources containing multiple skills open an interactive
multiselect. Use the repeatable `-s <name>` or `--skill <name>` option to
select exact `SKILL.md` frontmatter names without interactive input.

### List

List skills registered in the curated repository:

```bash
agent-skills list
```

List skills installed for agents in the current project or current user:

```bash
agent-skills list --installed
agent-skills list --installed -g
agent-skills list --installed --global
```

### Remove

Remove named skills:

```bash
agent-skills remove --skill demo --skill another-skill
agent-skills remove -s demo -s another-skill
```

Run without names to select skills interactively:

```bash
agent-skills remove
```

### Update

Update named skills from their recorded sources:

```bash
agent-skills update --skill demo --skill another-skill
agent-skills update -s demo -s another-skill
```

Run without names to update every registered skill:

```bash
agent-skills update
```

Git skills track the branch or ref recorded when added. Local skills are
copied again from their original absolute path.

## Command Reference

```text
agent-skills add <source> [-s|--skill <name>]...
agent-skills remove [-s|--skill <name>]...
agent-skills list [--installed] [-g|--global]
agent-skills version
agent-skills update [-s|--skill <name>]...
agent-skills install [-g|--global] [--all]
agent-skills uninstall [-s|--skill <name>]... [-g|--global]
agent-skills uninstall --all [-g|--global]
```

`agent-skills version` prints the installed version and checks npm for the
latest release. Successful interactive commands check at most once every 24
hours and offer to install an available update. Choosing the default “later”
option prints `npm install -g @bacnh85/agent-skills@latest`.

## Repository Metadata

`skill-registry.json` records each curated skill's repository-relative
destination, source, source-relative path, tracked ref and commit, content
hash, and timestamps. `skill-history.jsonl` contains append-only `add`,
`update`, and `remove` events.

These metadata files belong to the curated repository. The `install` command
copies only skill directories and does not create registry or history files in
`.agents/skills`.

Version 1 registries are migrated in memory and written as version 2 on the
next mutation. Legacy entries without enough source provenance remain listable
and removable, but must be re-added before they can be updated.
