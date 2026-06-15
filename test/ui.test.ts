import assert from "node:assert/strict";
import test from "node:test";
import { formatOperationResult, runOperation, skillOptions } from "../src/ui.js";

test("selection options preserve repository-relative paths", () => {
  assert.deepEqual(
    skillOptions([
      { name: "demo", absolutePath: "/tmp/source/nested/demo", relativePath: "nested/demo" }
    ]),
    [{ value: "nested/demo", label: "demo", hint: "nested/demo" }]
  );
});

test("selection options display declared names for mismatched source directories", () => {
  assert.deepEqual(
    skillOptions([
      {
        name: "evaluating-llms-harness",
        absolutePath: "/tmp/source/lm-evaluation-harness",
        relativePath: "skills/lm-evaluation-harness"
      }
    ]),
    [{
      value: "skills/lm-evaluation-harness",
      label: "evaluating-llms-harness",
      hint: "skills/lm-evaluation-harness"
    }]
  );
});

test("non-interactive operations run without suppressing progress callbacks", () => {
  const messages: string[] = [];
  const results = runOperation("Starting", "Finished", false, (progress) => {
    progress.message("Working");
    messages.push("ran");
    return [{ name: "demo", action: "updated", path: "skills/demo" }];
  });

  assert.deepEqual(messages, ["ran"]);
  assert.deepEqual(results, [
    { name: "demo", action: "updated", path: "skills/demo" }
  ]);
});

test("operation results share consistent formatting", () => {
  const formatted = formatOperationResult({
    name: "demo",
    action: "skipped",
    message: "source unavailable"
  });
  assert.equal(formatted.replace(/\x1B\[[0-9;]*m/g, ""), "skipped: demo (source unavailable)");
});
