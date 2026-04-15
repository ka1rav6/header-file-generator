"use strict";
/**
 * generator.ts
 * Converts parsed C/C++ declarations into a well-formatted header file.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateHeader = generateHeader;
const path = __importStar(require("path"));
// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Convert a filename (no extension) to a valid C include-guard macro. */
function toGuard(baseName) {
    return baseName
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "_")
        .replace(/^[0-9]/, "_$&") + "_H";
}
/** Get current date string for file header comment. */
function dateString() {
    return new Date().toISOString().split("T")[0];
}
/** Left-pad every line in a block with spaces. */
function indent(text, spaces = 4) {
    const pad = " ".repeat(spaces);
    return text
        .split("\n")
        .map((l) => (l.trim().length > 0 ? pad + l : l))
        .join("\n");
}
/** Build a divider comment line. */
function divider(label, width = 72) {
    const dashes = "─".repeat(Math.max(4, width - label.length - 6));
    return `/* ─── ${label} ${dashes} */`;
}
// ─── Section Emitters ─────────────────────────────────────────────────────────
function emitIncludes(includes, isC) {
    if (includes.length === 0)
        return "";
    const lines = includes.map((inc) => `#include ${inc}`).join("\n");
    return `${divider("Includes")}\n\n${lines}\n`;
}
function emitMacros(macros) {
    if (macros.length === 0)
        return "";
    return `${divider("Constants / Macros")}\n\n${macros.join("\n")}\n`;
}
function emitTypedefs(typedefs) {
    if (typedefs.length === 0)
        return "";
    const lines = typedefs.map((t) => `typedef ${t.original} ${t.alias};`).join("\n");
    return `${divider("Typedefs")}\n\n${lines}\n`;
}
function emitEnum(e) {
    const body = e.body
        .split("\n")
        .map((l) => "    " + l.trim())
        .filter((l) => l.trim().length > 0)
        .join("\n");
    if (e.isTypedef && e.typedefAlias) {
        return `typedef enum ${e.name ? e.name + " " : ""}{\n${body}\n} ${e.typedefAlias};`;
    }
    return `enum ${e.name} {\n${body}\n};`;
}
function emitEnums(enums) {
    if (enums.length === 0)
        return "";
    const lines = enums.map(emitEnum).join("\n\n");
    return `${divider("Enumerations")}\n\n${lines}\n`;
}
function emitStruct(s) {
    const body = s.body
        .split("\n")
        .map((l) => "    " + l.trim())
        .filter((l) => l.trim().length > 0)
        .join("\n");
    if (s.isTypedef && s.typedefAlias) {
        return `typedef struct ${s.name ? s.name + " " : ""}{\n${body}\n} ${s.typedefAlias};`;
    }
    return `struct ${s.name} {\n${body}\n};`;
}
function emitStructs(structs) {
    if (structs.length === 0)
        return "";
    const lines = structs.map(emitStruct).join("\n\n");
    return `${divider("Structures")}\n\n${lines}\n`;
}
function emitMethodDecl(m) {
    const parts = [];
    if (m.isStatic)
        parts.push("static");
    if (m.isVirtual)
        parts.push("virtual");
    if (m.returnType) {
        parts.push(`${m.returnType} ${m.name}(${m.params})`);
    }
    else {
        // constructor / destructor
        parts.push(`${m.name}(${m.params})`);
    }
    let decl = parts.join(" ");
    if (m.isConst)
        decl += " const";
    if (m.isPureVirtual)
        decl += " = 0";
    decl += ";";
    return decl;
}
function emitClassSection(section) {
    const lines = [];
    if (section.methods.length > 0) {
        section.methods.forEach((method) => {
            lines.push(indent(emitMethodDecl(method)));
        });
    }
    if (section.fields.length > 0) {
        if (section.methods.length > 0)
            lines.push("");
        section.fields.forEach((field) => {
            lines.push(indent(field));
        });
    }
    return lines.join("\n");
}
function emitClass(cls) {
    const keyword = cls.isStruct ? "struct" : "class";
    const bases = cls.baseClasses.length > 0 ? ` : ${cls.baseClasses.join(", ")}` : "";
    const lines = [];
    lines.push(`${keyword} ${cls.name}${bases} {`);
    for (const section of cls.sections) {
        lines.push(`${section.access}:`);
        const body = emitClassSection(section);
        if (body.trim().length > 0) {
            lines.push(body);
        }
        lines.push("");
    }
    // Remove trailing blank line before closing brace
    if (lines[lines.length - 1] === "")
        lines.pop();
    lines.push("};");
    return lines.join("\n");
}
function emitClasses(classes) {
    if (classes.length === 0)
        return "";
    const lines = classes.map(emitClass).join("\n\n");
    return `${divider("Class Declarations")}\n\n${lines}\n`;
}
function emitFunctionProto(f) {
    const parts = [];
    if (f.isStatic)
        parts.push("static");
    if (f.isInline)
        parts.push("inline");
    parts.push(`${f.returnType} ${f.name}(${f.params});`);
    return parts.join(" ");
}
function emitFunctions(functions) {
    // Only include non-static functions in the public header
    const publicFns = functions.filter((f) => !f.isStatic);
    if (publicFns.length === 0)
        return "";
    const lines = publicFns.map(emitFunctionProto).join("\n");
    return `${divider("Function Prototypes")}\n\n${lines}\n`;
}
function emitExternC(content, isC) {
    if (isC)
        return content;
    // For C++ headers we still offer the C linkage guard if it's a C++ header
    // that might be included from C — but we leave it optional.
    return content;
}
// ─── Main Generator ───────────────────────────────────────────────────────────
/**
 * Generate the full content of a `.h` header file from parsed source data.
 */
