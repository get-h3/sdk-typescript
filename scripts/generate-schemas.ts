#!/usr/bin/env npx tsx
/**
 * JSON Schema → Zod TypeScript generator for H3 Protocol.
 *
 * Reads get-h3/protocol/schemas/v1/*.json and generates
 * src/protocol.ts with Zod schemas + TypeScript types.
 *
 * Usage:
 *   npx tsx scripts/generate-schemas.ts [--protocol-dir <path>]
 *
 * Default protocol dir: ../protocol/schemas/v1
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Types ─────────────────────────────────────────────────────────────

interface JsonSchema {
  $id?: string;
  title?: string;
  description?: string;
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: (string | number)[];
  const?: string | number | boolean;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  definitions?: Record<string, JsonSchema>;
  $ref?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  additionalProperties?: JsonSchema | boolean;
}

interface SchemaFile {
  basename: string;
  schema: JsonSchema;
}

// ── Name mappings: JSON Schema basename → { type export, optional enum exports } ─

const FILE_NAMES: Record<string, { name: string; enums?: Record<string, string> }> = {
  decision:     { name: "Decision",      enums: { "decision": "DecisionType" } },
  "tool-call":  { name: "ToolCall" },
  "llm-call":   { name: "LLMCall" },
  "text-response": { name: "TextResponse" },
  wait:         { name: "Wait" },
  delegate:     { name: "Delegate" },
  end:          { name: "End",           enums: { "reason": "EndReason" } },
  "process-request":  { name: "ProcessRequest" },
  "result-request":   { name: "ResultRequest", enums: { "result.type": "ResultType" } },
  "cancel-request":   { name: "CancelRequest", enums: { "reason": "CancelReason" } },
  "health-response":  { name: "HealthResponse", enums: { "status": "HealthStatus", "capabilities": "Capability" } },
  "error-response":   { name: "ErrorResponse", enums: { "error.code": "ErrorCode" } },
  "session-response": { name: "SessionResponse", enums: { "status": "SessionStatus" } },
};

const DEF_NAMES: Record<string, string> = {
  Message:       "Message",
  Attachment:    "Attachment",
  Identity:      "Identity",
  HistoryEntry:  "HistoryEntry",
  Tool:          "Tool",
  Model:         "Model",
  SessionState:  "SessionState",
  Config:        "Config",
  Context:       "Context",
};

const DEF_ENUMS: Record<string, Record<string, string>> = {
  Message:      { "role": "MessageRole" },
  Attachment:   { "type": "AttachmentType" },
};

// Extra standalone schemas (not from files directly)
const EXTRA_TYPES: Record<string, { schema: JsonSchema; enums?: Record<string, string> }> = {
  ResultPayload: {
    schema: {
      type: "object",
      required: ["type", "success"],
      properties: {
        type: { $ref: "#/definitions/ResultType" },
        tool_name: { type: "string" },
        data: { type: "object" },
        duration_ms: { type: "number", minimum: 0 },
        success: { type: "boolean" },
      },
    },
  },
  ErrorDetail: {
    schema: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { $ref: "#/definitions/ErrorCode" },
        message: { type: "string" },
        details: { type: "object" },
      },
    },
  },
  LLMMessage: {
    schema: {
      type: "object",
      required: ["role", "content"],
      properties: {
        role: { type: "string", enum: ["user", "assistant", "system"] },
        content: { type: "string" },
      },
    },
    enums: { "role": "MessageRole" }, // reuses same enum, ok
  },
};

// ── Helpers ───────────────────────────────────────────────────────────

function loadSchemas(dir: string): SchemaFile[] {
  const files: SchemaFile[] = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".json")) continue;
    const basename = entry.replace(".json", "");
    const raw = fs.readFileSync(path.join(dir, entry), "utf-8");
    files.push({ basename, schema: JSON.parse(raw) as JsonSchema });
  }
  return files;
}

function indent(n: number): string {
  return "  ".repeat(n);
}

// ── Resolver ──────────────────────────────────────────────────────────

class Resolver {
  definitions = new Map<string, JsonSchema>();
  enums = new Map<string, string[]>(); // name → values

  registerDef(name: string, schema: JsonSchema) {
    this.definitions.set(name, schema);
    if (schema.type === "string" && schema.enum) {
      this.enums.set(name, schema.enum as string[]);
    }
  }

  resolveRef(ref: string): { schema: JsonSchema; name: string } | null {
    if (ref.startsWith("#/definitions/")) {
      const name = ref.replace("#/definitions/", "");
      const s = this.definitions.get(name);
      if (s) return { schema: s, name };
      // Check if it's an enum name registered separately
      if (this.enums.has(name)) {
        return { schema: { type: "string", enum: this.enums.get(name)! }, name };
      }
      return null;
    }
    const m = ref.match(/^(.+)\.json#\/definitions\/(.+)$/);
    if (m) {
      const name = m[2];
      const s = this.definitions.get(name);
      if (s) return { schema: s, name };
      if (this.enums.has(name)) {
        return { schema: { type: "string", enum: this.enums.get(name)! }, name };
      }
      return null;
    }
    return null;
  }

  zodExpr(schema: JsonSchema, level: number): string {
    if (schema.const !== undefined) {
      return `z.literal(${JSON.stringify(schema.const)})`;
    }
    if (schema.$ref) {
      const resolved = this.resolveRef(schema.$ref);
      if (resolved) {
        const mapped = DEF_NAMES[resolved.name] ?? DEF_ENUMS[resolved.name]?.[Object.keys(DEF_ENUMS[resolved.name] ?? {})[0]] ?? null;
        if (mapped && this.enums.has(resolved.name)) {
          return `${resolved.name}Schema`;
        }
        return `${resolved.name}Schema`;
      }
      return `z.any()`;
    }
    if (schema.enum) {
      if (schema.enum.every((v) => typeof v === "string")) {
        return `z.enum([${schema.enum.map((v) => JSON.stringify(v)).join(", ")}] as const)`;
      }
      return `z.union([${schema.enum.map((v) => JSON.stringify(v)).join(", ")}])`;
    }
    switch (schema.type) {
      case "string": return "z.string()";
      case "number":
      case "integer": {
        let e = "z.number()";
        if (schema.minimum !== undefined) e = `z.number().min(${schema.minimum})`;
        if (Number.isInteger(schema.minimum)) e = e.replace("z.number()", "z.number().int()").replace(".min(", ".min(");
        return e;
      }
      case "boolean": return "z.boolean()";
      case "array": {
        if (schema.items) return `z.array(${this.zodExpr(schema.items, level)})`;
        return "z.array(z.any())";
      }
      case "object": {
        if (!schema.properties) return "z.object({})";
        const props: string[] = [];
        const required = new Set(schema.required ?? []);
        for (const [key, prop] of Object.entries(schema.properties)) {
          let expr = this.zodExpr(prop, level + 1);
          if (!required.has(key)) expr = `${expr}.optional()`;
          props.push(`${indent(level + 1)}${key}: ${expr},`);
        }
        return `z.object({\n${props.join("\n")}\n${indent(level)}})`;
      }
      default:
        if (schema.oneOf) return "z.any() /* oneOf */";
        return "z.any()";
    }
  }
}

