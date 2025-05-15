/// <reference path="./obsidian.d.ts" />
import { App, Plugin, PluginSettingTab, Setting, TFile, Notice } from 'obsidian';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { Ollama } from 'ollama';

dayjs.extend(isoWeek);

interface WeeklySummarizerSettings {
  outputPathTemplate: string;
  outputFolder: string;
  ollamaApiUrl: string;
  model: string;
  maxTokens: number;
}

const DEFAULT_SETTINGS: WeeklySummarizerSettings = {
  outputPathTemplate: 'Summary of Week %WEEK_NUMBER%.md',
  outputFolder: '/',
  ollamaApiUrl: 'http://localhost:11434',
  model: 'mistral:latest',
  maxTokens: 500,
};

export default class WeeklySummarizer extends Plugin {
  settings!: WeeklySummarizerSettings;
  ollamaClient!: Ollama;

  async onload() {
    console.log('Loading Weekly Summarizer Plugin');
    await this.loadSettings();

    // Initialize Ollama client
    this.ollamaClient = new Ollama();

    this.addCommand({
      id: 'generate-weekly-summary',
      name: 'Generate Weekly Summary',
      callback: async () => {
        await this.generateWeeklySummary();
      },
    });

    this.addSettingTab(new WeeklySummarizerSettingTab(this.app, this));
  }

  async generateWeeklySummary() {
    const lastMonday = dayjs().startOf('isoWeek');
    const weekNumber = lastMonday.isoWeek();
    const year = lastMonday.year();

    const outputFileName = this.settings.outputPathTemplate
      .replace('%WEEK_NUMBER%', `${weekNumber}`)
      .replace('%YEAR%', `${year}`);

    const outputPath = `${this.settings.outputFolder}/${outputFileName}`;

    // Check if summary file exists
    const existingFile = this.app.vault.getAbstractFileByPath(outputPath);
    if (existingFile instanceof TFile) {
      new Notice(`Weekly summary for week ${weekNumber} already exists. No action taken.`);
      return;
    }

    const markdownFiles = this.app.vault.getMarkdownFiles();

    // Step 1: Summarize each document individually (1-2 sentences)
    const perDocSummaries: { content: string; filePath: string }[] = [];

    for (const file of markdownFiles) {
      try {
        const content = await this.app.vault.read(file);

        // Generate a short summary for this document
        const shortSummary = await this.generateShortSummary(content);
        perDocSummaries.push({ content: shortSummary, filePath: file.path });
      } catch (err) {
        console.error(`Error reading ${file.path}: ${err}`);
      }
    }

    // Step 2: Combine the short summaries with links and generate the final detailed review
    const finalSummary = await this.generateFinalReview(perDocSummaries, weekNumber);

    const fullSummary = `${finalSummary}`;

    try {
      await this.app.vault.create(outputPath, fullSummary);
      new Notice(`Weekly summary for week ${weekNumber} generated successfully!`);
    } catch (err) {
      console.error(`Error writing summary: ${err}`);
      new Notice(`Failed to write weekly summary.`);
    }
  }

  // Generate a very short summary (1-2 sentences) per document
  async generateShortSummary(text: string): Promise<string> {
    const prompt = `Please summarize the following content in one or two concise sentences:\n\n${text}`;

    try {
      const response = await this.ollamaClient.chat({
        model: this.settings.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      });
      return response.message?.content.trim() || 'No summary generated.';
    } catch (err) {
      console.error(`Error generating short summary: ${err}`);
      return 'Error summarizing content.';
    }
  }

  // Generate the final two-paragraph review with markdown links
  async generateFinalReview(summaries: { content: string; filePath: string }[], weekNumber: number): Promise<string> {
    const contentWithLinks = summaries
      .map(({ content, filePath }) => `- ${content} ([Link to document](${filePath}))`)
      .join('\n');

    const prompt = `Based on the following content, write a two-paragraph weekly review for week ${weekNumber}. 
Focus on what was worked on, what was completed, what still needs attention, and any recurring themes or notable patterns.
Include relevant links in Markdown format where applicable (links should have this structure [[link]], no escape characters).

Content with links:\n\n${contentWithLinks}`;

    try {
      const response = await this.ollamaClient.chat({
        model: this.settings.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      });
      return response.message?.content.trim() || 'No review generated.';
    } catch (err) {
      console.error(`Error generating final review: ${err}`);
      return 'Error generating review.';
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class WeeklySummarizerSettingTab extends PluginSettingTab {
  plugin: WeeklySummarizer;

  constructor(app: App, plugin: WeeklySummarizer) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Weekly Summarizer Settings' });

    new Setting(containerEl)
      .setName('Output Path Template')
      .setDesc('Template for the output file. Use %WEEK_NUMBER% and %YEAR% as placeholders.')
      .addText((text) =>
        text
          .setPlaceholder('Summary of Week %WEEK_NUMBER%.md')
          .setValue(this.plugin.settings.outputPathTemplate)
          .onChange(async (value) => {
            this.plugin.settings.outputPathTemplate = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Output Folder')
      .setDesc('Folder where the summary file will be saved.')
      .addText((text) =>
        text
          .setPlaceholder('/')
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            this.plugin.settings.outputFolder = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Ollama API URL')
      .setDesc('URL for the Ollama API (e.g., http://localhost:11434)')
      .addText((text) =>
        text
          .setPlaceholder('http://localhost:11434')
          .setValue(this.plugin.settings.ollamaApiUrl)
          .onChange(async (value) => {
            this.plugin.settings.ollamaApiUrl = value;
            await this.plugin.saveSettings();
            // Reinitialize Ollama client with new API URL
            this.plugin.ollamaClient = new Ollama();
          }),
      );

    new Setting(containerEl)
      .setName('Ollama Model')
      .setDesc('Model to be used for summarization (e.g., mistral:latest). You must manually pull the model if it does not already exist.')
      .addText((text) =>
        text
          .setPlaceholder('mistral:latest')
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Maximum Tokens')
      .setDesc('Maximum number of tokens to use for each summary request.')
      .addText((text) =>
        text
          .setPlaceholder('500')
          .setValue(String(this.plugin.settings.maxTokens))
          .onChange(async (value) => {
            this.plugin.settings.maxTokens = parseInt(value, 10);
            await this.plugin.saveSettings();
          }),
      );
  }
}
