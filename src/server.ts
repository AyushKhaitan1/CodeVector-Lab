import express from 'express';
import cors from 'cors';
import path from 'path';
import { DBManager, Product } from './db';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize DB Manager
const db = new DBManager();

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../public')));

// Helper to encode cursor to base64
function encodeCursor(createdAt: string, id: number): string {
  const cursorObj = { created_at: createdAt, id };
  return Buffer.from(JSON.stringify(cursorObj)).toString('base64');
}

// Helper to decode cursor from base64
function decodeCursor(cursorStr: string): { created_at: string; id: number } | null {
  try {
    const jsonStr = Buffer.from(cursorStr, 'base64').toString('utf-8');
    return JSON.parse(jsonStr);
  } catch (err) {
    return null;
  }
}

// GET /api/products
// Query parameters:
// - limit: number of items (default 20, max 100)
// - category: filter by category (optional)
// - cursor: base64 encoded cursor of last item (optional)
app.get('/api/products', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const category = req.query.category as string | undefined;
    const cursorStr = req.query.cursor as string | undefined;

    // We query limit + 1 items to determine if there is a next page
    const queryLimit = limit + 1;
    let products: Product[] = [];
    
    // Parse cursor if present
    const cursor = cursorStr ? decodeCursor(cursorStr) : null;

    let sql = '';
    let params: any[] = [];

    const queryStartTime = process.hrtime.bigint();

    if (category) {
      if (cursor) {
        // Category filter + Cursor
        sql = `
          SELECT id, name, category, price, created_at, updated_at 
          FROM products 
          WHERE category = $1 AND (
            created_at < $2 OR (created_at = $3 AND id < $4)
          )
          ORDER BY created_at DESC, id DESC 
          LIMIT $5
        `;
        params = [category, cursor.created_at, cursor.created_at, cursor.id, queryLimit];
      } else {
        // Category filter only (first page)
        sql = `
          SELECT id, name, category, price, created_at, updated_at 
          FROM products 
          WHERE category = $1
          ORDER BY created_at DESC, id DESC 
          LIMIT $2
        `;
        params = [category, queryLimit];
      }
    } else {
      if (cursor) {
        // Global Cursor (no category filter)
        sql = `
          SELECT id, name, category, price, created_at, updated_at 
          FROM products 
          WHERE (
            created_at < $1 OR (created_at = $2 AND id < $3)
          )
          ORDER BY created_at DESC, id DESC 
          LIMIT $4
        `;
        params = [cursor.created_at, cursor.created_at, cursor.id, queryLimit];
      } else {
        // Global first page
        sql = `
          SELECT id, name, category, price, created_at, updated_at 
          FROM products 
          ORDER BY created_at DESC, id DESC 
          LIMIT $1
        `;
        params = [queryLimit];
      }
    }

    products = await db.query<Product>(sql, params);
    
    const queryEndTime = process.hrtime.bigint();
    const queryDurationMs = Number(queryEndTime - queryStartTime) / 1000000;

    // Check if we retrieved more than the requested limit
    const hasMore = products.length > limit;
    
    // If we have more, slice off the extra item we fetched
    const returnedProducts = hasMore ? products.slice(0, limit) : products;
    
    let nextCursor: string | null = null;
    if (hasMore && returnedProducts.length > 0) {
      const lastItem = returnedProducts[returnedProducts.length - 1];
      // Store created_at exactly as it is returned from DB (ISO string)
      nextCursor = encodeCursor(lastItem.created_at, Number(lastItem.id));
    }

    res.json({
      success: true,
      data: {
        products: returnedProducts,
        next_cursor: nextCursor,
        has_more: hasMore,
        db_type: db.isPostgres() ? 'PostgreSQL' : 'SQLite (Local)'
      },
      meta: {
        query_time_ms: parseFloat(queryDurationMs.toFixed(3)),
        limit,
        category: category || null,
        sql_executed: sql.trim().replace(/\s+/g, ' ')
      }
    });
  } catch (err: any) {
    console.error('Error fetching products:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/products
// Creates a single product
app.post('/api/products', async (req, res) => {
  try {
    const { name, category, price } = req.body;
    if (!name || !category || typeof price !== 'number') {
      return res.status(400).json({ success: false, error: 'Missing name, category, or valid price' });
    }

    const nowStr = new Date().toISOString();
    
    const insertSql = `
      INSERT INTO products (name, category, price, created_at, updated_at) 
      VALUES ($1, $2, $3, $4, $5)
    `;
    
    await db.execute(insertSql, [name, category, price, nowStr, nowStr]);

    // Retrieve the newly inserted item
    // In PostgreSQL we could use RETURNING, but to support both SQLite and Postgres easily,
    // we query by name and timestamp or just get the latest inserted ID.
    // In SQLite, db.execute returns info with lastInsertRowid.
    // For a simple unified solution:
    const fetchSql = `
      SELECT * FROM products 
      WHERE name = $1 AND created_at = $2 
      ORDER BY id DESC LIMIT 1
    `;
    const rows = await db.query<Product>(fetchSql, [name, nowStr]);

    res.status(201).json({ success: true, product: rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/simulate-inserts
// Simulates background insertions by creating 50 new products
app.post('/api/simulate-inserts', async (req, res) => {
  try {
    const categories = ['Electronics', 'Clothing', 'Books', 'Home & Kitchen', 'Beauty', 'Sports'];
    const productsToInsert = [];
    const baseTimestamp = Date.now();

    for (let i = 0; i < 50; i++) {
      const category = categories[Math.floor(Math.random() * categories.length)];
      const name = `[SIMULATED] Premium ${category} Item #${Math.floor(Math.random() * 900000) + 100000}`;
      const price = parseFloat((Math.random() * 200 + 5.99).toFixed(2));
      // Give each item a slightly increasing millisecond offset to keep IDs/timestamps sorted
      const timestamp = new Date(baseTimestamp + i).toISOString();

      productsToInsert.push({
        name,
        category,
        price,
        created_at: timestamp,
        updated_at: timestamp
      });
    }

    await db.bulkInsert(productsToInsert);

    res.json({
      success: true,
      message: 'Simulated 50 new product insertions.',
      count: productsToInsert.length
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start the database and server
async function startServer() {
  try {
    await db.init();
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
