/// <reference path="./obsidian.d.ts" />
import { App, Plugin, PluginSettingTab, Setting, TFile, Notice } from 'obsidian';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { Ollama } from 'ollama'; // Import Ollama class

dayjs.extend(isoWeek);

interface WeeklySummarizerSettings {
  outputPathTemplate: string;
  outputFolder: string;
  ollamaApiUrl: string;
  model: string; // Add a setting for the model
}

const DEFAULT_SETTINGS: WeeklySummarizerSettings = {
  outputPathTemplate: 'Summary of Week %WEEK_NUMBER%.md',
  outputFolder: '/',
  ollamaApiUrl: 'http://localhost:11434',
  model: 'mistral:latest', // Default model
};

export default class WeeklySummarizer extends Plugin {
  settings!: WeeklySummarizerSettings;
  ollamaClient!: Ollama;  // Ollama client instance

  async onload() {
    console.log('Loading Weekly Summarizer Plugin');
    await this.loadSettings();
    
    // Initialize Ollama client without baseUrl
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

    // Check if the summary file already exists
    const existingFile = this.app.vault.getAbstractFileByPath(outputPath);
    if (existingFile instanceof TFile) {
      new Notice(`Weekly summary for week ${weekNumber} already exists. No action taken.`);
      return; // Exit the function if the file already exists
    }

    const markdownFiles = this.app.vault.getMarkdownFiles();
    
    // Combine all the content of the markdown files
    let combinedContent = '';

    for (const file of markdownFiles) {
      try {
        const content = await this.app.vault.read(file);
        combinedContent += content + '\n\n'; // Add each file's content to the combined content
      } catch (err) {
        console.error(`Error reading ${file.path}: ${err}`);
      }
    }

    // Now generate one summary for the combined content of all files
    const summaryContent = await this.fetchOllamaSummary(combinedContent);

    // Prepare the full summary
    const finalSummary = `# Summary of Week ${weekNumber}\n\n${summaryContent}`;

    try {
      await this.app.vault.create(outputPath, finalSummary);  // Create the summary file
    } catch (err) {
      console.error(`Error writing summary: ${err}`);
    }
  }

  async fetchOllamaSummary(text: string): Promise<string> {
    try {
      const response = await this.ollamaClient.chat({
        model: this.settings.model,  // Use the model from settings
        messages: [{ role: 'user', content: text }],
        stream: false, // Assuming no streaming for now
      });

      return response.message?.content || 'No summary generated.';
    } catch (err) {
      console.error(`Error connecting to Ollama API: ${err}`);
      return 'Error summarizing content.';
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
      .addText(text =>
        text
          .setPlaceholder('Summary of Week %WEEK_NUMBER%.md')
          .setValue(this.plugin.settings.outputPathTemplate)
          .onChange(async (value) => {
            this.plugin.settings.outputPathTemplate = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Output Folder')
      .setDesc('Folder where the summary file will be saved.')
      .addText(text =>
        text
          .setPlaceholder('/')
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            this.plugin.settings.outputFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Ollama API URL')
      .setDesc('URL for the Ollama API (e.g., http://localhost:11434)')
      .addText(text =>
        text
          .setPlaceholder('http://localhost:11434')
          .setValue(this.plugin.settings.ollamaApiUrl)
          .onChange(async (value) => {
            this.plugin.settings.ollamaApiUrl = value;
            await this.plugin.saveSettings();
            // Reinitialize Ollama client with new API URL
            this.plugin.ollamaClient = new Ollama();
          })
      );

    new Setting(containerEl)
      .setName('Ollama Model')
      .setDesc('Model to be used for summarization (e.g., mistral:latest). You must manually pull the model if doess not already exists.')
      .addText(text =>
        text
          .setPlaceholder('mistral:latest')
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