// ── Generator ─────────────────────────────────────────────────────────

function generate(files: SchemaFile[], protocolDir: string): string {
  const resolver = new Resolver();

  // Register all definitions from common.json and other files
  for (const f of files) {
    if (f.schema.definitions) {
      for (const [name, def] of Object.entries(f.schema.definitions)) {
        resolver.registerDef(name, def);
      }
    }
  }

  // Register inline enums from file properties (handles dot-separated nested paths)
  for (const f of files) {
    const info = FILE_NAMES[f.basename];
    if (!info?.enums) continue;
    if (!f.schema.properties) continue;
    for (const [propPath, enumName] of Object.entries(info.enums)) {
      // Support dot-separated nested paths like "result.type" or "error.code"
      let obj: JsonSchema | undefined = f.schema;
      const parts = propPath.split(".");
      for (const part of parts) {
        obj = obj?.properties?.[part];
        if (!obj) break;
      }
      if (!obj) continue;
      if (obj.enum) {
        resolver.enums.set(enumName, obj.enum as string[]);
      }
      // Handle items.enum (e.g., Capability from health-response capabilities array)
      if (obj.items?.enum) {
        resolver.enums.set(enumName, obj.items.enum as string[]);
      }
    }
  }

  // Extract nested enums from definition properties (AttachmentType, MessageRole, etc.)
  for (const [defName, defSchema] of resolver.definitions) {
  if (defSchema.type === "object" && defSchema.properties) {
    for (const [propKey, propSchema] of Object.entries(defSchema.properties)) {
      if (propSchema.enum && !resolver.enums.has(propKey)) {
        // Derive name from definition + property
        const enumName = defName + propKey.charAt(0).toUpperCase() + propKey.slice(1);
        // Map to known names
        const knownEnums: Record<string, string> = {
          "Attachmenttype": "AttachmentType",
          "Messagerole": "MessageRole",
          "HistoryEntryrole": "MessageRole", // Same enum, reuse
        };
        const mapped = knownEnums[enumName] ?? enumName;
        if (!resolver.enums.has(mapped)) {
          resolver.enums.set(mapped, propSchema.enum as string[]);
        }
      }
    }
  }
  }

  const lines: string[] = [];
  const I = "  ";

  lines.push(`/**`);
  lines.push(` * H3 Protocol Types — Zod schemas + TypeScript types matching the v1 JSON Schema.`);
  lines.push(` *`);
  lines.push(` * AUTO-GENERATED from get-h3/protocol/schemas/v1/*.json.`);
  lines.push(` * DO NOT EDIT BY HAND — run: npx tsx scripts/generate-schemas.ts`);
  lines.push(` */`);
  lines.push(``);
  lines.push(`import { z } from "zod";`);
  lines.push(``);

  // ── Enums ──────────────────────────────────────────────────────────
  lines.push(`// ── Enums ───────────────────────────────────────────────────────────`);
  lines.push(``);

  const enumOrder = [
    "DecisionType", "EndReason", "CancelReason", "ResultType",
    "SessionStatus", "ErrorCode", "HealthStatus", "AttachmentType",
    "MessageRole", "Capability",
  ];

  for (const name of enumOrder) {
    const values = resolver.enums.get(name);
    if (!values) continue;
    lines.push(`export const ${name}Schema = z.enum([`);
    lines.push(`${I}${values.map((v) => JSON.stringify(v)).join(`,\n${I}`)},`);
    lines.push(`] as const);`);
    lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
    lines.push(``);
  }

  // ── Common types ────────────────────────────────────────────────────
  lines.push(`// ── Common types ────────────────────────────────────────────────────`);
  lines.push(``);

  // Order matters: Attachment before Message (Message references Attachment)
  const defOrder = ["Attachment", "Message", "Identity", "HistoryEntry", "Tool", "Model", "SessionState", "Config", "Context"];

  for (const defName of defOrder) {
    const exportName = DEF_NAMES[defName];
    if (!exportName) continue;
    const schema = resolver.definitions.get(defName);
    if (!schema) continue;
    const zodExpr = resolver.zodExpr(schema, 1);
    lines.push(`export const ${exportName}Schema = ${zodExpr};`);
    lines.push(`export type ${exportName} = z.infer<typeof ${exportName}Schema>;`);
    lines.push(``);
  }

  // ── Decision sub-types (from individual files) ──────────────────────
  lines.push(`// ── Decision Sub-Types ──────────────────────────────────────────────`);
  lines.push(``);

  const subTypeOrder = ["ToolCall", "LLMMessage", "LLMCall", "TextResponse", "Wait", "Delegate", "End"];
  for (const name of subTypeOrder) {
    let schema: JsonSchema | undefined;
    if (name === "LLMMessage") {
      schema = EXTRA_TYPES.LLMMessage.schema;
    } else {
      // Find file with this export name
      for (const f of files) {
        const info = FILE_NAMES[f.basename];
        if (info?.name === name && f.schema.type === "object" && f.schema.properties) {
          schema = f.schema;
          break;
        }
      }
    }
    if (!schema) continue;
    const zodExpr = resolver.zodExpr(schema, 1);
    lines.push(`export const ${name}Schema = ${zodExpr};`);
    lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
    lines.push(``);
  }

  // ── Request schemas ─────────────────────────────────────────────────
  lines.push(`// ── Request Schemas ─────────────────────────────────────────────────`);
  lines.push(``);

  for (const name of ["ProcessRequest", "ResultPayload", "ResultRequest", "CancelRequest"]) {
    let schema: JsonSchema | undefined;
    if (name === "ResultPayload") {
      schema = EXTRA_TYPES.ResultPayload.schema;
    } else {
      for (const f of files) {
        const info = FILE_NAMES[f.basename];
        if (info?.name === name && f.schema.type === "object" && f.schema.properties) {
          schema = f.schema;
          break;
        }
      }
    }
    if (!schema) continue;
    const zodExpr = resolver.zodExpr(schema, 1);
    lines.push(`export const ${name}Schema = ${zodExpr};`);
    lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
    lines.push(``);
  }

  // ── Response schemas ────────────────────────────────────────────────
  lines.push(`// ── Response Schemas ────────────────────────────────────────────────`);
  lines.push(``);

  for (const name of ["HealthResponse", "ErrorDetail", "ErrorResponse", "SessionResponse"]) {
    let schema: JsonSchema | undefined;
    if (name === "ErrorDetail") {
      schema = EXTRA_TYPES.ErrorDetail.schema;
    } else {
      for (const f of files) {
        const info = FILE_NAMES[f.basename];
        if (info?.name === name && f.schema.type === "object" && f.schema.properties) {
          schema = f.schema;
          break;
        }
      }
    }
    if (!schema) continue;
    const zodExpr = resolver.zodExpr(schema, 1);
    lines.push(`export const ${name}Schema = ${zodExpr};`);
    lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
    lines.push(``);
  }

  // ── Decision (top-level, flat optional) ─────────────────────────────
  lines.push(`// ── Decision (top-level) ────────────────────────────────────────────`);
  lines.push(``);

  const decisionFile = files.find((f) => f.basename === "decision");
  if (decisionFile) {
    const baseZod = resolver.zodExpr(
      {
        type: "object",
        required: ["decision", "decision_id"],
        properties: {
          decision: { $ref: "#/definitions/DecisionType" },
          decision_id: { type: "string" },
          tool_call: { $ref: "#/definitions/ToolCall" },
          llm_call: { $ref: "#/definitions/LLMCall" },
          text: { $ref: "#/definitions/TextResponse" },
          wait: { $ref: "#/definitions/Wait" },
          delegate: { $ref: "#/definitions/Delegate" },
          end: { $ref: "#/definitions/End" },
        },
      },
      1
    );
    lines.push(`export const DecisionSchema = ${baseZod};`);
    lines.push(`export type Decision = z.infer<typeof DecisionSchema>;`);
    lines.push(``);
  }

  return lines.join("\n");
}

