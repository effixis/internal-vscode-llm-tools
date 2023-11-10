import * as vscode from "vscode";
import { Chat, ChatElement, ChatService } from "../../services/ChatService";
import { LlmProviderService } from "../../services/LlmProviderService";
import { getNonce } from "../../utilities";

export class ChatWebview implements vscode.WebviewViewProvider {

	public static readonly viewType = 'llmTools.chatView';
	private readonly _extensionUri: vscode.Uri;
	public _webviewView?: vscode.WebviewView;
	private _localChat?: Chat;

	constructor(
		private readonly _extensionContext: vscode.ExtensionContext,
		private readonly _providerService: LlmProviderService,
		private readonly _chatService: ChatService,
	) {
		this._extensionUri = _extensionContext.extensionUri;
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		// Allow scripts in the webview
		webviewView.webview.options = { enableScripts: true };
		// Set the webview content, listeners and webview reference
		webviewView.webview.html = this._getWebviewContent(webviewView.webview, this._extensionUri);
		this._setWebviewMessageListener(webviewView);
		this._webviewView = webviewView;
	}

	public init(chat: Chat) {
		this._localChat = chat;
		// Ensure the webviewView is available
		if (!this._webviewView?.webview?.postMessage) {
			console.error('WebviewView is not available');
			return;
		}
		// Post the initialization message to the webview
		this._webviewView.webview.postMessage({
			command: 'init',
			payload: chat
		});
	}

	private async sendMessage(message: ChatElement) {
		// Ensure the webviewView is available
		if (!this._webviewView?.webview?.postMessage) {
			vscode.window.showErrorMessage('WebviewView is not available');
			return;
		}
		// Ensure the localChat is defined
		if (!this._localChat) {
			vscode.window.showErrorMessage('_localChat not defined');
			return;
		}
		// Ensure the message is defined
		if (!message.content) {
			vscode.window.showErrorMessage('Message not defined');
			return;
		}

		let response = await this._providerService.runCall(this._localChat, message.content);

		// Ensure the response is not null
		if (response === null) {
			return;
		}

		// Wrap the response in a ChatElement if needed
		if (response !== null && !response?.content) {
			const topMessage = response.choices[0].message || {};
			response = { ...response, ...topMessage } as ChatElement;
		}

		// Add the message to the chat
		this._localChat = await this._chatService.addMessagesAndSave(this._localChat, [message, response]);

		// Post the initialization message to the webview
		this._webviewView.webview.postMessage({
			command: 'receiveMessage',
			payload: response
		});
	}

	public async postMessage(command: string, payload?: any) {
		if (!this._webviewView?.webview?.postMessage) {
			vscode.window.showErrorMessage('WebviewView is not available');
			return;
		}
		await this._webviewView.webview.postMessage({
			command: command,
			payload: payload
		});
		return;
	}

	private async initMessageStream(message: ChatElement) {
		// Ensure the webviewView is available
		if (!this._webviewView?.webview?.postMessage) {
			return this.endStream('WebviewView is not available');
		}
		// Ensure the localChat is defined
		if (!this._localChat) {
			return this.endStream('_localChat not defined');
		}
		// Ensure the message is defined
		if (!message.content) {
			return this.endStream('Message not defined');
		}

		const generator = await this._providerService.runStreamCall(this._localChat, message.content);

		// Ensure the generator is not null
		if (!generator) {
			return this.endStream('The generator cannot be accessed at the moment, typically because the provider responsible for creating the chat has been removed.');
		}

		// loop through the generator
		const chunks: any[] = [];
		let content = "";
		try {
			for await (const chunk of generator) {
				const value = chunk.choices[0].delta.content;
				if (value) {
					chunks.push(chunk);
					content += value;
				}
				this._webviewView.webview.postMessage({
					command: 'patchMessage',
					payload: content
				});
			}

			const response = {
				...(chunks?.[chunks.length - 1] || {}),
				role: 'assistant',
				content: content,
				object: 'chat.completion._chain'
			};
			this._webviewView.webview.postMessage({
				command: 'endStream',
				payload: response
			});

			// Add the message to the chat
			this._localChat = await this._chatService.addMessagesAndSave(this._localChat, [message, response]);

		} catch (error: any) {
			return this.endStream(error.message);
		}
	}

