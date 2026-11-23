/** HttpOnly cookie that carries the access token; read on the server only. */
export const ACCESS_COOKIE = "access_token";

/** Non-httpOnly hint cookie (`logged_in=1`): a session may exist; never used for authorisation. */
export const SESSION_HINT_COOKIE = "logged_in";
