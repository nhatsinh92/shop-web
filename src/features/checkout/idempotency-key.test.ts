import { clearKey, hashBody, keyForRequest } from "./idempotency-key";

const ID = "7d9f1c2e-0000-4000-8000-000000000001";

describe("idempotency key", () => {
  beforeEach(() => sessionStorage.clear());

  it("makes a UUID with crypto.randomUUID and stores it under the reservation id with a body hash", () => {
    const spy = vi.spyOn(crypto, "randomUUID");
    const key = keyForRequest(ID, { a: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(sessionStorage.getItem(`checkout:idempotency:${ID}`)!)).toEqual({
      key,
      hash: hashBody({ a: 1 }),
    });
    spy.mockRestore();
  });

  it("returns the same key for the same body (retry or reload)", () => {
    expect(keyForRequest(ID, { a: 1 })).toBe(keyForRequest(ID, { a: 1 }));
  });

  it("makes a new key when the body differs from the stored hash", () => {
    const first = keyForRequest(ID, { phone: "0901234567" });
    expect(keyForRequest(ID, { phone: "0907654321" })).not.toBe(first);
  });

  it("makes a new key for a new reservation", () => {
    expect(keyForRequest(ID, { a: 1 })).not.toBe(keyForRequest("other", { a: 1 }));
  });

  it("makes a new key after clearKey and removes the entry", () => {
    const first = keyForRequest(ID, { a: 1 });
    clearKey(ID);
    expect(sessionStorage.getItem(`checkout:idempotency:${ID}`)).toBeNull();
    expect(keyForRequest(ID, { a: 1 })).not.toBe(first);
  });

  it("ignores a corrupt entry and works when storage throws", () => {
    sessionStorage.setItem(`checkout:idempotency:${ID}`, "{nope");
    expect(keyForRequest(ID, 1)).toMatch(/^[0-9a-f-]{36}$/);
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(keyForRequest(ID, 2)).toMatch(/^[0-9a-f-]{36}$/);
    expect(() => clearKey(ID)).not.toThrow();
    set.mockRestore();
    remove.mockRestore();
  });
});