	private endStream(message: string) {
		if (!this._webviewView) {
			return;
		}
		vscode.window.showErrorMessage(message);
		this._webviewView.webview.postMessage({
			command: 'endStream',
			payload: LlmProviderService.buildErrorResponse(message)
		});
		return;
	}

	private cancelStream(currentMessage: string) {
		if (!this._webviewView) {
			return;
		}
		this._providerService.abortCallStream(this._localChat);
		this._webviewView.webview.postMessage({
			command: 'endStream',
			payload: {
				id: Date.now().toString(),
				role: 'assistant',
				content: currentMessage + " [CANCELLED]",
				object: 'chat.completion._cancelled'
			}
		});
	}


	private _setWebviewMessageListener(webviewView: vscode.WebviewView) {
		webviewView.webview.onDidReceiveMessage((message) => {
			const command = message.command;
			const payload = message.payload;
			switch (command) {
				case "sendMessage":
					this.sendMessage(payload);
					break;
				case "initMessageStream":
					this.initMessageStream(payload);
					break;
				case "cancelMessage":
					this.cancelStream(message.payload);
					break;
			}
		});
	}

	private _getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {

		const webviewUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'webview.js'));
		const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'style.css'));
		const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));
		const nonce = getNonce();

		// Tip: Install the es6-string-html VS Code extension to enable code highlighting below
		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
					<link rel="stylesheet" href="${stylesUri}">
					<link href="${codiconsUri}" rel="stylesheet" />
					<title>LLM Chat</title>
				</head>
				<body>
					<div id="chat-content">
						<vscode-button id="toggle-actions" aria-label="Toggle actions panel" appearance="icon">
							<span class="codicon codicon-selection" id="toggle-actions-icon"></span>
						</vscode-button>
						<section id="actions">
							<div class="dropdown-container">
								<label for="format-input">Formatting</label>
								<vscode-dropdown id="format-input">
									<vscode-option value="markdown">Markdown</vscode-option>
									<vscode-option value="plain">Plain text</vscode-option>
								</vscode-dropdown>
							</div>
							<div class="dropdown-container">
								<label for="mode-input">Mode</label>
								<vscode-dropdown id="mode-input">
									<vscode-option value="streaming">Streaming</vscode-option>
									<vscode-option value="classic">One call</vscode-option>
								</vscode-dropdown>
							</div>
						</section>
						<section id="chat-details">
							<div id="details-content">
								<table>
									<tbody>
										<tr>
											<th id="chat-model-title">Parameters</th>
											<td id="chat-model"></td>
										</tr>
										<tr>
											<th>System Prompt</th>
											<td id="chat-system-prompt"></td>
										</tr>
									</tbody>
								</table>
							<div>
							<vscode-divider></vscode-divider>
						</section>
						<span id="messages-title">Messages</span>
						<section id="messages-list">

						</section>
						<section class="loader-panel" id="simple-loader-panel">
							<vscode-progress-ring class="simple-loader"></vscode-progress-ring>
						</section>
						<section class="loader-panel" id="button-loader-panel">
							<vscode-progress-ring class="simple-loader"></vscode-progress-ring>
							<vscode-button id="cancel-message-button" aria-label="Cancel message" appearance="icon">
								Cancel
							</vscode-button>
						</section>
						<section id="chat-input">
							<div id="message-wrapper">
								<vscode-text-area
									id="message-input"
									placeholder="Enter a message..."
									aria-label="Message input"
									resize="vertical"
									rows="2"
									value=""
								></vscode-text-area>
								<vscode-button id="send-message-button" aria-label="Send message" appearance="secondary">
									<span class="codicon codicon-send"></span>
								</vscode-button>
							</div>
						</section>
					</div>
					<div id="no-chat">
						<span>Select a chat from the list.</span>
						<!-- <vscode-button id="new-chat-button" aria-label="New chat">
							New chat
						</vscode-button> -->
					</div>
          <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
				</body>
			</html>
		`;
	}

}

