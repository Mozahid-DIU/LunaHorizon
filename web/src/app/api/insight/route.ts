import { createInsightService, MAX_BODY_CHARS } from "@/lib/insightService";

const service = createInsightService({ apiKey: process.env.GROQ_API_KEY });
const IPV6_PREFIX_GROUPS = 4;

/**
 * Vercel puts the visitor's address first. An IPv6 visitor holds a whole /64, so the limit
 * counts that block; anything without an address counts as one shared visitor.
 */
function clientOf(request: Request): string {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return address.includes(":") ? address.split(":").slice(0, IPV6_PREFIX_GROUPS).join(":") : address;
}

/** Reads at most one byte past the limit, whatever the request claims about its size. */
async function readCapped(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_CHARS) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const refuse = (status: number) => Response.json({ source: "rules", reason: "invalid" }, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  // only this site's own pages may ask; a browser sends this header and other sites cannot fake it
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return refuse(403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return refuse(415);

  const body = await readCapped(request);
  if (body === null) return refuse(413);
  const { status, reply } = await service.handle(body, clientOf(request));
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (status === 429) headers["retry-after"] = "60";
  return Response.json(reply, { status, headers });
}
