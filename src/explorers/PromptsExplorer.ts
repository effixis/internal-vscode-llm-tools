import * as vscode from 'vscode';
import { Prompt, PromptService } from '../services/PromptService';

export default class PromptsExplorer implements vscode.TreeDataProvider<PromptItem> {

  public static readonly viewType = 'llmTools.promptsExplorer';

  private _onDidChangeTreeData: vscode.EventEmitter<PromptItem | undefined | void> = new vscode.EventEmitter<PromptItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<PromptItem | undefined | void> = this._onDidChangeTreeData.event;
  private readonly _extensionContext: vscode.ExtensionContext;

  constructor(
    extensionContext: vscode.ExtensionContext,
    private readonly promtService: PromptService,
  ) {
    this._extensionContext = extensionContext;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: PromptItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: PromptItem): Thenable<PromptItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    else {
      const promptsList = this.promtService.getPrompts();
      if (promptsList.length === 0) {
        return Promise.resolve([]);
      }
      return Promise.resolve(promptsList.map((prompt: Prompt, index: number) => new PromptItem(
        prompt.label,
        prompt.value,
        prompt.id,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'llmTools.displayPrompt',
          title: 'Open prompt',
          arguments: [prompt, index]
        }
      )));
    }
  }

}

export class PromptItem extends vscode.TreeItem {

  constructor(
    public readonly label: string,
    private readonly value: string,
    public readonly id: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);

    this.tooltip = this.value;
    this.description = this.value;
    this.iconPath = new vscode.ThemeIcon("output");
  }

  contextValue = this.id === "searchPlaceholder" ? "searchPlaceholder" : 'prompt';
}