
import {
	provideVSCodeDesignSystem,
	Button,
	ProgressRing,
	vsCodeButton,
	vsCodeDropdown,
	vsCodeOption,
	vsCodeTextField,
	vsCodeProgressRing,
	TextArea,
	vsCodeTextArea,
	vsCodeDivider,
} from "@vscode/webview-ui-toolkit";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const showdown = require('showdown');
const markdownConverter = new showdown.Converter();
//markdownConverter.setOption('tables', true);
markdownConverter.setFlavor('github');
let formatting = "markdown";
let localChat;
let targetMessage: HTMLDivElement | null = null;
let messageMode = 'streaming';

// In order to use the Webview UI Toolkit web components they
// must be registered with the browser (i.e. webview) using the
// syntax below.
provideVSCodeDesignSystem().register(
	vsCodeButton(),
	vsCodeDropdown(),
	vsCodeOption(),
	vsCodeProgressRing(),
	vsCodeTextField(),
	vsCodeTextArea(),
	vsCodeDivider()
);


const vscode = acquireVsCodeApi();

window.addEventListener("load", main);

function main() {
	const sendMessageBtn = document.getElementById("send-message-button") as Button;
	const messageInput = document.getElementById("message-input") as TextArea;
	sendMessageBtn.addEventListener("click", getMessage);
	messageInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			getMessage();
		}
	});

	const formatInput = document.getElementById("format-input") as HTMLSelectElement;
	formatInput.addEventListener("change", (e) => {
		formatting = (e.target as HTMLSelectElement).value;
		displayMessages(localChat.messages);
	});
	const modeInput = document.getElementById("mode-input") as HTMLSelectElement;
	modeInput.addEventListener("change", (e) => {
		messageMode = (e.target as HTMLSelectElement).value;
	});
	const actionsBtn = document.getElementById("toggle-actions") as Button;
	const actionsBtnIcon = document.getElementById("toggle-actions-icon");
	const actions = document.getElementById("actions") as HTMLDivElement;
	actionsBtn.addEventListener("click", () => {
		if (actions.style.display === "flex") {
			actions.style.display = "none";
			actionsBtnIcon.classList.remove("codicon-chevron-down");
			actionsBtnIcon.classList.add("codicon-chevron-right");
		}
		else {
			actions.style.display = "flex";
			actionsBtnIcon.classList.remove("codicon-chevron-right");
			actionsBtnIcon.classList.add("codicon-chevron-down");
		}
	});
	const cancelBtn = document.getElementById("cancel-message-button") as Button;
	cancelBtn.addEventListener("click", () => {
		const lastMessage = targetMessage ? targetMessage.textContent : "";
		vscode.postMessage({
			command: "cancelMessage",
			payload: lastMessage
		});
		displayLoadingState(false);
	});

	setVSCodeMessageListener();
}

function getMessage() {
	if (messageMode === 'streaming') {
		initMessageStream();
	}
	else {
		sendMessage();
	}
}

function initMessageStream() {
	const message = document.getElementById("message-input") as TextArea;
	const msg = {
		id: Date.now().toString(),
		role: "user",
		content: message.value,
		timestamp: Date.now(),
	};
	addMessage(msg);
	targetMessage = addMessage({
		role: "assistant",
		content: "",
		timestamp: Date.now(),
	});
	if (targetMessage) {
		targetMessage.innerHTML = `<div class="lds-ellipsis"><div></div><div></div><div></div><div></div></div>`;
	}
	vscode.postMessage({
		command: "initMessageStream",
		payload: msg
	});
	message.value = "";
	displayLoadingState();
}

function sendMessage() {
	const message = document.getElementById("message-input") as TextArea;
	const msg = {
		id: Date.now().toString(),
		role: "user",
		content: message.value,
		timestamp: Date.now(),
	};
	addMessage(msg);
	vscode.postMessage({
		command: "sendMessage",
		payload: msg
	});
	message.value = " ";
	displayLoadingState();
}

