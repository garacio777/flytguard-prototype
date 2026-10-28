import { z } from "zod";

export const JsonRpcIdSchema = z.union([z.string(), z.number(), z.null()]);

export const JsonRpcMessageSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: JsonRpcIdSchema.optional(),
    method: z.string().min(1).max(120),
    params: z.unknown().optional()
  })
  .strict();

export const McpInitializeParamsSchema = z
  .object({
    protocolVersion: z.string().min(1).max(40).optional(),
    capabilities: z.record(z.string(), z.unknown()).optional(),
    clientInfo: z
      .object({
        name: z.string(),
        version: z.string().optional()
      })
      .optional()
  })
  .passthrough();

export const McpToolCallParamsSchema = z
  .object({
    name: z.enum([
      "parse_norwegian_dispatch",
      "validate_dispatch_payload",
      "list_equipment_catalog"
    ]),
    arguments: z.unknown().optional()
  })
  .passthrough();

export const ValidateDispatchToolArgsSchema = z
  .object({
    payload: z.unknown()
  })
  .strict();

export type JsonRpcId = z.infer<typeof JsonRpcIdSchema>;
export type JsonRpcMessage = z.infer<typeof JsonRpcMessageSchema>;
