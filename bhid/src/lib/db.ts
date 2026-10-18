// creating the db connection to the database using the provided configuration.
// The connection is established using the specified database driver and connection parameters.
// Once the connection is successful, it can be used to perform
// various database operations such as querying, inserting, updating, and deleting records.


import "server-only";

import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const pool = new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: {
    rejectUnauthorized: true,
  },
});

export default pool;