// ── CLI ───────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  let protocolDir = path.resolve(__dirname, "..", "..", "protocol", "schemas", "v1");

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--protocol-dir" && args[i + 1]) {
      protocolDir = path.resolve(args[i + 1]);
      i++;
    }
  }

  if (!fs.existsSync(protocolDir)) {
    console.error(`Protocol schemas dir not found: ${protocolDir}`);
    process.exit(1);
  }

  const files = loadSchemas(protocolDir);
  console.error(`Loaded ${files.length} schema files from ${protocolDir}`);

  const output = generate(files, protocolDir);

  const outPath = path.resolve(__dirname, "..", "src", "protocol.ts");
  let changed = true;
  if (fs.existsSync(outPath)) {
    const existing = fs.readFileSync(outPath, "utf-8");
    if (existing === output) {
      changed = false;
      console.error("No changes — generated output matches current protocol.ts");
    }
  }

  if (changed) {
    fs.writeFileSync(outPath, output, "utf-8");
    console.error(`Wrote ${outPath} (${output.length} bytes)`);
  }

  // Write change flag for CI
  const flagPath = path.resolve(__dirname, "..", ".schemas-changed");
  if (changed) {
    fs.writeFileSync(flagPath, "true\n", "utf-8");
  } else if (fs.existsSync(flagPath)) {
    fs.unlinkSync(flagPath);
  }

  process.exit(0);
}

main();
