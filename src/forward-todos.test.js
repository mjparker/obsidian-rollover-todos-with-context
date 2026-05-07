import { expect, test } from "vitest";
import {
  annotateDestinationTodoLine,
  buildForwardTodoData,
  groupTodoBlocks,
  transformSourceTodoLine,
} from "./forward-todos";

test("groupTodoBlocks keeps parent and child blocks together", () => {
  const todos = [
    "- [ ] Parent 1",
    "    - [ ] Child 1",
    "    - note child",
    "- [ ] Parent 2",
    "    - [ ] Child 2",
    "- [ ] Parent 3",
  ];

  const result = groupTodoBlocks(todos);

  expect(result).toStrictEqual([
    ["- [ ] Parent 1", "    - [ ] Child 1", "    - note child"],
    ["- [ ] Parent 2", "    - [ ] Child 2"],
    ["- [ ] Parent 3"],
  ]);
});

test("annotateDestinationTodoLine appends backlink and trims trailing spaces", () => {
  const todoLine = "- [ ] Review PR   ";

  const result = annotateDestinationTodoLine(todoLine, "2026-05-06");

  expect(result).toBe("- [ ] Review PR (forwarded from [[2026-05-06]])");
});

test("transformSourceTodoLine converts status and appends destination backlink", () => {
  const todoLine = "  * [/] Review PR";

  const result = transformSourceTodoLine(todoLine, "2026-05-07");

  expect(result).toBe("  * [>] Review PR (forwarded to [[2026-05-07]])");
});

test("buildForwardTodoData annotates only parent lines and prepares replacements", () => {
  const todos = [
    "- [ ] Parent",
    "    - [ ] Child",
    "- [ ] Another",
  ];

  const result = buildForwardTodoData({
    todos,
    sourceDailyNote: "2026-05-06",
    destinationDailyNote: "2026-05-07",
  });

  expect(result).toStrictEqual({
    todosForToday: [
      "- [ ] Parent (forwarded from [[2026-05-06]])",
      "    - [ ] Child",
      "- [ ] Another (forwarded from [[2026-05-06]])",
    ],
    sourceReplacements: [
      {
        from: "- [ ] Parent",
        to: "- [>] Parent (forwarded to [[2026-05-07]])",
      },
      {
        from: "- [ ] Another",
        to: "- [>] Another (forwarded to [[2026-05-07]])",
      },
    ],
  });
});
