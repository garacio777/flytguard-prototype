import { DispatchOutputSchema, EquipmentCategoryEnum } from "../../src/schemas/dispatch.js";
import {
  JsonRpcMessageSchema,
  McpInitializeParamsSchema,
  McpToolCallParamsSchema,
  ValidateDispatchToolArgsSchema,
  type JsonRpcId
} from "../../src/schemas/mcp.js";
import {
  executeDispatchPipeline,
  SHARED_SECURITY_HEADERS,
  type DispatchEnv
} from "../lib/dispatch-engine.js";

const SUPPORTED_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18"]);
const DEFAULT_PROTOCOL_VERSION = "2025-03-26";

const EQUIPMENT_CATALOG = [
  {
    category: "GRAVEMASKIN",
    norwegianLabel: "Gravemaskiner (belte- og hjulgravere)",
    typicalModels: ["1.8t minigraver", "8-tonns beltegraver", "15-tonns hjulgraver", "25t anleggsgraver"],
    certificationRule: "Maskinførerbevis M2 påkrevd ved masseforflytning over 15 kW når maskinen leies med fører."
  },
  {
    category: "HJULLASTER",
    norwegianLabel: "Hjullastere og kompaktlastere",
    typicalModels: ["5t kompaktlaster", "15-tonns hjullaster", "18t anleggslaster"],
    certificationRule: "Maskinførerbevis M4 påkrevd ved operatøroppdrag."
  },
  {
    category: "LIFT_STILLAS",
    norwegianLabel: "Personløftere, sakselifter, bomlifter og stillas",
    typicalModels: ["10m elektrisk sakselift", "16m leddbomlift 4x4", "Rullestillas aluminium"],
    certificationRule: "Dokumenterte sikkerhetsopplæringskrav (personløfterbevis A/B/C) ved bruk."
  },
  {
    category: "STRØM_VARME_LYS",
    norwegianLabel: "Byggestrøm, lysmaster, varme og avfukting",
    typicalModels: ["Mobil LED lysmast 9m", "Byggestrømskap 63A", "Byggvarmer 18 kW", "Kondensavfukter"],
    certificationRule: "Krav til jordfeilvern og forskriftsmessig oppstilling på anleggsplass."
  },
  {
    category: "KOMPRIMERING",
    norwegianLabel: "Vibroplater, hoppetusser og valser",
    typicalModels: ["Vibroplate 90 kg", "Vibroplate 400 kg reversibel", "Grøftevals fjernstyrt"],
    certificationRule: "Bruk hørselsvern og kontroller vibrasjonseksponering (HMS)."
  }
] as const;

const MCP_TOOLS_MANIFEST = [
  {
    name: "parse_norwegian_dispatch",
    description:
      "Tolker en ustrukturert norsk feltbestilling (f.eks. fra anleggsleder) til en strengt Zod-validert maskinutleie-ordre (Gate 1 input + Gate 2 AI/deterministisk + Gate 3 DispatchOutputSchema).",
    inputSchema: {
      type: "object",
      properties: {
        projectSiteId: {
          type: "string",
          pattern: "^PROJ-[0-9]{4}$",
          description: "Prosjekt-ID på formatet PROJ-XXXX (f.eks. PROJ-1042)."
        },
        rawMessage: {
          type: "string",
          minLength: 10,
          maxLength: 500,
          description: "Norsk fritekstbestilling av maskiner, antall, leveringssted og tidspunkt."
        }
      },
      required: ["projectSiteId", "rawMessage"],
      additionalProperties: false
    }
  },
  {
    name: "validate_dispatch_payload",
    description:
      "Validerer et uverifisert JSON-utkast mot FlytGuards strenge DispatchOutputSchema (blokkerer hallusinerte utstyrskategorier og ugyldige ISO-8601 datoer).",
    inputSchema: {
      type: "object",
      properties: {
        payload: {
          type: "object",
          description: "Kandidat-objekt som skal kontrolleres mot DispatchOutputSchema."
        }
      },
      required: ["payload"],
      additionalProperties: false
    }
  },
  {
    name: "list_equipment_catalog",
    description:
      "Returnerer tillatte utstyrskategorier (EquipmentCategoryEnum), typiske maskinspesifikasjoner og norske sertifiserings-/HMS-regler.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
] as const;

function jsonRpcSuccess(id: JsonRpcId, result: unknown): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id,
    error: data !== undefined ? { code, message, data } : { code, message }
  };
}

