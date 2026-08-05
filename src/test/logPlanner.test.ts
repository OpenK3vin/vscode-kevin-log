import * as assert from "assert";
import { suite, test } from "mocha";
import {
  buildLogPlan,
  formatLogStatement,
  findMarkedLogLines,
  DEFAULT_MARKER,
} from "../logPlanner";

/** Find the offset of the given needle's first character in source. Throws if not found. */
function offsetOf(source: string, needle: string): number {
  const idx = source.indexOf(needle);
  assert.ok(idx !== -1, `needle "${needle}" not found in source`);
  return idx;
}

suite("logPlanner: buildLogPlan", () => {
  test("plain variable inside a function declaration includes enclosing function name", () => {
    const source = [
      "function calculateTotal(items) {",
      "  const total = items.reduce((a, b) => a + b, 0);",
      "  return total;",
      "}",
    ].join("\n");

    const offset = offsetOf(source, "total ="); // cursor on "total" in "const total ="
    const plan = buildLogPlan(source, "test.ts", offset, "total");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["total"]);
    assert.strictEqual(plan!.contextName, "calculateTotal");
    assert.strictEqual(plan!.insertLine, 2); // 0-indexed line after "const total = ..."

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "function calculateTotal(items) {",
        "  const total = items.reduce((a, b) => a + b, 0);",
        "  console.log('🚀 ~ test.ts:3 ~ calculateTotal ~ total:', total);",
        "  return total;",
        "}",
      ],
    );
  });

  test("plain variable with no enclosing function has undefined contextName", () => {
    const source = "const x = 5;\nconst y = 10;";
    const offset = offsetOf(source, "y");
    const plan = buildLogPlan(source, "test.ts", offset, "y");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["y"]);
    assert.strictEqual(plan!.contextName, undefined);
    // "y" is the declaration name of "const y = 10;" (line 1, 0-indexed);
    // that statement's own end anchors the insert point, so the log lands
    // on line 2, after the statement, not "right after the cursor".
    assert.strictEqual(plan!.insertLine, 2);
    assert.strictEqual(plan!.logLineNumber, 3);

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "const x = 5;",
        "const y = 10;",
        "console.log('🚀 ~ test.ts:3 ~ y:', y);",
      ],
    );
  });

  test("enclosing function name resolves for arrow function assigned to const", () => {
    const source = [
      "const doWork = (input) => {",
      "  const result = input * 2;",
      "  return result;",
      "};",
    ].join("\n");

    const offset = offsetOf(source, "result =");
    const plan = buildLogPlan(source, "test.ts", offset, "result");

    assert.ok(plan);
    assert.strictEqual(plan!.contextName, "doWork");

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "const doWork = (input) => {",
        "  const result = input * 2;",
        "  console.log('🚀 ~ test.ts:3 ~ doWork ~ result:', result);",
        "  return result;",
        "};",
      ],
    );
  });

  test("enclosing function name resolves for method inside a class", () => {
    const source = [
      "class Widget {",
      "  render() {",
      "    const html = '<div></div>';",
      "    return html;",
      "  }",
      "}",
    ].join("\n");

    const offset = offsetOf(source, "html =");
    const plan = buildLogPlan(source, "test.ts", offset, "html");

    assert.ok(plan);
    assert.strictEqual(plan!.contextName, "render");

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "class Widget {",
        "  render() {",
        "    const html = '<div></div>';",
        "    console.log('🚀 ~ test.ts:4 ~ render ~ html:', html);",
        "    return html;",
        "  }",
        "}",
      ],
    );
  });

  test("destructured single field selected -> logs just that field", () => {
    const source = [
      "function handler(req) {",
      "  const { userId, sessionId } = req;",
      "  return userId;",
      "}",
    ].join("\n");

    const offset = offsetOf(source, "userId,"); // the binding element "userId" in the pattern
    const plan = buildLogPlan(source, "test.ts", offset, "userId");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["userId"]);
    assert.strictEqual(plan!.contextName, "handler");

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "function handler(req) {",
        "  const { userId, sessionId } = req;",
        "  console.log('🚀 ~ test.ts:3 ~ handler ~ userId:', userId);",
        "  return userId;",
        "}",
      ],
    );
  });

  test("destructured whole pattern (source object) logs the source object once", () => {
    const source = [
      "function handler(req) {",
      "  const { userId, sessionId } = req;",
      "  return userId;",
      "}",
    ].join("\n");

    // Cursor on "req" (the initializer), not on a binding element.
    const offset = source.lastIndexOf("req;");
    const plan = buildLogPlan(source, "test.ts", offset, "req");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["req"]);

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "function handler(req) {",
        "  const { userId, sessionId } = req;",
        "  console.log('🚀 ~ test.ts:3 ~ handler ~ req:', req);",
        "  return userId;",
        "}",
      ],
    );
  });

  test("function parameter selected inserts right after opening brace (single-line signature)", () => {
    const source = ["function greet(name) {", "  return 'hi';", "}"].join("\n");

    const offset = offsetOf(source, "name)");
    const plan = buildLogPlan(source, "test.ts", offset, "name");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["name"]);
    assert.strictEqual(plan!.contextName, "greet");
    assert.strictEqual(plan!.insertLine, 1); // right after line 0's opening brace

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "function greet(name) {",
        "console.log('🚀 ~ test.ts:2 ~ greet ~ name:', name);",
        "  return 'hi';",
        "}",
      ],
    );
  });

  test("function parameter selected inserts after opening brace even with multi-line signature", () => {
    const source = [
      "function greet(",
      "  name,",
      "  greeting",
      ") {",
      "  return greeting + name;",
      "}",
    ].join("\n");

    const offset = offsetOf(source, "name,");
    const plan = buildLogPlan(source, "test.ts", offset, "name");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["name"]);
    // Body's opening brace is on line 3 (0-indexed), so insert on line 4.
    assert.strictEqual(plan!.insertLine, 4);

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "function greet(",
        "  name,",
        "  greeting",
        ") {",
        "console.log('🚀 ~ test.ts:5 ~ greet ~ name:', name);",
        "  return greeting + name;",
        "}",
      ],
    );
  });

  test("arrow function parameter also resolves enclosing function name via variable", () => {
    const source = ["const add = (a, b) => {", "  return a + b;", "};"].join(
      "\n",
    );

    const offset = offsetOf(source, "a,");
    const plan = buildLogPlan(source, "test.ts", offset, "a");

    assert.ok(plan);
    assert.strictEqual(plan!.contextName, "add");
    assert.strictEqual(plan!.insertLine, 1);

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "const add = (a, b) => {",
        "console.log('🚀 ~ test.ts:2 ~ add ~ a:', a);",
        "  return a + b;",
        "};",
      ],
    );
  });

  test("class property declaration selected logs this.prop with class name as context", () => {
    const source = ["class UserService {", "  name = 'default';", "}"].join(
      "\n",
    );

    const offset = offsetOf(source, "name =");
    const plan = buildLogPlan(source, "test.ts", offset, "name");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["this.name"]);
    assert.strictEqual(plan!.contextName, "UserService");

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "class UserService {",
        "  name = 'default';",
        "  console.log('🚀 ~ test.ts:3 ~ UserService ~ this.name:', this.name);",
        "}",
      ],
    );
  });

  test("this.prop usage inside a method logs this.prop with class name as context", () => {
    const source = [
      "class UserService {",
      "  greet() {",
      "    return this.name;",
      "  }",
      "}",
    ].join("\n");

    const offset = offsetOf(source, "this.name");
    const plan = buildLogPlan(source, "test.ts", offset, "this.name");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["this.name"]);
    assert.strictEqual(plan!.contextName, "UserService");

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "class UserService {",
        "  greet() {",
        "    return this.name;",
        "    console.log('🚀 ~ test.ts:4 ~ UserService ~ this.name:', this.name);",
        "  }",
        "}",
      ],
    );
  });

  test("variable declaration with multi-line initializer inserts after the full statement, not after the cursor's line", () => {
    const source = [
      "const x =",
      "  a &&",
      "  f({",
      "    p,",
      "    q: 'r',",
      "    s: T.U,",
      "  });",
    ].join("\n");

    // Cursor on "x", the declaration name (line 0), not inside the multi-line initializer.
    const offset = offsetOf(source, "x");
    const plan = buildLogPlan(source, "test.ts", offset, "x");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["x"]);
    // Statement spans lines 0-6 (0-indexed); log must land on line 7, after the closing ");".
    assert.strictEqual(plan!.insertLine, 7);
    assert.strictEqual(plan!.logLineNumber, 8);
    // Indent must come from the declaration's own line (0), not the deeper-nested
    // closing "});" on line 6 — otherwise the inserted log is over-indented.
    assert.strictEqual(plan!.indentLine, 0);

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "const x =",
        "  a &&",
        "  f({",
        "    p,",
        "    q: 'r',",
        "    s: T.U,",
        "  });",
        "console.log('🚀 ~ test.ts:8 ~ x:', x);",
      ],
    );
  });

  test("indentLine points at the statement's own line even when the RHS is indented more deeply, so the inserted log matches the statement's indentation", () => {
    const source = [
      "function outer() {",
      "  const x =",
      "    a &&",
      "    f({",
      "      p,",
      "    });",
      "}",
    ].join("\n");

    const offset = offsetOf(source, "x =");
    const plan = buildLogPlan(source, "test.ts", offset, "x");

    assert.ok(plan);
    // Statement spans lines 1-5 (0-indexed): "  const x =" through "    });".
    // Log must land on line 6, right after "    });" and before the function's
    // closing "}" on line 6 (post-insert) / line 6 (pre-insert, now pushed to 7).
    assert.strictEqual(plan!.insertLine, 6);
    assert.strictEqual(plan!.logLineNumber, 7);
    // "  const x =" is line 1, indented 2 spaces. "    });" (line 5) is indented
    // 4 spaces — if indentLine pointed there instead, the log would be over-indented.
    assert.strictEqual(plan!.indentLine, 1);

    const indent = "  ";
    const logStatement = formatLogStatement(plan!, "test.ts", { indent });
    assert.ok(logStatement.startsWith("  console.log"));

    // Full end-to-end check: simulate the insertion and confirm the log lands
    // between "});" and the function's closing "}", correctly indented.
    const lines = source.split("\n");
    const resultLines = [
      ...lines.slice(0, plan!.insertLine),
      logStatement.replace(/\n$/, ""),
      ...lines.slice(plan!.insertLine),
    ];
    assert.deepStrictEqual(resultLines, [
      "function outer() {",
      "  const x =",
      "    a &&",
      "    f({",
      "      p,",
      "    });",
      "  console.log('🚀 ~ test.ts:7 ~ outer ~ x:', x);",
      "}",
    ]);
  });

  test("variable declaration with single-line initializer still inserts right after that line", () => {
    const source = "const x = 1;\nconst y = 2;";
    const offset = offsetOf(source, "x");
    const plan = buildLogPlan(source, "test.ts", offset, "x");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["x"]);
    assert.strictEqual(plan!.insertLine, 1);

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "const x = 1;",
        "console.log('🚀 ~ test.ts:2 ~ x:', x);",
        "const y = 2;",
      ],
    );
  });

  test("selecting an identifier inside the initializer (not the declaration name) logs that identifier, not the declared variable", () => {
    const source = ["const x =", "  a &&", "  f({ q: 'r' });"].join("\n");

    // Cursor on "a" inside the initializer.
    const offset = offsetOf(source, "a &&");
    const plan = buildLogPlan(source, "test.ts", offset, "a");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["a"]);

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "const x =",
        "  a &&",
        "  f({ q: 'r' });",
        "console.log('🚀 ~ test.ts:4 ~ a:', a);",
      ],
    );
  });

  test("identifier used inside a multi-line initializer (not the declaration name) anchors on the end of the statement", () => {
    const source = [
      "function outer() {",
      "  const x =",
      "    a &&",
      "    f({",
      "      p,",
      "    });",
      "}",
    ].join("\n");

    const offset = offsetOf(source, "a &&");
    const plan = buildLogPlan(source, "test.ts", offset, "a");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["a"]);
    // Statement spans lines 1-5 (0-indexed); log must land on line 6,
    // right after "    });" and before the function's closing "}".
    assert.strictEqual(plan!.insertLine, 6);
    assert.strictEqual(plan!.logLineNumber, 7);
    // Indent comes from "  const x =" (line 1), not the deeper-nested RHS.
    assert.strictEqual(plan!.indentLine, 1);
    // Enclosing function "outer" is still resolved for the context segment.
    assert.strictEqual(plan!.contextName, "outer");

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "function outer() {",
        "  const x =",
        "    a &&",
        "    f({",
        "      p,",
        "    });",
        `  console.log('${DEFAULT_MARKER} ~ test.ts:7 ~ outer ~ a:', a);`,
        "}",
      ],
    );
  });

  test("plain reassignment with a multi-line RHS inserts after the full statement, same as a declaration", () => {
    const source = [
      "function f() {",
      "  let x;",
      "  x =",
      "    a &&",
      "    g();",
      "}",
    ].join("\n");

    const offset = offsetOf(source, "x =");
    const plan = buildLogPlan(source, "test.ts", offset, "x");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["x"]);
    // Assignment spans lines 2-4 (0-indexed); log lands on line 5, after the closing ");".
    assert.strictEqual(plan!.insertLine, 5);
    // Indent should come from "  x =" (line 2), not the deeper-nested RHS.
    assert.strictEqual(plan!.indentLine, 2);
    // Enclosing function "f" is still resolved for the context segment.
    assert.strictEqual(plan!.contextName, "f");

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "function f() {",
        "  let x;",
        "  x =",
        "    a &&",
        "    g();",
        `  console.log('${DEFAULT_MARKER} ~ test.ts:6 ~ f ~ x:', x);`,
        "}",
      ],
    );
  });

  test("multi-declarator statement anchors on the end of the whole statement, not just the selected declarator", () => {
    const source = ["const w = 1, x =", "  a &&", "  f();"].join("\n");

    const offset = offsetOf(source, "x =");
    const plan = buildLogPlan(source, "test.ts", offset, "x");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["x"]);
    assert.strictEqual(plan!.insertLine, 3);
    assert.strictEqual(plan!.indentLine, 0);

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "const w = 1, x =",
        "  a &&",
        "  f();",
        "console.log('🚀 ~ test.ts:4 ~ x:', x);",
      ],
    );
  });

  test("a multi-line if-condition reference logs inside the block, not mid-condition", () => {
    // Regression guard: a reference inside an if-condition must never be
    // logged by inserting a statement between the condition's own lines —
    // `if (\n  a &&\n  console.log(...);\n  b\n) {` is invalid syntax,
    // since a statement can't sit inside a parenthesized expression. The
    // log must land inside the block instead, anchored on the block's
    // first statement, however many lines the condition itself spans.
    const source = [
      "function check() {",
      "  if (",
      "    a &&",
      "    b",
      "  ) {",
      "    return true;",
      "  }",
      "}",
    ].join("\n");

    const offset = offsetOf(source, "a &&");
    const plan = buildLogPlan(source, "test.ts", offset, "a");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["a"]);
    assert.strictEqual(plan!.insertLine, 5); // inside the block, before "return true;"
    assert.strictEqual(plan!.indentLine, 5); // matches the block's own indentation
    assert.strictEqual(plan!.contextName, "check");

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "function check() {",
        "  if (",
        "    a &&",
        "    b",
        "  ) {",
        `    console.log('${DEFAULT_MARKER} ~ test.ts:6 ~ check ~ a:', a);`,
        "    return true;",
        "  }",
        "}",
      ],
    );
  });

  test("a single-line if-condition reference logs inside the block, indented to match the block's own statements", () => {
    // Regression guard: the default fallback plan used to copy the `if`
    // line's own (shallower) indentation even though the log lands inside
    // the block. It should instead match the indentation of the block's
    // first statement.
    const source = [
      "function f() {",
      "  const a = true;",
      "  if (!a) {",
      "    return false;",
      "  }",
      "}",
    ].join("\n");

    // Offset at the end of "a", right before ")" (as a real cursor/word
    // selection would land), not at its exact start boundary — right at
    // the boundary next to "!" is a separate, pre-existing ambiguity in
    // findTokenAtOffset unrelated to this fix.
    const offset = offsetOf(source, "a) {") + 1;
    const plan = buildLogPlan(source, "test.ts", offset, "a");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["a"]);
    assert.strictEqual(plan!.insertLine, 3); // right after "if (!a) {"
    assert.strictEqual(plan!.indentLine, 3); // matches "return false;", not the shallower "if" line
    assert.strictEqual(plan!.contextName, "f");

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "function f() {",
        "  const a = true;",
        "  if (!a) {",
        `    console.log('${DEFAULT_MARKER} ~ test.ts:4 ~ f ~ a:', a);`,
        "    return false;",
        "  }",
        "}",
      ],
    );
  });

  test("a single-line if with multiple conditions and multiple block statements still anchors on the block's first statement", () => {
    const source = [
      "async function g() {",
      "  const a = check();",
      "  const b = true;",
      "  const c = true;",
      "  if (!a || !b || !c) {",
      "    return { successful: false };",
      "  }",
      "}",
    ].join("\n");

    const offset = offsetOf(source, "a || !b") + 1;
    const plan = buildLogPlan(source, "test.ts", offset, "a");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["a"]);
    assert.strictEqual(plan!.insertLine, 5);
    assert.strictEqual(plan!.indentLine, 5);
    assert.strictEqual(plan!.contextName, "g");

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "async function g() {",
        "  const a = check();",
        "  const b = true;",
        "  const c = true;",
        "  if (!a || !b || !c) {",
        `    console.log('${DEFAULT_MARKER} ~ test.ts:6 ~ g ~ a:', a);`,
        "    return { successful: false };",
        "  }",
        "}",
      ],
    );
  });

  test("a reference inside an if-condition nested deep in an unrelated outer variable declaration's callback does not anchor on that outer declaration", () => {
    // Regression guard: findAncestor(token, isVariableDeclaration) can walk
    // arbitrarily far up past function-body boundaries. Without a guard,
    // `a` here would be treated as "inside the initializer" of the
    // *outer* `const x = client.method(async () => { ... })`
    // declaration, anchoring the log at the very end of that statement
    // instead of inside the `if` block where it's actually used.
    const source = [
      "const x = client",
      "  .method(",
      "    async () => {",
      "      const a = check();",
      "      if (!a) {",
      "        return false;",
      "      }",
      "    },",
      "  );",
    ].join("\n");

    const offset = offsetOf(source, "a) {") + 1;
    const plan = buildLogPlan(source, "test.ts", offset, "a");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["a"]);
    assert.strictEqual(plan!.insertLine, 5); // inside the if-block, not at the end of the outer statement
    assert.strictEqual(plan!.indentLine, 5);

    const indent = source.split("\n")[plan!.indentLine].match(/^(\s*)/)![1];
    const logStatement = formatLogStatement(plan!, "test.ts", {
      indent,
    }).replace(/\n$/, "");
    const lines = source.split("\n");
    assert.deepStrictEqual(
      [
        ...lines.slice(0, plan!.insertLine),
        logStatement,
        ...lines.slice(plan!.insertLine),
      ],
      [
        "const x = client",
        "  .method(",
        "    async () => {",
        "      const a = check();",
        "      if (!a) {",
        `        console.log('${DEFAULT_MARKER} ~ test.ts:6 ~ a:', a);`,
        "        return false;",
        "      }",
        "    },",
        "  );",
      ],
    );
  });

  test("subsequent calls on the same statement stack new logs below existing ones, in insertion order", () => {
    const source = ["const a =", "  b &&", "  c({", "    x,", "  });"].join(
      "\n",
    );

    // First call: log "a" (the declaration name).
    const aOffset = offsetOf(source, "a =");
    const aPlan = buildLogPlan(source, "test.ts", aOffset, "a");
    assert.ok(aPlan);
    assert.strictEqual(aPlan!.insertLine, 5);
    assert.strictEqual(aPlan!.logLineNumber, 6);
    assert.strictEqual(aPlan!.indentLine, 0);

    const aLog = formatLogStatement(aPlan!, "test.ts").replace(/\n$/, "");
    let lines = [
      ...source.split("\n").slice(0, aPlan!.insertLine),
      aLog,
      ...source.split("\n").slice(aPlan!.insertLine),
    ];
    const afterA = lines.join("\n");

    assert.deepStrictEqual(lines, [
      "const a =",
      "  b &&",
      "  c({",
      "    x,",
      "  });",
      `console.log('${DEFAULT_MARKER} ~ test.ts:6 ~ a:', a);`,
    ]);

    // Second call: log "b". Without the fix this would also compute
    // insertLine 5, landing ABOVE the "a" log just inserted.
    const bOffset = offsetOf(afterA, "b &&");
    const bPlan = buildLogPlan(afterA, "test.ts", bOffset, "b");
    assert.ok(bPlan);
    // Should skip past the already-inserted "a" log and land right below it.
    assert.strictEqual(bPlan!.insertLine, 6);
    assert.strictEqual(bPlan!.logLineNumber, 7);
    assert.strictEqual(bPlan!.indentLine, 0);

    const bLog = formatLogStatement(bPlan!, "test.ts").replace(/\n$/, "");
    lines = [
      ...lines.slice(0, bPlan!.insertLine),
      bLog,
      ...lines.slice(bPlan!.insertLine),
    ];
    const afterB = lines.join("\n");

    assert.deepStrictEqual(lines, [
      "const a =",
      "  b &&",
      "  c({",
      "    x,",
      "  });",
      `console.log('${DEFAULT_MARKER} ~ test.ts:6 ~ a:', a);`,
      `console.log('${DEFAULT_MARKER} ~ test.ts:7 ~ b:', b);`,
    ]);

    // Third call: log "c". Should stack below both prior logs.
    const cOffset = offsetOf(afterB, "c({");
    const cPlan = buildLogPlan(afterB, "test.ts", cOffset, "c");
    assert.ok(cPlan);
    assert.strictEqual(cPlan!.insertLine, 7);
    assert.strictEqual(cPlan!.logLineNumber, 8);
    assert.strictEqual(cPlan!.indentLine, 0);

    const cLog = formatLogStatement(cPlan!, "test.ts").replace(/\n$/, "");
    lines = [
      ...lines.slice(0, cPlan!.insertLine),
      cLog,
      ...lines.slice(cPlan!.insertLine),
    ];

    // Final order: a, b, c — insertion order, not reversed, each log's
    // file:line tag matching where it actually landed.
    assert.deepStrictEqual(lines, [
      "const a =",
      "  b &&",
      "  c({",
      "    x,",
      "  });",
      `console.log('${DEFAULT_MARKER} ~ test.ts:6 ~ a:', a);`,
      `console.log('${DEFAULT_MARKER} ~ test.ts:7 ~ b:', b);`,
      `console.log('${DEFAULT_MARKER} ~ test.ts:8 ~ c:', c);`,
    ]);
  });

  test("returns undefined when there is no token and no selected text", () => {
    const plan = buildLogPlan("", "test.ts", 0, undefined);
    assert.strictEqual(plan, undefined);
  });

  test("falls back to selectedText when cursor lands on whitespace", () => {
    const source = "const x = 1;\n\nconst y = 2;";
    // Offset inside the blank line (whitespace) — no meaningful token there.
    const offset = source.indexOf("\n\n") + 1;
    const plan = buildLogPlan(source, "test.ts", offset, "manualSelection");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["manualSelection"]);
  });
});

