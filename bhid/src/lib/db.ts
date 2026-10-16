// creating the db connection to the database using the provided configuration.
// The connection is established using the specified database driver and connection parameters.
// Once the connection is successful, it can be used to perform
// various database operations such as querying, inserting, updating, and deleting records.

import { pool } from 'pg';

const pool = new pool({
    
  user: process.env.DB_USER,
  host: process.env.DB_HOST,