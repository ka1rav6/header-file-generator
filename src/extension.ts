/**
 * extension.ts
 * VS Code extension entry point for Header File Generator.
 *
 * Registers the `headerFileGenerator.generate` command and wires up
 * all activation hooks (command palette, context menus, keybinding).
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { parseSource } from "./parser";
import { generateHeader } from "./generator";

// ─── Constants ────────────────────────────────────────────────────────────────

const COMMAND_ID = "headerFileGenerator.generate";
const C_EXTENSIONS = new Set([".c", ".cpp", ".cc", ".cxx", ".c++"]);

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  console.log("Header File Generator activated");

  // Register the main command
  const disposable = vscode.commands.registerCommand(
    COMMAND_ID,
    async (uri?: vscode.Uri) => {
      await runGenerateCommand(uri);
    }
  );

  context.subscriptions.push(disposable);

  // Status bar convenience button (visible when a C/C++ file is open)
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = COMMAND_ID;
  statusBarItem.text = "$(file-add) Gen .h";
  statusBarItem.tooltip = "Generate Header File (Ctrl+Shift+H)";
  context.subscriptions.push(statusBarItem);

  // Show/hide status bar item based on active editor language
  const updateStatusBar = (editor?: vscode.TextEditor) => {
    if (editor && isCOrCpp(editor.document.fileName)) {
      statusBarItem.show();
    } else {
      statusBarItem.hide();
    }
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateStatusBar)
  );
  updateStatusBar(vscode.window.activeTextEditor);
}

export function deactivate(): void {
  console.log("Header File Generator deactivated");
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

/**
 * Main command handler.
 * Accepts an optional `uri` when triggered from the Explorer context menu.
 * Falls back to the currently active editor.
 */
async function runGenerateCommand(uri?: vscode.Uri): Promise<void> {
  let sourceFilePath: string | undefined;

  // 1. Determine source file path
  if (uri) {
    // Triggered from Explorer context menu
    sourceFilePath = uri.fsPath;
  } else {
    // Triggered from Command Palette or keybinding
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage(
        "Header File Generator: No active editor found. Please open a C/C++ source file."
      );
      return;
    }
    sourceFilePath = editor.document.fileName;
  }

  // 2. Validate it's a C/C++ file
  if (!isCOrCpp(sourceFilePath)) {
    vscode.window.showErrorMessage(
      `Header File Generator: "${path.basename(sourceFilePath)}" is not a C/C++ source file (.c, .cpp, .cc, .cxx).`
    );
    return;
  }

  // 3. Read source content
  let sourceContent: string;
  try {
    sourceContent = fs.readFileSync(sourceFilePath, "utf8");
  } catch (err) {
    vscode.window.showErrorMessage(
      `Header File Generator: Could not read file "${sourceFilePath}".\n${String(err)}`
    );
    return;
  }

  // 4. Parse & generate with progress notification
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Header File Generator",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "Parsing source file…" });

      let parsed;
      try {
        parsed = parseSource(sourceContent, sourceFilePath!);
      } catch (err) {
        vscode.window.showErrorMessage(
          `Header File Generator: Parse error — ${String(err)}`
        );
        return;
      }

      progress.report({ message: "Generating header…", increment: 50 });

      let headerContent: string;
      try {
        headerContent = generateHeader(parsed, sourceFilePath!);
      } catch (err) {
        vscode.window.showErrorMessage(
          `Header File Generator: Generation error — ${String(err)}`
        );
        return;
      }

      // 5. Determine output path
      const dir = path.dirname(sourceFilePath!);
      const baseName = path.basename(sourceFilePath!, path.extname(sourceFilePath!));
      const headerPath = path.join(dir, `${baseName}.h`);

      progress.report({ message: "Writing header file…", increment: 40 });

      // 6. Check if header already exists
      const existed = fs.existsSync(headerPath);

      // 7. Write the header
      try {
        fs.writeFileSync(headerPath, headerContent, "utf8");
      } catch (err) {
        vscode.window.showErrorMessage(
          `Header File Generator: Could not write "${headerPath}".\n${String(err)}`
        );
        return;
      }

      progress.report({ increment: 10 });

      // 8. Open the generated header in the editor
      const headerUri = vscode.Uri.file(headerPath);
      const doc = await vscode.workspace.openTextDocument(headerUri);
      await vscode.window.showTextDocument(doc, {
        preview: false,
        viewColumn: vscode.ViewColumn.Beside,
      });

      // 9. Success notification
      const action = existed ? "Updated" : "Created";
      const stats = buildStatsSummary(parsed);
      vscode.window.showInformationMessage(
        `✅ ${action} "${baseName}.h" — ${stats}`
      );
    }
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function isCOrCpp(filePath: string): boolean {
  return C_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function buildStatsSummary(parsed: ReturnType<typeof parseSource>): string {
  const parts: string[] = [];

  const publicFns = parsed.functions.filter((f) => !f.isStatic).length;
  if (publicFns > 0) parts.push(`${publicFns} function${publicFns > 1 ? "s" : ""}`);
  if (parsed.classes.length > 0) parts.push(`${parsed.classes.length} class${parsed.classes.length > 1 ? "es" : ""}`);
  if (parsed.structs.length > 0) parts.push(`${parsed.structs.length} struct${parsed.structs.length > 1 ? "s" : ""}`);
  if (parsed.enums.length > 0) parts.push(`${parsed.enums.length} enum${parsed.enums.length > 1 ? "s" : ""}`);
  if (parsed.typedefs.length > 0) parts.push(`${parsed.typedefs.length} typedef${parsed.typedefs.length > 1 ? "s" : ""}`);

  return parts.length > 0 ? parts.join(", ") + " exported" : "header created";
}
