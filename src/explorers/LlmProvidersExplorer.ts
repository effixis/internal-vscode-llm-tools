import * as vscode from 'vscode';
import { LlmProvider, LlmProviderService, ParametersTemplate } from '../services/LlmProviderService';

export default class LlmProvidersExplorer implements vscode.TreeDataProvider<LlmTreeItem> {

  public static readonly viewType = 'llmTools.providersExplorer';

  private _onDidChangeTreeData: vscode.EventEmitter<LlmTreeItem | undefined | void> = new vscode.EventEmitter<LlmTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<LlmTreeItem | undefined | void> = this._onDidChangeTreeData.event;

  constructor(
    private readonly _extensionContext: vscode.ExtensionContext,
    private readonly _providersService: LlmProviderService
  ) { }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: LlmTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: LlmTreeItem): Thenable<LlmTreeItem[]> {
    // display: provider content
    if (element?.contextValue === "provider") {
      const e = element as LlmProviderItem;
      if (!e.provider) {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        new LlmProviderParameterItem(
          "API Key",
          e.provider.apiKey,
          "key",
          vscode.TreeItemCollapsibleState.None,
          {
            command: 'llmTools.editProviderParameter',
            title: 'Open prompt',
            arguments: ["apiKey", e.provider]
          }
        ),
        new LlmProviderFolderItem(
          e.provider,
          vscode.TreeItemCollapsibleState.Collapsed
        )
      ]);
    }
    else if (element?.contextValue === "parametersTemplate") {
      const e = element as LlmProviderParametersTemplateItem;
      const p = e.parameters;
      if (!p) {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        new LlmProviderParameterItem(
          "Model",
          p.model,
          "",
          vscode.TreeItemCollapsibleState.None,
          {
            command: 'llmTools.editTemplateParameter',
            title: 'Edit parameter',
            arguments: ["model", p, p]
          }
        ),
        new LlmProviderParameterItem(
          "Temperature",
          p.temperature?.toString() || "",
          "",
          vscode.TreeItemCollapsibleState.None,
          {
            command: 'llmTools.editTemplateParameter',
            title: 'Edit parameter',
            arguments: ["temperature", p, p]
          }
        ),
        new LlmProviderParameterItem(
          "Max tokens",
          p.max_tokens?.toString() || "",
          "",
          vscode.TreeItemCollapsibleState.None,
          {
            command: 'llmTools.editTemplateParameter',
            title: 'Edit parameter',
            arguments: ["max_tokens", p, p]
          }
        ),
        new LlmProviderParameterItem(
          "Top P",
          p.top_p?.toString() || "",
          "",
          vscode.TreeItemCollapsibleState.None,
          {
            command: 'llmTools.editTemplateParameter',
            title: 'Edit parameter',
            arguments: ["top_p", p, p]
          }
        )
      ]);
    }
    else if (element?.contextValue === "providerFolder") {
      const e = element as LlmProviderFolderItem;
      const provider = e.provider;
      if (!provider) {
        return Promise.resolve([]);
      }
      return Promise.resolve(provider.parametersTemplates?.map((parameters: ParametersTemplate) => (
        new LlmProviderParametersTemplateItem(
          parameters,
          provider,
          "note",
          vscode.TreeItemCollapsibleState.Collapsed
        )
      )) || []);
    }
    // display the providers
    else {
      const providersList = this._providersService.getProviders();
      return Promise.resolve(providersList.map((provider: LlmProvider, index: number) => new LlmProviderItem(
        provider,
        vscode.TreeItemCollapsibleState.Collapsed
      )));
    }
  }

}

export type LlmTreeItem = LlmProviderItem | LlmProviderParameterItem | LlmProviderParametersTemplateItem | LlmProviderFolderItem;

export class LlmProviderItem extends vscode.TreeItem {

  constructor(
    public readonly provider: LlmProvider,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    const label = provider.label || provider.providerName || "Provider";
    super(label, collapsibleState);

    this.description = provider.providerName || provider.providerCode || "";
    // this.tooltip = JSON.stringify(provider, null, 2);
    if (provider.icon) {
      this.iconPath = new vscode.ThemeIcon(provider.icon);
    }
  }

  contextValue = 'provider';
}

export class LlmProviderParameterItem extends vscode.TreeItem {

  constructor(
    public readonly label: string,
    public readonly value: string,
    public readonly icon: string | null,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);

    this.description = this.value;
    this.tooltip = this.value;
    if (icon) {
      this.iconPath = new vscode.ThemeIcon(icon);
    }
  }

  contextValue = 'providerParameter';
}

export class LlmProviderParametersTemplateItem extends vscode.TreeItem {

  constructor(
    public readonly parameters: ParametersTemplate,
    public readonly provider: LlmProvider,
    public readonly icon: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(parameters.label, collapsibleState);

    this.tooltip = this.parameters.model;
    this.description = `${this.parameters.model} [${this.parameters.temperature}, ${this.parameters.max_tokens}, ${this.parameters.top_p}]`;
    this.iconPath = new vscode.ThemeIcon(this.icon);
  }

  contextValue = 'parametersTemplate';
}

export class LlmProviderFolderItem extends vscode.TreeItem {

  constructor(
    public readonly provider: LlmProvider,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super("Parameters Templates", collapsibleState);
  }

  contextValue = 'providerFolder';
}