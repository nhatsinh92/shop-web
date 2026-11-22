import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccountEntry } from "./account-entry";

const BOX = "flex min-h-touch items-center gap-2 rounded-lg px-3 text-sm font-medium";

describe("AccountEntry before the session hint is known", () => {
  it("renders an aria-hidden placeholder without a link, sized like the link", () => {
    const html = renderToString(<AccountEntry />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<a");
    for (const cls of BOX.split(" ")) {
      expect(html).toContain(cls);
    }
  });

  it("shows the user icon inside the link once the hint is known", async () => {
    const { render, screen } = await import("@testing-library/react");
    render(<AccountEntry />);
    const link = screen.getByRole("link", { name: "Đăng nhập" });
    expect(link.querySelector("svg")).not.toBeNull();
  });
});