async function handleSingleRpcObject(
  rawItem: unknown,
  env: DispatchEnv
): Promise<Record<string, unknown> | null> {
  const parsedMsg = JsonRpcMessageSchema.safeParse(rawItem);
  if (!parsedMsg.success) {
    return jsonRpcError(null, -32600, "Ugyldig JSON-RPC 2.0 forespørsel", parsedMsg.error.flatten());
  }

  const msg = parsedMsg.data;

  // JSON-RPC notifications (no `id`) receive no response body per MCP Streamable HTTP spec
  if (msg.id === undefined) {
    return null;
  }

  const requestId = msg.id;

  if (msg.method === "initialize") {
    const initParams = McpInitializeParamsSchema.safeParse(msg.params ?? {});
    const requestedVersion = initParams.success ? initParams.data.protocolVersion : undefined;
    const negotiatedVersion =
      requestedVersion && SUPPORTED_VERSIONS.has(requestedVersion)
        ? requestedVersion
        : DEFAULT_PROTOCOL_VERSION;

    return jsonRpcSuccess(requestId, {
      protocolVersion: negotiatedVersion,
      capabilities: {
        tools: {
          listChanged: false
        }
      },
      serverInfo: {
        name: "flytguard-dispatch-mcp",
        version: "1.0.0"
      },
      instructions:
        "FlytGuard deterministisk MCP-server for norsk maskinutleie og ordremottak. Alle verktøykall valideres med strenge Zod-kontrakter."
    });
  }

  if (msg.method === "ping") {
    return jsonRpcSuccess(requestId, {});
  }

  if (msg.method === "tools/list") {
    return jsonRpcSuccess(requestId, {
      tools: MCP_TOOLS_MANIFEST
    });
  }

  if (msg.method === "tools/call") {
    const parsedCall = McpToolCallParamsSchema.safeParse(msg.params);
    if (!parsedCall.success) {
      return jsonRpcError(
        requestId,
        -32602,
        "Ugyldige parametere til tools/call",
        parsedCall.error.flatten()
      );
    }

    const { name, arguments: toolArgs } = parsedCall.data;

    if (name === "list_equipment_catalog") {
      const catalogPayload = {
        allowedCategories: EquipmentCategoryEnum.options,
        catalog: EQUIPMENT_CATALOG
      };
      return jsonRpcSuccess(requestId, {
        content: [
          {
            type: "text",
            text: JSON.stringify(catalogPayload, null, 2)
          }
        ],
        structuredContent: catalogPayload,
        isError: false
      });
    }

    if (name === "validate_dispatch_payload") {
      const parsedWrapper = ValidateDispatchToolArgsSchema.safeParse(toolArgs ?? {});
      if (!parsedWrapper.success) {
        return jsonRpcSuccess(requestId, {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "REJECTED",
                  error: "Mangler påkrevd 'payload'-felt.",
                  violations: parsedWrapper.error.flatten()
                },
                null,
                2
              )
            }
          ],
          isError: true
        });
      }

      const verified = DispatchOutputSchema.safeParse(parsedWrapper.data.payload);
      if (!verified.success) {
        const rejection = {
          status: "REJECTED",
          error: "Payload brøt DispatchOutputSchema og ble blokkert.",
          violations: verified.error.flatten()
        };
        return jsonRpcSuccess(requestId, {
          content: [{ type: "text", text: JSON.stringify(rejection, null, 2) }],
          structuredContent: rejection,
          isError: true
        });
      }

      const validResult = {
        status: "VALIDATED",
        data: verified.data
      };
      return jsonRpcSuccess(requestId, {
        content: [{ type: "text", text: JSON.stringify(validResult, null, 2) }],
        structuredContent: validResult,
        isError: false
      });
    }

    if (name === "parse_norwegian_dispatch") {
      const pipelineResult = await executeDispatchPipeline(toolArgs ?? {}, env);
      if (!pipelineResult.ok) {
        return jsonRpcSuccess(requestId, {
          content: [
            {
              type: "text",
              text: JSON.stringify(pipelineResult.body, null, 2)
            }
          ],
          structuredContent: pipelineResult.body,
          isError: true
        });
      }

      const validatedEnvelope = {
        status: "VALIDATED",
        data: pipelineResult.data
      };
      return jsonRpcSuccess(requestId, {
        content: [
          {
            type: "text",
            text: JSON.stringify(validatedEnvelope, null, 2)
          }
        ],
        structuredContent: validatedEnvelope,
        isError: false
      });
    }
  }

  return jsonRpcError(requestId, -32601, `Ukjent MCP-metode: ${msg.method}`);
}

export const onRequestPost = async (context: {
  request: Request;
  env: DispatchEnv;
}): Promise<Response> => {
  let rawBody: unknown;
  try {
    rawBody = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify(jsonRpcError(null, -32700, "Ugyldig JSON i MCP-forespørsel")),
      {
        status: 400,
        headers: SHARED_SECURITY_HEADERS
      }
    );
  }

  if (Array.isArray(rawBody)) {
    if (rawBody.length === 0) {
      return new Response(
        JSON.stringify(jsonRpcError(null, -32600, "Tom JSON-RPC batch er ikke tillatt")),
        { status: 400, headers: SHARED_SECURITY_HEADERS }
      );
    }

    const responses: Array<Record<string, unknown>> = [];
    for (const item of rawBody) {
      const res = await handleSingleRpcObject(item, context.env);
      if (res !== null) {
        responses.push(res);
      }
    }

    if (responses.length === 0) {
      return new Response(null, { status: 202, headers: SHARED_SECURITY_HEADERS });
    }

    return new Response(JSON.stringify(responses), {
      status: 200,
      headers: SHARED_SECURITY_HEADERS
    });
  }

  const singleResponse = await handleSingleRpcObject(rawBody, context.env);
  if (singleResponse === null) {
    return new Response(null, { status: 202, headers: SHARED_SECURITY_HEADERS });
  }

  return new Response(JSON.stringify(singleResponse), {
    status: 200,
    headers: SHARED_SECURITY_HEADERS
  });
};

export const onRequest = async (context: {
  request: Request;
  env: DispatchEnv;
}): Promise<Response> => {
  if (context.request.method === "POST") {
    return onRequestPost(context);
  }

  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...SHARED_SECURITY_HEADERS,
        "Allow": "POST, OPTIONS"
      }
    });
  }

  return new Response(
    JSON.stringify(
      jsonRpcError(
        null,
        -32600,
        "Tilstandsløs MCP Streamable HTTP støtter kun HTTP POST på dette endepunktet."
      )
    ),
    {
      status: 405,
      headers: {
        ...SHARED_SECURITY_HEADERS,
        "Allow": "POST, OPTIONS"
      }
    }
  );
};
