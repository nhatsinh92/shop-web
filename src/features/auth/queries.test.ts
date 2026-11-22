import { authKeys, authQueries } from "./queries";

describe("authQueries", () => {
  it("builds keys under authKeys.all", () => {
    expect(authKeys.all).toEqual(["auth"]);
    expect(authKeys.me()).toEqual(["auth", "me"]);
  });

  it("does not persist the me query", () => {
    const options = authQueries.me();
    expect(options.queryKey).toEqual(authKeys.me());
    expect(options.meta?.persist).toBeUndefined();
  });
});
