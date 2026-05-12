import { MarkdownView, Notice, Plugin } from "obsidian";
import {
  getDailyNoteSettings,
  getAllDailyNotes,
  getDailyNote,
} from "obsidian-daily-notes-interface";
import UndoModal from "./ui/UndoModal";
import RolloverSettingTab from "./ui/RolloverSettingTab";
import { getTodos } from "./get-todos";
import { buildForwardTodoData, groupTodoBlocks } from "./forward-todos";
import { applyMoveCompletedToAllSections } from "./move-completed-todos";

const MAX_TIME_SINCE_CREATION = 5000; // 5 seconds

/* Just some boilerplate code for recursively going through subheadings for later
function createRepresentationFromHeadings(headings) {
  let i = 0;
  const tags = [];

  (function recurse(depth) {
    let unclosedLi = false;
    while (i < headings.length) {
      const [hashes, data] = headings[i].split("# ");
      if (hashes.length < depth) {
        break;
      } else if (hashes.length === depth) {
        if (unclosedLi) tags.push('</li>');
        unclosedLi = true;
        tags.push('<li>', data);
        i++;
      } else {
        tags.push('<ul>');
        recurse(depth + 1);
        tags.push('</ul>');
      }
    }
    if (unclosedLi) tags.push('</li>');
  })(-1);
  return tags.join('\n');
}
*/

export default class RolloverTodosPlugin extends Plugin {
  async loadSettings() {
    const DEFAULT_SETTINGS = {
      templateHeading: "none",
      previousDayBehavior: "duplicate",
      removeEmptyTodos: false,
      rolloverChildren: false,
      rolloverOnFileCreate: true,
      doneStatusMarkers: "xX-",
      leadingNewLine: true,
    };
    const loadedSettings = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);

    if (!this.settings.previousDayBehavior) {
      this.settings.previousDayBehavior = this.settings.deleteOnComplete
        ? "delete"
        : "duplicate";
    }

    if (
      !["duplicate", "delete", "forward"].includes(
        this.settings.previousDayBehavior,
      )
    ) {
      this.settings.previousDayBehavior = "duplicate";
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  isDailyNotesEnabled() {
    const dailyNotesPlugin = this.app.internalPlugins.plugins["daily-notes"];
    const dailyNotesEnabled = dailyNotesPlugin && dailyNotesPlugin.enabled;

    const periodicNotesPlugin = this.app.plugins.getPlugin("periodic-notes");
    const periodicNotesEnabled =
      periodicNotesPlugin && periodicNotesPlugin.settings?.daily?.enabled;

    return dailyNotesEnabled || periodicNotesEnabled;
  }

  getLastDailyNote() {
    const { moment } = window;
    let { folder, format } = getDailyNoteSettings();

    folder = this.getCleanFolder(folder);
    folder = folder.length === 0 ? folder : folder + "/";

    const dailyNoteRegexMatch = new RegExp("^" + folder + "(.*).md$");
    const todayMoment = moment();

    // get all notes in directory that aren't null
    const dailyNoteFiles = this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(folder))
      .filter((file) =>
        moment(
          file.path.replace(dailyNoteRegexMatch, "$1"),
          format,
          true,
        ).isValid(),
      )
      .filter((file) => file.basename)
      .filter((file) =>
        this.getFileMoment(file, folder, format).isSameOrBefore(
          todayMoment,
          "day",
        ),
      );

    // sort by date
    const sorted = dailyNoteFiles.sort(
      (a, b) =>
        this.getFileMoment(b, folder, format).valueOf() -
        this.getFileMoment(a, folder, format).valueOf(),
    );
    return sorted[1];
  }

  /**
   * All daily notes strictly before today, oldest first (for aggregating open todos).
   */
  getDailyNotesBeforeToday() {
    const { moment } = window;
    let { folder, format } = getDailyNoteSettings();

    folder = this.getCleanFolder(folder);
    folder = folder.length === 0 ? folder : folder + "/";

    const dailyNoteRegexMatch = new RegExp("^" + folder + "(.*).md$");
    const todayStart = moment().startOf("day");

    const dailyNoteFiles = this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(folder))
      .filter((file) =>
        moment(
          file.path.replace(dailyNoteRegexMatch, "$1"),
          format,
          true,
        ).isValid(),
      )
      .filter((file) => file.basename)
      .filter((file) =>
        this.getFileMoment(file, folder, format)
          .startOf("day")
          .isBefore(todayStart),
      );

