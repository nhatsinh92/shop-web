import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";

/** MSW worker for local mock mode (NEXT_PUBLIC_API_MOCKING=enabled). */
export const worker = setupWorker(...handlers);
