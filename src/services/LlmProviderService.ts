import * as vscode from 'vscode';
import StepSelector, { StepSelectorItem } from '../StepSelector';
import { Chat, ChatElement } from './ChatService';
import { OpenAiController } from '../controllers/OpenAiController';
import { nanoid } from 'nanoid';
import { isValidJson } from '../utilities';


export interface ParametersTemplate {
	id: string
	label: string
	providerCode: string
	providerName?: string
	model: string
	temperature?: number
	max_tokens?: number
	top_p?: number
}

export interface LlmProviderProps {
	id: string
	providerCode: string
	providerName?: string
	label: string
	icon?: string
	apiKey: string
}

export interface LlmProvider extends LlmProviderProps {
	parametersTemplates?: ParametersTemplate[]
	controller?: OpenAiController
}

export const providers: StepSelectorItem[] = [
	{ icon: 'server', label: 'OpenAI', value: 'openai' }
];

export const providersModels: Record<string, StepSelectorItem[]> = {
	openai: [
		{ label: 'gpt-3.5-turbo', value: 'gpt-3.5-turbo' }
	]
};

export class LlmProviderService {

	private providers: LlmProvider[] = [];

	constructor(private context: vscode.ExtensionContext) {
		// getting the providers list from the global state
		this.providers = this.context.globalState.get('llmTools.providers', []).map(this.initializeController);
	}

	private initializeController(provider: LlmProvider) {
		if (provider.providerCode === 'openai') {
			return {
				...provider,
				controller: new OpenAiController(provider.apiKey)
			};
		}
		return provider;
	}

	// API Calls

	async runCall(chat: Chat, message: string) {
		const p = this.providers.find(provider => provider.id === chat.provider.id);
		if (p?.controller) {
			return p.controller.apiCall(chat, message);
		}
		vscode.window.showErrorMessage('Provider Controller not found.');
		return null;
	}

	async runStreamCall(chat: Chat, message: string) {
		const p = this.providers.find(provider => provider.id === chat.provider.id);
		if (p?.controller) {
			return p.controller.apiStreamCall(chat, message);
		}
		vscode.window.showErrorMessage('Provider Controller not found.');
		return null;
	}

	abortCallStream(chat?: Chat) {
		const p = this.providers.find(provider => provider.id === chat?.provider?.id);
		if (p?.controller) {
			return p.controller.abort();
		}
		vscode.window.showErrorMessage('Provider Controller not found.');
	}


	// Static methods

	static buildErrorResponse(message: string): ChatElement {
		vscode.window.showErrorMessage(message);
		return {
			id: Date.now().toString(),
			content: message,
			role: 'error',
			created: Date.now(),
		} as ChatElement;
	}


	// Setters and getters

	getProviders() {
		return this.providers;
	}

	getProvider(id: string) {
		return this.providers.find(provider => provider.id === id);
	}

	getDefaultProvider() {
		const defaultProviderId = vscode.workspace.getConfiguration('llmTools').get('defaultProviderId');
		if (!defaultProviderId) {
			return this.providers?.[0];
		}
		return this.providers.find(provider => provider.id == defaultProviderId);
	}

	getModels(id: string) {
		return providersModels?.[id] || [];
	}

	getParametersTemplates(id: string) {
		return this.getProvider(id)?.parametersTemplates || [];
	}

	getDefaultParameters(id: string) {
		const defaultParametersTemplateId = vscode.workspace.getConfiguration('llmTools').get('defaultParametersTemplateId');
		const p = this.getProvider(id);
		const parametersTemplates = this.getParametersTemplates(id);
		if (!defaultParametersTemplateId) {
			return parametersTemplates?.[0];
		}
		return parametersTemplates?.find(parametersTemplate => parametersTemplate.id == defaultParametersTemplateId);
	}

	async addProvider(provider: LlmProvider) {
		this.providers.unshift(this.initializeController(provider));
		await this.context.globalState.update('llmTools.providers', this.providers);
		return this.providers;
	}

	async removeProvider(id: string) {
		this.providers = this.providers.filter(provider => provider.id !== id);
		await this.context.globalState.update('llmTools.providers', this.providers);
		vscode.commands.executeCommand('llmTools.refreshProviders');
		return this.providers;
	}

