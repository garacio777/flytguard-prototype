import {
  DispatchRequestSchema,
  DispatchOutputSchema,
  LlmCompletionEnvelopeSchema
} from "../../src/schemas/dispatch.js";

interface Env {
  OPENAI_API_KEY?: string;
}

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const securityHeaders = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };

  try {
    const rawBody: unknown = await context.request.json();

    // Gate 1: Deterministic Input Validation
    const parsedInput = DispatchRequestSchema.safeParse(rawBody);
    if (!parsedInput.success) {
      return new Response(
        JSON.stringify({
          error: "Valideringsfeil i input",
          details: parsedInput.error.flatten()
        }),
        { status: 400, headers: securityHeaders }
      );
    }

    if (!context.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "AI-nøkkel er ikke konfigurert i Edge-miljøet (context.env.OPENAI_API_KEY)."
        }),
        { status: 503, headers: securityHeaders }
      );
    }

    // Gate 2: Bounded LLM Call (Timeout + System Prompt Isolation)
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "Authorization": `Bearer ${context.env.OPENAI_API_KEY}`,
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

    if (!aiResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Oppstrøms AI-tjeneste utilgjengelig" }),
        { status: 502, headers: securityHeaders }
      );
    }

    const rawEnvelope: unknown = await aiResponse.json();
    const parsedEnvelope = LlmCompletionEnvelopeSchema.safeParse(rawEnvelope);
    if (!parsedEnvelope.success) {
      return new Response(
        JSON.stringify({ error: "Ugyldig responsstruktur fra oppstrøms AI-tjeneste" }),
        { status: 502, headers: securityHeaders }
      );
    }

    const firstChoice = parsedEnvelope.data.choices[0];
    if (!firstChoice) {
      return new Response(
        JSON.stringify({ error: "Tomt svar fra oppstrøms AI-tjeneste" }),
        { status: 502, headers: securityHeaders }
      );
    }

    let unverifiedPayload: unknown;
    try {
      unverifiedPayload = JSON.parse(firstChoice.message.content);
    } catch {
      return new Response(
        JSON.stringify({
          error: "AI-output var ikke gyldig JSON og ble blokkert før lagring."
        }),
        { status: 422, headers: securityHeaders }
      );
    }

    // Gate 3: Deterministic Output Validation (Blocks LLM Hallucinations)
    const verifiedOutput = DispatchOutputSchema.safeParse(unverifiedPayload);
    if (!verifiedOutput.success) {
      return new Response(
        JSON.stringify({
          error: "AI-output brøt sikkerhetsskjema og ble blokkert før lagring.",
          violations: verifiedOutput.error.flatten()
        }),
        { status: 422, headers: securityHeaders }
      );
    }

    return new Response(
      JSON.stringify({ status: "VALIDATED", data: verifiedOutput.data }),
      { status: 200, headers: securityHeaders }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Ugyldig JSON-forespørsel" }),
      { status: 400, headers: securityHeaders }
    );
  }
};
