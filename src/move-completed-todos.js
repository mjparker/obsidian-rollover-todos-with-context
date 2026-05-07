import { getCheckboxTodoStatus } from "./get-todos";

export const getLeadingWhitespaceLength = (line) =>
  (line.match(/^\s*/) || [""])[0].length;

/**
 * Walk upward from cursorLine to find the nearest ATX heading; return its line index and level.
 */
export const findContainingHeading = (lines, cursorLine) => {
  for (let i = cursorLine; i >= 0; i--) {
    const m = lines[i].match(/^(#{1,6})\s+\S/);
    if (m) {
      return { headingLine: i, headingLevel: m[1].length };
    }
  }
  return null;
};

/**
 * First line index after the section that starts at headingLine (exclusive).
 */
export const findSectionEndExclusive = (lines, headingLine, headingLevel) => {
  for (let i = headingLine + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s/);
    if (m && m[1].length <= headingLevel) {
      return i;
    }
  }
  return lines.length;
};

/**
 * Within body lines (below a heading), move blocks of completed checkbox todos to the bottom.
 * Order of non-completed lines is preserved; completed blocks keep their relative order at the end.
 */
export const moveCompletedTodoBlocksToBottom = (
  bodyLines,
  { doneStatusMarkers, rolloverChildren }
) => {
  const blocks = [];
  let i = 0;

  while (i < bodyLines.length) {
    const status = getCheckboxTodoStatus(bodyLines[i], doneStatusMarkers);
    if (status === null) {
      blocks.push({ kind: "text", lines: [bodyLines[i]] });
      i++;
      continue;
    }

    const blockLines = [bodyLines[i]];
    const parentIndent = getLeadingWhitespaceLength(bodyLines[i]);
    i++;

    if (rolloverChildren) {
      while (
        i < bodyLines.length &&
        getLeadingWhitespaceLength(bodyLines[i]) > parentIndent
      ) {
        blockLines.push(bodyLines[i]);
        i++;
      }
    }

    blocks.push({
      kind: "todo",
      completed: status === "completed",
      lines: blockLines,
    });
  }

  const top = [];
  const bottom = [];
  for (const b of blocks) {
    if (b.kind === "text") {
      top.push(...b.lines);
    } else if (!b.completed) {
      top.push(...b.lines);
    } else {
      bottom.push(...b.lines);
    }
  }

  return [...top, ...bottom];
};
