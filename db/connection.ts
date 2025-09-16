import { Pool, PoolClient } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

// Create a connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
})

// Helper function to execute queries
export async function query(text: string, params?: any[]): Promise<any> {
  const client = await pool.connect()
  try {
    const result = await client.query(text, params)
    return result
  } finally {
    client.release()
  }
}

// Helper function to get a client for transactions
export async function getClient(): Promise<PoolClient> {
  return await pool.connect()
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  await pool.end()
}