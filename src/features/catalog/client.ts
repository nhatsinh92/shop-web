// Client-safe entry of the catalog feature: only what client components in app/ need.
// Never re-export anything that reaches catalog.server.ts or "server-only".
export { useProductSelection } from "./components/purchase-panel";
