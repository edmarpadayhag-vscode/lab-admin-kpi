import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// max: 1 is important for serverless environments (Vercel) to avoid
// exhausting Aurora's connection limit across concurrent function instances.
const client = postgres(process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(client, { schema });
