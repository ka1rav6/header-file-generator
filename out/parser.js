"use strict";
/**
 * parser.ts
 * Parses C/C++ source files and extracts declarations for header generation.
 * Uses regex-based heuristics — no compiler required.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferRequiredIncludes = inferRequiredIncludes;
exports.parseSource = parseSource;
// ─── Preprocessor Utilities ───────────────────────────────────────────────────
/**
 * Remove all single-line and multi-line comments from source,
 * but preserve line counts (replace with whitespace) so that
 * line-relative offsets stay accurate enough for our purposes.
 * Also captures the leading comment for the next declaration.
 */
function stripComments(source) {
    const commentMap = new Map();
    let result = "";
    let i = 0;
    let lineNum = 0;
    while (i < source.length) {
        // Multi-line comment
        if (source[i] === "/" && source[i + 1] === "*") {
            const startLine = lineNum;
            let comment = "";
            i += 2;
            while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
                if (source[i] === "\n") {
                    lineNum++;
                    result += "\n";
                }
                else {
                    result += " ";
                }
                comment += source[i];
                i++;
            }
            i += 2; // skip */
            commentMap.set(startLine, comment.trim());
            continue;
        }
        // Single-line comment
        if (source[i] === "/" && source[i + 1] === "/") {
            const startLine = lineNum;
            let comment = "";
            i += 2;
            while (i < source.length && source[i] !== "\n") {
                comment += source[i];
                result += " ";
                i++;
            }
            commentMap.set(startLine, comment.trim());
            continue;
        }
        // String literals — skip contents so we don't parse code inside strings
        if (source[i] === '"') {
            result += source[i++];
            while (i < source.length && source[i] !== '"') {
                if (source[i] === "\\") {
                    result += " ";
                    i++;
                }
                if (source[i] === "\n") {
                    lineNum++;
                    result += "\n";
                }
                else {
                    result += " ";
                }
                i++;
            }
            if (i < source.length)
                result += source[i++]; // closing "
            continue;
        }
        // Char literals
        if (source[i] === "'") {
            result += source[i++];
            while (i < source.length && source[i] !== "'") {
                if (source[i] === "\\") {
                    result += " ";
                    i++;
                }
                result += " ";
                i++;
            }
            if (i < source.length)
                result += source[i++];
            continue;
        }
        if (source[i] === "\n")
            lineNum++;
        result += source[i++];
    }
    return { clean: result, commentMap };
}
/**
 * Remove preprocessor directives (lines starting with #)
 * but remember #include lines for the header.
 */
function extractIncludes(source) {
    const includes = [];
    const includeRe = /^\s*#\s*include\s+([<"].*?[>"])/gm;
    let m;
    while ((m = includeRe.exec(source)) !== null) {
        includes.push(m[1]);
    }
    return includes;
}
/**
 * Extract #define macros that look like constants (not function-like).
 */
function extractMacros(source) {
    const macros = [];
    const macroRe = /^\s*#\s*define\s+([A-Z_][A-Z0-9_]*)\s+(.+)/gm;
    let m;
    while ((m = macroRe.exec(source)) !== null) {
        macros.push(`#define ${m[1]} ${m[2].trim()}`);
    }
    return macros;
}
// ─── Block Extraction ─────────────────────────────────────────────────────────
/**
 * Given a position right AFTER an opening `{`, find the matching `}`.
 * Returns the index of the closing `}` in source, or -1 if not found.
 */
