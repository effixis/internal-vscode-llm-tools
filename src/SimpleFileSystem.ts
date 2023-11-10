import * as vscode from 'vscode';

export default class SimpleFileSystem implements vscode.FileSystemProvider {
	private files: Map<string, string> = new Map();
	private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event;

	stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
		return {
			type: vscode.FileType.File,
			ctime: 0,
			mtime: 0,
			size: 0
		};
	}

	watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
		return new vscode.Disposable(() => { });
	}

	readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
		return [];
	}

	createDirectory(uri: vscode.Uri): void | Thenable<void> {
		// Not required for this example
	}

	readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
		const content = this.files.get(uri.path);
		if (content !== undefined) {
			return new TextEncoder().encode(content);
		}
		throw vscode.FileSystemError.FileNotFound();
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): void | Thenable<void> {
		this.files.set(uri.path, new TextDecoder().decode(content));
	}

	delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
		this.files.delete(uri.path);
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
		const content = this.files.get(oldUri.path);
		if (content !== undefined) {
			this.files.set(newUri.path, content);
			this.files.delete(oldUri.path);
		}
	}
}