suite("logPlanner: formatLogStatement", () => {
  const basePlan = {
    expressions: ["total"],
    contextName: "calculateTotal",
    insertLine: 2,
    logLineNumber: 4,
    indentLine: 1,
  };

  test("default options produce marker, file:line, context, single-quotes, semicolon", () => {
    const result = formatLogStatement(basePlan, "test.ts");
    assert.strictEqual(
      result,
      `console.log('${DEFAULT_MARKER} ~ test.ts:4 ~ calculateTotal ~ total:', total);\n`,
    );
  });

  test("includeMarker: false omits the marker", () => {
    const result = formatLogStatement(basePlan, "test.ts", {
      includeMarker: false,
    });
    assert.strictEqual(
      result,
      `console.log('test.ts:4 ~ calculateTotal ~ total:', total);\n`,
    );
  });

  test("includeFileAndLine: false omits file/line", () => {
    const result = formatLogStatement(basePlan, "test.ts", {
      includeMarker: false,
      includeFileAndLine: false,
    });
    assert.strictEqual(
      result,
      `console.log('calculateTotal ~ total:', total);\n`,
    );
  });

  test("no contextName omits that segment", () => {
    const plan = { ...basePlan, contextName: undefined };
    const result = formatLogStatement(plan, "test.ts", {
      includeMarker: false,
      includeFileAndLine: false,
    });
    assert.strictEqual(result, `console.log('total:', total);\n`);
  });

  test("double-quote style", () => {
    const result = formatLogStatement(basePlan, "test.ts", {
      includeMarker: false,
      includeFileAndLine: false,
      quoteStyle: '"',
    });
    assert.strictEqual(
      result,
      `console.log("calculateTotal ~ total:", total);\n`,
    );
  });

  test("semicolons: false omits trailing semicolon", () => {
    const result = formatLogStatement(basePlan, "test.ts", {
      includeMarker: false,
      includeFileAndLine: false,
      semicolons: false,
    });
    assert.strictEqual(
      result,
      `console.log('calculateTotal ~ total:', total)\n`,
    );
  });

  test("custom log function name", () => {
    const result = formatLogStatement(basePlan, "test.ts", {
      includeMarker: false,
      includeFileAndLine: false,
      logFunction: "myLogger.debug",
    });
    assert.strictEqual(
      result,
      `myLogger.debug('calculateTotal ~ total:', total);\n`,
    );
  });

  test("indent is prefixed to the line", () => {
    const result = formatLogStatement(basePlan, "test.ts", {
      includeMarker: false,
      includeFileAndLine: false,
      indent: "    ",
    });
    assert.strictEqual(
      result,
      `    console.log('calculateTotal ~ total:', total);\n`,
    );
  });

  test("multiple expressions are comma-joined as args", () => {
    const plan = {
      ...basePlan,
      expressions: ["a", "b"],
      contextName: undefined,
    };
    const result = formatLogStatement(plan, "test.ts", {
      includeMarker: false,
      includeFileAndLine: false,
    });
    assert.strictEqual(result, `console.log('a: ~ b:', a, b);\n`);
  });

  test("uses basename of fileName, not full path", () => {
    const result = formatLogStatement(basePlan, "/some/deep/path/test.ts", {
      includeMarker: false,
    });
    assert.strictEqual(
      result,
      `console.log('test.ts:4 ~ calculateTotal ~ total:', total);\n`,
    );
  });
});

