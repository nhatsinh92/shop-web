/**
 * Returns `value` only for a same-origin relative path (exactly one leading `/`, query and hash
 * allowed); anything else becomes `/`. Prevents open redirects through the `next` parameter.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  // Control characters (tab, newline) are stripped by URL parsers and can hide a second slash.
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return "/";
  return value;
}
