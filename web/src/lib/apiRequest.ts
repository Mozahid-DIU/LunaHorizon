/** What the AI routes share: who is asking, and a body read no further than its limit. */
const IPV6_PREFIX_GROUPS = 4;

/**
 * Vercel puts the visitor's address first. An IPv6 visitor holds a whole /64, so the limit
 * counts that block; anything without an address counts as one shared visitor.
 */
export function clientOf(request: Request): string {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return address.includes(":") ? expandIpv6(address).slice(0, IPV6_PREFIX_GROUPS).join(":") : address;
}

/** The 8 groups of an IPv6 address, with "::" filled in, so one /64 always gives one key. */
export function expandIpv6(address: string): string[] {
  const [head, tail] = address.toLowerCase().split("::");
  const front = head ? head.split(":") : [];
  const back = tail === undefined ? [] : tail ? tail.split(":") : [];
  const missing = tail === undefined ? 0 : Math.max(0, 8 - front.length - back.length);
  return [...front, ...Array<string>(missing).fill("0"), ...back].map((group) => group.replace(/^0+(?=.)/, ""));
}

/** Reads at most one byte past the limit, whatever the request claims about its size. */
export async function readCapped(request: Request, maxChars: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxChars) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Only this site's own pages may ask; a browser sends this header and other sites cannot fake it. */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
}
