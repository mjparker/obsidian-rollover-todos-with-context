import { expect, test } from "vitest";
import {
  applyMoveCompletedToAllSections,
  findContainingHeading,
  findSectionEndExclusive,
  moveCompletedTodoBlocksToBottom,
  removeBlankLinesBetweenAdjacentCheckboxLines,
  trimLeadingEmptyLines,
} from "./move-completed-todos";

test("findContainingHeading finds nearest heading above cursor", () => {
  const lines = [
    "# Root",
    "## Sub",
    "text",
    "- [ ] open",
  ];

  expect(findContainingHeading(lines, 3)).toStrictEqual({
    headingLine: 1,
    headingLevel: 2,
  });
});

test("findSectionEndExclusive stops at sibling or higher heading", () => {
  const lines = [
    "## A",
    "x",
    "## B",
    "### C",
    "y",
    "## D",
  ];

  expect(findSectionEndExclusive(lines, 0, 2)).toBe(2);
  expect(findSectionEndExclusive(lines, 3, 3)).toBe(5);
});

test("removeBlankLinesBetweenAdjacentCheckboxLines removes blank between two todos", () => {
  expect(
    removeBlankLinesBetweenAdjacentCheckboxLines(
      ["- [ ] a", "", "- [x] b"],
      "xX-"
    )
  ).toStrictEqual(["- [ ] a", "- [x] b"]);
});

test("trimLeadingEmptyLines removes blank lines before first content", () => {
  expect(trimLeadingEmptyLines(["", "", "x"])).toStrictEqual(["x"]);
});

test("applyMoveCompletedToAllSections updates every heading section", () => {
  const lines = [
    "## A",
    "- [x] done a",
    "- [ ] open a",
    "## B",
    "- [ ] open b",
    "- [x] done b",
  ];

  const { lines: out, changed } = applyMoveCompletedToAllSections(lines, {
    doneStatusMarkers: "xX-",
    rolloverChildren: false,
  });

  expect(changed).toBe(true);
  expect(out).toStrictEqual([
    "## A",
    "- [ ] open a",
    "- [x] done a",
    "## B",
    "- [ ] open b",
    "- [x] done b",
  ]);
});

test("RCC example: completed todo sits directly under open todo with no blank line between", () => {
  const body = [
    "- [x] Prep for Dalton meeting",
    "- [ ] Close out RCC deployment",
  ];

  const result = moveCompletedTodoBlocksToBottom(body, {
    doneStatusMarkers: "xX-",
    rolloverChildren: false,
  });

  expect(result).toStrictEqual([
    "- [ ] Close out RCC deployment",
    "- [x] Prep for Dalton meeting",
  ]);
});

test("moveCompletedTodoBlocksToBottom puts completed todos last", () => {
  const body = [
    "Intro",
    "- [x] done",
    "- [ ] open",
    "- [X] also done",
  ];

  const result = moveCompletedTodoBlocksToBottom(body, {
    doneStatusMarkers: "xX-",
    rolloverChildren: false,
  });

  expect(result).toStrictEqual([
    "Intro",
    "- [ ] open",
    "- [x] done",
    "- [X] also done",
  ]);
});

test("moveCompletedTodoBlocksToBottom keeps nested lines with parent when rolloverChildren", () => {
  const body = [
    "- [x] parent",
    "    note child",
    "- [ ] open",
  ];

  const result = moveCompletedTodoBlocksToBottom(body, {
    doneStatusMarkers: "xX-",
    rolloverChildren: true,
  });

  expect(result).toStrictEqual([
    "- [ ] open",
    "- [x] parent",
    "    note child",
  ]);
});
