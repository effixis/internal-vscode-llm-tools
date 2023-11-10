import * as vscode from 'vscode';

export interface StepSelectorItem extends vscode.QuickPickItem {
	value?: string;
	icon?: string;
}

export type StepSelectorValidateResponse = string | vscode.InputBoxValidationMessage | undefined | null

export interface StepSelectorInputConfig<T> {
	label?: string;
	placeholder?: string;
	key: keyof T | null;
	useItemAsValue?: boolean | string[];
	options?: StepSelectorItem[] | ((state: Partial<T>) => Promise<StepSelectorItem[]>);
	password?: boolean;
	prompt?: string;
	validateInput?: (value: string) => StepSelectorValidateResponse | Promise<StepSelectorValidateResponse>;
	addAction?: (state: Partial<T>, self: StepSelector<T>) => Promise<StepSelectorItem | null>;
	addActionNewOptionLabel?: string;
}

export interface StepSelectorParams<T> {
	label?: string;
	inputs: StepSelectorInputConfig<T>[];
}

export interface SelectorInputParams<T> {
	state: Partial<T>
	title: string
	placeholder?: string
	options?: StepSelectorItem[] | Promise<StepSelectorItem[]>
	step: number
	totalSteps: number
	defaultValue?: string
	password?: StepSelectorInputConfig<T>["password"]
	prompt?: StepSelectorInputConfig<T>["prompt"]
	validateInput?: StepSelectorInputConfig<T>["validateInput"]
	addAction?: StepSelectorInputConfig<T>["addAction"]
	addActionNewOptionLabel?: string
}

export default class StepSelector<T> {
	public currentStep = 0;
	private params: StepSelectorParams<T>;
	private steps: (() => Thenable<StepSelectorItem | null | string>)[];
	private inputs: SelectorInput<T>[] = [];

	constructor(params: StepSelectorParams<T>, private state: Partial<T> = {}) {
		this.params = params;
		this.steps = params.inputs.map((input, index) => () => this.createStep(input, index));
	}

	private async createStep(inputConfig: StepSelectorInputConfig<T>, stepIndex: number): Promise<StepSelectorItem | null | string> {
		let options: StepSelectorItem[] | Promise<StepSelectorItem[]> | undefined;

		if (typeof inputConfig.options === 'function') {
			options = inputConfig.options(this.state);
		} else {
			options = inputConfig.options;
		}

		const currentValue = inputConfig.key === null ? this.state : this.state[inputConfig.key];
		let title = inputConfig.label || this.params.label || 'Select an option';
		if (inputConfig.label && this.params.label) {
			title = `${this.params.label} - ${inputConfig.label}`;
		}

		const input = new SelectorInput({
			...inputConfig,
			state: this.state,
			title: title,
			options: options,
			step: stepIndex + 1,
			totalSteps: this.params.inputs.length,
			defaultValue: currentValue?.toString(),
		}, this);

		this.inputs.push(input);
		return input.show();
	}

	public close() {
		this.inputs.map(e => e.hide());
	}

	static filterObject<T extends object>(obj: T, keysToKeep: string[]): Partial<T> {
		const filteredEntries = Object.entries(obj).filter(([key]) => keysToKeep.includes(key));
		return Object.fromEntries(filteredEntries) as Partial<T>;
	}

	async run(): Promise<Partial<T> | null> {
		while (this.currentStep < this.steps.length) {
			const result = await this.steps[this.currentStep]();
			if (result === 'back') {
				if (this.currentStep > 0) {
					this.currentStep--;
					continue;
				} else {
					this.close();
					return null;
				}
			}
			else if (result === null) {
				// loop again...
			}
			else if (typeof result === 'object') {
				const currentInput = this.params.inputs[this.currentStep];
				const key = currentInput.key;
				if (currentInput.useItemAsValue) {
					if (Array.isArray(currentInput.useItemAsValue)) {
						const v = (StepSelector<T>).filterObject(result, currentInput.useItemAsValue);
						key === null ? this.state = v as T : this.state[key] = v as T[keyof T];
					}
					else {
						const v = result as T[keyof T];
						key === null ? this.state = v as T : this.state[key] = v as T[keyof T];

					}
				}
				else {
					const v = result.value as T[keyof T];
					key === null ? this.state = v as T : this.state[key] = v as T[keyof T];

				}
				this.currentStep++;
				if (this.currentStep >= this.steps.length) {
					return this.state;
				}
			}
			else if (typeof result === 'string') {
				const key = this.params.inputs[this.currentStep].key;
				const v = result as T[keyof T];
				key === null ? this.state = v as T : this.state[key] = v as T[keyof T];

				this.currentStep++;
				if (this.currentStep >= this.steps.length) {
					return this.state;
				}
			}
		}
		return this.state;
	}


}


class SelectorInput<T> {
	private _quickPick!: vscode.QuickPick<StepSelectorItem>;
	private _inputBox!: vscode.InputBox;
	private _isQuickPick: boolean;

