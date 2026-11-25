import { shippingAddressSchema } from "./checkout.schema";

const valid = {
  fullName: "Nguyễn Văn A",
  phone: "0901234567",
  line1: "12 Lê Lợi",
  ward: "Bến Nghé",
  province: "TP. Hồ Chí Minh",
};

const messages = (input: unknown) =>
  shippingAddressSchema
    .safeParse(input)
    .error?.issues.map((i) => `${i.path.join(".")}: ${i.message}`);

describe("shippingAddressSchema", () => {
  it("accepts a valid address with optional district and note", () => {
    expect(shippingAddressSchema.safeParse(valid).success).toBe(true);
    expect(
      shippingAddressSchema.safeParse({ ...valid, district: "Quận 1", note: "Gọi trước" }).success,
    ).toBe(true);
    expect(shippingAddressSchema.safeParse({ ...valid, phone: "+84901234567" }).success).toBe(true);
  });

  it("rejects an invalid phone with the Vietnamese message", () => {
    for (const phone of ["12345", "0201234567", "090123456", "09012345678"]) {
      expect(messages({ ...valid, phone })).toContain("phone: Số điện thoại không hợp lệ");
    }
  });

  it("requires fullName, line1, ward and province", () => {
    const result = messages({ ...valid, fullName: "", line1: " ", ward: "", province: "" });
    expect(result).toHaveLength(4);
    expect(result?.some((m) => m.startsWith("fullName"))).toBe(true);
    expect(result?.some((m) => m.startsWith("province"))).toBe(true);
  });

  it("enforces the contract lengths and the 500 character note", () => {
    expect(messages({ ...valid, fullName: "a".repeat(101) })).toHaveLength(1);
    expect(messages({ ...valid, line1: "a".repeat(201) })).toHaveLength(1);
    expect(messages({ ...valid, district: "a".repeat(101) })).toHaveLength(1);
    expect(messages({ ...valid, note: "a".repeat(501) })).toHaveLength(1);
    expect(shippingAddressSchema.safeParse({ ...valid, note: "a".repeat(500) }).success).toBe(true);
  });
});
