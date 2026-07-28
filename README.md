# Kevin Log

Console logging, done right. No BS, no subscription.

Select a variable, hit a shortcut, get a `console.log` with the file name, line number, and enclosing function — instantly.

```
console.log('🚀 handler.ts:12 ~ processOrder ~ total:', total);
```

## Features

- **Insert log** — select a variable (or just place your cursor on one) and log it with full context
- **Smart detection** — knows the difference between a plain variable, a destructured field, a function parameter, and a class property, and logs the right thing for each
- **Delete all logs** — remove every log this extension inserted, in one shot
- **Comment/uncomment all logs** — toggle them off without deleting, useful when debugging in stages
- **Marker-based tracking** — every inserted log is tagged with 🚀, so delete/comment only ever touches logs _this extension_ added, never the ones you wrote by hand
- **Configurable** — quote style, semicolons, custom log function, marker on/off, file/line on/off

## What it doesn't do

- No subscription
- No account or sign-in
- No telemetry
- No AI upsell
- No bloated dependencies

## Usage

| Command                    | Default Shortcut (Win/Linux) | Default Shortcut (Mac) |
| -------------------------- | ---------------------------- | ---------------------- |
| Insert Console Log         | `Ctrl+Alt+L`                 | `Cmd+Alt+L`            |
| Delete All Logs            | `Ctrl+Alt+Shift+D`           | `Cmd+Alt+Shift+D`      |
| Comment/Uncomment All Logs | `Ctrl+Alt+Shift+C`           | `Cmd+Alt+Shift+C`      |

All three are also available from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) under **Kevin Log**.

### Examples

**Plain variable:**

```js
function calculateTotal(items) {
  const total = items.reduce((a, b) => a + b, 0);
  // place cursor on `total`, trigger Insert Log
  console.log("🚀 file.ts:3 ~ calculateTotal ~ total:", total);
}
```

**Destructured field:**

```js
function handler(req) {
  const { userId, sessionId } = req;
  // select `userId`
  console.log("🚀 file.ts:3 ~ handler ~ userId:", userId);
}
```

**Function parameter:**

```js
function greet(name, greeting) {
  // select `name` — log lands right after the opening brace,
  // even with a multi-line signature
  console.log("🚀 file.ts:2 ~ greet ~ name:", name);
  return greeting + name;
}
```

**Class property:**

```js
class UserService {
  greet() {
    return this.name;
    // select `this.name`
    // console.log('🚀 file.ts:3 ~ UserService ~ this.name:', this.name);
  }
}
```

## Settings

Configure under `Settings → Extensions → Kevin Log`, or in `settings.json`:

| Setting                       | Default       | Description                                                       |
| ----------------------------- | ------------- | ----------------------------------------------------------------- |
| `kevinLog.quoteStyle`         | `'`           | Quote character: `'`, `"`, or `` ` ``                             |
| `kevinLog.logFunction`        | `console.log` | The function used to log, e.g. `console.debug` or a custom logger |
| `kevinLog.includeFileAndLine` | `true`        | Include the file name and line number                             |
| `kevinLog.includeMarker`      | `true`        | Prefix logs with 🚀 (needed for Delete/Comment All to find them)  |
| `kevinLog.semicolons`         | `true`        | Add a trailing semicolon                                          |

## Why

Typing `console.log('here:', x)` fifty times a day is a waste of your time. Turning it into a paid, account-gated, telemetry-collecting extension is a waste of everyone else's. This one just logs your variables and gets out of the way.

## License

MIT
