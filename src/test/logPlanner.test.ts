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
  });

  test("plain variable with no enclosing function has undefined contextName", () => {
    const source = "const x = 5;\nconst y = 10;";
    const offset = offsetOf(source, "y");
    const plan = buildLogPlan(source, "test.ts", offset, "y");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["y"]);
    assert.strictEqual(plan!.contextName, undefined);
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
  });

  test("function parameter selected inserts right after opening brace (single-line signature)", () => {
    const source = ["function greet(name) {", "  return 'hi';", "}"].join("\n");

    const offset = offsetOf(source, "name)");
    const plan = buildLogPlan(source, "test.ts", offset, "name");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["name"]);
    assert.strictEqual(plan!.contextName, "greet");
    assert.strictEqual(plan!.insertLine, 1); // right after line 0's opening brace
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
  });

  test("selecting an identifier inside the initializer (not the declaration name) logs that identifier, not the declared variable", () => {
    const source = ["const x =", "  a &&", "  f({ q: 'r' });"].join("\n");

    // Cursor on "a" inside the initializer.
    const offset = offsetOf(source, "a &&");
    const plan = buildLogPlan(source, "test.ts", offset, "a");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["a"]);
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
  });

  test("multi-declarator statement anchors on the end of the whole statement, not just the selected declarator", () => {
    const source = ["const w = 1, x =", "  a &&", "  f();"].join("\n");

    const offset = offsetOf(source, "x =");
    const plan = buildLogPlan(source, "test.ts", offset, "x");

    assert.ok(plan);
    assert.deepStrictEqual(plan!.expressions, ["x"]);
    assert.strictEqual(plan!.insertLine, 3);
    assert.strictEqual(plan!.indentLine, 0);
  });

  test("a multi-line if-condition reference logs right after the reference, not after the entire if-block", () => {
    // Regression guard: only a declaration/assignment name should anchor on
    // the whole statement. A plain mid-expression reference has no ordering
    // hazard, so it should keep the original cursor-line behavior.
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
    assert.strictEqual(plan!.insertLine, 3); // right after "a &&", not after the whole if-block
  });

  test("subsequent calls on the same statement stack new logs below existing ones, in insertion order", () => {
    const source = ["const a =", "  b &&", "  c({", "    x,", "  });"].join(
      "\n",
    );

    // First call: log "a" (the declaration name).
    const aOffset = offsetOf(source, "a =");
    const aPlan = buildLogPlan(source, "test.ts", aOffset, "a");
    assert.ok(aPlan);
    assert.strictEqual(aPlan!.insertLine, 4);

    const lines = source.split("\n");
    const afterA = [
      ...lines.slice(0, aPlan!.insertLine),
      `console.log('${DEFAULT_MARKER} a:', a);`,
      ...lines.slice(aPlan!.insertLine),
    ].join("\n");

    // Second call: log "b". Without the fix this would also compute
    // insertLine 4, landing ABOVE the "a" log just inserted.
    const bOffset = offsetOf(afterA, "b &&");
    const bPlan = buildLogPlan(afterA, "test.ts", bOffset, "b");
    assert.ok(bPlan);
    // Should skip past the already-inserted "a" log and land right below it.
    assert.strictEqual(bPlan!.insertLine, 5);

    const afterB = [
      ...afterA.split("\n").slice(0, bPlan!.insertLine),
      `console.log('${DEFAULT_MARKER} b:', b);`,
      ...afterA.split("\n").slice(bPlan!.insertLine),
    ].join("\n");

    // Third call: log "c". Should stack below both prior logs.
    const cOffset = offsetOf(afterB, "c({");
    const cPlan = buildLogPlan(afterB, "test.ts", cOffset, "c");
    assert.ok(cPlan);
    assert.strictEqual(cPlan!.insertLine, 6);

    const finalLines = [
      ...afterB.split("\n").slice(0, cPlan!.insertLine),
      `console.log('${DEFAULT_MARKER} c:', c);`,
      ...afterB.split("\n").slice(cPlan!.insertLine),
    ];

    // Final order: a, b, c — insertion order, not reversed.
    assert.deepStrictEqual(finalLines, [
      "const a =",
      "  b &&",
      "  c({",
      "    x,",
      "  });",
      `console.log('${DEFAULT_MARKER} a:', a);`,
      `console.log('${DEFAULT_MARKER} b:', b);`,
      `console.log('${DEFAULT_MARKER} c:', c);`,
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
