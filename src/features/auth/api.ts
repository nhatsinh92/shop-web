import { api, unwrap } from "@/lib/api";

import type { CoreComponents } from "@/lib/api";

export type UserProfile = CoreComponents["schemas"]["UserProfile"];
export type LoginRequest = CoreComponents["schemas"]["LoginRequest"];

/** Browser call: goes to the gateway through /api/*, never through a Next.js route handler. */
export async function getMe(signal?: AbortSignal): Promise<UserProfile> {
  return unwrap(await api.GET("/api/auth/me", { signal }));
}

export async function login(body: LoginRequest): Promise<UserProfile> {
  return unwrap(await api.POST("/api/auth/login", { body }));
}
