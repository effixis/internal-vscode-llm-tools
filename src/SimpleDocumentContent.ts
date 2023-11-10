import * as vscode from 'vscode';

export default class SimpleDocumentContent implements vscode.TextDocumentContentProvider {
  onDidChange?: vscode.Event<vscode.Uri> | undefined;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return decodeURIComponent(uri.query);
  }
}
