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
    };
    const result = formatLogStatement(plan, "test.ts");
    assert.ok(result.includes(DEFAULT_MARKER));
  });

  test("uses a custom marker string when provided", () => {
    const plan = {
      expressions: ["x"],
      insertLine: 0,
      logLineNumber: 1,
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
    };
    const result = formatLogStatement(plan, "test.ts", { marker: "DEBUG:" });
    assert.ok(result.includes("DEBUG:"));
  });

  test("omits the marker entirely when includeMarker is false, regardless of marker option", () => {
    const plan = {
      expressions: ["x"],
      insertLine: 0,
      logLineNumber: 1,
    };
    const result = formatLogStatement(plan, "test.ts", {
      marker: "🐛",
      includeMarker: false,
    });
    assert.ok(!result.includes("🐛"));
  });
});
