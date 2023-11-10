import * as vscode from 'vscode';
import StepSelector, { StepSelectorItem } from '../StepSelector';
import { LlmProvider, LlmProviderProps, LlmProviderService, ParametersTemplate } from './LlmProviderService';
import { Prompt, PromptService } from './PromptService';
import { nanoid } from 'nanoid';


export type MessageType = 'system' | 'user' | 'assistant' | 'error';

export interface ChatCompletion {
	id: string
	object: string
	created: number
	model: string
	system_fingerprint: string
	choices: ChatElementChoice[]
	usage: {
		prompt_tokens: number
		completion_tokens: number
		total_tokens: number
	}
}

export type ChatElement = ChatCompletion & Partial<ChatMessage> & {
	id: string
	created: number
}

export interface ChatMessage {
	role: string
	content: string
}

export interface ChatElementChoice {
	finish_reason: string
	index: number
	message: ChatMessage
}

export interface Chat {
	id: string
	label?: string
	provider: LlmProviderProps
	parameters: ParametersTemplate
	systemPrompt?: Prompt
	messages: ChatElement[]
}


export class ChatService {
	private chats: Chat[] = [];
	public selectedChat: Chat | undefined;

	constructor(
		private context: vscode.ExtensionContext,
		private readonly _providerService: LlmProviderService,
		private readonly _promptService: PromptService,
	) {
		this.chats = this.context.globalState.get('llmTools.chats', []);
	}

	// Setters and getters

	getChats() {
		return this.chats;
	}

	getChat(id: string) {
		return this.chats.find(chat => chat.id === id);
	}

	async selectChat(chat: Chat) {
		this.selectedChat = chat;
		await this.context.globalState.update('llmTools.selectedChat', chat);
		return chat;
	}


	async addChat(chat: Chat) {
		this.chats.unshift(chat);
		await this.context.globalState.update('llmTools.chats', this.chats);
		return this.chats;
	}

	async removeChat(id: string) {
		this.chats = this.chats.filter(chat => chat.id !== id);
		await this.context.globalState.update('llmTools.chats', this.chats);
		return this.chats;
	}

	async updateChat(chat: Chat, newChat: Partial<Chat>) {
		this.chats = this.chats.map(p => {
			if (p.id === chat.id) {
				return {
					...p,
					...newChat
				};
			}
			return p;
		});
		await this.context.globalState.update('llmTools.chats', this.chats);
		return this.chats;
	}

	async renameChat(chatId: string, label: string) {
		const chat = this.chats.find(chat => chat.id === chatId);
		if (chat) {
			chat.label = label;
			await this.updateChat(chat, chat);
			return chat;
		}
		return chat;
	}

	async addMessagesAndSave(chat: Chat, messages: ChatElement[]) {
		chat.messages = [...chat.messages, ...messages];
		await this.updateChat(chat, chat);
		return chat;
	}

	async clearState() {
		this.chats = [];
		this.selectedChat = undefined;
		await this.context.globalState.update('llmTools.chats', []);
		await this.context.globalState.update('llmTools.selectedChat', undefined);
		return this.chats;
	}

	removeIconFromString(text: string, iconName?: string): string {
		if (!iconName) return text;
		const iconPattern = `\\$\\(${iconName}\\)\\s*`;
		const regex = new RegExp(iconPattern, 'g');
		return text.replace(regex, '');
	}

	// Form methods

	async openChatChoiceForm() {
		const selector = new StepSelector<string>({
			label: "Select an Option",
			inputs: [
				{
					key: null,
					options: [{
						label: "Select chat",
						value: "select"
					}, {
						label: "New chat",
						value: "add"
					}]
				}
			]
		});

		const result = await selector.run();

		if (result === "add") {
			const chat = await this.openForm();
			return chat;
		}
		else if (result === "select") {
			const chat = await this.openChatSelectorForm();
			return chat;
		}
		return;
	}

	async openChatSelectorForm() {
		const selector = new StepSelector<{ chat: Chat }>({
			label: "Select a Chat",
			inputs: [
				{
					key: "chat",
					placeholder: "Chat...",
					options: this.chats.map(chat => ({ ...chat, label: chat.label || chat.systemPrompt?.label || chat.id })),
					useItemAsValue: true,
				}
			]
		}, { chat: this.selectedChat });

		const result = await selector.run();

		if (result?.chat) {
			await this.selectChat(result.chat);
			return result.chat;
		}

		return;
	}

	async openRenameForm(chatId: string) {
		const chat = this.chats.find(chat => chat.id === chatId);
		if (!chat) {
			vscode.window.showErrorMessage('Chat not found.');
			return;
		}
		const result = await new StepSelector<Chat>({
			label: "Rename Chat",
			inputs: [{
				key: "label",
				placeholder: "Label..."
			}]
		}, { label: chat.label }).run();

		if (result?.label) {
			await this.renameChat(chat.id, result.label);
			vscode.window.showInformationMessage('Chat renamed.');
			vscode.commands.executeCommand('llmTools.refreshChats');
			return chat;
		}
		return;
	}


