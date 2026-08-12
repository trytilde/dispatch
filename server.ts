// The root entrypoint lets Hono own routing on every deployment target.
// The production build creates this artifact before Vercel traces the function.
// @ts-ignore the declaration is generated only as part of the production build
export { default } from "./apps/server/dist/app.js";

export const maxDuration = 300;
