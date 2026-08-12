import { migrate } from "./migrations.js";

await migrate();
console.log("OpenBot database migrations are current");