function patchMessage(message) {
	if (targetMessage) {
		targetMessage.innerHTML = formatMessage(message);
		scrollDown();
	}
}

function fixPatchedMessage(message) {
	if (targetMessage) {
		targetMessage.remove();
		addMessage(message);
		displayLoadingState(false);
		targetMessage = null;
		scrollDown();
	}
}

function appendToInput(value) {
	const message = document.getElementById("message-input") as TextArea;
	message.value = message.value + value;
}


function setVSCodeMessageListener() {
	window.addEventListener("message", (event) => {
		const command = event.data.command;
		switch (command) {
			case "init":
				initChat(event.data.payload);
				break;
			case "receiveMessage":
				addMessage(event.data.payload);
				displayLoadingState(false);
				break;
			case "patchMessage":
				patchMessage(event.data.payload);
				break;
			case "endStream":
				fixPatchedMessage(event.data.payload);
				break;
			case "appendToInput":
				appendToInput(event.data.payload);
				break;
		}
	});
}


function initChat(chat) {
	localChat = chat;
	const contentE = document.getElementById("chat-content");
	const noContent = document.getElementById("no-chat");
	const modelE = document.getElementById("chat-model");
	const modelTitleE = document.getElementById("chat-model-title");
	const systemPromptE = document.getElementById("chat-system-prompt");
	if (contentE && noContent && modelE && modelTitleE && systemPromptE) {
		// setting the meta informations
		modelTitleE.textContent = chat.parameters.label;
		modelE.textContent = chat.parameters.model;
		modelE.title = JSON.stringify(chat.parameters, null, 2);
		if (chat.systemPrompt?.value) {
			systemPromptE.textContent = chat.systemPrompt.label;
			systemPromptE.title = chat.systemPrompt.value;
		}
		else {
			systemPromptE.textContent = "None";
		}
		// revealing the chat
		contentE.style.display = "block";
		noContent.style.display = "none";
		// building the messages list
		displayMessages(chat.messages);
		// focusing the input
		const messageInput = document.getElementById("message-input") as TextArea;
		setTimeout(() => {
			messageInput?.focus();
		}, 20);
	}

}

function displayMessages(messages) {
	const messagesElem = document.getElementById("messages-list");
	if (messagesElem) {
		messagesElem.innerHTML = "";
		messages.forEach((message) => {
			const messageElem = buildMessage(message);
			messagesElem.appendChild(messageElem);
		});
	}
}

function formatMessage(value: string) {
	if (formatting === "markdown") {
		return markdownConverter.makeHtml(value);
	}
	return value;
}

function buildMessage(message) {
	const messageElem = document.createElement("div");
	messageElem.classList.add("message");
	messageElem.classList.add(message.role);
	messageElem.innerHTML = formatMessage(message.content);
	return messageElem;
}

function addMessage(message) {
	const messagesElem = document.getElementById("messages-list");
	localChat.messages.push(message);
	if (messagesElem) {
		const messageElem = buildMessage(message);
		messagesElem.appendChild(messageElem);
		return messageElem;
	}
	return null;
}


function displayLoadingState(show = true) {
	// hide / reveal the loader panel
	if (messageMode === 'streaming') {
		const loadE = document.getElementById("button-loader-panel");
		if (loadE) {
			show ? loadE.classList.add("open") : loadE.classList.remove("open");
		}
		const input = document.getElementById("message-input") as TextArea;
		setTimeout(() => {
			if (input) {
				input.focus();
			}
		}, 200);
	}
	else {
		const loadE = document.getElementById("simple-loader-panel");
		if (loadE) {
			show ? loadE.classList.add("open") : loadE.classList.remove("open");
		}
	}

	// disable / enable th inputs
	const input = document.getElementById("message-input") as TextArea;
	const btn = document.getElementById("send-message-button") as Button;
	if (input && btn) {
		input.disabled = show;
		btn.disabled = show;
	}

	// for animation purpose
	scrollDown();
}

function scrollDown() {
	window.scrollTo(0, document.body.scrollHeight);
}

