import { clientOf, isSameOrigin, readCapped } from "@/lib/apiRequest";
import { createInsightService, MAX_BODY_CHARS, sharedLimiter } from "@/lib/insightService";

const service = createInsightService({ apiKey: process.env.GROQ_API_KEY, allow: sharedLimiter });

const refuse = (status: number) => Response.json({ source: "rules", reason: "invalid" }, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return refuse(403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return refuse(415);

  const body = await readCapped(request, MAX_BODY_CHARS);
  if (body === null) return refuse(413);
  const { status, reply } = await service.handle(body, clientOf(request));
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (status === 429) headers["retry-after"] = "60";
  return Response.json(reply, { status, headers });
}
