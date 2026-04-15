/**
 * generator.ts
 * Converts parsed C/C++ declarations into a well-formatted header file.
 */

import * as path from "path";
import {
  ParseResult,
  ClassDecl,
  ClassSection,
  MethodDecl,
  StructDecl,
  EnumDecl,
  TypedefDecl,
  FunctionDecl,
} from "./parser";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a filename (no extension) to a valid C include-guard macro. */
function toGuard(baseName: string): string {
  return baseName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/^[0-9]/, "_$&") + "_H";
}

/** Get current date string for file header comment. */
function dateString(): string {
  return new Date().toISOString().split("T")[0];
}

/** Left-pad every line in a block with spaces. */
function indent(text: string, spaces: number = 4): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((l) => (l.trim().length > 0 ? pad + l : l))
    .join("\n");
}

/** Build a divider comment line. */
function divider(label: string, width: number = 72): string {
  const dashes = "─".repeat(Math.max(4, width - label.length - 6));
  return `/* ─── ${label} ${dashes} */`;
}

// ─── Section Emitters ─────────────────────────────────────────────────────────

function emitIncludes(includes: string[], isC: boolean): string {
  if (includes.length === 0) return "";
  const lines = includes.map((inc) => `#include ${inc}`).join("\n");
  return `${divider("Includes")}\n\n${lines}\n`;
}

function emitMacros(macros: string[]): string {
  if (macros.length === 0) return "";
  return `${divider("Constants / Macros")}\n\n${macros.join("\n")}\n`;
}

function emitTypedefs(typedefs: TypedefDecl[]): string {
  if (typedefs.length === 0) return "";
  const lines = typedefs.map((t) => `typedef ${t.original} ${t.alias};`).join("\n");
  return `${divider("Typedefs")}\n\n${lines}\n`;
}

function emitEnum(e: EnumDecl): string {
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

function emitEnums(enums: EnumDecl[]): string {
  if (enums.length === 0) return "";
  const lines = enums.map(emitEnum).join("\n\n");
  return `${divider("Enumerations")}\n\n${lines}\n`;
}

function emitStruct(s: StructDecl): string {
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

function emitStructs(structs: StructDecl[]): string {
  if (structs.length === 0) return "";
  const lines = structs.map(emitStruct).join("\n\n");
  return `${divider("Structures")}\n\n${lines}\n`;
}

function emitMethodDecl(m: MethodDecl): string {
  const parts: string[] = [];

  if (m.isStatic) parts.push("static");
  if (m.isVirtual) parts.push("virtual");

  if (m.returnType) {
    parts.push(`${m.returnType} ${m.name}(${m.params})`);
  } else {
    // constructor / destructor
    parts.push(`${m.name}(${m.params})`);
  }

  let decl = parts.join(" ");
  if (m.isConst) decl += " const";
  if (m.isPureVirtual) decl += " = 0";
  decl += ";";

  return decl;
}

function emitClassSection(section: ClassSection): string {
  const lines: string[] = [];

  if (section.methods.length > 0) {
    section.methods.forEach((method) => {
      lines.push(indent(emitMethodDecl(method)));
    });
  }

  if (section.fields.length > 0) {
    if (section.methods.length > 0) lines.push("");
    section.fields.forEach((field) => {
      lines.push(indent(field));
    });
  }

  return lines.join("\n");
}

function emitClass(cls: ClassDecl): string {
  const keyword = cls.isStruct ? "struct" : "class";
  const bases =
    cls.baseClasses.length > 0 ? ` : ${cls.baseClasses.join(", ")}` : "";

  const lines: string[] = [];
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
  if (lines[lines.length - 1] === "") lines.pop();
  lines.push("};");

  return lines.join("\n");
}

function emitClasses(classes: ClassDecl[]): string {
  if (classes.length === 0) return "";
  const lines = classes.map(emitClass).join("\n\n");
  return `${divider("Class Declarations")}\n\n${lines}\n`;
}

function emitFunctionProto(f: FunctionDecl): string {
  const parts: string[] = [];
  if (f.isStatic) parts.push("static");
  if (f.isInline) parts.push("inline");
  parts.push(`${f.returnType} ${f.name}(${f.params});`);
  return parts.join(" ");
}

function emitFunctions(functions: FunctionDecl[]): string {
  // Only include non-static functions in the public header
  const publicFns = functions.filter((f) => !f.isStatic);
  if (publicFns.length === 0) return "";

  const lines = publicFns.map(emitFunctionProto).join("\n");
  return `${divider("Function Prototypes")}\n\n${lines}\n`;
}

function emitExternC(content: string, isC: boolean): string {
  if (isC) return content;
  // For C++ headers we still offer the C linkage guard if it's a C++ header
  // that might be included from C — but we leave it optional.
  return content;
}

// ─── Main Generator ───────────────────────────────────────────────────────────

/**
 * Generate the full content of a `.h` header file from parsed source data.
 */
export function generateHeader(
  parsed: ParseResult,
  sourceFilename: string
): string {
  const baseName = path.basename(sourceFilename, path.extname(sourceFilename));
  const guard = toGuard(baseName);
  const today = dateString();

  const sections: string[] = [];

  // ── File banner ────────────────────────────────────────────────────────────
  sections.push(
    `/**\n` +
    ` * @file ${baseName}.h\n` +
    ` * @brief Auto-generated header for ${path.basename(sourceFilename)}\n` +
    ` *\n` +
    ` * Generated by Header File Generator on ${today}.\n` +
    ` * DO NOT EDIT — re-run the generator to update.\n` +
    ` */`
  );

  // ── Include guard ─────────────────────────────────────────────────────────
  sections.push(`#ifndef ${guard}\n#define ${guard}`);

  // ── C++ extern "C" open ───────────────────────────────────────────────────
  if (parsed.isC) {
    sections.push(
      `#ifdef __cplusplus\nextern "C" {\n#endif /* __cplusplus */`
    );
  }

  // ── Includes ─────────────────────────────────────────────────────────────
  const incSection = emitIncludes(parsed.includes, parsed.isC);
  if (incSection) sections.push(incSection);

  // ── Macros ────────────────────────────────────────────────────────────────
  const macroSection = emitMacros(parsed.macros);
  if (macroSection) sections.push(macroSection);

  // ── Typedefs ─────────────────────────────────────────────────────────────
  const typedefSection = emitTypedefs(parsed.typedefs);
  if (typedefSection) sections.push(typedefSection);

  // ── Enums ────────────────────────────────────────────────────────────────
  const enumSection = emitEnums(parsed.enums);
  if (enumSection) sections.push(enumSection);

  // ── Structs ───────────────────────────────────────────────────────────────
  const structSection = emitStructs(parsed.structs);
  if (structSection) sections.push(structSection);

  // ── Classes (C++ only) ────────────────────────────────────────────────────
  if (!parsed.isC) {
    const classSection = emitClasses(parsed.classes);
    if (classSection) sections.push(classSection);
  }

  // ── Function prototypes ───────────────────────────────────────────────────
  const fnSection = emitFunctions(parsed.functions);
  if (fnSection) sections.push(fnSection);

  // ── C extern "C" close ────────────────────────────────────────────────────
  if (parsed.isC) {
    sections.push(
      `#ifdef __cplusplus\n} /* extern "C" */\n#endif /* __cplusplus */`
    );
  }

  // ── Include guard close ───────────────────────────────────────────────────
  sections.push(`#endif /* ${guard} */`);

  return sections.join("\n\n") + "\n";
}
