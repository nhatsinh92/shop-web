import { loginSchema } from "./login.schema";

describe("loginSchema", () => {
  it("accepts a valid email and a password", () => {
    expect(loginSchema.safeParse({ email: "a@b.vn", password: "x" }).success).toBe(true);
  });

  it("rejects empty values with Vietnamese messages", () => {
    const result = loginSchema.safeParse({ email: "", password: "" });
    expect(result.success).toBe(false);
    const msgs = result.error?.issues.map((i) => i.message);
    expect(msgs).toContain("Vui lòng nhập email.");
    expect(msgs).toContain("Vui lòng nhập mật khẩu.");
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({ email: "nope", password: "x" });
    expect(result.error?.issues[0]?.message).toBe("Email không hợp lệ.");
  });
});
