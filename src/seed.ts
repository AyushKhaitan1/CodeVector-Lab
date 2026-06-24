import { DBManager } from './db';

const CATEGORIES = ['Electronics', 'Clothing', 'Books', 'Home & Kitchen', 'Beauty', 'Sports'];

const NAME_COMPONENTS: Record<string, { adj: string[]; noun: string[] }> = {
  'Electronics': {
    adj: ['Wireless', 'Ultra', 'Pro', 'Smart', 'Quantum', 'Aero', 'Nova', 'Cyber', 'Sonic', 'Infinity'],
    noun: ['Earbuds', 'Smartwatch', 'Charger', 'Speaker', 'Keyboard', 'Mouse', 'Monitor', 'Tablet', 'Webcam', 'Router']
  },
  'Clothing': {
    adj: ['Classic', 'Comfort Fit', 'Breathable', 'Athletic', 'Urban', 'Vintage', 'Waterproof', 'Thermal', 'Eco-friendly', 'Luxe'],
    noun: ['T-Shirt', 'Hoodie', 'Jacket', 'Sneakers', 'Joggers', 'Socks', 'Cap', 'Shorts', 'Sweater', 'Jeans']
  },
  'Books': {
    adj: ['The Ultimate Guide to', 'Mastering', 'History of', 'Secrets of', 'Introduction to', 'The Art of', 'Beyond', 'Advanced', 'Chronicles of', 'Tales of'],
    noun: ['Programming', 'Machine Learning', 'Productivity', 'Design', 'Architecture', 'Cooking', 'Philosophy', 'Economics', 'Astrophysics', 'Psychology']
  },
  'Home & Kitchen': {
    adj: ['Ergonomic', 'Stainless Steel', 'Automatic', 'Compact', 'Precision', 'Eco-Clean', 'Modular', 'Electric', 'Ceramic', 'Heavy Duty'],
    noun: ['Blender', 'Coffee Maker', 'Air Fryer', 'Knife Set', 'Organizer', 'Pan', 'Mug', 'Scale', 'Toaster', 'Kettle']
  },
  'Beauty': {
    adj: ['Hydrating', 'Organic', 'Nourishing', 'Gentle', 'Revitalizing', 'Glowing', 'Mineral', 'Calming', 'Anti-Aging', 'Vegan'],
    noun: ['Serum', 'Moisturizer', 'Cleanser', 'Sunscreen', 'Face Mask', 'Lip Balm', 'Shampoo', 'Conditioner', 'Body Wash', 'Exfoliator']
  },
  'Sports': {
    adj: ['High-Performance', 'Heavy-Duty', 'Adjustable', 'Ultra-Light', 'Pro-Grip', 'All-Weather', 'Ergonomic', 'Reflective', 'Shock-Absorbing', 'Flex'],
    noun: ['Dumbbells', 'Yoga Mat', 'Water Bottle', 'Resistance Bands', 'Jump Rope', 'Backpack', 'Running Shoes', 'Goggles', 'Towel', 'Gloves']
  }
};

function generateProductName(category: string, index: number): string {
  const components = NAME_COMPONENTS[category];
  const adj = components.adj[index % components.adj.length];
  const noun = components.noun[Math.floor(index / components.adj.length) % components.noun.length];
  // Add a unique identifier suffix to avoid complete duplicates
  return `${adj} ${noun} #${100000 + index}`;
}

async function seed() {
  console.log('Starting seed process...');
  const startTime = Date.now();

  const db = new DBManager();
  await db.init();

  console.log('Clearing existing products...');
  await db.execute('DELETE FROM products');
  
  // SQLite vacuum to reset auto-increment IDs and reclaim space
  if (!db.isPostgres()) {
    try {
      await db.execute('DELETE FROM sqlite_sequence WHERE name = "products"');
      await db.execute('VACUUM');
    } catch (err) {
      // Ignored if table sequence doesn't exist yet
    }
  }

  const TOTAL_PRODUCTS = 200000;
  const products: any[] = [];
  const now = Date.now();

  console.log(`Generating ${TOTAL_PRODUCTS} products in memory...`);
  
  for (let i = 0; i < TOTAL_PRODUCTS; i++) {
    // Distribute categories evenly
    const category = CATEGORIES[i % CATEGORIES.length];
    const name = generateProductName(category, i);
    // Price between $5.00 and $1004.99
    const price = parseFloat((5.00 + (i * 0.005) % 1000).toFixed(2));
    
    // Spread created_at times by 10 seconds, going backwards in time
    // Product 0 is the newest (current time), product 199999 is the oldest (approx 23 days ago)
    const createdAtTime = now - i * 10000;
    const createdAt = new Date(createdAtTime).toISOString();
    
    products.push({
      name,
      category,
      price,
      created_at: createdAt,
      updated_at: createdAt
    });
  }

  console.log(`Inserting products into database (using chunks for optimization)...`);
  const insertStart = Date.now();
  await db.bulkInsert(products);
  const insertDuration = (Date.now() - insertStart) / 1000;

  console.log(`Successfully inserted ${TOTAL_PRODUCTS} products in ${insertDuration.toFixed(2)} seconds.`);
  
  // Verify row count
  const countResult = await db.query('SELECT COUNT(*) as count FROM products');
  console.log(`Total rows in products table: ${countResult[0].count}`);

  await db.close();
  const totalDuration = (Date.now() - startTime) / 1000;
  console.log(`Seed script completed successfully in ${totalDuration.toFixed(2)} seconds.`);
}

seed().catch(err => {
  console.error('Error during seeding:', err);
  process.exit(1);
});
