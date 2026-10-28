import {
  executeDispatchPipeline,
  SHARED_SECURITY_HEADERS,
  type DispatchEnv
} from "../lib/dispatch-engine.js";

export const onRequestPost = async (context: {
  request: Request;
  env: DispatchEnv;
}): Promise<Response> => {
  try {
    const rawBody: unknown = await context.request.json();
    const result = await executeDispatchPipeline(rawBody, context.env);

    if (!result.ok) {
      return new Response(JSON.stringify(result.body), {
        status: result.status,
        headers: SHARED_SECURITY_HEADERS
      });
    }

    return new Response(
      JSON.stringify({ status: "VALIDATED", data: result.data }),
      {
        status: 200,
        headers: SHARED_SECURITY_HEADERS
      }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Ugyldig JSON-forespørsel" }),
      {
        status: 400,
        headers: SHARED_SECURITY_HEADERS
      }
    );
  }
};