suite("logPlanner: findMarkedLogLines", () => {
  test("returns empty array when no marker present", () => {
    const source = "const x = 1;\nconsole.log('x:', x);";
    assert.deepStrictEqual(findMarkedLogLines(source), []);
  });

  test("finds a single marked line", () => {
    const source = [
      "const x = 1;",
      `console.log('${DEFAULT_MARKER} test.ts:2 ~ x:', x);`,
      "const y = 2;",
    ].join("\n");
    assert.deepStrictEqual(findMarkedLogLines(source), [1]);
  });

  test("finds multiple marked lines, ignoring unmarked console.log calls", () => {
    const source = [
      `console.log('${DEFAULT_MARKER} a:', a);`,
      "console.log('manual log, no marker');",
      `console.log('${DEFAULT_MARKER} b:', b);`,
    ].join("\n");
    assert.deepStrictEqual(findMarkedLogLines(source), [0, 2]);
  });

  test("handles CRLF line endings", () => {
    const source = `const x = 1;\r\nconsole.log('${DEFAULT_MARKER} x:', x);\r\nconst y = 2;`;
    assert.deepStrictEqual(findMarkedLogLines(source), [1]);
  });

  test("finds lines using a custom marker instead of the default", () => {
    const source = [
      "const x = 1;",
      "console.log('🐛 test.ts:2 ~ x:', x);",
      "const y = 2;",
    ].join("\n");
    assert.deepStrictEqual(findMarkedLogLines(source, "🐛"), [1]);
  });

  test("does not find a custom-marker line when searching for the default marker only", () => {
    const source = [
      "const x = 1;",
      "console.log('🐛 test.ts:2 ~ x:', x);",
    ].join("\n");
    assert.deepStrictEqual(findMarkedLogLines(source), []);
  });

  test("finds lines matching any marker when given a list (old + new marker after a settings change)", () => {
    const source = [
      `console.log('${DEFAULT_MARKER} a:', a);`, // inserted before the setting changed
      "console.log('🐛 b:', b);", // inserted after the setting changed
      "console.log('manual log, no marker');",
    ].join("\n");
    assert.deepStrictEqual(
      findMarkedLogLines(source, ["🐛", DEFAULT_MARKER]),
      [0, 1],
    );
  });
});

