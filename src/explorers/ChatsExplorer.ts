import * as vscode from 'vscode';
import { Chat, ChatService } from '../services/ChatService';

export default class ChatsExplorer implements vscode.TreeDataProvider<ChatItem> {

  public static readonly viewType = 'llmTools.chatsExplorer';

  private _onDidChangeTreeData: vscode.EventEmitter<ChatTreeItem | undefined | void> = new vscode.EventEmitter<ChatTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<ChatTreeItem | undefined | void> = this._onDidChangeTreeData.event;

  constructor(
    private readonly _extensionContext: vscode.ExtensionContext,
    private readonly _chatService: ChatService
  ) { }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ChatItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ChatItem): Thenable<ChatItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    else {
      const chatsList = this._chatService.getChats();
      if (chatsList.length === 0) {
        return Promise.resolve([]);
      }
      return Promise.resolve(chatsList.map((chat: Chat, index: number) => new ChatItem(
        chat.label || chat.systemPrompt?.label || "Chat",
        chat,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'llmTools.showChat',
          title: 'Open chat',
          arguments: [chat, index]
        }
      )));
    }
  }

}


export type ChatTreeItem = ChatItem;

export class ChatItem extends vscode.TreeItem {

  constructor(
    public readonly label: string,
    public readonly chat: Chat,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);

    // this.tooltip = JSON.stringify({ ...chat, messages: "[...]" }, null, 2);
    this.description = !chat.messages.length ? "" : String(chat.messages.length) + " • ";
    if (chat.provider) {
      this.description += `${chat.provider.label}`;
    }
    if (chat.parameters) {
      this.description += ` ~ ${chat.parameters.label}`;
    }
    const firstUserMessage = chat.messages.find(m => m.role === "user");
    if (firstUserMessage) {
      this.description += ` | ${firstUserMessage.content}`;
    }
    this.iconPath = new vscode.ThemeIcon("comment-discussion");
  }

  contextValue = this.id === "searchPlaceholder" ? "searchPlaceholder" : 'chat';
}