function findMatchingBrace(source, openPos) {
    let depth = 1;
    let i = openPos;
    while (i < source.length && depth > 0) {
        if (source[i] === "{")
            depth++;
        else if (source[i] === "}")
            depth--;
        i++;
    }
    return depth === 0 ? i - 1 : -1;
}
// ─── Struct / Enum / Typedef Parsers ─────────────────────────────────────────
function parseStructs(source) {
    const structs = [];
    // typedef struct [Tag] { ... } Alias;
    const typedefRe = /typedef\s+struct\s*(\w*)\s*\{/g;
    let m;
    while ((m = typedefRe.exec(source)) !== null) {
        const openBrace = m.index + m[0].length - 1;
        const closeBrace = findMatchingBrace(source, openBrace + 1);
        if (closeBrace < 0)
            continue;
        const body = source.slice(openBrace + 1, closeBrace).trim();
        // get alias after closing brace
        const after = source.slice(closeBrace + 1, closeBrace + 64).match(/\s*(\w+)\s*;/);
        const alias = after ? after[1] : m[1];
        structs.push({
            name: m[1] || alias,
            body: normaliseBody(body),
            isTypedef: true,
            typedefAlias: alias,
        });
        typedefRe.lastIndex = closeBrace + 1;
    }
    // plain struct Tag { ... };
    const plainRe = /\bstruct\s+(\w+)\s*\{/g;
    while ((m = plainRe.exec(source)) !== null) {
        // skip if already captured by typedef
        if (structs.some((s) => s.name === m[1]))
            continue;
        const openBrace = m.index + m[0].length - 1;
        const closeBrace = findMatchingBrace(source, openBrace + 1);
        if (closeBrace < 0)
            continue;
        const body = source.slice(openBrace + 1, closeBrace).trim();
        structs.push({
            name: m[1],
            body: normaliseBody(body),
            isTypedef: false,
        });
        plainRe.lastIndex = closeBrace + 1;
    }
    return structs;
}
function parseEnums(source) {
    const enums = [];
    const typedefRe = /typedef\s+enum\s*(\w*)\s*\{/g;
    let m;
    while ((m = typedefRe.exec(source)) !== null) {
        const openBrace = m.index + m[0].length - 1;
        const closeBrace = findMatchingBrace(source, openBrace + 1);
        if (closeBrace < 0)
            continue;
        const body = source.slice(openBrace + 1, closeBrace).trim();
        const after = source.slice(closeBrace + 1, closeBrace + 64).match(/\s*(\w+)\s*;/);
        const alias = after ? after[1] : m[1];
        enums.push({ name: m[1] || alias, body: normaliseBody(body), isTypedef: true, typedefAlias: alias });
        typedefRe.lastIndex = closeBrace + 1;
    }
    const plainRe = /\benum\s+(\w+)\s*\{/g;
    while ((m = plainRe.exec(source)) !== null) {
        if (enums.some((e) => e.name === m[1]))
            continue;
        const openBrace = m.index + m[0].length - 1;
        const closeBrace = findMatchingBrace(source, openBrace + 1);
        if (closeBrace < 0)
            continue;
        const body = source.slice(openBrace + 1, closeBrace).trim();
        enums.push({ name: m[1], body: normaliseBody(body), isTypedef: false });
        plainRe.lastIndex = closeBrace + 1;
    }
    return enums;
}
function parseTypedefs(source) {
    const typedefs = [];
    // typedef <type> <alias>;  — skip struct/enum typedefs (handled above)
    const re = /\btypedef\b(?!\s*(struct|enum|union))\s+(.+?)\s+(\w+)\s*;/g;
    let m;
    while ((m = re.exec(source)) !== null) {
        typedefs.push({ original: m[2].trim(), alias: m[3] });
    }
    return typedefs;
}
// ─── Function Parser ──────────────────────────────────────────────────────────
/**
 * Normalise whitespace in a parameter list or body snippet.
 */
function normalise(s) {
    return s.replace(/\s+/g, " ").trim();
}
function normaliseBody(s) {
    return s
        .split("\n")
        .map((l) => "    " + l.trim())
        .filter((l) => l.trim().length > 0)
        .join("\n");
}
/**
 * Attempt to infer which standard headers might be needed based on
 * identifiers used in the source.
 */
function inferRequiredIncludes(source) {
    const needed = [];
    const checks = [
        [/\bprintf\b|\bsprintf\b|\bfprintf\b|\bsscanf\b|\bscanf\b/, "<stdio.h>"],
        [/\bmalloc\b|\bcalloc\b|\brealloc\b|\bfree\b/, "<stdlib.h>"],
        [/\bstrlen\b|\bstrcpy\b|\bstrcat\b|\bstrcmp\b|\bstrstr\b/, "<string.h>"],
        [/\bsqrt\b|\bpow\b|\bsin\b|\bcos\b|\btan\b|\bfabs\b|\bceil\b|\bfloor\b/, "<math.h>"],
        [/\btime\b|\bclock\b|\bstruct\s+tm\b/, "<time.h>"],
        [/\bassert\b/, "<assert.h>"],
        [/\bbool\b|\btrue\b|\bfalse\b/, "<stdbool.h>"],
        [/\bint8_t\b|\bint16_t\b|\bint32_t\b|\bint64_t\b|\buint\d+_t\b/, "<stdint.h>"],
        [/\bstd::string\b|\bstd::vector\b|\bstd::map\b|\bstd::set\b|\bstd::pair\b/, ""],
        [/\bstd::cout\b|\bstd::cin\b|\bstd::endl\b/, "<iostream>"],
        [/\bstd::string\b/, "<string>"],
        [/\bstd::vector\b/, "<vector>"],
        [/\bstd::map\b/, "<map>"],
        [/\bstd::set\b/, "<set>"],
        [/\bstd::pair\b/, "<utility>"],
        [/\bstd::shared_ptr\b|\bstd::unique_ptr\b|\bstd::make_shared\b/, "<memory>"],
        [/\bstd::thread\b/, "<thread>"],
        [/\bstd::mutex\b/, "<mutex>"],
        [/\bstd::function\b/, "<functional>"],
        [/\bstd::algorithm\b|\bstd::sort\b|\bstd::find\b/, "<algorithm>"],
    ];
    for (const [re, header] of checks) {
        if (header && re.test(source)) {
            needed.push(header);
        }
    }
    return [...new Set(needed)];
}
/**
 * Parse free (non-class) C/C++ functions from clean (comment-stripped) source.
 * Strategy: scan line-by-line for lines that look like function definitions
 * (contain a `{` at the end after a `name(...)`), then extract the signature.
 * This avoids catastrophic backtracking from greedy multi-token regexes.
 */
function parseFunctions(source, isC) {
    const functions = [];
    // ── Step 1: blank out class/struct bodies so we skip their methods ──────────
    // Use the same character-based approach as parseClasses to avoid backtracking.
    let stripped = source;
    const classKwRe = /\b(?:class|struct)\s+(\w+)/g;
    let cm;
    while ((cm = classKwRe.exec(stripped)) !== null) {
        let i = cm.index + cm[0].length;
        // Walk forward to find `{` or `;` (forward declarations are skipped)
        while (i < stripped.length && stripped[i] !== "{" && stripped[i] !== ";")
            i++;
        if (i >= stripped.length || stripped[i] === ";")
            continue;
        const openBrace = i;
        const closeBrace = findMatchingBrace(stripped, openBrace + 1);
        if (closeBrace >= 0) {
            stripped =
                stripped.slice(0, openBrace + 1) +
                    " ".repeat(closeBrace - openBrace - 1) +
                    stripped.slice(closeBrace);
            classKwRe.lastIndex = cm.index + 1;
        }
    }
    // ── Step 2: collect param-balanced signatures ending with { ──────────────
    // We walk character-by-character to find `word(...)...{` patterns safely.
    const skipNames = new Set([
        "if", "else", "for", "while", "do", "switch", "case", "return",
        "sizeof", "typeof", "alignof", "static_assert", "catch", "try",
        "main", "namespace", "extern",
    ]);
    const WORD = /^\w+$/;
    // Tokenise into "candidate blocks": everything up to a top-level `{`
    // We split on `{` at depth 0 to get function preambles.
    const blocks = [];
    let depth = 0;
    let blockStart = 0;
    for (let i = 0; i < stripped.length; i++) {
        const ch = stripped[i];
        if (ch === "{") {
            if (depth === 0) {
                blocks.push(stripped.slice(blockStart, i));
                blockStart = i + 1;
            }
            depth++;
        }
        else if (ch === "}") {
            if (depth > 0)
                depth--;
            if (depth === 0)
                blockStart = i + 1;
        }
    }
    // ── Step 3: for each block ending, try to parse a function signature ─────
    for (const block of blocks) {
        const trimmed = block.trimEnd();
        if (!trimmed.endsWith(")") && !trimmed.match(/\)\s*(const|noexcept|override|final|\s)*\s*$/)) {
            continue; // doesn't end with closing paren (+ optional qualifiers)
        }
        // Find the matching open paren scanning backwards
        let closeParenIdx = trimmed.length - 1;
        // skip trailing qualifiers: const noexcept override final
        const trailingQualRe = /\b(const|noexcept|override|final)\s*$/;
        let body = trimmed;
        let trailingQuals = "";
        let tq;
        // strip trailing qualifiers up to 4 times
        for (let q = 0; q < 4; q++) {
            tq = trailingQualRe.exec(body);
            if (!tq)
                break;
            trailingQuals = tq[1] + " " + trailingQuals;
            body = body.slice(0, tq.index).trimEnd();
        }
        closeParenIdx = body.length - 1;
        if (body[closeParenIdx] !== ")")
            continue;
        // find matching open paren
        let pd = 1;
        let openParenIdx = closeParenIdx - 1;
        while (openParenIdx >= 0 && pd > 0) {
            if (body[openParenIdx] === ")")
                pd++;
            else if (body[openParenIdx] === "(")
                pd--;
            if (pd > 0)
                openParenIdx--;
        }
        if (pd !== 0)
            continue; // unbalanced
        const params = normalise(body.slice(openParenIdx + 1, closeParenIdx));
        const before = body.slice(0, openParenIdx).trimEnd();
        // Extract function name: last word-token before the paren
        // (may have a `*` prefix for pointer-returning functions)
        const nameMatch = before.match(/(\*?\s*\w+)\s*$/);
        if (!nameMatch)
            continue;
        const rawName = nameMatch[1].replace(/^\*+\s*/, "").trim();
        if (!WORD.test(rawName) || skipNames.has(rawName))
            continue;
        const prefixRaw = before.slice(0, before.length - nameMatch[0].length).trim();
        // Parse qualifiers from prefix
        let prefix = prefixRaw;
        const isStatic = /\bstatic\b/.test(prefix);
        const isInline = /\binline\b/.test(prefix);
        // Strip known qualifiers to get the return type
        let returnType = prefix
            .replace(/\bstatic\b/g, "")
            .replace(/\binline\b/g, "")
            .replace(/\bvirtual\b/g, "")
            .replace(/\bexplicit\b/g, "")
            .replace(/\s+/g, " ")
            .trim();
        // Must have a non-empty return type (skip bare constructors in free scope)
        if (!returnType)
            continue;
        // Return type should look like a type, not a keyword
        const lastToken = returnType.split(/\s+/).pop() || "";
        if (skipNames.has(lastToken))
            continue;
        // Skip out-of-line method definitions: ClassName::methodName
        // These show up as "SomeClass" return type with "::" in the before string
        if (prefixRaw.includes("::") || rawName.includes("::"))
            continue;
        functions.push({
            returnType,
            name: rawName,
            params: params || "void",
            isStatic,
            isInline,
        });
    }
    // ── Step 4: deduplicate by name + params ──────────────────────────────────
    const seen = new Set();
    return functions.filter((f) => {
        const key = `${f.name}|${f.params}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
// ─── Class Parser ─────────────────────────────────────────────────────────────
function parseClasses(source) {
    const classes = [];
    // Find class/struct keywords, then parse forward char-by-char to avoid
    // catastrophic backtracking from [^{]+ style regexes on large files.
    const keywordRe = /\b(class|struct)\s+(\w+)/g;
    let m;
    while ((m = keywordRe.exec(source)) !== null) {
        const keyword = m[1];
        const name = m[2];
        // Skip "enum class Foo" — this is an enum, not a class
        const charBefore = source.slice(Math.max(0, m.index - 5), m.index).trimEnd();
        if (charBefore.endsWith("enum"))
            continue;
        let i = m.index + m[0].length;
        // Walk forward: collect optional `: bases` text until `{` or `;`
        let basesRaw = "";
        let foundBrace = false;
        while (i < source.length) {
            const ch = source[i];
            if (ch === "{") {
                foundBrace = true;
                break;
            }
            if (ch === ";")
                break; // forward declaration
            basesRaw += ch;
            i++;
        }
        if (!foundBrace)
            continue;
        const openBrace = i;
        const closeBrace = findMatchingBrace(source, openBrace + 1);
        if (closeBrace < 0)
            continue;
        // Strip leading colon from bases string
        const bases = basesRaw
            .replace(/^\s*:\s*/, "")
            .split(",")
            .map((b) => b.trim())
            .filter((b) => b.length > 0 && b.trim() !== "");
        const body = source.slice(openBrace + 1, closeBrace);
        const isStruct = keyword === "struct";
        const sections = parseClassBody(body, isStruct);
        classes.push({ name, baseClasses: bases, sections, isStruct });
        // Advance past the class body
        keywordRe.lastIndex = closeBrace + 1;
    }
    return classes;
}
function parseClassBody(body, isStruct) {
    // Split into access sections
    const sections = [];
    // Default access: public for struct, private for class
    let currentAccess = isStruct ? "public" : "private";
    let currentSection = {
        access: currentAccess,
        methods: [],
        fields: [],
    };
    sections.push(currentSection);
    // Split on access specifiers
    const parts = body.split(/\b(public|private|protected)\s*:/);
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === "public" || part === "private" || part === "protected") {
            currentAccess = part;
            currentSection = { access: currentAccess, methods: [], fields: [] };
            sections.push(currentSection);
            continue;
        }
        // Parse methods and fields from this section chunk
        parseClassSection(part, currentSection);
    }
    return sections.filter((s) => s.methods.length > 0 || s.fields.length > 0);
}
function parseClassSection(chunk, section) {
    // Parse method declarations using a brace-split approach (same as parseFunctions)
    // to avoid catastrophic backtracking.
    const skipNames = new Set(["if", "else", "for", "while", "switch", "return", "do", "case"]);
    // Collect declaration candidates: text between ; or { boundaries at depth 0
    const stmts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i];
        if (ch === "{") {
            depth++;
        }
        else if (ch === "}") {
            if (depth > 0)
                depth--;
        }
        else if ((ch === ";" || ch === "{") && depth === 0) {
            stmts.push(chunk.slice(start, i).trim());
            start = i + 1;
        }
    }
    if (start < chunk.length)
        stmts.push(chunk.slice(start).trim());
    for (const stmt of stmts) {
        if (!stmt || stmt.length === 0)
            continue;
        // Must contain parentheses to be a method
        const closeParenIdx = stmt.lastIndexOf(")");
        if (closeParenIdx < 0) {
            // Might be a field: "Type name" or "Type name = value"
            const fieldMatch = stmt.match(/^([\w\s\*&:<>,]+?)\s+(\w+)\s*(?:=.*)?$/);
            if (fieldMatch) {
                const fname = fieldMatch[2];
                if (!skipNames.has(fname)) {
                    section.fields.push(`${normalise(fieldMatch[1])} ${fname};`);
                }
            }
            continue;
        }
        // Find matching open paren scanning backwards from closeParenIdx
        let pd = 1;
        let openParenIdx = closeParenIdx - 1;
        while (openParenIdx >= 0 && pd > 0) {
            if (stmt[openParenIdx] === ")")
                pd++;
            else if (stmt[openParenIdx] === "(")
                pd--;
            if (pd > 0)
                openParenIdx--;
        }
        if (pd !== 0)
            continue;
        const params = normalise(stmt.slice(openParenIdx + 1, closeParenIdx));
        // Trailing qualifiers after closing paren
        const afterParen = stmt.slice(closeParenIdx + 1).trim();
        const isConst = /\bconst\b/.test(afterParen);
        const isPureVirtual = /=\s*0/.test(afterParen);
        // Before the open paren: qualifiers + return type + name
        const before = stmt.slice(0, openParenIdx).trimEnd();
        const nameMatch = before.match(/(~?\w+)\s*$/);
        if (!nameMatch)
            continue;
        const name = nameMatch[1];
        if (skipNames.has(name))
            continue;
        const prefix = before.slice(0, before.length - nameMatch[0].length).trim();
        const isVirtual = /\bvirtual\b/.test(prefix);
        const isStatic = /\bstatic\b/.test(prefix);
        let returnType = prefix
            .replace(/\bvirtual\b/g, "")
            .replace(/\bstatic\b/g, "")
            .replace(/\bexplicit\b/g, "")
            .replace(/\binline\b/g, "")
            .replace(/\s+/g, " ")
            .trim();
        // Constructor / destructor: return type is empty or equals class name pattern
        const seemsConstructor = !returnType || returnType === name.replace(/^~/, "");
        if (seemsConstructor) {
            section.methods.push({
                returnType: "",
                name,
                params: params || "",
                isVirtual,
                isStatic,
                isConst,
                isPureVirtual,
            });
        }
        else {
            section.methods.push({
                returnType,
                name,
                params: params,
                isVirtual,
                isStatic,
                isConst,
                isPureVirtual,
            });
        }
    }
}
function parseGlobalVars(source) {
    const vars = [];
    // extern declarations or globals: type name; at top level (rough heuristic)
    const re = /^(extern\s+\w[\w\s\*&]+\w)\s*;/gm;
    let m;
    while ((m = re.exec(source)) !== null) {
        vars.push(m[1].trim() + ";");
    }
    return vars;
}
// ─── Main Entry Point ─────────────────────────────────────────────────────────
/**
 * Parse a C or C++ source file and return structured declaration info.
 */
function parseSource(source, filename) {
    const isC = filename.toLowerCase().endsWith(".c");
    const includes = extractIncludes(source);
    const macros = extractMacros(source);
    const { clean } = stripComments(source);
    const structs = parseStructs(clean);
    const enums = parseEnums(clean);
    const typedefs = parseTypedefs(clean);
    const classes = isC ? [] : parseClasses(clean);
    const functions = parseFunctions(clean, isC);
    const globalVars = parseGlobalVars(clean);
    const inferredIncludes = inferRequiredIncludes(source);
    // Merge inferred with actual, favouring inferred for the header
    const allIncludes = [...new Set([...inferredIncludes])];
    return {
        functions,
        classes,
        structs,
        typedefs,
        enums,
        includes: allIncludes,
        macros,
        globalVars,
        isC,
    };
}
//# sourceMappingURL=parser.js.map