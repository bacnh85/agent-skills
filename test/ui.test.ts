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
  const ansi = /\x1B\[[0-9;]*m/g;
  const formatted = formatOperationResult({
    name: "demo",
    action: "skipped",
    message: "source unavailable"
  });
  assert.equal(formatted.replace(ansi, ""), "skipped: demo (source unavailable)");
});
