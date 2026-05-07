const GRAPHENE_MODIFIERS = ["\u202E", "\u200B", "\u200C", "\u200D"];

/** Split string into grapheme clusters (same rules as TodoParser). */
export function segmentGraphemes(content, contentType = "content") {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    return Array.from(segmenter.segment(content), (s) => s.segment);
  }
  console.error(
    `Intl.Segmenter not available, falling back to Array.from() for ${contentType}`
  );
  return Array.from(content);
}

/**
 * Checkbox line classification for list tooling (move completed, etc.).
 * @returns {null | 'incomplete' | 'completed'} null if not a valid single-grapheme checkbox todo
 */
export function getCheckboxTodoStatus(line, doneStatusMarkers = "xX-") {
  const match = line.match(/\s*[*+-] \[(.+?)\]/);
  if (!match) return null;

  const contentChars = segmentGraphemes(match[1], "checkbox content");
  if (contentChars.length !== 1) return null;

  const singleChar = contentChars[0];
  if (GRAPHENE_MODIFIERS.some((c) => c === singleChar)) return null;
  if (singleChar === ">") return null;

  const markerChars = segmentGraphemes(doneStatusMarkers, "done status markers");
  return markerChars.includes(singleChar) ? "completed" : "incomplete";
}

class TodoParser {
  // Support all unordered list bullet symbols as per spec (https://daringfireball.net/projects/markdown/syntax#list)
  bulletSymbols = ["-", "*", "+"];

  // Default completed status markers
  doneStatusMarkers = ["x", "X", "-"];

  // List of strings that include the Markdown content
  #lines;

  // Boolean that encodes whether nested items should be rolled over
  #withChildren;

  // Parse content with segmentation to allow for Unicode grapheme clusters
  #parseIntoChars(content, contentType = "content") {
    return segmentGraphemes(content, contentType);
  }

  constructor(lines, withChildren, doneStatusMarkers) {
    this.#lines = lines;
    this.#withChildren = withChildren;
    if (doneStatusMarkers) {
      this.doneStatusMarkers = this.#parseIntoChars(
        doneStatusMarkers,
        "done status markers"
      );
    }
  }

  // Returns true if string s is a todo-item
  #isTodo(s) {
    // Extract the checkbox content
    const match = s.match(/\s*[*+-] \[(.+?)\]/);
    if (!match) return false;

    const checkboxContent = match[1];

    // Parse content with segmentation to allow for Unicode grapheme clusters
    const contentChars = this.#parseIntoChars(
      checkboxContent,
      "checkbox content"
    );

    // Valid checkbox content must be exactly one grapheme cluster
    if (contentChars.length !== 1) {
      return false;
    }

    const singleChar = contentChars[0];

    // Already forwarded by this plugin; never roll again
    if (singleChar === ">") {
      return false;
    }

    // Exclude grapheme modifiers that are not valid as standalone content
    const hasGraphemeModifier = contentChars.some((char) =>
      GRAPHENE_MODIFIERS.includes(char)
    );
    if (hasGraphemeModifier) {
      return false;
    }

    // Check if the checkbox content contains any characters that are in doneStatusMarkers
    const hasDoneMarker = contentChars.some((char) =>
      this.doneStatusMarkers.includes(char)
    );

    // Return true (is a todo) if it does NOT contain any done markers
    return !hasDoneMarker;
  }

  // Returns true if line after line-number `l` is a nested item
  #hasChildren(l) {
    if (l + 1 >= this.#lines.length) {
      return false;
    }
    const indCurr = this.#getIndentation(l);
    const indNext = this.#getIndentation(l + 1);
    if (indNext > indCurr) {
      return true;
    }
    return false;
  }

  // Returns a list of strings that are the nested items after line `parentLinum`
  #getChildren(parentLinum) {
    const children = [];
    let nextLinum = parentLinum + 1;
    while (this.#isChildOf(parentLinum, nextLinum)) {
      children.push(this.#lines[nextLinum]);
      nextLinum++;
    }
    return children;
  }

  // Returns true if line `linum` has more indentation than line `parentLinum`
  #isChildOf(parentLinum, linum) {
    if (parentLinum >= this.#lines.length || linum >= this.#lines.length) {
      return false;
    }
    return this.#getIndentation(linum) > this.#getIndentation(parentLinum);
  }

  // Returns the number of whitespace-characters at beginning of string at line `l`
  #getIndentation(l) {
    return this.#lines[l].search(/\S/);
  }

  // Returns a list of strings that represents all the todos along with there potential children
  getTodos() {
    let todos = [];
    for (let l = 0; l < this.#lines.length; l++) {
      const line = this.#lines[l];
      if (this.#isTodo(line)) {
        todos.push(line);
        if (this.#withChildren && this.#hasChildren(l)) {
          const cs = this.#getChildren(l);
          todos = [...todos, ...cs];
          l += cs.length;
        }
      }
    }
    return todos;
  }
}

// Utility-function that acts as a thin wrapper around `TodoParser`
export const getTodos = ({
  lines,
  withChildren = false,
  doneStatusMarkers = null,
}) => {
  const todoParser = new TodoParser(lines, withChildren, doneStatusMarkers);
  return todoParser.getTodos();
};
