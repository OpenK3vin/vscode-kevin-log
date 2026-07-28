import * as path from "path";
import * as ts from "typescript";

export const MARKER = "🚀";

/** Describes what to log and where, expressed in plain line/character terms. */
export interface LogPlan {
  /** The expression(s) to log, e.g. ["x"] or ["obj"] or ["this.name"]. */
  expressions: string[];
  /** Human label for the "context" part of the message, e.g. enclosing fn/class name. */
  contextName?: string;
  /** 0-indexed line to insert the new log line at (line content is inserted, pushing existing line down). */
  insertLine: number;
  /** 1-indexed line number the log will land on, for the file:line tag. */
  logLineNumber: number;
}

export interface FormatOptions {
  quoteStyle?: string; // "'" | '"' | "`"
  logFunction?: string; // e.g. "console.log"
  includeFileAndLine?: boolean;
  includeMarker?: boolean;
  semicolons?: boolean;
  /** Indent string to prefix the generated line with (caller determines this from surrounding code). */
  indent?: string;
}

/**
 * Given full source text, a file name, and a character offset (cursor position
 * or start of a text selection), decide what should be logged and where.
 *
 * `selectedText` is the literal text the user had selected, if any (used as a
 * fallback identifier when no more specific AST match is found).
 */
export function buildLogPlan(
  sourceText: string,
  fileName: string,
  offset: number,
  selectedText?: string,
): LogPlan | undefined {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(fileName),
  );

  const token = findTokenAtOffset(sourceFile, offset);
  const fallbackName =
    selectedText || (token ? token.getText(sourceFile) : undefined);

  if (!fallbackName) return undefined;

  if (token) {
    const destructuring = tryDestructuring(sourceFile, token);
    if (destructuring) return destructuring;

    const param = tryFunctionParameter(sourceFile, token);
    if (param) return param;

    const classProp = tryClassProperty(sourceFile, token);
    if (classProp) return classProp;
  }

  // Default: plain variable / identifier case.
  const enclosingFunctionName = token
    ? findEnclosingFunctionName(sourceFile, token.getStart(sourceFile))
    : undefined;

  const cursorLine = sourceFile.getLineAndCharacterOfPosition(offset).line;

  return {
    expressions: [fallbackName],
    contextName: enclosingFunctionName,
    insertLine: cursorLine + 1,
    logLineNumber: cursorLine + 2,
  };
}

/**
 * If the token sits inside a destructuring pattern `const { a, b } = obj`,
 * decide whether the user selected one field or the whole pattern.
 */
function tryDestructuring(
  sourceFile: ts.SourceFile,
  token: ts.Node,
): LogPlan | undefined {
  const bindingElement = findAncestor(token, ts.isBindingElement);
  if (!bindingElement) return undefined;

  const objectPattern = bindingElement.parent;
  if (!ts.isObjectBindingPattern(objectPattern)) return undefined;

  const varDecl = objectPattern.parent;
  if (!ts.isVariableDeclaration(varDecl) || !varDecl.initializer)
    return undefined;

  const declEndLine = sourceFile.getLineAndCharacterOfPosition(
    varDecl.getEnd(),
  ).line;
  const insertLine = declEndLine + 1;
  const enclosingFunctionName = findEnclosingFunctionName(
    sourceFile,
    varDecl.getStart(sourceFile),
  );

  const selectedTheField =
    token.getStart(sourceFile) >= bindingElement.getStart(sourceFile) &&
    token.getEnd() <= bindingElement.getEnd() &&
    isNameOfBindingElement(bindingElement, token);

  if (!selectedTheField) {
    // Selected the whole pattern (or something else in it) -> log the source object once.
    return {
      expressions: [varDecl.initializer.getText(sourceFile)],
      contextName: enclosingFunctionName,
      insertLine,
      logLineNumber: declEndLine + 2,
    };
  }

  // Selected one destructured field -> log just that field.
  const fieldName = bindingElement.name.getText(sourceFile);
  return {
    expressions: [fieldName],
    contextName: enclosingFunctionName,
    insertLine,
    logLineNumber: declEndLine + 2,
  };
}

function isNameOfBindingElement(
  el: ts.BindingElement,
  token: ts.Node,
): boolean {
  return (
    token.getStart() >= el.name.getStart() && token.getEnd() <= el.name.getEnd()
  );
}

/**
 * If the token is a function parameter name, log right after the
 * opening `{` of the function body (handles multi-line signatures).
 */
function tryFunctionParameter(
  sourceFile: ts.SourceFile,
  token: ts.Node,
): LogPlan | undefined {
  const param = findAncestor(token, ts.isParameter);
  if (!param) return undefined;
  if (!ts.isIdentifier(param.name)) return undefined;

  // Only treat as "selected a parameter" if the token is the parameter's name.
  if (
    token.getStart(sourceFile) < param.name.getStart(sourceFile) ||
    token.getEnd() > param.name.getEnd()
  ) {
    return undefined;
  }

  const fn = findAncestor(
    param,
    (n): n is ts.FunctionLikeDeclaration =>
      ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) ||
      ts.isMethodDeclaration(n),
  );
  if (!fn || !fn.body || !ts.isBlock(fn.body)) return undefined;

  const bodyStart = fn.body.getStart(sourceFile); // position of "{"
  const bodyStartLine =
    sourceFile.getLineAndCharacterOfPosition(bodyStart).line;
  const insertLine = bodyStartLine + 1;

  const fnName = getFunctionName(fn);

  return {
    expressions: [param.name.text],
    contextName: fnName,
    insertLine,
    logLineNumber: bodyStartLine + 2,
  };
}