	async updateProvider(provider: LlmProvider, newProvider: Partial<LlmProvider>) {
		this.providers = this.providers.map(p => {
			if (p.id === provider.id) {
				return this.initializeController({
					...p,
					...newProvider
				});
			}
			return p;
		});
		await this.context.globalState.update('llmTools.providers', this.providers);
		return this.providers;
	}

	async clearState() {
		this.providers = [];
		await this.context.globalState.update('llmTools.providers', []);
		return this.providers;
	}


	// Form methods

	async openProviderForm(initialState?: Partial<LlmProvider>) {
		const result = await new StepSelector<LlmProvider>({
			label: "New LLM Provider",
			inputs: [
				{
					key: "providerCode",
					placeholder: "Select a provider...",
					options: providers,
				},
				{
					key: "apiKey",
					placeholder: "Enter your API key...",
					validateInput: value => !value ? "API key is required." : undefined
				},
				{
					key: "label",
					placeholder: "Give a custom label (optional)...",
				}
			]
		}, initialState).run();

		if (!result?.providerCode || !result?.apiKey) {
			return null;
		}

		const providerItem = providers.find(provider => provider.value === result?.providerCode);
		if (!providerItem || !providerItem?.value) {
			vscode.window.showErrorMessage('Provider not found.');
			return null;
		}

		let parametersTemplates: ParametersTemplate[] = [];
		if (providersModels?.[result?.providerCode]?.[0]?.value) {
			parametersTemplates = [{
				temperature: 0,
				max_tokens: 256,
				top_p: 1,
				providerName: providerItem?.label,
				providerCode: providerItem?.value,
				label: "Default",
				model: providersModels?.[result?.providerCode]?.[0]?.value || "",
				id: nanoid()
			}];
		}

		const provider: LlmProvider = {
			id: nanoid(),
			providerName: providerItem?.label,
			label: providerItem?.label || "",
			icon: providerItem?.icon,
			parametersTemplates: parametersTemplates,
			providerCode: "",
			apiKey: "",
			...result,
		};

		if (!provider.providerCode) {
			vscode.window.showErrorMessage('Provider not found.');
			return null;
		}
		else if (!provider.apiKey) {
			vscode.window.showErrorMessage('API key not found.');
			return null;
		}
		else {
			vscode.window.showInformationMessage('Provider added.');
			vscode.commands.executeCommand('llmTools.refreshProviders');
			this.addProvider(provider);
			return provider;
		}
	}

	async editParameter(key: string, provider: LlmProvider) {
		if (key === 'apiKey') {
			const result = await new StepSelector<LlmProvider>({
				label: "Edit API key",
				inputs: [{
					key: "apiKey",
					placeholder: "Enter your API key...",
					prompt: "Enter the key to use the API.",
					validateInput: value => !value ? "API key is required." : undefined
				}]
			}, { apiKey: provider.apiKey }).run();

			if (result?.apiKey) {
				this.updateProvider(provider, result);
				vscode.commands.executeCommand('llmTools.refreshProviders');
			}
		}
		if (key === 'label') {
			const result = await new StepSelector<LlmProvider>({
				label: "Edit Provider Label",
				inputs: [{
					key: "label",
					placeholder: "Label (optional)...",
					prompt: "Enter your custom provider label"
				}]
			}, { label: provider.label }).run();

			if (result?.label) {
				this.updateProvider(provider, result);
				vscode.commands.executeCommand('llmTools.refreshProviders');
			}
		}
	}

	async openNewParametersForm(p: LlmProvider) {
		if (!p) {
			vscode.window.showErrorMessage('Provider not found.');
			return null;
		}
		const result = await new StepSelector<ParametersTemplate>({
			label: "New Parameters Template",
			inputs: [
				{
					key: "label",
					placeholder: "Label..."
				},
				{
					key: "model",
					placeholder: "Select a model...",
					options: this.getModels(p.providerCode)
				},
				{
					label: "Temperature",
					key: "temperature",
					placeholder: "temperature value...",
				},
				{
					label: "Max tokens",
					key: "max_tokens",
					placeholder: "max_tokens value...",
				},
				{
					label: "Top p",
					key: "top_p",
					placeholder: "top_p value...",
				},
			]
		}, {
			temperature: 0,
			max_tokens: 256,
			top_p: 1,
			providerCode: p.providerCode,
			providerName: p.providerName,
		}).run();


		if (result) {
			result.temperature = result?.temperature ? Number(result?.temperature) : 0;
			result.max_tokens = result?.temperature ? Number(result?.temperature) : 256;
			result.top_p = result?.top_p ? Number(result?.top_p) : 1;

			// enforced validation
			if (result?.label && result?.model) {
				result.id = nanoid();
				this.updateProvider(p, { parametersTemplates: [...(p.parametersTemplates || []), result as ParametersTemplate] });
				vscode.window.showInformationMessage('Parameters template created.');
				vscode.commands.executeCommand('llmTools.refreshProviders');
				return result;
			}
		}

		return;
	}

