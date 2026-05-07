import { getCheckboxTodoStatus } from "./get-todos";

/** Drop blank lines that only sit between two checkbox todo lines (keeps list flush). */
export const removeBlankLinesBetweenAdjacentCheckboxLines = (
  lines,
  doneStatusMarkers
) => {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i] === "" &&
      i > 0 &&
      i < lines.length - 1 &&
      getCheckboxTodoStatus(lines[i - 1], doneStatusMarkers) !== null &&
      getCheckboxTodoStatus(lines[i + 1], doneStatusMarkers) !== null
    ) {
      continue;
    }
    out.push(lines[i]);
  }
  return out;
};

export const trimLeadingEmptyLines = (lines) => {
  let start = 0;
  while (start < lines.length && lines[start] === "") {
    start++;
  }
  return lines.slice(start);
};

/**
 * Walk all ATX headings (deepest first, then bottom-up) and reorder completed
 * todos within each section until no section changes.
 */
export const applyMoveCompletedToAllSections = (lines, settings) => {
  const markers = settings.doneStatusMarkers || "xX-";
  let working = lines.slice();
  let anyChanged = false;
  let guard = 0;

  while (guard++ < 100) {
    const headings = [];
    for (let i = 0; i < working.length; i++) {
      const m = working[i].match(/^(#{1,6})\s/);
      if (m) {
        headings.push({ line: i, level: m[1].length });
      }
    }
    if (headings.length === 0) {
      break;
    }

    headings.sort((a, b) => {
      if (b.level !== a.level) {
        return b.level - a.level;
      }
      return b.line - a.line;
    });

    let passChanged = false;
    for (const h of headings) {
      const end = findSectionEndExclusive(working, h.line, h.level);
      const body = working.slice(h.line + 1, end);
      let newBody = moveCompletedTodoBlocksToBottom(body, settings);
      newBody = removeBlankLinesBetweenAdjacentCheckboxLines(newBody, markers);
      newBody = trimLeadingEmptyLines(newBody);

      const unchanged =
        body.length === newBody.length &&
        body.every((line, i) => line === newBody[i]);

      if (!unchanged) {
        working.splice(h.line + 1, end - h.line - 1, ...newBody);
        anyChanged = true;
        passChanged = true;
        break;
      }
    }

    if (!passChanged) {
      break;
    }
  }

  return { lines: working, changed: anyChanged };
};

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
