import * as vscode from "vscode";
import {
  DEFAULT_MARKER,
  buildLogPlan,
  formatLogStatement,
  findMarkedLogLines,
} from "./logPlanner";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("kevinLog.insertLog", insertLogCommand),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "kevinLog.deleteAllLogs",
      deleteAllLogsCommand,
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "kevinLog.commentAllLogs",
      commentAllLogsCommand,
    ),
  );
}

// ---------------------------------------------------------------------------
// Command: insert log
// ---------------------------------------------------------------------------

function insertLogCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const selection = editor.selection;

  const sourceText = document.getText();
  const offset = document.offsetAt(selection.active);

  let selectedText = document.getText(selection);
  if (!selectedText) {
    const wordRange = document.getWordRangeAtPosition(selection.active);
    if (wordRange) selectedText = document.getText(wordRange);
  }

  const config = vscode.workspace.getConfiguration("kevinLog");
  const marker = config.get<string>("marker", DEFAULT_MARKER);

  const plan = buildLogPlan(
    sourceText,
    document.fileName,
    offset,
    selectedText,
    // Also match DEFAULT_MARKER so logs inserted before a custom marker
    // was configured are still recognized and stacked below correctly.
    [marker, DEFAULT_MARKER],
  );
  if (!plan) {
    vscode.window.showWarningMessage("No variable selected or under cursor.");
    return;
  }

  const anchorLine = document.lineAt(
    Math.max(Math.min(plan.indentLine, document.lineCount - 1), 0),
  );
  const indent = anchorLine.text.match(/^(\s*)/)?.[1] ?? "";

  const logStatement = formatLogStatement(plan, document.fileName, {
    quoteStyle: config.get<string>("quoteStyle", "'"),
    logFunction: config.get<string>("logFunction", "console.log"),
    includeFileAndLine: config.get<boolean>("includeFileAndLine", true),
    includeMarker: config.get<boolean>("includeMarker", true),
    marker: config.get<string>("marker", DEFAULT_MARKER),
    semicolons: config.get<boolean>("semicolons", true),
    indent,
  });

  const insertPosition = new vscode.Position(plan.insertLine, 0);

  editor
    .edit((editBuilder) => {
      editBuilder.insert(insertPosition, logStatement);
    })
    .then(() => {
      const insertedLine = plan.insertLine;
      const newPosition = new vscode.Position(
        insertedLine,
        document.lineAt(insertedLine).text.length,
      );
      editor.selection = new vscode.Selection(newPosition, newPosition);
    });
}

// ---------------------------------------------------------------------------
// Command: delete all logs
// ---------------------------------------------------------------------------

function deleteAllLogsCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const config = vscode.workspace.getConfiguration("kevinLog");
  const marker = config.get<string>("marker", DEFAULT_MARKER);
  const linesToDelete = findMarkedLogLines(document.getText(), [
    marker,
    DEFAULT_MARKER,
  ]);

  if (linesToDelete.length === 0) {
    vscode.window.showInformationMessage(
      "No kevin-log logs found in this file.",
    );
    return;
  }

  editor.edit((editBuilder) => {
    for (let i = linesToDelete.length - 1; i >= 0; i--) {
      const line = document.lineAt(linesToDelete[i]);
      editBuilder.delete(line.rangeIncludingLineBreak);
    }
  });
}

// ---------------------------------------------------------------------------
// Command: comment/uncomment all logs (toggle)
// ---------------------------------------------------------------------------

function commentAllLogsCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const config = vscode.workspace.getConfiguration("kevinLog");
  const marker = config.get<string>("marker", DEFAULT_MARKER);
  const lineNumbers = findMarkedLogLines(document.getText(), [
    marker,
    DEFAULT_MARKER,
  ]);

  if (lineNumbers.length === 0) {
    vscode.window.showInformationMessage(
      "No kevin-log logs found in this file.",
    );
    return;
  }

  const firstLineText = document.lineAt(lineNumbers[0]).text;
  const shouldUncomment = /^\s*\/\//.test(firstLineText);

  editor.edit((editBuilder) => {
    for (const lineNumber of lineNumbers) {
      const line = document.lineAt(lineNumber);
      const text = line.text;

      if (shouldUncomment) {
        const uncommented = text.replace(/^(\s*)\/\/\s?/, "$1");
        editBuilder.replace(line.range, uncommented);
      } else {
        const indentMatch = text.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : "";
        const rest = text.slice(indent.length);
        editBuilder.replace(line.range, `${indent}// ${rest}`);
      }
    }
  });
}

export function deactivate() {}
