import { Pool } from 'pg';
import Database from 'better-sqlite3';
import * as dotenv from 'dotenv';

dotenv.config();

export interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  created_at: string; // ISO string
  updated_at: string; // ISO string
}

export class DBManager {
  private pgPool: Pool | null = null;
  private sqliteDb: any = null;
  private isPg: boolean = false;

  constructor() {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
      console.log('Database URL detected. Connecting to PostgreSQL...');
      this.pgPool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false } // Required for Neon/Supabase on free tiers
      });
      this.isPg = true;
    } else {
      console.log('No PostgreSQL URL found. Using local SQLite database (products.db)...');
      this.sqliteDb = new Database('products.db');
      this.isPg = false;
    }
  }

  public isPostgres(): boolean {
    return this.isPg;
  }

  public async init(): Promise<void> {
    if (this.isPg && this.pgPool) {
      // Postgres schema creation
      await this.pgPool.query(`
        CREATE TABLE IF NOT EXISTS products (
          id BIGSERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          category VARCHAR(100) NOT NULL,
          price DECIMAL(10, 2) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
      `);

      // Create composite indexes for fast cursor pagination
      await this.pgPool.query(`
        CREATE INDEX IF NOT EXISTS idx_products_created_id 
        ON products (created_at DESC, id DESC);
      `);

      await this.pgPool.query(`
        CREATE INDEX IF NOT EXISTS idx_products_category_created_id 
        ON products (category, created_at DESC, id DESC);
      `);
      console.log('PostgreSQL database initialized with schema and indexes.');
    } else if (this.sqliteDb) {
      // SQLite schema creation
      this.sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          price REAL NOT NULL,
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now') || 'Z') NOT NULL,
          updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now') || 'Z') NOT NULL
        );
      `);

      // Create composite indexes for SQLite
      this.sqliteDb.exec(`
        CREATE INDEX IF NOT EXISTS idx_products_created_id 
        ON products (created_at DESC, id DESC);
      `);

      this.sqliteDb.exec(`
        CREATE INDEX IF NOT EXISTS idx_products_category_created_id 
        ON products (category, created_at DESC, id DESC);
      `);
      console.log('SQLite database initialized with schema and indexes.');
    }
  }

  // Unified query method. Translates Postgres parameterized queries ($1, $2, etc.) to SQLite (?) if needed.
  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (this.isPg && this.pgPool) {
      const res = await this.pgPool.query(sql, params);
      return res.rows as T[];
    } else if (this.sqliteDb) {
      // Replace Postgres-style parameter placeholders ($1, $2) with SQLite (?)
      const sqliteSql = sql.replace(/\$\d+/g, '?');
      const stmt = this.sqliteDb.prepare(sqliteSql);
      
      // Convert standard Date objects or UUIDs to string representation if needed
      const mappedParams = params.map(p => {
        if (p instanceof Date) return p.toISOString();
        return p;
      });

      return stmt.all(mappedParams) as T[];
    }
    throw new Error('Database not initialized');
  }

  public async execute(sql: string, params: any[] = []): Promise<any> {
    if (this.isPg && this.pgPool) {
      const res = await this.pgPool.query(sql, params);
      return res;
    } else if (this.sqliteDb) {
      const sqliteSql = sql.replace(/\$\d+/g, '?');
      const stmt = this.sqliteDb.prepare(sqliteSql);
      const mappedParams = params.map(p => {
        if (p instanceof Date) return p.toISOString();
        return p;
      });
      return stmt.run(mappedParams);
    }
    throw new Error('Database not initialized');
  }

  // High performance bulk insertion for seeding
  public async bulkInsert(products: Array<{ name: string, category: string, price: number, created_at: string, updated_at: string }>): Promise<void> {
    if (this.isPg && this.pgPool) {
      // For Postgres, we can do a multi-row INSERT in chunks
      // This is simpler and very fast. Let's do chunks of 5000 rows.
      const chunkSize = 5000;
      for (let i = 0; i < products.length; i += chunkSize) {
        const chunk = products.slice(i, i + chunkSize);
        const valueStrings: string[] = [];
        const values: any[] = [];
        
        chunk.forEach((p, index) => {
          const baseIndex = index * 5;
          valueStrings.push(`($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5})`);
          values.push(p.name, p.category, p.price, p.created_at, p.updated_at);
        });

        const sql = `INSERT INTO products (name, category, price, created_at, updated_at) VALUES ${valueStrings.join(', ')}`;
        await this.pgPool.query(sql, values);
      }
    } else if (this.sqliteDb) {
      // For SQLite, running a transaction with a prepared statement is extremely fast (under 1.5 seconds for 200k)
      const insertStmt = this.sqliteDb.prepare(`
        INSERT INTO products (name, category, price, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const transaction = this.sqliteDb.transaction((items: any[]) => {
        for (const item of items) {
          insertStmt.run(item.name, item.category, item.price, item.created_at, item.updated_at);
        }
      });
      
      transaction(products);
    }
  }

  public async close(): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.end();
    }
    if (this.sqliteDb) {
      this.sqliteDb.close();
    }
  }
}
