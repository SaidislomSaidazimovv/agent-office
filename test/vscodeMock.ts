// ── Minimal `vscode` mock (test bundle uchun alias bilan ulanadi) ──
// npm test skriptида `--alias:vscode=./test/vscodeMock.ts` orqali ulanadi,
// shunда agentManager haqiqiy VS Code'сиз sinaladi.
type Listener = (t: unknown) => void;

class Uri {
  private constructor(public fsPath: string) {}
  static file(p: string): Uri {
    return new Uri(p);
  }
}

export const _state = {
  terminals: [] as unknown[],
  activeTerminal: undefined as unknown,
  closeListeners: [] as Listener[],
  workspaceFolders: [] as { uri: Uri }[],
};

export function resetState(workspacePath: string): void {
  _state.terminals = [];
  _state.activeTerminal = undefined;
  _state.closeListeners = [];
  _state.workspaceFolders = [{ uri: Uri.file(workspacePath) }];
}

export function fireClose(t: unknown): void {
  _state.terminals = _state.terminals.filter((x) => x !== t);
  if (_state.activeTerminal === t) _state.activeTerminal = undefined;
  for (const fn of _state.closeListeners) fn(t);
}

/** Sinov terminalи yaratadi (ro'yxatga qo'shadi). */
export function makeTerminal(opts: { name?: string; cwd?: string } = {}): {
  name: string;
  creationOptions: Record<string, unknown>;
  shellIntegration?: { cwd: Uri };
  show(): void;
  dispose(): void;
} {
  const t = {
    name: opts.name ?? "pwsh",
    creationOptions: {} as Record<string, unknown>,
    shellIntegration: opts.cwd ? { cwd: Uri.file(opts.cwd) } : undefined,
    show(): void {},
    dispose(): void {
      fireClose(t);
    },
  };
  _state.terminals.push(t);
  return t;
}

export const window = {
  get terminals(): unknown[] {
    return _state.terminals;
  },
  get activeTerminal(): unknown {
    return _state.activeTerminal;
  },
  createTerminal(opts: { name?: string; cwd?: string }): unknown {
    const t = {
      name: opts.name,
      creationOptions: opts,
      shellIntegration: undefined,
      show(): void {},
      dispose(): void {
        fireClose(t);
      },
    };
    _state.terminals.push(t);
    return t;
  },
  onDidCloseTerminal(fn: Listener): { dispose(): void } {
    _state.closeListeners.push(fn);
    return { dispose(): void {} };
  },
};

export const workspace = {
  get workspaceFolders(): { uri: Uri }[] {
    return _state.workspaceFolders;
  },
};

export { Uri };
export const Disposable = { from() { return { dispose(): void {} }; } };
export default { window, workspace, Uri, Disposable };
