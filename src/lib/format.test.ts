import { formatVnd } from "./format";

describe("formatVnd", () => {
  it("formats 890000 as 890.000₫", () => {
    expect(formatVnd(890000)).toBe("890.000₫");
  });

  it("formats 1790000 as 1.790.000₫", () => {
    expect(formatVnd(1790000)).toBe("1.790.000₫");
  });

  it("formats 0 as 0₫", () => {
    expect(formatVnd(0)).toBe("0₫");
  });

  it("leaves amounts below one thousand ungrouped", () => {
    expect(formatVnd(500)).toBe("500₫");
  });
});
