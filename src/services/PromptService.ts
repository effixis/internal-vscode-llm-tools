import * as vscode from 'vscode';
import StepSelector from '../StepSelector';
import { nanoid } from 'nanoid';
import { isValidJson } from '../utilities';

export interface Prompt {
	id: string
	label: string
	value: string
}

export class PromptService {
	private prompts: Prompt[] = [];

	constructor(private context: vscode.ExtensionContext) {
		this.prompts = this.context.globalState.get('llmTools.prompts', []);
	}


	// Helpers

	extractPromptId(input: string): string | null {
		// This regular expression looks for any characters that follow a path separator
		// (such as \ or /) and captures them until it hits the last dot, which is presumed
		// to start the file extension. It accounts for both forward and backward slashes.
		const regex = /(?:\\|\/)([^.]+)\.[^.]+$/;
		const matches = input.match(regex);
		return matches ? matches[1] : null;
	}


	// Setters / Getters

	getPrompts(): Prompt[] {
		return this.prompts;
	}

	getPrompt(id?: string): Prompt | undefined {
		if (!id) return undefined;
		return this.prompts.find(prompt => prompt.id === id);
	}

	async addPrompt(prompt: Prompt) {
		this.prompts.unshift(prompt);
		await this.context.globalState.update('llmTools.prompts', this.prompts);
		return this.prompts;
	}

	async removePrompt(id: string) {
		this.prompts = this.prompts.filter(n => n.id !== id);
		await this.context.globalState.update('llmTools.prompts', this.prompts);
		return this.prompts;
	}

	async updatePrompt(prompt: Prompt) {
		const index = this.prompts.findIndex(n => n.id === prompt.id);
		if (index >= 0) {
			this.prompts[index] = prompt;
			await this.context.globalState.update('llmTools.prompts', this.prompts);
		}
		return this.prompts;
	}

	async savePrompt(id: string, value: string) {
		const index = this.prompts.findIndex(n => n.id === id);
		if (index >= 0) {
			this.prompts[index].value = value;
			await this.context.globalState.update('llmTools.prompts', this.prompts);
			return this.prompts[index];
		}
		return;
	}

	async clearState() {
		this.prompts = [];
		await this.context.globalState.update('llmTools.prompts', []);
		return this.prompts;
	}


	// Form methods

	async openRenameForm(chatId: string) {
		const prompt = this.prompts.find(p => p.id === chatId);
		if (!prompt) {
			vscode.window.showErrorMessage('Prompt not found.');
			return;
		}
		const result = await new StepSelector<Prompt>({
			label: "Rename Prompt",
			inputs: [{
				key: "label",
				placeholder: "Label..."
			}]
		}, { label: prompt.label }).run();

		if (result?.label) {
			await this.updatePrompt({ ...prompt, ...result });
			vscode.window.showInformationMessage('Prompt renamed.');
			vscode.commands.executeCommand('llmTools.refreshPrompts');
			return prompt;
		}
		return;
	}

	async openForm(initialState?: Partial<Prompt>, useLabelOnly?: boolean) {
		if (useLabelOnly) {
			const result = await new StepSelector<Prompt>({
				label: "New Prompt",
				inputs: [{
					key: "label",
					placeholder: "Label..."
				}]
			}, initialState).run();

			// postprocessing
			if (result?.label) {
				result.id = nanoid();
				vscode.commands.executeCommand('llmTools.refreshPrompts');
				return result;
			}
		}
		else {
			const result = await new StepSelector<Prompt>({
				label: "New Prompt",
				inputs: [{
					key: "value",
					placeholder: "Prompt..."
				}, {
					key: "label",
					placeholder: "Label..."
				}]
			}, initialState).run();

			// postprocessing
			if (result?.value) {
				result.id = nanoid();
				vscode.commands.executeCommand('llmTools.refreshPrompts');
				return result;
			}
		}

		return;
	}

	async exportPromptsToClipboard() {
		const prompts = this.prompts.map(prompt => ({
			...prompt,
			controller: undefined
		}));
		await vscode.env.clipboard.writeText(JSON.stringify(prompts, null, 2));
		vscode.window.showInformationMessage('Prompts copied to clipboard.');
	}


	async openImportPromptsForm() {
		const result = await new StepSelector<any>({
			label: `Import Prompts`,
			inputs: [{
				key: 'value',
				placeholder: `JSON string...`,
				validateInput: async value => {
					if (!isValidJson(value)) {
						return 'Invalid JSON string.';
					}
					const v = JSON.parse(value);
					if (typeof v !== "object") {
						return 'The value must be an array or an object.';
					}
				}
			}, {
				key: 'action',
				placeholder: `'Prepend to' or 'Replace' the current prompts list?`,
				options: [
					{ label: 'Prepend to', value: 'prepend' },
					{ label: 'Replace', value: 'replace' },
				]
			}]
		}).run();

		if (!result?.value || !isValidJson(result.value)) {
			return;
		}

		const value = JSON.parse(result.value);
		let n = 0;
		if (result?.action === 'replace') {
			await this.clearState();
		}
		if (Array.isArray(value)) {
			const myPromptsIds = this.prompts.map(p => p.id);
			value.forEach((p: Prompt) => this.addPrompt(myPromptsIds.includes(p.id) || !p.id ? { ...p, id: nanoid() } : p));
			n = value.length;
		}
		else if (typeof value === 'object' && Object.values(value).every(v => typeof v === "string")) {
			Object.keys(value).forEach(key => {
				this.addPrompt({ id: nanoid(), label: key, value: value[key] });
				n++;
			});
		}
		vscode.window.showInformationMessage(`${n ? `${n} ` : ''}Prompts imported.`);
		vscode.commands.executeCommand('llmTools.refreshPrompts');
	}

	async openPromptSelectorForm() {
		const selector = new StepSelector<{ prompt: Prompt }>({
			label: "Select a Prompt",
			inputs: [
				{
					key: "prompt",
					placeholder: "Prompt...",
					options: this.prompts,
					useItemAsValue: true,
				}
			]
		});

		const result = await selector.run();
		if (result?.prompt) {
			return result.prompt;
		}
		return;
	}

}
