import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { server } from "@mocks/node";

import { CheckoutFormHost } from "./checkout-form-host";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

describe("CheckoutFormHost", () => {
  it("prefills the name from the current user's displayName", async () => {
    server.use(
      http.get("*/api/auth/me", () =>
        HttpResponse.json({ id: "u1", email: "an@example.com", displayName: "Nguyễn An" }),
      ),
    );
    const res = await fetch("http://localhost/api/checkout/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ sku: "SKU-ANC-PRO-BLK", quantity: 1 }] }),
    });
    const { id } = await res.json();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CheckoutFormHost reservationId={id} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText("Họ và tên")).toHaveValue("Nguyễn An"));
  });
});
