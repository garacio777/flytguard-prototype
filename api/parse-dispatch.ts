import { onRequestPost } from "../functions/api/parse-dispatch";

export const config = {
  runtime: "edge"
};

declare const process:
  | {
      readonly env?: Readonly<Record<string, string | undefined>>;
    }
  | undefined;

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Kun HTTP POST støttes på /api/parse-dispatch." }),
      {
        status: 405,
        headers: {
          "Allow": "POST",
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  }

  const openAiKey =
    typeof process !== "undefined" ? process?.env?.OPENAI_API_KEY : undefined;

  return onRequestPost({
    request,
    env: { OPENAI_API_KEY: openAiKey }
  });
}
