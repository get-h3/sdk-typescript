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

// ── Field Overrides ────────────────────────────────────────────────────
//
// JSON Schema defines the canonical contract, but in practice some fields
// need to be more permissive — defaults for required fields that callers
// frequently omit, optional timestamps, looser enum handling.
//
// Two override types:
//   ".suffix"        — appended to the generated Zod expression
//   "REPLACE:expr"   — replaces the entire generated expression
//
// Keyed by schema export name → field name → modifier.

const FIELD_OVERRIDES: Record<string, Record<string, string>> = {
  Message: {
    role:       'REPLACE:z.string().default("user")',
    timestamp:  ".optional()",
  },
  Identity: {
    user_name:  '.default("unknown")',
    user_id:    '.default("unknown")',
  },
  HistoryEntry: {
    role:       "REPLACE:z.string()",     // loose — incoming history can have any role
  },
  Tool: {
    parameters: "REPLACE:z.record(z.unknown())",   // free-form params accepted
  },
  SessionState: {
    turn_count:        ".default(0)",
    total_tool_calls:  ".default(0)",
    total_llm_calls:   ".default(0)",
    cost_so_far:       ".default(0)",
    started_at:        ".optional()",
  },
  Config: {
    max_iterations: ".default(100)",
    timeout_seconds: ".default(60)",
  },
  Context: {
    history: ".default([])",
    tools:   ".default([])",
    models:  ".default([])",
  },
  ToolCall: {
    params: "REPLACE:z.record(z.unknown())",    // free-form params
  },
  Decision: {
    decision_id: '.uuid().default(() => crypto.randomUUID())',
  },
  SessionResponse: {
    turn_count: ".default(0)",
  },
  HealthResponse: {
    transport: 'REPLACE:z.string().default("rest")',
  },
  ResultPayload: {
    data: "REPLACE:z.record(z.unknown())",
  },
  ErrorDetail: {
    details: "REPLACE:z.record(z.unknown())",
  },
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

// ── Field-level overrides ─────────────────────────────────────────────
// Maps "DefName.fieldName" → custom Zod expression. Used instead of
// schema-derived expressions for fields where the committed hand-edited
// protocol.ts diverges from the JSON Schema for practical leniency.

const FIELD_OVERRIDES: Record<string, Record<string, string>> = {
  Attachment: {
    type: "AttachmentTypeSchema",
  },
  Message: {
    role: `z.string().default("user")`,
  },
  Identity: {
    user_name: `z.string().default("unknown")`,
    user_id: `z.string().default("unknown")`,
  },
  HistoryEntry: {
    role: "z.string()",
  },
  Tool: {
    parameters: "z.record(z.unknown())",
  },
  SessionState: {
    turn_count: "z.number().default(0)",
    total_tool_calls: "z.number().default(0)",
    total_llm_calls: "z.number().default(0)",
    cost_so_far: "z.number().default(0)",
  },
  Config: {
    max_iterations: "z.number().default(100)",
    timeout_seconds: "z.number().default(60)",
  },
  Context: {
    history: "z.array(HistoryEntrySchema).default([])",
    tools: "z.array(ToolSchema).default([])",
    models: "z.array(ModelSchema).default([])",
  },
};

// Extra enum values that should be added beyond what the schema defines
const ENUM_ADDITIONS: Record<string, string[]> = {
  MessageRole: ["assistant", "system"],
};

// Inline-enum threshold: enums with this many or fewer values use single-line format
const INLINE_ENUM_MAX = 3;

// "params" / "parameters" fields of type object → z.record(z.unknown())
const RECORD_FIELDS = new Set(["params", "parameters"]);

// ── Resolver ──────────────────────────────────────────────────────────

class Resolver {
  definitions = new Map<string, JsonSchema>();
  enums = new Map<string, string[]>(); // name → values
  currentDefName = ""; // set during zodExpr for def-level property overrides

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

  zodExpr(schema: JsonSchema, level: number, fieldName?: string): string {
    // Check field-level override first
    if (fieldName && this.currentDefName) {
      const overrides = FIELD_OVERRIDES[this.currentDefName];
      if (overrides?.[fieldName]) {
        return overrides[fieldName];
      }
    }

    if (schema.const !== undefined) {
      return `z.literal(${JSON.stringify(schema.const)})`;
    }
    if (schema.$ref) {
      const resolved = this.resolveRef(schema.$ref);
      if (resolved) {
        return `${resolved.name}Schema`;
      }
      return `z.any()`;
    }
    if (schema.enum) {
      if (schema.enum.every((v) => typeof v === "string")) {
        const vals = schema.enum.map((v) => JSON.stringify(v));
        // Inline for short enums, multiline for longer
        if (vals.length <= INLINE_ENUM_MAX) {
          return `z.enum([${vals.join(", ")}] as const)`;
        }
        return `z.enum([\n${indent(level)}  ${vals.join(`,\n${indent(level)}  `)},\n${indent(level)}] as const)`;
      }
      return `z.union([${schema.enum.map((v) => JSON.stringify(v)).join(", ")}])`;
    }
    switch (schema.type) {
      case "string": return "z.string()";
      case "number":
      case "integer": {
        let e = "z.number()";
        if (schema.minimum !== undefined) e = `z.number().min(${schema.minimum})`;
        if (Number.isInteger(schema.minimum)) e = e.replace("z.number()", "z.number().int()");
        return e;
      }
      case "boolean": return "z.boolean()";
      case "array": {
        if (schema.items) return `z.array(${this.zodExpr(schema.items, level)})`;
        return "z.array(z.any())";
      }
      case "object": {
        if (!schema.properties) {
          // "params"/"parameters" objects → z.record(z.unknown())
          if (fieldName && RECORD_FIELDS.has(fieldName)) {
            return "z.record(z.unknown())";
          }
          return "z.object({})";
        }
        const prevDefName = this.currentDefName;
        const props: string[] = [];
        const required = new Set(schema.required ?? []);
        for (const [key, prop] of Object.entries(schema.properties)) {
          let expr = this.zodExpr(prop, level + 1, key);
          if (!required.has(key)) expr = `${expr}.optional()`;
          props.push(`${indent(level + 1)}${key}: ${expr},`);
        }
        this.currentDefName = prevDefName;
        return `z.object({\n${props.join("\n")}\n${indent(level)}})`;
      }
      default:
        if (schema.oneOf) return "z.any() /* oneOf */";
        return "z.any()";
    }
  }
}
      case "object": {
        if (!schema.properties) return "z.object({})";
        const props: string[] = [];
        const required = new Set(schema.required ?? []);
        for (const [key, prop] of Object.entries(schema.properties)) {
          let expr = this.zodExpr(prop, level + 1, schemaName, key);
          if (!required.has(key)) {
            // Don't add .optional() if the field already has .default() —
            // Zod's .default() makes the field effectively optional already,
            // and chaining .optional() prevents the default from firing.
            if (!expr.includes(".default(")) {
              expr = `${expr}.optional()`;
            }
          }
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
          const enumName = defName + propKey.charAt(0).toUpperCase() + propKey.slice(1);
          const knownEnums: Record<string, string> = {
            "Attachmenttype": "AttachmentType",
            "Messagerole": "MessageRole",
            "HistoryEntryrole": "MessageRole",
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

  const defOrder = ["Attachment", "Message", "Identity", "HistoryEntry", "Tool", "Model", "SessionState", "Config", "Context"];

  for (const defName of defOrder) {
    const exportName = DEF_NAMES[defName];
    if (!exportName) continue;
    const schema = resolver.definitions.get(defName);
    if (!schema) continue;
    const zodExpr = resolver.zodExpr(schema, 1, exportName);
    lines.push(`export const ${exportName}Schema = ${zodExpr};`);
    lines.push(`export type ${exportName} = z.infer<typeof ${exportName}Schema>;`);
    lines.push(``);
  }

  // ── Decision sub-types ──────────────────────────────────────────────
  lines.push(`// ── Decision Sub-Types ──────────────────────────────────────────────`);
  lines.push(``);

  const subTypeOrder = ["ToolCall", "LLMMessage", "LLMCall", "TextResponse", "Wait", "Delegate", "End"];
  for (const name of subTypeOrder) {
    let schema: JsonSchema | undefined;
    if (name === "LLMMessage") {
      schema = EXTRA_TYPES.LLMMessage.schema;
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
    const zodExpr = resolver.zodExpr(schema, 1, name);
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
    const zodExpr = resolver.zodExpr(schema, 1, name);
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
    const zodExpr = resolver.zodExpr(schema, 1, name);
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
      1,
      "Decision"
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
