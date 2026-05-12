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

const arraysEqual = (a, b) =>
  a.length === b.length && a.every((line, i) => line === b[i]);

const reorderLinesWithCompletedAtBottom = (lines, settings) => {
  const markers = settings.doneStatusMarkers || "xX-";
  let next = moveCompletedTodoBlocksToBottom(lines, settings);
  next = removeBlankLinesBetweenAdjacentCheckboxLines(next, markers);
  return trimLeadingEmptyLines(next);
};

/** Line indices that sit in any ATX heading section body (below a heading, until sibling-or-higher). */
export const getHeadingBodyLineIndices = (lines) => {
  const covered = new Set();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s/);
    if (!m) continue;
    const end = findSectionEndExclusive(lines, i, m[1].length);
    for (let j = i + 1; j < end; j++) {
      covered.add(j);
    }
  }
  return covered;
};

/** Contiguous line ranges not covered by heading section bodies. */
export const findUnheadedLineRanges = (lines) => {
  const covered = getHeadingBodyLineIndices(lines);
  const ranges = [];
  let start = null;

  for (let i = 0; i < lines.length; i++) {
    if (covered.has(i)) {
      if (start !== null) {
        ranges.push({ start, end: i });
        start = null;
      }
      continue;
    }
    if (start === null) {
      start = i;
    }
  }
  if (start !== null) {
    ranges.push({ start, end: lines.length });
  }
  return ranges;
};

/**
 * Split a line range into groups separated by one or more blank lines.
 * Each group is { start, end } indices relative to the full lines array.
 */
export const splitRangeIntoBlankSeparatedGroups = (lines, rangeStart, rangeEnd) => {
  const groups = [];
  let groupStart = null;

  for (let i = rangeStart; i < rangeEnd; i++) {
    if (lines[i] === "") {
      if (groupStart !== null) {
        groups.push({ start: groupStart, end: i });
        groupStart = null;
      }
      continue;
    }
    if (groupStart === null) {
      groupStart = i;
    }
  }
  if (groupStart !== null) {
    groups.push({ start: groupStart, end: rangeEnd });
  }
  return groups;
};

const groupContainsCheckboxTodo = (lines, group, doneStatusMarkers) =>
  lines
    .slice(group.start, group.end)
    .some((line) => getCheckboxTodoStatus(line, doneStatusMarkers) !== null);

/**
 * Reorder completed todos in each blank-line-separated list outside headings.
 * @returns {boolean} whether lines were modified
 */
export const applyMoveCompletedToUnheadedListGroups = (lines, settings) => {
  const markers = settings.doneStatusMarkers || "xX-";
  const ranges = findUnheadedLineRanges(lines);
  let changed = false;

  for (let r = ranges.length - 1; r >= 0; r--) {
    const { start, end } = ranges[r];
    const groups = splitRangeIntoBlankSeparatedGroups(lines, start, end);
    if (groups.length === 0) {
      continue;
    }

    const rebuilt = [];
    let lastGroupEnd = start;

    for (const group of groups) {
      for (let i = lastGroupEnd; i < group.start; i++) {
        rebuilt.push(lines[i]);
      }
      const groupLines = lines.slice(group.start, group.end);
      const nextGroupLines = groupContainsCheckboxTodo(lines, group, markers)
        ? reorderLinesWithCompletedAtBottom(groupLines, settings)
        : groupLines;
      if (!arraysEqual(groupLines, nextGroupLines)) {
        changed = true;
      }
      rebuilt.push(...nextGroupLines);
      lastGroupEnd = group.end;
    }
    for (let i = lastGroupEnd; i < end; i++) {
      rebuilt.push(lines[i]);
    }

    if (!arraysEqual(lines.slice(start, end), rebuilt)) {
      lines.splice(start, end - start, ...rebuilt);
      changed = true;
    }
  }

  return changed;
};

/**
 * Walk all ATX headings (deepest first, then bottom-up) and reorder completed
 * todos within each section; also reorder unheaded list groups separated by blanks.
 */
export const applyMoveCompletedToAllSections = (lines, settings) => {
  let working = lines.slice();
  let anyChanged = false;
  let guard = 0;

  while (guard++ < 100) {
    let passChanged = false;

    const headings = [];
    for (let i = 0; i < working.length; i++) {
      const m = working[i].match(/^(#{1,6})\s/);
      if (m) {
        headings.push({ line: i, level: m[1].length });
      }
    }

    headings.sort((a, b) => {
      if (b.level !== a.level) {
        return b.level - a.level;
      }
      return b.line - a.line;
    });

    for (const h of headings) {
      const end = findSectionEndExclusive(working, h.line, h.level);
      const body = working.slice(h.line + 1, end);
      const newBody = reorderLinesWithCompletedAtBottom(body, settings);

      if (!arraysEqual(body, newBody)) {
        working.splice(h.line + 1, end - h.line - 1, ...newBody);
        anyChanged = true;
        passChanged = true;
        break;
      }
    }

    if (!passChanged) {
      if (applyMoveCompletedToUnheadedListGroups(working, settings)) {
        anyChanged = true;
        passChanged = true;
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