	async openForm(initialState?: Partial<Chat>) {
		const myProviders = JSON.parse(JSON.stringify(this._providerService.getProviders())) as LlmProvider[];
		const selector = new StepSelector<Chat>({
			label: "New Chat",
			inputs: [
				{
					key: "provider",
					label: "Select a Provider",
					placeholder: "Provider...",
					options: async () => myProviders.map(p => ({ ...p, label: p.label || p.providerName || "Provider" })),
					useItemAsValue: [
						"id",
						"providerCode",
						"providerName",
						"label",
						"icon",
						"apiKey",
					] as (keyof LlmProvider)[],
					addActionNewOptionLabel: "New provider...",
					addAction: async () => {
						const provider = await this._providerService.openProviderForm();
						if (!provider) return null;
						provider.label = provider.label || provider.providerName || "Provider";
						myProviders.unshift(provider);
						return provider;
					}
				},
				{
					key: "parameters",
					label: "Select a Template",
					placeholder: "Parameters template...",
					useItemAsValue: true,
					options: async (state) => {
						const p = myProviders.find(provider => provider.providerCode === state.provider?.providerCode);
						return p ? this._providerService.getParametersTemplates(p.id) : [];
					},
					addActionNewOptionLabel: "New template...",
					addAction: async (state) => {
						if (state.provider?.providerCode) {
							const provider = myProviders.find(provider => provider.providerCode === state.provider?.providerCode);
							if (provider) {
								return await this._providerService.openNewParametersForm(provider) as StepSelectorItem;
							}
						}
						return null;
					}
				},
				{
					key: "systemPrompt",
					label: "Select a System Prompt",
					placeholder: "System prompt...",
					useItemAsValue: true,
					options: async () => {
						const value = this._promptService.getPrompts();
						return [
							{
								label: "No system prompt",
								value: ""
							},
							...value
						];
					},
					addActionNewOptionLabel: "New prompt...",
					addAction: async () => {
						const prompt = await this._promptService.openForm() as Prompt;
						this._promptService.addPrompt(prompt);
						vscode.window.showInformationMessage('Prompt created.');
						return prompt;
					}
				},
				{
					key: "label",
					label: "Custom label",
					placeholder: "Label (optional)..."
				}
			]
		}, initialState);

		const result = await selector.run();

		if (result?.provider && result?.parameters) {
			const chatItem = this.chats.find(chat => chat.id === result.id);
			const label = result.label || chatItem?.label || result.id;
			if (result.provider) {
				result.provider = {
					...result.provider,
					label: this.removeIconFromString(result.provider.label, result.provider.icon),
				};
			}
			const chat: Chat = {
				id: nanoid(),
				label: label,
				messages: [],
				provider: result.provider,
				parameters: result.parameters,
				systemPrompt: !result.systemPrompt?.value ? undefined : result.systemPrompt,
			};
			this.addChat(chat);
			vscode.window.showInformationMessage('Chat created.');
			vscode.commands.executeCommand('llmTools.refreshChats');
			return chat;
		}

		return;
	}


	async createQuickChat() {
		const provider = this._providerService.getDefaultProvider();
		if (provider) {
			const parameters = this._providerService.getDefaultParameters(provider.id);
			if (parameters) {
				const chat: Chat = {
					id: nanoid(),
					label: provider.label || provider.providerName || "Provider",
					messages: [],
					provider: provider,
					parameters: parameters,
				};
				this.addChat(chat);
				vscode.window.showInformationMessage('Chat created.');
				vscode.commands.executeCommand('llmTools.refreshChats');
				return chat;
			}
			else {
				vscode.window.showErrorMessage('No parameters template found.');
			}
		}
		else {
			vscode.window.showErrorMessage('No provider found.');
		}
	}

	async exportChatsToClipboard() {
		const chats = this.chats.map(chat => ({
			...chat,
			controller: undefined
		}));
		await vscode.env.clipboard.writeText(JSON.stringify(chats, null, 2));
		vscode.window.showInformationMessage('Chats copied to clipboard.');
	}

	async openImportChatsForm() {
		const result = await new StepSelector<any>({
			label: `Import Chats`,
			inputs: [{
				key: 'value',
				placeholder: `JSON string...`,
				validateInput: async value => {
					try {
						const e = JSON.parse(value);
						if (!Array.isArray(e)) {
							return 'The value must be an array.';
						}
					}
					catch (e) {
						return 'Invalid JSON string.';
					}
				}
			}, {
				key: 'action',
				placeholder: `'Prepend to' or 'Replace' the current chats list?`,
				options: [
					{ label: 'Prepend to', value: 'prepend' },
					{ label: 'Replace', value: 'replace' },
				]
			}]
		}).run();

		if (!result?.value) {
			return;
		}

		const value = JSON.parse(result.value);
		if (result?.action === 'replace') {
			await this.clearState();
		}
		const myChatsIds = this.chats.map(chat => chat.id);
		value.forEach((chat: Chat) => this.addChat(myChatsIds.includes(chat.id) ? { ...chat, id: nanoid() } : chat));
		vscode.window.showInformationMessage('Chats imported.');
		vscode.commands.executeCommand('llmTools.refreshChats');
	}

}
