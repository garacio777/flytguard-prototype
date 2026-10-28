import {
  DispatchOutputSchema,
  DispatchRequestSchema,
  LlmCompletionEnvelopeSchema,
  type DispatchOutput,
  type FlattenedValidationError
} from "../../src/schemas/dispatch.js";
import { parseNorwegianDispatchDeterministically } from "./norwegian-fallback-parser.js";

export interface DispatchEnv {
  OPENAI_API_KEY?: string;
}

export const SHARED_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Resource-Policy": "same-origin"
};

export type DispatchPipelineResult =
  | {
      readonly ok: true;
      readonly status: 200;
      readonly data: DispatchOutput;
    }
  | {
      readonly ok: false;
      readonly status: 400;
      readonly body: {
        readonly error: string;
        readonly details?: FlattenedValidationError;
      };
    }
  | {
      readonly ok: false;
      readonly status: 422;
      readonly body: {
        readonly error: string;
        readonly violations?: FlattenedValidationError;
      };
    }
  | {
      readonly ok: false;
      readonly status: 502;
      readonly body: {
        readonly error: string;
      };
    };

export async function executeDispatchPipeline(
  rawBody: unknown,
  env: DispatchEnv
): Promise<DispatchPipelineResult> {
  // Gate 1: Deterministic Input Validation
  const parsedInput = DispatchRequestSchema.safeParse(rawBody);
  if (!parsedInput.success) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Valideringsfeil i input",
        details: parsedInput.error.flatten()
      }
    };
  }

  let unverifiedPayload: unknown;

  if (!env.OPENAI_API_KEY) {
    // Deterministic Zone 4 Edge Parser when no upstream LLM key is provisioned
    unverifiedPayload = parseNorwegianDispatchDeterministically(parsedInput.data);
  } else {
    // Gate 2: Bounded LLM Call (Timeout + System Prompt Isolation)
    let aiResponse: Response;
    try {
      aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Du er en deterministisk ordre-parser for maskinutleie og drift. Returner KUN gyldig JSON med feltene: confidenceScore (0-1), needsHumanReview (boolean), items (liste med category [GRAVEMASKIN|HJULLASTER|LIFT_STILLAS|STRØM_VARME_LYS|KOMPRIMERING], modelSpecification, quantity, deliveryLocation, requestedStartIso [ISO-8601 med tidssone], requiresCertifiedOperator), og safetyNotes."
            },
            {
              role: "user",
              content: `Prosjekt: ${parsedInput.data.projectSiteId}\nBestilling: ${parsedInput.data.rawMessage}`
            }
          ]
        })
      });
    } catch {
      return {
        ok: false,
        status: 502,
        body: { error: "Oppstrøms AI-tjeneste utilgjengelig" }
      };
    }

    if (!aiResponse.ok) {
      return {
        ok: false,
        status: 502,
        body: { error: "Oppstrøms AI-tjeneste utilgjengelig" }
      };
    }

    const rawEnvelope: unknown = await aiResponse.json();
    const parsedEnvelope = LlmCompletionEnvelopeSchema.safeParse(rawEnvelope);
    if (!parsedEnvelope.success) {
      return {
        ok: false,
        status: 502,
        body: { error: "Ugyldig responsstruktur fra oppstrøms AI-tjeneste" }
      };
    }

    const firstChoice = parsedEnvelope.data.choices[0];
    if (!firstChoice) {
      return {
        ok: false,
        status: 502,
        body: { error: "Tomt svar fra oppstrøms AI-tjeneste" }
      };
    }

    try {
      unverifiedPayload = JSON.parse(firstChoice.message.content);
    } catch {
      return {
        ok: false,
        status: 422,
        body: { error: "AI-output var ikke gyldig JSON og ble blokkert før lagring." }
      };
    }
  }

  // Gate 3: Deterministic Output Validation (Blocks LLM & Parser Drift)
  const verifiedOutput = DispatchOutputSchema.safeParse(unverifiedPayload);
  if (!verifiedOutput.success) {
    return {
      ok: false,
      status: 422,
      body: {
        error: "AI-output brøt sikkerhetsskjema og ble blokkert før lagring.",
        violations: verifiedOutput.error.flatten()
      }
    };
  }

  return {
    ok: true,
    status: 200,
    data: verifiedOutput.data
  };
}
