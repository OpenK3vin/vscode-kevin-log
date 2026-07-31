import * as path from "path";
import * as ts from "typescript";

/** Fallback marker used when no user-configured marker is supplied. */
export const DEFAULT_MARKER = "🚀";

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
  /**
   * 0-indexed line whose leading whitespace should be copied as the
   * indent for the inserted log line. This is usually the same line the
   * logged declaration/statement starts on — NOT necessarily `insertLine - 1`,
   * since a multi-line statement's last physical line (e.g. a nested `});`)
   * can be indented more deeply than the statement itself.
   */
  indentLine: number;
}

export interface FormatOptions {
  quoteStyle?: string; // "'" | '"' | "`"
  logFunction?: string; // e.g. "console.log"
  includeFileAndLine?: boolean;
  includeMarker?: boolean;
  /** Marker string prefixed to log messages, e.g. "🚀" or "DEBUG:". Defaults to DEFAULT_MARKER. */
  marker?: string;
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
  markers: string | string[] = DEFAULT_MARKER,
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

  let plan: LogPlan | undefined;

  if (token) {
    plan =
      tryDestructuring(sourceFile, token) ??
      tryFunctionParameter(sourceFile, token) ??
      tryClassProperty(sourceFile, token) ??
      tryVariableDeclaration(sourceFile, token);
  }

  if (!plan) {
    // Default: plain variable / identifier case.
    const enclosingFunctionName = token
      ? findEnclosingFunctionName(sourceFile, token.getStart(sourceFile))
      : undefined;

    const cursorLine = sourceFile.getLineAndCharacterOfPosition(offset).line;

    plan = {
      expressions: [fallbackName],
      contextName: enclosingFunctionName,
      insertLine: cursorLine + 1,
      logLineNumber: cursorLine + 2,
      indentLine: cursorLine,
    };
  }

  return skipExistingLogLines(sourceText, plan, markers);
}

/**
 * If the computed insert point is immediately followed by one or more
 * already-inserted marked log lines (e.g. from prior invocations targeting
 * the same statement), advance past them. Otherwise every new log for that
 * statement would land at the same fixed point and push earlier ones down,
 * stacking them in reverse order. Skipping forward makes new logs append
 * below existing ones, in the order they were added.
 */
function skipExistingLogLines(
  sourceText: string,
  plan: LogPlan,
  markers: string | string[],
): LogPlan {
  const markerList = (Array.isArray(markers) ? markers : [markers]).filter(
    (m) => m.length > 0,
  );
  if (markerList.length === 0) return plan;

  const lines = sourceText.split(/\r\n|\r|\n/);
  let insertLine = plan.insertLine;
  let skipped = 0;

  while (
    insertLine < lines.length &&
    markerList.some((m) => lines[insertLine].includes(m))
  ) {
    insertLine++;
    skipped++;
  }

  if (skipped === 0) return plan;

  return {
    ...plan,
    insertLine,
    logLineNumber: plan.logLineNumber + skipped,
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
  const indentLine = sourceFile.getLineAndCharacterOfPosition(
    varDecl.getStart(sourceFile),
  ).line;
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
      indentLine,
    };
  }

  // Selected one destructured field -> log just that field.
  const fieldName = bindingElement.name.getText(sourceFile);
  return {
    expressions: [fieldName],
    contextName: enclosingFunctionName,
    insertLine,
    logLineNumber: declEndLine + 2,
    indentLine,
  };
}

/**
 * If the token is the name of a simple (non-destructured) variable
 * declaration, e.g. `const x = a && f(...)`, insert the log after
 * the *end of the full declaration/statement* rather than right after
 * the cursor's line. This matters when the initializer spans multiple
 * lines: logging must not land in the middle of the expression.
 */