suite("logPlanner: formatLogStatement marker option", () => {
  test("uses DEFAULT_MARKER when no marker option is provided", () => {
    const plan = {
      expressions: ["x"],
      insertLine: 0,
      logLineNumber: 1,
      indentLine: 0,
    };
    const result = formatLogStatement(plan, "test.ts");
    assert.ok(result.includes(DEFAULT_MARKER));
  });

  test("uses a custom marker string when provided", () => {
    const plan = {
      expressions: ["x"],
      insertLine: 0,
      logLineNumber: 1,
      indentLine: 0,
    };
    const result = formatLogStatement(plan, "test.ts", { marker: "🐛" });
    assert.ok(result.includes("🐛"));
    assert.ok(!result.includes(DEFAULT_MARKER));
  });

  test("supports a non-emoji text marker", () => {
    const plan = {
      expressions: ["x"],
      insertLine: 0,
      logLineNumber: 1,
      indentLine: 0,
    };
    const result = formatLogStatement(plan, "test.ts", { marker: "DEBUG:" });
    assert.ok(result.includes("DEBUG:"));
  });

  test("omits the marker entirely when includeMarker is false, regardless of marker option", () => {
    const plan = {
      expressions: ["x"],
      insertLine: 0,
      logLineNumber: 1,
      indentLine: 0,
    };
    const result = formatLogStatement(plan, "test.ts", {
      marker: "🐛",
      includeMarker: false,
    });
    assert.ok(!result.includes("🐛"));
  });
});
