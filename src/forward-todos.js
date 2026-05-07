const TODO_CHECKBOX_PATTERN = /^(\s*[*+-]\s)\[(.+?)\]/u;

/** Parent must be an open task `- [ ]` (single space); other incomplete markers are not forwarded. */
const OPEN_CHECKBOX_LINE = /^\s*[*+-]\s\[ \]/u;

const getIndentation = (line) => (line.match(/^\s*/) || [""])[0].length;

export const isOpenCheckboxTodoLine = (line) => OPEN_CHECKBOX_LINE.test(line);

export const groupTodoBlocks = (todos) => {
  const groups = [];
  let index = 0;

  while (index < todos.length) {
    const group = [todos[index]];
    const parentIndentation = getIndentation(todos[index]);
    index++;

    while (index < todos.length) {
      const currentIndentation = getIndentation(todos[index]);
      if (currentIndentation <= parentIndentation) {
        break;
      }
      group.push(todos[index]);
      index++;
    }

    groups.push(group);
  }

  return groups;
};

export const annotateDestinationTodoLine = (line, sourceDailyNote) =>
  `${line.trimEnd()} (forwarded from [[${sourceDailyNote}]])`;

export const transformSourceTodoLine = (line, destinationDailyNote) => {
  const todoLineWithForwardMarker = line.replace(
    TODO_CHECKBOX_PATTERN,
    "$1[>]"
  );

  if (todoLineWithForwardMarker === line) {
    return line;
  }

  return `${todoLineWithForwardMarker.trimEnd()} (forwarded to [[${destinationDailyNote}]])`;
};

export const buildForwardTodoData = ({
  todos,
  sourceDailyNote,
  destinationDailyNote,
}) => {
  const todoBlocks = groupTodoBlocks(todos);
  const todosForToday = [];
  const sourceReplacements = [];

  todoBlocks.forEach((block) => {
    const [parentTodo, ...childTodos] = block;
    if (!isOpenCheckboxTodoLine(parentTodo)) {
      return;
    }
    const annotatedTodo = annotateDestinationTodoLine(parentTodo, sourceDailyNote);
    todosForToday.push(annotatedTodo, ...childTodos);
    sourceReplacements.push({
      from: parentTodo,
      to: transformSourceTodoLine(parentTodo, destinationDailyNote),
    });
  });

  return { todosForToday, sourceReplacements };
};
