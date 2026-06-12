import assert from "node:assert/strict";
import test from "node:test";
import {
  createSkillOptions,
  formatReview,
  selectSkills,
  sortInstalledSkills
} from "../src/promote-ui.js";
import type { InstalledSkill } from "../src/types.js";

const installed: InstalledSkill[] = [
  { name: "beta", path: "/skills/beta", scope: "project", agents: [] },
  { name: "alpha", path: "/global/alpha", scope: "global", agents: [] },
  { name: "alpha", path: "/project/alpha", scope: "project", agents: [] }
];

test("skill options sort by name and scope with scope and path hints", () => {
  assert.deepEqual(
    sortInstalledSkills(installed).map((skill) => `${skill.name}:${skill.scope}`),
    ["alpha:global", "alpha:project", "beta:project"]
  );
  assert.deepEqual(createSkillOptions(installed), [
    {
      value: "global:alpha",
      label: "alpha",
      hint: "global · /global/alpha"
    },
    {
      value: "project:alpha",
      label: "alpha",
      hint: "project · /project/alpha"
    },
    {
      value: "project:beta",
      label: "beta",
      hint: "project · /skills/beta"
    }
  ]);
});

test("single-skill discovery auto-selects and empty discovery selects nothing", async () => {
  const single = [installed[0]];
  assert.deepEqual(await selectSkills(single), {
    cancelled: false,
    skills: single
  });
  assert.deepEqual(await selectSkills([]), {
    cancelled: false,
    skills: []
  });
});

test("review includes destination, category, and provenance", () => {
  const review = formatReview(
    [
      {
        skill: installed[0],
        category: "development",
        provenance: { source: "git@example/repo.git", sourceType: "git" }
      }
    ],
    "/central"
  );
  assert.match(review, /Destination\s+\/central\/skills\/development\/beta/);
  assert.match(review, /Category\s+development/);
  assert.match(review, /Source\s+git@example\/repo.git/);
});