function tryVariableDeclaration(
  sourceFile: ts.SourceFile,
  token: ts.Node,
): LogPlan | undefined {
  const varDecl = findAncestor(token, ts.isVariableDeclaration);
  if (varDecl && ts.isIdentifier(varDecl.name) && varDecl.initializer) {
    const isNameToken =
      token.getStart(sourceFile) >= varDecl.name.getStart(sourceFile) &&
      token.getEnd() <= varDecl.name.getEnd();
    if (isNameToken) {
      // Anchor on the end of the enclosing statement (covers the trailing
      // semicolon / multi-declarator lists) so the insert point is always
      // after the whole thing, however many lines it spans.
      const statement =
        findAncestor(varDecl, ts.isVariableStatement) ?? varDecl;
      return declarationPlan(sourceFile, varDecl.name.text, varDecl, statement);
    }

    // Token is inside the initializer itself (e.g. `const canEdit =
    // isApproved && f(...)`, cursor on `isApproved`). If the initializer
    // spans multiple lines, inserting right after the token's own line
    // would land the log mid-expression and break the syntax — so anchor
    // on the end of the whole statement, same as the declaration-name
    // case, but log the selected identifier rather than the declared name.
    const isInInitializer =
      token.getStart(sourceFile) >= varDecl.initializer.getStart(sourceFile) &&
      token.getEnd() <= varDecl.initializer.getEnd();
    if (isInInitializer && ts.isIdentifier(token)) {
      const initStartLine = sourceFile.getLineAndCharacterOfPosition(
        varDecl.initializer.getStart(sourceFile),
      ).line;
      const initEndLine = sourceFile.getLineAndCharacterOfPosition(
        varDecl.initializer.getEnd(),
      ).line;
      if (initEndLine > initStartLine) {
        const statement =
          findAncestor(varDecl, ts.isVariableStatement) ?? varDecl;
        return declarationPlan(
          sourceFile,
          token.getText(sourceFile),
          varDecl,
          statement,
        );
      }
    }
  }

  // Same hazard applies to a plain reassignment: `x = a && f(...);`
  // (no `const`/`let`, just an assignment expression statement).
  const binary = findAncestor(token, ts.isBinaryExpression);
  if (
    binary &&
    binary.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isIdentifier(binary.left)
  ) {
    const isNameToken =
      token.getStart(sourceFile) >= binary.left.getStart(sourceFile) &&
      token.getEnd() <= binary.left.getEnd();
    if (isNameToken) {
      const statement =
        findAncestor(binary, ts.isExpressionStatement) ?? binary;
      return declarationPlan(sourceFile, binary.left.text, binary, statement);
    }

    const isInRhs =
      token.getStart(sourceFile) >= binary.right.getStart(sourceFile) &&
      token.getEnd() <= binary.right.getEnd();
    if (isInRhs && ts.isIdentifier(token)) {
      const rhsStartLine = sourceFile.getLineAndCharacterOfPosition(
        binary.right.getStart(sourceFile),
      ).line;
      const rhsEndLine = sourceFile.getLineAndCharacterOfPosition(
        binary.right.getEnd(),
      ).line;
      if (rhsEndLine > rhsStartLine) {
        const statement =
          findAncestor(binary, ts.isExpressionStatement) ?? binary;
        return declarationPlan(
          sourceFile,
          token.getText(sourceFile),
          binary,
          statement,
        );
      }
    }
  }

  return undefined;
}

/**
 * Build the LogPlan for a declaration/assignment-name match. `statement` is
 * the enclosing statement whose end anchors `insertLine` (so a multi-line
 * initializer doesn't get logged mid-expression) and whose *start* line
 * anchors `indentLine` (so the log line copies the statement's own
 * indentation, not that of some deeper-nested line inside its RHS).
 */
function declarationPlan(
  sourceFile: ts.SourceFile,
  name: string,
  nameOwner: ts.Node,
  statement: ts.Node,
): LogPlan {
  const declEndLine = sourceFile.getLineAndCharacterOfPosition(
    statement.getEnd(),
  ).line;
  const indentLine = sourceFile.getLineAndCharacterOfPosition(
    statement.getStart(sourceFile),
  ).line;
  const enclosingFunctionName = findEnclosingFunctionName(
    sourceFile,
    nameOwner.getStart(sourceFile),
  );

  return {
    expressions: [name],
    contextName: enclosingFunctionName,
    insertLine: declEndLine + 1,
    logLineNumber: declEndLine + 2,
    indentLine,
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
    indentLine: bodyStartLine,
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
      const indentLine = sourceFile.getLineAndCharacterOfPosition(
        propDecl.getStart(sourceFile),
      ).line;
      return {
        expressions: [`this.${propDecl.name.text}`],
        contextName: className,
        insertLine: declEndLine + 1,
        logLineNumber: declEndLine + 2,
        indentLine,
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
    const indentLine = sourceFile.getLineAndCharacterOfPosition(
      propAccess.getStart(sourceFile),
    ).line;
    return {
      expressions: [propAccess.getText(sourceFile)],
      contextName: className,
      insertLine: line + 1,
      logLineNumber: line + 2,
      indentLine,
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
  const marker = options.marker ?? DEFAULT_MARKER;
  const semi = (options.semicolons ?? true) ? ";" : "";
  const indent = options.indent ?? "";

  const baseName = path.basename(fileName);

  const parts: string[] = [];
  if (includeMarker) parts.push(marker);
  if (includeFileLine) parts.push(`${baseName}:${plan.logLineNumber}`);
  if (plan.contextName) parts.push(plan.contextName);
  parts.push(...plan.expressions.map((e) => `${e}:`));

  const labelParts = parts.slice(0, -1);
  const lastLabel = parts[parts.length - 1];
  const label = [...labelParts, lastLabel].join(" ~ ");

  const args = plan.expressions.join(", ");

  return `${indent}${logFn}(${quote}${label}${quote}, ${args})${semi}\n`;
}

/**
 * Find all 0-indexed line numbers in the source that contain a marker.
 * Accepts one marker or a list (so logs inserted under a previous
 * `kevinLog.marker` setting are still found after the user changes it).
 * Defaults to DEFAULT_MARKER for backwards compatibility.
 */
export function findMarkedLogLines(
  sourceText: string,
  markers: string | string[] = DEFAULT_MARKER,
): number[] {
  const markerList = Array.isArray(markers) ? markers : [markers];
  const lines = sourceText.split(/\r\n|\r|\n/);
  const result: number[] = [];
  lines.forEach((line, i) => {
    if (markerList.some((m) => m.length > 0 && line.includes(m))) {
      result.push(i);
    }
  });
  return result;
}
