import { revalidateTag } from "next/cache";

import { revalidateBodySchema } from "./revalidate.schema";
import { verifySignature } from "./signature";

function problem(status: number, title: string, code: string): Response {
  return new Response(JSON.stringify({ type: "about:blank", title, status, code }), {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

/**
 * Handles `POST /hooks/revalidate` from shop-api. Without `REVALIDATE_SECRET` the route does not
 * exist (404). Everything is checked before any tag is revalidated (all or nothing).
 */
export async function handleRevalidate(request: Request): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return new Response(null, { status: 404 });

  const rawBody = await request.text();
  if (!verifySignature(request.headers.get("x-shop-signature"), rawBody, secret)) {
    return problem(401, "Invalid signature", "REVALIDATE_SIGNATURE_INVALID");
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return problem(400, "Validation failed", "VALIDATION_FAILED");
  }
  const parsed = revalidateBodySchema.safeParse(json);
  if (!parsed.success) return problem(400, "Validation failed", "VALIDATION_FAILED");

  for (const tag of new Set(parsed.data.tags)) {
    revalidateTag(tag, { expire: 0 });
  }
  return new Response(null, { status: 204 });
}
