import { onRequest } from "../functions/api/mcp.js";

export const config = {
  runtime: "edge"
};

declare const process:
  | {
      readonly env?: Readonly<Record<string, string | undefined>>;
    }
  | undefined;

export default async function handler(request: Request): Promise<Response> {
  const openAiKey =
    typeof process !== "undefined" ? process?.env?.OPENAI_API_KEY : undefined;

  return onRequest({
    request,
    env: { OPENAI_API_KEY: openAiKey }
  });
}
