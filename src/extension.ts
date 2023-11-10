import * as vscode from 'vscode';
import SimpleFileSystem from './SimpleFileSystem';
import PromptsExplorer, { PromptItem } from './explorers/PromptsExplorer';
import { Prompt, PromptService } from './services/PromptService';
import SimpleDocumentContent from './SimpleDocumentContent';
import ChatsExplorer, { ChatTreeItem } from './explorers/ChatsExplorer';
import { Chat, ChatService } from './services/ChatService';
import { ChatWebview } from './webviews/chat/ChatWebview';
import LlmProvidersExplorer, { LlmProviderItem, LlmProviderParametersTemplateItem, LlmTreeItem } from './explorers/LlmProvidersExplorer';
import { LlmProvider, LlmProviderService, ParametersTemplate } from './services/LlmProviderService';

export function activate(context: vscode.ExtensionContext) {

	// Custom Document Provider
	const fileSystemProvider = new SimpleFileSystem();
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('prompt', fileSystemProvider, { isCaseSensitive: true }));

	const documentProvider = new SimpleDocumentContent();
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('prompt', documentProvider));


	// Prompts Explorer
	const promptService = new PromptService(context);
	const promptsExplorer = new PromptsExplorer(context, promptService);
	context.subscriptions.push(vscode.window.registerTreeDataProvider(PromptsExplorer.viewType, promptsExplorer));

	// LlmProviders Explorer
	const providerService = new LlmProviderService(context);
	const providersExplorer = new LlmProvidersExplorer(context, providerService);
	context.subscriptions.push(vscode.window.registerTreeDataProvider(LlmProvidersExplorer.viewType, providersExplorer));

	// Chats Explorer
	const chatService = new ChatService(context, providerService, promptService);
	const chatsExplorer = new ChatsExplorer(context, chatService);
	context.subscriptions.push(vscode.window.registerTreeDataProvider(ChatsExplorer.viewType, chatsExplorer));

	// Chat View
	const chatView = new ChatWebview(context, providerService, chatService);
	context.subscriptions.push(vscode.window.registerWebviewViewProvider(ChatWebview.viewType, chatView));

	// Clear State Kill Switch
	context.subscriptions.push(vscode.commands.registerCommand('llmTools.clearAll', async () => {
		await providerService.clearState();
		await chatService.clearState();
		await promptService.clearState();
		providersExplorer.refresh();
		chatsExplorer.refresh();
		promptsExplorer.refresh();
		vscode.window.showInformationMessage('Nuked.');
	}));



	context.subscriptions.push(vscode.commands.registerCommand('llmTools.sendToChat', async () => {
		const value = vscode.window.activeTextEditor?.document.getText(vscode.window.activeTextEditor.selection);
		const chat = await chatService.openChatChoiceForm();
		if (chat && value) {
			await vscode.commands.executeCommand('llmTools.showChat', chat);
			chatView.postMessage("appendToInput", value);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.sendToQuickChat', async () => {
		const value = vscode.window.activeTextEditor?.document.getText(vscode.window.activeTextEditor.selection);
		const chat = await chatService.createQuickChat();
		if (chat && value) {
			await vscode.commands.executeCommand('llmTools.showChat', chat);
			chatView.postMessage("appendToInput", value);
		}
	}));


	/**
	 * Providers Commands
	 */

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.refreshProviders', () => providersExplorer.refresh()));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.addProvider', async () => {
		await providerService.openProviderForm();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.renameProvider', async (treeItem: LlmTreeItem) => {
		if (treeItem.contextValue === "provider") {
			const t = treeItem as LlmProviderItem;
			await providerService.editParameter("label", t.provider);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.copyProviderId', async (treeItem: LlmProviderItem) => {
		if (treeItem.provider.id) {
			vscode.env.clipboard.writeText(treeItem.provider.id);
			vscode.window.showInformationMessage('Provider ID copied!');
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.editProviderParameter', async (key: string, provider: LlmProvider) => {
		if (key && provider) {
			await providerService.editParameter(key, provider);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.exportProviders', async () => {
		await providerService.exportProvidersToClipboard();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.importProviders', async () => {
		await providerService.openImportProvidersForm();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.removeProvider', async (providerItem: LlmProviderItem) => {
		if (providerItem.provider) {
			await providerService.removeProvider(providerItem.provider.id);
		}
	}));


	/**
	 * Parameters Templates Commands
	 */

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.newParametersTemplate', async (providerItem: LlmProviderItem) => {
		if (providerItem.provider?.id) {
			await providerService.openNewParametersForm(providerItem.provider);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.editTemplateParameter', async (key: keyof ParametersTemplate, provider: LlmProvider, parametersTemplate: ParametersTemplate) => {
		if (key && provider && parametersTemplate) {
			await providerService.editParametersTemplate(key, provider, parametersTemplate);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.renameParametersTemplate', async (treeItem: LlmProviderParametersTemplateItem) => {
		if (treeItem.contextValue === "parametersTemplate") {
			await providerService.editParametersTemplate("label", treeItem.provider, treeItem.parameters);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.copyParametersTemplateId', async (treeItem: LlmProviderParametersTemplateItem) => {
		if (treeItem.parameters.id) {
			vscode.env.clipboard.writeText(treeItem.parameters.id);
			vscode.window.showInformationMessage('Parameters Template ID copied!');
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.deleteParametersTemplate', async (parametersTemplateItem: LlmProviderParametersTemplateItem) => {
		if (parametersTemplateItem) {
			await providerService.deleteParametersTemplate(parametersTemplateItem.provider, parametersTemplateItem.parameters);
		}
	}));


	/**
	 * Chats Commands
	 */

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.refreshChats', () => chatsExplorer.refresh()));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.newChat', async () => {
		const chat = await chatService.openForm();
		if (chat) {
			vscode.commands.executeCommand('llmTools.showChat', chat);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.newQuickChat', async () => {
		const chat = await chatService.createQuickChat();
		if (chat) {
			await vscode.commands.executeCommand('llmTools.showChat', chat);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.renameChat', async (chatItem: ChatTreeItem) => {
		if (chatItem.chat.id) {
			await chatService.openRenameForm(chatItem.chat.id);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.copyChatId', async (chatItem: ChatTreeItem) => {
		if (chatItem.chat.id) {
			vscode.env.clipboard.writeText(chatItem.chat.id);
			vscode.window.showInformationMessage('Chat ID copied!');
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.exportChats', async () => {
		await chatService.exportChatsToClipboard();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.importChats', async () => {
		await chatService.openImportChatsForm();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.deleteChat', async (chatItem: ChatTreeItem) => {
		if (chatItem.chat.id) {
			await chatService.removeChat(chatItem.chat.id);
			chatsExplorer.refresh();
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.openChat', async (chat: Chat) => {
		const result = await chatService.openChatSelectorForm();
		if (result) {
			await vscode.commands.executeCommand('llmTools.showChat', result);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.showChat', async (chat: Chat) => {
		await vscode.commands.executeCommand('llmTools.chatView.focus');
		await chatService.selectChat(chat);
		chatView.init(chat);
		if (chatView._webviewView) {
			chatView._webviewView.title = chat.label || chat.systemPrompt?.label ? "Chat — " + (chat.label || chat.systemPrompt?.label) : "Chat";
		}
		return;
	}));


	/**
	 * Prompts Commands
	 */

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.refreshPrompts', () => promptsExplorer.refresh()));

	/* Prompt: Create */

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.newPrompt', async () => {
		const prompt = await promptService.openForm({}, true);
		if (prompt) {
			promptService.addPrompt(prompt as Prompt);
			const uri = vscode.Uri.parse(`prompt:/${prompt.id}.prompt`);
			await fileSystemProvider.writeFile(uri, new TextEncoder().encode(prompt.value), { create: true, overwrite: true });
			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc, { preview: false });
			vscode.commands.executeCommand('workbench.action.refreshPrompts');
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.newQuickPrompt', async () => {
		const result = await promptService.openForm();
		if (result) {
			promptService.addPrompt(result as Prompt);
			vscode.window.showInformationMessage('Prompt created.');
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.newPromptFromSelection', async () => {
		const value = vscode.window.activeTextEditor?.document.getText(vscode.window.activeTextEditor.selection);
		const res = await promptService.openForm({ value }, true);
		if (res) {
			promptService.addPrompt(res as Prompt);
			vscode.window.showInformationMessage('Prompt created.');
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.newPromptFromClipboard', async () => {
		const value = await vscode.env.clipboard.readText();
		const res = await promptService.openForm({ value }, true);
		if (res) {
			promptService.addPrompt(res as Prompt);
			vscode.window.showInformationMessage('Prompt created.');
		}
	}));

	/* Prompt: Update */

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.editPrompt', async (promptItem: PromptItem) => {
		const prompt = promptService.getPrompt(promptItem.id);
		if (prompt) {
			const res = await promptService.openForm(prompt);
			if (res) {
				promptService.updatePrompt(res as Prompt);
				vscode.window.showInformationMessage('Prompt updated.');
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.renamePrompt', async (promptItem: PromptItem) => {
		if (promptItem) {
			await promptService.openRenameForm(promptItem.id);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.copyPromptId', async (promptItem: PromptItem) => {
		if (promptItem.id) {
			vscode.env.clipboard.writeText(promptItem.id);
			vscode.window.showInformationMessage('Prompt ID copied!');
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.openPrompt', async () => {
		const result = await promptService.openPromptSelectorForm();
		if (result) {
			await vscode.commands.executeCommand('llmTools.displayPrompt', result);
		}
	}));


	context.subscriptions.push(vscode.commands.registerCommand('llmTools.exportPrompts', async () => {
		await promptService.exportPromptsToClipboard();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.importPrompts', async () => {
		await promptService.openImportPromptsForm();
	}));


	/* Prompt: Delete */

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.deletePrompt', async (promptItem?: PromptItem) => {
		if (promptItem) {
			await promptService.removePrompt(promptItem.id);
			promptsExplorer.refresh();
		}
		else {
			vscode.window.showInformationMessage('No prompt selected. Delete using the list view.');
		}
	}));

	/* Prompt: Actions */

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.copyPromptValue', async (promptItem?: PromptItem) => {
		if (promptItem) {
			const prompt = promptService.getPrompt(promptItem.id);
			if (prompt) {
				vscode.env.clipboard.writeText(prompt.value);
				vscode.window.showInformationMessage('Prompt copied!');
			}
			else {
				vscode.window.showInformationMessage('No prompt found.');
			}
		}
		else {
			vscode.window.showInformationMessage('No prompt selected. Copy using the list view.');
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.displayPrompt', async (prompt?: Prompt) => {
		if (prompt) {
			const uri = vscode.Uri.parse(`prompt:/${prompt.id}.prompt`);
			await fileSystemProvider.writeFile(uri, new TextEncoder().encode(prompt.value), { create: true, overwrite: true });
			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc, { preview: false });
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('llmTools.displayPromptReadOnly', async (prompt?: Prompt) => {
		if (prompt) {
			const promptTitle = prompt.label;
			const uri = vscode.Uri.parse(`prompt:${promptTitle}.prompt?${encodeURIComponent(prompt.value)}`);
			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc, { preview: true });
		}
	}));



	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async (doc: vscode.TextDocument) => {
		// Check if the document's URI scheme is 'prompt'
		if (doc.uri.scheme === 'prompt') {
			const content = doc.getText();
			const promptId = promptService.extractPromptId(doc.fileName);
			if (!promptId) {
				vscode.window.showErrorMessage('Prompt ID not found (invalid prompt file name).');
				return;
			}
			await promptService.savePrompt(promptId, content);
			promptsExplorer.refresh();
			await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		}
	}));



}
