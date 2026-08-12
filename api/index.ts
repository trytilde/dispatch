// The production function imports the server's bundled artifact. Vercel's
// tracer otherwise preserves pnpm workspace links that do not survive in the
// Lambda filesystem. The root build creates this file before function tracing.
// @ts-ignore the declaration is generated only as part of the production build
export { default } from "../apps/server/dist/vercel.js";
export const maxDuration = 300;
