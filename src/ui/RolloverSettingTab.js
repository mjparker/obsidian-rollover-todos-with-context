import { Setting, PluginSettingTab } from "obsidian";
import { getDailyNoteSettings } from "obsidian-daily-notes-interface";

export default class RolloverSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async getTemplateHeadings() {
    const { template } = getDailyNoteSettings();
    if (!template) return [];

    let file = this.app.vault.getAbstractFileByPath(template);

    if (file === null) {
      file = this.app.vault.getAbstractFileByPath(template + ".md");
    }

    if (file === null) {
      return [];
    }

    const templateContents = await this.app.vault.read(file);
    const allHeadings = Array.from(templateContents.matchAll(/#{1,} .*/g)).map(
      ([heading]) => heading,
    );
    return allHeadings;
  }

  getPreviousDayBehaviorDescription() {
    const behavior = this.plugin.settings.previousDayBehavior || "forward";

    const behaviorEffects = {
      duplicate:
        "The previous daily note keeps its todos and copies are added to today.",
      delete:
        "Rolled todos are removed from the previous daily note after they are added to today.",
      forward:
        "Eligible open todos in the previous daily note are marked `[>]` with a backlink to today, and today's copies note where they came from.",
    };

    return `Automatic rollover on creation and Rollover Todos Now use only the most recent daily note before today. ${behaviorEffects[behavior] || behaviorEffects.forward}`;
  }

  async display() {
    const templateHeadings = await this.getTemplateHeadings();

    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName("Template heading")
      .setDesc(
        "Choose a heading from your daily note template where rolled todos should be inserted. Todos are collected from the entire source note regardless of heading. None appends them to the end of today's note.",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            ...templateHeadings.reduce((acc, heading) => {
              acc[heading] = heading;
              return acc;
            }, {}),
            none: "None",
          })
          .setValue(this.plugin?.settings.templateHeading)
          .onChange((value) => {
            this.plugin.settings.templateHeading = value;
            this.plugin.saveSettings();
          }),
      );

    const previousDayBehaviorSetting = new Setting(this.containerEl)
      .setName("Previous day todo behavior")
      .setDesc(this.getPreviousDayBehaviorDescription())
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            duplicate: "Duplicate (keep previous day todos)",
            delete: "Delete todos from previous day",
            forward: "Mark todos as forwarded",
          })
          .setValue(this.plugin.settings.previousDayBehavior || "forward")
          .onChange((value) => {
            this.plugin.settings.previousDayBehavior = value;
            this.plugin.saveSettings();
            previousDayBehaviorSetting.setDesc(
              this.getPreviousDayBehaviorDescription(),
            );
          }),
      );

    new Setting(this.containerEl)
      .setName("Remove empty todos in rollover")
      .setDesc(
        "Skip checkbox todos with no text (for example `- [ ]`) when rolling them into today's note.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.removeEmptyTodos ?? true)
          .onChange((value) => {
            this.plugin.settings.removeEmptyTodos = value;
            this.plugin.saveSettings();
          }),
      );

    new Setting(this.containerEl)
      .setName("Roll over children of todos")
      .setDesc(
        "Also roll nested lines under a todo, such as indented notes or sub-items. When disabled, only the parent todo line moves.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.rolloverChildren ?? true)
          .onChange((value) => {
            this.plugin.settings.rolloverChildren = value;
            this.plugin.saveSettings();
          }),
      );

    new Setting(this.containerEl)
      .setName("Automatic rollover on daily note creation")
      .setDesc(
        "When enabled, unfinished todos from the previous daily note are rolled into today's note as soon as today's daily note file is created. This does not run when you merely open an existing note.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.rolloverOnFileCreate ?? true)
          .onChange((value) => {
            this.plugin.settings.rolloverOnFileCreate = value;
            this.plugin.saveSettings();
          }),
      );

    new Setting(this.containerEl)
      .setName("Done status markers")
      .setDesc(
        'Characters inside `[...]` that mark a checkbox as done. Default is "xX-". Tasks already marked `[>]` are never rolled again.',
      )
      .addText((text) =>
        text
          .setValue(this.plugin.settings.doneStatusMarkers || "xX-")
          .onChange((value) => {
            this.plugin.settings.doneStatusMarkers = value;
            this.plugin.saveSettings();
          }),
      );

    new Setting(this.containerEl)
      .setName("Add extra blank line between Heading and Todos")
      .setDesc(
        "Insert an extra blank line between the selected template heading and rolled todos. Only applies when a template heading is selected.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.leadingNewLine ?? false)
          .onChange((value) => {
            this.plugin.settings.leadingNewLine = value;
            this.plugin.saveSettings();
          }),
      );
  }
}
