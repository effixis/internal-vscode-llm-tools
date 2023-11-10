import { ChatElement, Chat } from '../services/ChatService';
import { LlmProviderService } from '../services/LlmProviderService';

export class OpenAiController {

	public abortController: AbortController | undefined;

	constructor(private apiKey: string | undefined) { }

	async setApiKey(key: string) {
		this.apiKey = key;
	}

	private buildMessagesListFromChat(chat: Chat, newMessage: string) {
		const messages = chat.messages.filter(m => m.role !== "error").map(message => {
			return {
				role: message.role || "user",
				content: message.content || "",
			};
		});
		if (chat.systemPrompt?.value) {
			messages.unshift({
				role: 'system',
				content: chat.systemPrompt?.value || '',
			});
		}
		return [
			...messages,
			{
				"role": "user",
				"content": newMessage
			}
		];
	}


	async apiCall(chat: Chat, message: string): Promise<ChatElement> {
		if (!this.apiKey) {
			return LlmProviderService.buildErrorResponse('OpenAI provider is not initialized.');
		}
		if (!chat.parameters.model) {
			return LlmProviderService.buildErrorResponse('OpenAI model is not defined.');
		}

		const messages = this.buildMessagesListFromChat(chat, message);

		try {
			this.abortController = new AbortController();
			const signal = this.abortController.signal;

			const response = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: chat.parameters.model,
					messages: messages,
					temperature: chat.parameters.temperature || 0,
					max_tokens: chat.parameters.max_tokens || 256,
					top_p: chat.parameters.top_p || 1,
					frequency_penalty: 0,
					presence_penalty: 0
				}),
				signal: signal
			});

			const result = await response.json();
			if (!response.ok) {
				return LlmProviderService.buildErrorResponse(result.error.message);
			}
			return result;

		} catch (error: any) {
			return LlmProviderService.buildErrorResponse(error.message);
		}
	}

	private isValidJson(str: string) {
		try {
			JSON.parse(str);
		} catch (e) {
			return false;
		}
		return true;
	}

	async *apiStreamCall(chat: Chat, message: string): AsyncGenerator<any, void, undefined> {
		if (!this.apiKey) {
			throw new Error('OpenAI provider is not initialized.');
		}
		if (!chat.parameters.model) {
			throw new Error('OpenAI model is not defined.');
		}

		const messages = this.buildMessagesListFromChat(chat, message);

		try {
			const controller = new AbortController();
			const signal = controller.signal;

			const response = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: chat.parameters.model,
					messages: messages,
					temperature: chat.parameters.temperature || 0,
					max_tokens: chat.parameters.max_tokens || 256,
					top_p: chat.parameters.top_p || 1,
					frequency_penalty: 0,
					presence_penalty: 0,
					stream: true
				}),
				signal: signal
			});

			if (!response.ok) {
				const jsonResponse = await response.json();
				throw new Error(jsonResponse.error.message);
			}

			const reader = response.body?.getReader();
			const decoder = new TextDecoder("utf-8");

			if (!reader) {
				throw new Error('OpenAI response is not valid.');
			}

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				const chunk = decoder.decode(value);
				const lines = chunk.split(/\n\n|\n/);
				const jsonStringLines = lines
					.map((line) => line.replace(/^data: /, "").trim())
					.filter((line) => line !== "" && line !== "[DONE]");

				for (const stringLine of jsonStringLines) {
					if (this.isValidJson(stringLine)) {
						const json = JSON.parse(stringLine);
						yield json;
					}
				}
			}

		} catch (error: any) {
			throw new Error(error.message);
		}
	}

	abort() {
		if (this.abortController) {
			this.abortController.abort();
		}
	}
}