function generateHeader(parsed, sourceFilename) {
    const baseName = path.basename(sourceFilename, path.extname(sourceFilename));
    const guard = toGuard(baseName);
    const today = dateString();
    const sections = [];
    // ── File banner ────────────────────────────────────────────────────────────
    sections.push(`/**\n` +
        ` * @file ${baseName}.h\n` +
        ` * @brief Auto-generated header for ${path.basename(sourceFilename)}\n` +
        ` *\n` +
        ` * Generated by Header File Generator on ${today}.\n` +
        ` * DO NOT EDIT — re-run the generator to update.\n` +
        ` */`);
    // ── Include guard ─────────────────────────────────────────────────────────
    sections.push(`#ifndef ${guard}\n#define ${guard}`);
    // ── C++ extern "C" open ───────────────────────────────────────────────────
    if (parsed.isC) {
        sections.push(`#ifdef __cplusplus\nextern "C" {\n#endif /* __cplusplus */`);
    }
    // ── Includes ─────────────────────────────────────────────────────────────
    const incSection = emitIncludes(parsed.includes, parsed.isC);
    if (incSection)
        sections.push(incSection);
    // ── Macros ────────────────────────────────────────────────────────────────
    const macroSection = emitMacros(parsed.macros);
    if (macroSection)
        sections.push(macroSection);
    // ── Typedefs ─────────────────────────────────────────────────────────────
    const typedefSection = emitTypedefs(parsed.typedefs);
    if (typedefSection)
        sections.push(typedefSection);
    // ── Enums ────────────────────────────────────────────────────────────────
    const enumSection = emitEnums(parsed.enums);
    if (enumSection)
        sections.push(enumSection);
    // ── Structs ───────────────────────────────────────────────────────────────
    const structSection = emitStructs(parsed.structs);
    if (structSection)
        sections.push(structSection);
    // ── Classes (C++ only) ────────────────────────────────────────────────────
    if (!parsed.isC) {
        const classSection = emitClasses(parsed.classes);
        if (classSection)
            sections.push(classSection);
    }
    // ── Function prototypes ───────────────────────────────────────────────────
    const fnSection = emitFunctions(parsed.functions);
    if (fnSection)
        sections.push(fnSection);
    // ── C extern "C" close ────────────────────────────────────────────────────
    if (parsed.isC) {
        sections.push(`#ifdef __cplusplus\n} /* extern "C" */\n#endif /* __cplusplus */`);
    }
    // ── Include guard close ───────────────────────────────────────────────────
    sections.push(`#endif /* ${guard} */`);
    return sections.join("\n\n") + "\n";
}
//# sourceMappingURL=generator.js.map