# Header File Generator

A Visual Studio Code extension that automatically generates C/C++ header files (`.h`) from source files (`.c` / `.cpp`).

---

## Features

- **One command** — generate a complete `.h` file from any open `.c` or `.cpp` file
- **Smart parsing** — extracts function prototypes, class declarations, structs, enums, typedefs, and macros using robust regex-based analysis
- **Include guards** — always generates proper `#ifndef / #define / #endif` guards
- **C++ class support** — preserves `public:` / `private:` / `protected:` sections, virtual methods, pure virtual methods, static methods
- **C extern linkage** — wraps C headers in `#ifdef __cplusplus extern "C" { }` blocks automatically
- **Include inference** — detects usage of common standard library functions and adds the right `#include` lines
- **Update in place** — re-running the command overwrites an existing header with fresh content
- **Multiple triggers** — Command Palette, right-click context menu (editor + Explorer), keyboard shortcut, and status-bar button

---

## Triggers

| Method | How to use |
|--------|-----------|
| **Keyboard shortcut** | `Ctrl+Shift+H` (Windows/Linux) · `Cmd+Shift+H` (macOS) |
| **Command Palette** | `Ctrl+Shift+P` → `Header File Generator: Generate Header File` |
| **Editor context menu** | Right-click inside a `.c`/`.cpp` file → *Generate Header File* |
| **Explorer context menu** | Right-click a `.c`/`.cpp` file in the file tree → *Generate Header File* |
| **Status bar button** | Click `$(file-add) Gen .h` in the bottom-right status bar |

---

## What Gets Generated

### For C files (`.c`)

```c
/**
 * @file example.h
 * @brief Auto-generated header for example.c
 * ...
 */
#ifndef EXAMPLE_H
#define EXAMPLE_H

#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

/* ─── Includes ─── */
#include <stdio.h>
#include <stdlib.h>

/* ─── Constants / Macros ─── */
#define MAX_NAME_LEN 128

/* ─── Typedefs ─── */
typedef unsigned int uint;

/* ─── Enumerations ─── */
typedef enum Status {
    STATUS_OK = 0,
    STATUS_ERROR,
    ...
} Status;

/* ─── Structures ─── */
typedef struct Point {
    float x;
    float y;
} Point;

/* ─── Function Prototypes ─── */
Point point_create(float x, float y);
float point_distance(Point a, Point b);
Status process_data(const char* input, char* output, size_t output_size);

#ifdef __cplusplus
} /* extern "C" */
#endif /* __cplusplus */

#endif /* EXAMPLE_H */
```

### For C++ files (`.cpp`)

- Full class declarations with access specifiers preserved
- Virtual / pure-virtual / static / const method qualifiers preserved
- Inheritance chains (`class Circle : public Shape`) preserved
- `#include` lines for standard library headers inferred from usage

---

## Installation & Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [VS Code](https://code.visualstudio.com/) 1.80+

### 1. Clone / download the extension folder

```bash
git clone <repo-url>
cd header-file-generator
```

### 2. Install dependencies

```bash
npm install
```

### 3. Compile TypeScript

```bash
npm run compile
```

Or start the watcher (recompiles on every save):

```bash
npm run watch
```

---

## Running the Extension (Development / F5)

1. Open the `header-file-generator` folder in VS Code:
   ```bash
   code .
   ```
2. Press **F5** (or go to *Run → Start Debugging*).
3. A new **Extension Development Host** window opens.
4. In that window, open one of the sample files:
   - `test-samples/example.c`
   - `test-samples/example.cpp`
5. Press `Ctrl+Shift+H` (or use Command Palette → *Generate Header File*).
6. The generated `.h` file opens side-by-side.

---

## Testing

Open either test sample and run the command:

```
test-samples/
├── example.c      ← C sample with structs, enums, typedefs, functions
└── example.cpp    ← C++ sample with class hierarchy, virtual methods
```

Expected output files will be created as `example.h` in the same directory.

### Expected output for `example.c`

- `#ifndef EXAMPLE_H` include guard
- `extern "C"` wrapper block
- Macros: `MAX_NAME_LEN`, `VERSION_MAJOR`, `VERSION_MINOR`
- Typedef: `uint`, `string_t`
- Enum: `Status` with 4 values
- Structs: `Point`, `Rectangle`, `Node`
- **7 public function prototypes** (static helpers `clamp` and `is_valid_name` are excluded)

### Expected output for `example.cpp`

- `#ifndef EXAMPLE_H` include guard
- Includes: `<iostream>`, `<string>`, `<vector>`, `<memory>`
- Enum: `Direction`
- Classes: `Shape` (abstract), `Circle : public Shape`, `Rectangle : public Shape`
- Method signatures with `virtual`, `= 0`, `override`, `const`, `static` preserved
- Free function prototypes (non-static only)

---

## Project Structure

```
header-file-generator/
├── src/
│   ├── extension.ts        ← Entry point; registers command, status bar
│   ├── parser.ts           ← C/C++ source parser (regex-based)
│   └── generator.ts        ← Header content generator
├── test-samples/
│   ├── example.c
│   └── example.cpp
├── .vscode/
│   ├── launch.json         ← F5 debug configuration
│   └── tasks.json          ← Build task (tsc watch)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Parser Capabilities

| Construct | Supported |
|-----------|-----------|
| Free function definitions → prototypes | ✅ |
| `static` function exclusion | ✅ |
| `inline` function handling | ✅ |
| Class declarations (public/private/protected) | ✅ |
| Virtual & pure virtual methods | ✅ |
| `const` methods | ✅ |
| Constructor / destructor signatures | ✅ |
| Inheritance chains | ✅ |
| `struct` (plain and typedef) | ✅ |
| `enum` / `enum class` | ✅ |
| `typedef` (non-struct/enum) | ✅ |
| `#define` constant macros | ✅ |
| Standard header inference | ✅ |
| `extern "C"` wrapper (for C files) | ✅ |
| Comment stripping (preserves line count) | ✅ |
| String literal avoidance | ✅ |

---

## Packaging for Distribution

```bash
npm install -g @vscode/vsce
vsce package
# produces: header-file-generator-1.0.0.vsix
```

Install the `.vsix`:
```bash
code --install-extension header-file-generator-1.0.0.vsix
```

---

## License

MIT