/**
 * If the token is a class property (this.foo usage or a property
 * declaration name), log `this.propName` with the class name as context.
 */
function tryClassProperty(
  sourceFile: ts.SourceFile,
  token: ts.Node,
): LogPlan | undefined {
  const propDecl = findAncestor(token, ts.isPropertyDeclaration);
  if (propDecl && ts.isIdentifier(propDecl.name)) {
    const isNameToken =
      token.getStart(sourceFile) >= propDecl.name.getStart(sourceFile) &&
      token.getEnd() <= propDecl.name.getEnd();
    if (isNameToken) {
      const classDecl = findAncestor(propDecl, ts.isClassDeclaration);
      const className = classDecl?.name?.text;
      const declEndLine = sourceFile.getLineAndCharacterOfPosition(
        propDecl.getEnd(),
      ).line;
      return {
        expressions: [`this.${propDecl.name.text}`],
        contextName: className,
        insertLine: declEndLine + 1,
        logLineNumber: declEndLine + 2,
      };
    }
  }

  // Also handle selecting `this.foo` directly in a property access expression.
  const propAccess = findAncestor(token, ts.isPropertyAccessExpression);
  if (propAccess && propAccess.expression.kind === ts.SyntaxKind.ThisKeyword) {
    const classDecl = findAncestor(propAccess, ts.isClassDeclaration);
    const className = classDecl?.name?.text;
    const line = sourceFile.getLineAndCharacterOfPosition(
      propAccess.getEnd(),
    ).line;
    return {
      expressions: [propAccess.getText(sourceFile)],
      contextName: className,
      insertLine: line + 1,
      logLineNumber: line + 2,
    };
  }

  return undefined;
}

function getFunctionName(fn: ts.FunctionLikeDeclaration): string | undefined {
  if (
    (ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) &&
    fn.name &&
    ts.isIdentifier(fn.name)
  ) {
    return fn.name.text;
  }
  if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.parent) {
    if (
      ts.isVariableDeclaration(fn.parent) &&
      ts.isIdentifier(fn.parent.name)
    ) {
      return fn.parent.name.text;
    }
    if (ts.isPropertyAssignment(fn.parent) && ts.isIdentifier(fn.parent.name)) {
      return fn.parent.name.text;
    }
  }
  return undefined;
}

/**
 * Walk up from the token at `offset` to find the nearest enclosing
 * named function, method, or arrow function assigned to a variable.
 */
export function findEnclosingFunctionName(
  sourceFile: ts.SourceFile,
  offset: number,
): string | undefined {
  const token = findTokenAtOffset(sourceFile, offset);
  if (!token) return undefined;

  let current: ts.Node | undefined = token;

  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return current.name.text;
    }

    if (ts.isMethodDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }

    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      current.parent &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      return current.parent.name.text;
    }

    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      current.parent &&
      ts.isPropertyAssignment(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      return current.parent.name.text;
    }

    current = current.parent;
  }

  return undefined;
}

function findAncestor<T extends ts.Node>(
  node: ts.Node,
  test: (n: ts.Node) => n is T,
): T | undefined {
  let current: ts.Node | undefined = node;
  while (current) {
    if (test(current)) return current;
    current = current.parent;
  }
  return undefined;
}

/** Find the deepest AST node containing the given offset. */
export function findTokenAtOffset(
  sourceFile: ts.SourceFile,
  offset: number,
): ts.Node | undefined {
  function find(node: ts.Node): ts.Node | undefined {
    if (offset < node.getStart(sourceFile) || offset > node.getEnd()) {
      return undefined;
    }

    for (const child of node.getChildren(sourceFile)) {
      const found = find(child);
      if (found) return found;
    }

    return node;
  }

  return find(sourceFile);
}

export function getScriptKind(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (fileName.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/**
 * Turn a LogPlan into the literal text of the console.log line, given
 * formatting options and the file's base name.
 */
export function formatLogStatement(
  plan: LogPlan,
  fileName: string,
  options: FormatOptions = {},
): string {
  const quote = options.quoteStyle ?? "'";
  const logFn = options.logFunction ?? "console.log";
  const includeFileLine = options.includeFileAndLine ?? true;
  const includeMarker = options.includeMarker ?? true;
  const semi = (options.semicolons ?? true) ? ";" : "";
  const indent = options.indent ?? "";

  const baseName = path.basename(fileName);

  const parts: string[] = [];
  if (includeMarker) parts.push(MARKER);
  if (includeFileLine) parts.push(`${baseName}:${plan.logLineNumber}`);
  if (plan.contextName) parts.push(plan.contextName);
  parts.push(...plan.expressions.map((e) => `${e}:`));

  const labelParts = parts.slice(0, -1);
  const lastLabel = parts[parts.length - 1];
  const label = [...labelParts, lastLabel].join(" ~ ");

  const args = plan.expressions.join(", ");

  return `${indent}${logFn}(${quote}${label}${quote}, ${args})${semi}\n`;
}

/** Find all 0-indexed line numbers in the source that contain the marker. */
export function findMarkedLogLines(sourceText: string): number[] {
  const lines = sourceText.split(/\r\n|\r|\n/);
  const result: number[] = [];
  lines.forEach((line, i) => {
    if (line.includes(MARKER)) result.push(i);
  });
  return result;
}
