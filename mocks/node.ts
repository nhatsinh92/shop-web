import { setupServer } from "msw/node";

import { handlers } from "./handlers";

/** MSW server for Vitest (see vitest.setup.ts). Override per test with server.use(...). */
export const server = setupServer(...handlers);
