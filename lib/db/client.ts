/**
 * lib/db/client.ts
 *
 * Neon serverless Postgres client initialized via Drizzle ORM.
 * As specified in Section 5.1 and 13.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { getConfig } from "../config";

let dbInstance: NeonHttpDatabase<typeof schema> | null = null;

export function getDb(databaseUrl?: string): NeonHttpDatabase<typeof schema> {
  const url = databaseUrl || getConfig().DATABASE_URL;
  if (!dbInstance || databaseUrl) {
    const client = neon(url);
    const db = drizzle(client, { schema });
    if (!databaseUrl) {
      dbInstance = db;
    }
    return db;
  }
  return dbInstance;
}
