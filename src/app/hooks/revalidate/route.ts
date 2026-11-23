import { handleRevalidate } from "@/features/revalidation";

export async function POST(request: Request): Promise<Response> {
  return handleRevalidate(request);
}