	constructor(public params: SelectorInputParams<T>, private _formRef: StepSelector<T>) {

		this._isQuickPick = !!params.options;
		const stepPart = params.step && params.totalSteps > 1 ? ` (Step ${params.step} of ${params.totalSteps})` : '';

		// QuickPick
		if (this._isQuickPick) {
			this._quickPick = vscode.window.createQuickPick<StepSelectorItem>();
			this._quickPick.title = `${params.title}${stepPart}`;
			this._quickPick.placeholder = params.placeholder;
			this._quickPick.buttons = params.totalSteps > 1 ? [vscode.QuickInputButtons.Back] : [];
			this._quickPick.ignoreFocusOut = true;
			if (params.prompt) {
				this._inputBox.prompt = params.prompt;
			}
			// Handle the options fetching logic
			if (params.options instanceof Promise) {
				this._quickPick.busy = true;
				params.options.then(items => {
					this._quickPick.items = items.map(item => ({
						...item,
						label: item.icon ? `$(${item.icon}) ${item.label}` : item.label,
					}));
					if (params.addAction) {
						this._quickPick.items = [...this._quickPick.items, {
							label: params.addActionNewOptionLabel || 'Add Item...',
							value: 'new'
						}];
					}
					this._quickPick.busy = false;
					if (params.defaultValue) {
						const defaultItem = items.find(item => item.value === params.defaultValue);
						if (defaultItem) {
							this._quickPick.selectedItems = [defaultItem];
						}
					}
				});
			}
			else {
				this._quickPick.items = (params.options || []).map(item => ({
					...item,
					label: item.icon ? `$(${item.icon}) ${item.label}` : item.label,
				}));
				if (params.addAction) {
					this._quickPick.items = [...this._quickPick.items, {
						label: params.addActionNewOptionLabel || 'Add Item...',
						value: 'new'
					}];
				}
				if (params.defaultValue) {
					const defaultItem = this._quickPick.items.find(item => item.value === params.defaultValue);
					if (defaultItem) {
						this._quickPick.selectedItems = [defaultItem];
					}
				}
			}
			// If addAction is provided, show a button for it
			if (params.addAction) {
				const addButtonItem = {
					iconPath: new vscode.ThemeIcon('add'),
					tooltip: 'Add Item'
				};
				this._quickPick.buttons = [...this._quickPick.buttons, addButtonItem];
			}
		}

		// InputBox
		else {
			this._inputBox = vscode.window.createInputBox();
			this._inputBox.title = `${params.title}${stepPart}`;
			this._inputBox.placeholder = params.placeholder;
			this._inputBox.buttons = params.totalSteps > 1 ? [vscode.QuickInputButtons.Back] : [];
			this._inputBox.ignoreFocusOut = true;
			if (params.defaultValue) {
				this._inputBox.value = params.defaultValue;
			}
			if (params.password) {
				this._inputBox.password = true;
			}
			if (params.prompt) {
				this._inputBox.prompt = params.prompt;
			}
			// Handle the validation logic
			if (params.validateInput) {
				let validationDebounceTimeout: NodeJS.Timeout | undefined;
				this._inputBox.onDidChangeValue(async (inputValue) => {
					if (validationDebounceTimeout !== undefined) {
						clearTimeout(validationDebounceTimeout);
					}
					this._inputBox.busy = true; // Set the InputBox to busy before validation
					validationDebounceTimeout = setTimeout(async () => {
						if (params.validateInput === undefined) return;
						const validationMessage = await params.validateInput(inputValue);
						this._inputBox.validationMessage = validationMessage || undefined;
						this._inputBox.busy = false; // Unset the InputBox from busy after validation
					}, 500); // Adding debounce of 500ms before triggering validation
				});
			}
		}
	}

	private async openAddItem() {
		try {
			if (this.params.addAction) {
				this._quickPick.hide();
				await new Promise(r => setTimeout(r, 50)); // quick hack to prevent the quickpick from calling onDidHide directly.
				const newItem = await this.params.addAction(this.params.state, this._formRef);
				if (newItem) {
					this._quickPick.items = [newItem, ...this._quickPick.items];
					this._quickPick.selectedItems = [newItem];
					return newItem;
				}
				else {
					return null; // If undefined, resolve to null to indicate no change (loop again the same question)
				}
			}
		} catch (error) {
			return null;
		}
	}

	public show(): Thenable<StepSelectorItem | string | null> {
		if (this._isQuickPick) {
			return new Promise((resolve) => {
				this._quickPick.onDidTriggerButton(async (button) => {
					if (button === vscode.QuickInputButtons.Back) {
						resolve('back');
					}
					else if ((button as any).tooltip === 'Add Item') {
						this._quickPick.busy = true;
						const addItemResponse = await this.openAddItem();
						this._quickPick.busy = false;
						resolve(addItemResponse || null);
					}
				});

				this._quickPick.onDidChangeSelection(async selection => {
					const v = selection[0];
					if (v) {
						if (v.value === 'new') {
							this._quickPick.busy = true;
							const addItemResponse = await this.openAddItem();
							this._quickPick.busy = false;
							resolve(addItemResponse || null);
						}
						else {
							resolve(v);
							this._quickPick.hide();
						}
					}
				});

				this._quickPick.onDidHide(() => {
					this._quickPick.dispose();
				});

				this._quickPick.show();
			});
		}
		else {
			return new Promise((resolve) => {
				this._inputBox.onDidTriggerButton(() => {
					resolve('back');
					return;
				});

				this._inputBox.onDidAccept(async () => {
					if (this._inputBox.validationMessage === undefined) {
						if (this.params.validateInput) {
							this._inputBox.busy = true;
							const validationMessage = await this.params.validateInput(this._inputBox.value);
							this._inputBox.validationMessage = validationMessage || undefined;
							this._inputBox.busy = false;
							if (validationMessage) return;
						}
						resolve(this._inputBox.value);
						this._inputBox.hide();
					}
				});

				this._inputBox.onDidHide(() => {
					this._inputBox.dispose();
				});

				this._inputBox.show();
			});
		}
	}

	public hide() {
		if (this._isQuickPick) {
			this._quickPick.hide();
			this._quickPick.dispose();
		}
		else {
			this._inputBox.hide();
			this._inputBox.dispose();
		}
	}
}