	async deleteParametersTemplate(provider: LlmProvider, template: ParametersTemplate) {
		const providerId = provider.id;
		if (!providerId) {
			vscode.window.showErrorMessage('Provider ID not found.');
			return null;
		}
		const parametersTemplateId = template.id;
		if (!parametersTemplateId) {
			vscode.window.showErrorMessage('Parameters Template ID not found.');
			return null;
		}
		const p = this.getProvider(providerId);
		if (!p) {
			vscode.window.showErrorMessage('Provider not found.');
			return null;
		}
		const parametersTemplates = p.parametersTemplates?.filter(parametersTemplate => parametersTemplate.id !== parametersTemplateId);
		if (!parametersTemplates) {
			vscode.window.showErrorMessage('Parameters template not found.');
			return null;
		}
		this.updateProvider(p, { parametersTemplates });
		vscode.window.showInformationMessage('Parameters template deleted.');
		vscode.commands.executeCommand('llmTools.refreshProviders');
		return parametersTemplates;
	}

	async editParametersTemplate(key: keyof ParametersTemplate, provider: LlmProvider, parametersTemplate: ParametersTemplate) {
		if (key === 'model') {
			const result = await new StepSelector<ParametersTemplate>({
				label: "Edit model",
				inputs: [{
					key: "model",
					placeholder: "Select a model...",
					options: this.getModels(provider.providerCode)
				}]
			}, parametersTemplate).run();
			vscode.commands.executeCommand('llmTools.refreshProviders');
			this.updateProvider(provider, {
				parametersTemplates: provider.parametersTemplates?.map(p => {
					if (p.id === parametersTemplate.id) {
						return {
							...p,
							...result
						};
					}
					return p;
				})
			});
		}
		else {
			const result = await new StepSelector<ParametersTemplate>({
				label: `Edit ${key}`,
				inputs: [{
					key,
					placeholder: `Enter a ${key} value...`
				}]
			}, parametersTemplate).run();
			vscode.commands.executeCommand('llmTools.refreshProviders');
			this.updateProvider(provider, {
				parametersTemplates: provider.parametersTemplates?.map(p => {
					if (p.id === parametersTemplate.id) {
						return {
							...p,
							...result
						};
					}
					return p;
				})
			});
		}
	}


	async exportProvidersToClipboard() {
		const providers = this.providers.map(provider => ({
			...provider,
			controller: undefined
		}));
		await vscode.env.clipboard.writeText(JSON.stringify(providers, null, 2));
		vscode.window.showInformationMessage('Providers copied to clipboard.');
	}

	async openImportProvidersForm() {
		const result = await new StepSelector<any>({
			label: `Import Providers`,
			inputs: [{
				key: 'value',
				placeholder: `JSON string...`,
				validateInput: async value => {
					if (!isValidJson(value)) {
						return 'Invalid JSON string.';
					}
					const v = JSON.parse(value);
					if (!Array.isArray(v)) {
						return 'The value must be an array.';
					}
				}
			}, {
				key: 'action',
				placeholder: `'Prepend to' or 'Replace' the current providers list?`,
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
		if (result?.action === 'replace') {
			await this.clearState();
		}
		const myProvidersIds = this.providers.map(p => p.id);
		value.forEach((p: LlmProvider) => this.addProvider(myProvidersIds.includes(p.id) || !p.id ? { ...p, id: nanoid() } : p));
		vscode.window.showInformationMessage('Providers imported.');
		vscode.commands.executeCommand('llmTools.refreshProviders');
	}

}