    return dailyNoteFiles.sort(
      (a, b) =>
        this.getFileMoment(a, folder, format).valueOf() -
        this.getFileMoment(b, folder, format).valueOf(),
    );
  }

  getFileMoment(file, folder, format) {
    let path = file.path;

    if (path.startsWith(folder)) {
      // Remove length of folder from start of path
      path = path.substring(folder.length);
    }

    if (path.endsWith(`.${file.extension}`)) {
      // Remove length of file extension from end of path
      path = path.substring(0, path.length - file.extension.length - 1);
    }

    return moment(path, format);
  }

  async getAllUnfinishedTodos(file) {
    const dn = await this.app.vault.read(file);
    const dnLines = dn.split(/\r?\n|\r|\n/g);

    return getTodos({
      lines: dnLines,
      withChildren: this.settings.rolloverChildren,
      doneStatusMarkers: this.settings.doneStatusMarkers,
    });
  }

  async sortHeadersIntoHierarchy(file) {
    ///console.log('testing')
    const templateContents = await this.app.vault.read(file);
    const allHeadings = Array.from(templateContents.matchAll(/#{1,} .*/g)).map(
      ([heading]) => heading,
    );

    if (allHeadings.length > 0) {
      console.log(createRepresentationFromHeadings(allHeadings));
    }
  }

  isDailyNoteFile(file) {
    const { moment } = window;
    let { folder, format } = getDailyNoteSettings();
    folder = this.getCleanFolder(folder);
    const prefix = folder === "" ? "" : folder + "/";
    if (folder !== "" && !file.path.startsWith(prefix)) {
      return false;
    }
    return moment(file.basename, format, true).isValid();
  }

  async moveCompletedTodosInDailyNote() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice("Open a note in the editor first.", 4000);
      return;
    }

    const file = view.file;
    if (!this.isDailyNoteFile(file)) {
      new Notice("Active file is not in your daily notes folder/format.", 6000);
      return;
    }

    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n|\r|\n/g);
    const endsWithNewline = /\r?\n$/.test(content);

    const settings = {
      doneStatusMarkers: this.settings.doneStatusMarkers || "xX-",
      rolloverChildren: !!this.settings.rolloverChildren,
    };

    const { lines: newLines, changed } = applyMoveCompletedToAllSections(
      lines,
      settings,
    );

    if (!changed) {
      new Notice("No completed todos to move.", 4500);
      return;
    }

    let out = newLines.join("\n");
    if (endsWithNewline && !out.endsWith("\n")) {
      out += "\n";
    }

    await this.app.vault.modify(file, out);
    new Notice(
      "Moved completed todos to the bottom of each section in this note.",
      5000,
    );
  }

  getCleanFolder(folder) {
    // Check if user defined folder with root `/` e.g. `/dailies`
    if (folder.startsWith("/")) {
      folder = folder.substring(1);
    }

    // Check if user defined folder with trailing `/` e.g. `dailies/`
    if (folder.endsWith("/")) {
      folder = folder.substring(0, folder.length - 1);
    }

    return folder;
  }

  async rollover(file = undefined) {
    /*** First we check if the file created is actually a valid daily note ***/
    let { folder, format } = getDailyNoteSettings();
    let ignoreCreationTime = false;

    // Rollover can be called, but we need to get the daily file
    if (file == undefined) {
      const allDailyNotes = getAllDailyNotes();
      file = getDailyNote(window.moment(), allDailyNotes);
      ignoreCreationTime = true;
    }
    if (!file) return;

    folder = this.getCleanFolder(folder);

    // is a daily note
    if (!file.path.startsWith(folder)) return;

    // is today's daily note
    const today = new Date();
    const todayFormatted = window.moment(today).format(format);
    const filePathConstructed = `${folder}${
      folder == "" ? "" : "/"
    }${todayFormatted}.${file.extension}`;
    if (filePathConstructed !== file.path) return;

    // was just created
    if (
      today.getTime() - file.stat.ctime > MAX_TIME_SINCE_CREATION &&
      !ignoreCreationTime
    )
      return;

    /*** Next, if it is a valid daily note, but we don't have daily notes enabled, we must alert the user ***/
    if (!this.isDailyNotesEnabled()) {
      new Notice(
        "RolloverTodosPlugin unable to rollover unfinished todos: Please enable Daily Notes, or Periodic Notes (with daily notes enabled).",
        10000,
      );
    } else {
      const {
        templateHeading,
        previousDayBehavior,
        removeEmptyTodos,
        leadingNewLine,
      } = this.settings;

      // check if there is a daily note from yesterday
      const lastDailyNote = this.getLastDailyNote();
      if (!lastDailyNote) return;

      // TODO: Rollover to subheadings (optional)
      //this.sortHeadersIntoHierarchy(lastDailyNote)

      // get unfinished todos from yesterday, if exist
      let todos_yesterday = await this.getAllUnfinishedTodos(lastDailyNote);

      console.log(
        `rollover-daily-todos: ${todos_yesterday.length} todos found in ${lastDailyNote.basename}.md`,
      );

      if (todos_yesterday.length == 0) {
        return;
      }

      // setup undo history
      let undoHistoryInstance = {
        previousDays: [],
        today: {
          file: undefined,
          oldContent: "",
        },
      };

      // Potentially filter todos from yesterday for today
      let todosAdded = 0;
      let emptiesToNotAddToTomorrow = 0;
      let todos_today = !removeEmptyTodos ? todos_yesterday : [];
      if (removeEmptyTodos) {
        todos_yesterday.forEach((line, i) => {
          const trimmedLine = (line || "").trim();
          if (trimmedLine != "- [ ]" && trimmedLine != "- [  ]") {
            todos_today.push(line);
            todosAdded++;
          } else {
            emptiesToNotAddToTomorrow++;
          }
        });
      } else {
        todosAdded = todos_yesterday.length;
      }

      let todos_today_for_note = todos_today;
      let sourceReplacements = [];
      if (previousDayBehavior === "forward") {
        const forwardTodoData = buildForwardTodoData({
          todos: todos_today,
          sourceDailyNote: lastDailyNote.basename,
          destinationDailyNote: file.basename,
        });
        todos_today_for_note = forwardTodoData.todosForToday;
        sourceReplacements = forwardTodoData.sourceReplacements;
        todosAdded = todos_today_for_note.length;
      }

      if (
        previousDayBehavior === "forward" &&
        todos_today_for_note.length === 0
      ) {
        new Notice(
          "Rollover: nothing to forward—only open `- [ ]` tasks are forwarded.",
          8000,
        );
        return;
      }

      // get today's content and modify it
      let templateHeadingNotFoundMessage = "";
      const templateHeadingSelected = templateHeading !== "none";

      if (todos_today_for_note.length > 0) {
        let dailyNoteContent = await this.app.vault.read(file);
        undoHistoryInstance.today = {
          file: file,
          oldContent: `${dailyNoteContent}`,
        };
        const todos_todayString = `\n${todos_today_for_note.join("\n")}`;

        // If template heading is selected, try to rollover to template heading
        if (templateHeadingSelected) {
          const contentAddedToHeading = dailyNoteContent.replace(
            templateHeading,
            `${templateHeading}${
              leadingNewLine ? "\n" : ""
            }${todos_todayString}`,
          );
          if (contentAddedToHeading == dailyNoteContent) {
            templateHeadingNotFoundMessage = `Rollover couldn't find '${templateHeading}' in today's daily not. Rolling todos to end of file.`;
          } else {
            dailyNoteContent = contentAddedToHeading;
          }
        }

        // Rollover to bottom of file if no heading found in file, or no heading selected
        if (
          !templateHeadingSelected ||
          templateHeadingNotFoundMessage.length > 0
        ) {
          dailyNoteContent += todos_todayString;
        }

        await this.app.vault.modify(file, dailyNoteContent);
      }

      // If delete behavior is selected, remove rolled todos from the previous note.
      if (previousDayBehavior === "delete") {
        let lastDailyNoteContent = await this.app.vault.read(lastDailyNote);
        undoHistoryInstance.previousDays.push({
          file: lastDailyNote,
          oldContent: `${lastDailyNoteContent}`,
        });
        let lines = lastDailyNoteContent.split("\n");

        for (let i = lines.length; i >= 0; i--) {
          if (todos_yesterday.includes(lines[i])) {
            lines.splice(i, 1);
          }
        }

        const modifiedContent = lines.join("\n");
        await this.app.vault.modify(lastDailyNote, modifiedContent);
      }

      // If forward behavior is selected, mark rolled todos as forwarded in the previous note.
      if (previousDayBehavior === "forward" && sourceReplacements.length > 0) {
        let lastDailyNoteContent = await this.app.vault.read(lastDailyNote);
        undoHistoryInstance.previousDays.push({
          file: lastDailyNote,
          oldContent: `${lastDailyNoteContent}`,
        });

        const lastDailyNoteLines = lastDailyNoteContent.split("\n");
        let searchStart = 0;

        sourceReplacements.forEach((replacement) => {
          let lineToReplaceIndex = lastDailyNoteLines.findIndex(
            (line, index) => index >= searchStart && line === replacement.from,
          );

          if (lineToReplaceIndex === -1) {
            lineToReplaceIndex = lastDailyNoteLines.findIndex(
              (line) => line === replacement.from,
            );
          }

          if (lineToReplaceIndex === -1) {
            return;
          }

          lastDailyNoteLines[lineToReplaceIndex] = replacement.to;
          searchStart = lineToReplaceIndex + 1;
        });

        const modifiedContent = lastDailyNoteLines.join("\n");
        await this.app.vault.modify(lastDailyNote, modifiedContent);
      }

      // Let user know rollover has been successful with X todos
      const todosAddedString =
        todosAdded == 0
          ? ""
          : `- ${todosAdded} todo${todosAdded > 1 ? "s" : ""} rolled over.`;
      const emptiesToNotAddToTomorrowString =
        emptiesToNotAddToTomorrow == 0
          ? ""
          : previousDayBehavior === "delete"
          ? `- ${emptiesToNotAddToTomorrow} empty todo${
              emptiesToNotAddToTomorrow > 1 ? "s" : ""
            } removed.`
          : "";
      const part1 =
        templateHeadingNotFoundMessage.length > 0
          ? `${templateHeadingNotFoundMessage}`
          : "";
      const part2 = `${todosAddedString}${
        todosAddedString.length > 0 ? " " : ""
      }`;
      const part3 = `${emptiesToNotAddToTomorrowString}${
        emptiesToNotAddToTomorrowString.length > 0 ? " " : ""
      }`;

      let allParts = [part1, part2, part3];
      let nonBlankLines = [];
      allParts.forEach((part) => {
        if (part.length > 0) {
          nonBlankLines.push(part);
        }
      });

      const message = nonBlankLines.join("\n");
      if (message.length > 0) {
        new Notice(message, 4000 + message.length * 3);
      }
      this.undoHistoryTime = new Date();
      this.undoHistory = [undoHistoryInstance];
    }
  }

  /**
   * Roll unfinished todos from every daily note before today into today's note.
   * Parent todos that appear identically on multiple days are included once (oldest wins).
   */
  async rolloverFromAllPreviousDailyNotes() {
    if (!this.isDailyNotesEnabled()) {
      new Notice(
        "RolloverTodosPlugin unable to rollover unfinished todos: Please enable Daily Notes, or Periodic Notes (with daily notes enabled).",
        10000,
      );
      return;
    }

    const allDailyNotes = getAllDailyNotes();
    const todayFile = getDailyNote(window.moment(), allDailyNotes);
    if (!todayFile) return;

    let { folder, format } = getDailyNoteSettings();
    folder = this.getCleanFolder(folder);

    const todayFormatted = window.moment().format(format);
    const filePathConstructed = `${folder}${
      folder == "" ? "" : "/"
    }${todayFormatted}.${todayFile.extension}`;
    if (filePathConstructed !== todayFile.path) return;

    const {
      templateHeading,
      previousDayBehavior,
      removeEmptyTodos,
      leadingNewLine,
    } = this.settings;

    const previousFiles = this.getDailyNotesBeforeToday();
    if (previousFiles.length === 0) {
      new Notice("Rollover: no daily notes found before today.", 6000);
      return;
    }

    let emptiesToNotAddToTomorrow = 0;
    if (removeEmptyTodos) {
      for (const srcFile of previousFiles) {
        const rawTodos = await this.getAllUnfinishedTodos(srcFile);
        rawTodos.forEach((line) => {
          const trimmedLine = (line || "").trim();
          if (trimmedLine === "- [ ]" || trimmedLine === "- [  ]") {
            emptiesToNotAddToTomorrow++;
          }
        });
      }
    }

    const seenParentTrimmed = new Set();
    const orderedContributions = [];

    for (const srcFile of previousFiles) {
      let todos = await this.getAllUnfinishedTodos(srcFile);
      let filteredTodos = todos;
      if (removeEmptyTodos) {
        filteredTodos = [];
        todos.forEach((line) => {
          const trimmedLine = (line || "").trim();
          if (trimmedLine !== "- [ ]" && trimmedLine !== "- [  ]") {
            filteredTodos.push(line);
          }
        });
      }

      const blocks = groupTodoBlocks(filteredTodos);
      for (const block of blocks) {
        const parentKey = block[0].trim();
        if (seenParentTrimmed.has(parentKey)) continue;
        seenParentTrimmed.add(parentKey);
        orderedContributions.push({ file: srcFile, block });
      }
    }

    let todosAdded = orderedContributions.reduce(
      (n, { block }) => n + block.length,
      0,
    );

    if (orderedContributions.length === 0) {
      new Notice(
        emptiesToNotAddToTomorrow > 0
          ? "Rollover: no todos to roll (only empty items skipped)."
          : "Rollover: no unfinished todos in earlier daily notes.",
        6000,
      );
      return;
    }

    let todos_today_for_note;
    const rolledLinesByFile = new Map();
    const replacementsByFile = new Map();

    for (const { file: srcFile, block } of orderedContributions) {
      if (!rolledLinesByFile.has(srcFile)) rolledLinesByFile.set(srcFile, []);
      rolledLinesByFile.get(srcFile).push(...block);
    }

    if (previousDayBehavior === "forward") {
      todos_today_for_note = [];
      for (const { file: srcFile, block } of orderedContributions) {
        const forwardTodoData = buildForwardTodoData({
          todos: block,
          sourceDailyNote: srcFile.basename,
          destinationDailyNote: todayFile.basename,
        });
        todos_today_for_note.push(...forwardTodoData.todosForToday);
        if (!replacementsByFile.has(srcFile))
          replacementsByFile.set(srcFile, []);
        replacementsByFile
          .get(srcFile)
          .push(...forwardTodoData.sourceReplacements);
      }
      todosAdded = todos_today_for_note.length;
    } else {
      todos_today_for_note = orderedContributions.flatMap(({ block }) => block);
    }

    if (
      previousDayBehavior === "forward" &&
      todos_today_for_note.length === 0
    ) {
      new Notice(
        "Rollover: nothing to forward—only open `- [ ]` tasks are forwarded.",
        8000,
      );
      return;
    }

    let undoHistoryInstance = {
      previousDays: [],
      today: {
        file: undefined,
        oldContent: "",
      },
    };

    let templateHeadingNotFoundMessage = "";
    const templateHeadingSelected = templateHeading !== "none";

    if (todos_today_for_note.length > 0) {
      let dailyNoteContent = await this.app.vault.read(todayFile);
      undoHistoryInstance.today = {
        file: todayFile,
        oldContent: `${dailyNoteContent}`,
      };
      const todos_todayString = `\n${todos_today_for_note.join("\n")}`;

      if (templateHeadingSelected) {
        const contentAddedToHeading = dailyNoteContent.replace(
          templateHeading,
          `${templateHeading}${leadingNewLine ? "\n" : ""}${todos_todayString}`,
        );
        if (contentAddedToHeading == dailyNoteContent) {
          templateHeadingNotFoundMessage = `Rollover couldn't find '${templateHeading}' in today's daily not. Rolling todos to end of file.`;
        } else {
          dailyNoteContent = contentAddedToHeading;
        }
      }

      if (
        !templateHeadingSelected ||
        templateHeadingNotFoundMessage.length > 0
      ) {
        dailyNoteContent += todos_todayString;
      }

      await this.app.vault.modify(todayFile, dailyNoteContent);
    }

    if (previousDayBehavior === "delete") {
      for (const [srcFile, linesToRemove] of rolledLinesByFile) {
        let srcContent = await this.app.vault.read(srcFile);
        undoHistoryInstance.previousDays.push({
          file: srcFile,
          oldContent: `${srcContent}`,
        });
        let lines = srcContent.split("\n");

        for (let i = lines.length; i >= 0; i--) {
          if (linesToRemove.includes(lines[i])) {
            lines.splice(i, 1);
          }
        }

        await this.app.vault.modify(srcFile, lines.join("\n"));
      }
    }

    if (previousDayBehavior === "forward") {
      for (const [srcFile, replacements] of replacementsByFile) {
        if (!replacements.length) continue;

        let srcContent = await this.app.vault.read(srcFile);
        undoHistoryInstance.previousDays.push({
          file: srcFile,
          oldContent: `${srcContent}`,
        });

        const srcLines = srcContent.split("\n");
        let searchStart = 0;

        replacements.forEach((replacement) => {
          let lineToReplaceIndex = srcLines.findIndex(
            (line, index) => index >= searchStart && line === replacement.from,
          );

          if (lineToReplaceIndex === -1) {
            lineToReplaceIndex = srcLines.findIndex(
              (line) => line === replacement.from,
            );
          }

          if (lineToReplaceIndex === -1) {
            return;
          }

          srcLines[lineToReplaceIndex] = replacement.to;
          searchStart = lineToReplaceIndex + 1;
        });

        await this.app.vault.modify(srcFile, srcLines.join("\n"));
      }
    }

    const todosAddedString =
      todosAdded === 0
        ? ""
        : `- ${todosAdded} todo${
            todosAdded > 1 ? "s" : ""
          } rolled over from earlier notes.`;
    const emptiesToNotAddToTomorrowString =
      emptiesToNotAddToTomorrow === 0
        ? ""
        : previousDayBehavior === "delete"
        ? `- ${emptiesToNotAddToTomorrow} empty todo${
            emptiesToNotAddToTomorrow > 1 ? "s" : ""
          } skipped.`
        : "";

    const part1 =
      templateHeadingNotFoundMessage.length > 0
        ? `${templateHeadingNotFoundMessage}`
        : "";
    const part2 = `${todosAddedString}${
      todosAddedString.length > 0 ? " " : ""
    }`;
    const part3 = `${emptiesToNotAddToTomorrowString}${
      emptiesToNotAddToTomorrowString.length > 0 ? " " : ""
    }`;

    let allParts = [part1, part2, part3];
    let nonBlankLines = [];
    allParts.forEach((part) => {
      if (part.length > 0) {
        nonBlankLines.push(part);
      }
    });

    const message = nonBlankLines.join("\n");
    if (message.length > 0) {
      new Notice(message, 4000 + message.length * 3);
    }
    this.undoHistoryTime = new Date();
    this.undoHistory = [undoHistoryInstance];
  }

  async onload() {
    await this.loadSettings();
    this.undoHistory = [];
    this.undoHistoryTime = new Date();

    this.addSettingTab(new RolloverSettingTab(this.app, this));

    this.registerEvent(
      this.app.vault.on("create", async (file) => {
        // Check if automatic daily note creation is enabled
        if (!this.settings.rolloverOnFileCreate) return;
        this.rollover(file);
      }),
    );

    this.addCommand({
      id: "obsidian-rollover-daily-todos-rollover",
      name: "Rollover Todos Now",
      callback: () => {
        this.rollover();
      },
    });

    this.addCommand({
      id: "obsidian-rollover-daily-todos-rollover-all-previous",
      name: "Rollover todos from all previous daily notes",
      callback: () => {
        this.rolloverFromAllPreviousDailyNotes();
      },
    });

    this.addCommand({
      id: "obsidian-rollover-daily-todos-move-completed-in-heading",
      name: "Move completed todos to bottom of each section",
      callback: () => {
        this.moveCompletedTodosInDailyNote();
      },
    });

    this.addCommand({
      id: "-undo",
      name: "Undo last rollover",
      checkCallback: (checking) => {
        // no history, don't allow undo
        if (this.undoHistory.length > 0) {
          const now = window.moment();
          const lastUse = window.moment(this.undoHistoryTime);
          const diff = now.diff(lastUse, "seconds");
          // 2+ mins since use: don't allow undo
          if (diff > 2 * 60) {
            return false;
          }
          if (!checking) {
            new UndoModal(this).open();
          }
          return true;
        }
        return false;
      },
    });
  }
}
