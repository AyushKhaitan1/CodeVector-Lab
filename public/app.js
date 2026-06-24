// State Variables
let currentCursor = null;
let currentCategory = '';
const limit = 20;
let loadedCount = 0;
let isLoading = false;

// DOM Elements
const dbBadge = document.getElementById('db-badge');
const queryLatency = document.getElementById('query-latency');
const currentCursorEl = document.getElementById('current-cursor');
const loadedCountEl = document.getElementById('loaded-count');
const sqlQueryEl = document.getElementById('sql-query');
const productsGrid = document.getElementById('products-grid');
const btnLoadMore = document.getElementById('btn-load-more');
const endMessage = document.getElementById('end-message');
const btnSimulate = document.getElementById('btn-simulate');
const toast = document.getElementById('toast');
const toastTitle = document.getElementById('toast-title');
const toastMessage = document.getElementById('toast-message');
const toastClose = document.querySelector('.toast-close');
const categoryPills = document.querySelectorAll('.cat-pill');

// Category to Tag Class Mapper
function getCategoryTagClass(category) {
  switch (category) {
    case 'Electronics': return 'tag-electronics';
    case 'Clothing': return 'tag-clothing';
    case 'Books': return 'tag-books';
    case 'Home & Kitchen': return 'tag-kitchen';
    case 'Beauty': return 'tag-beauty';
    case 'Sports': return 'tag-sports';
    default: return 'tag-default';
  }
}

// Format ISO string to show exact time with milliseconds
function formatTimestamp(isoString) {
  try {
    const d = new Date(isoString);
    const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${dateStr} @ ${hours}:${minutes}:${seconds}.${ms}`;
  } catch (err) {
    return isoString;
  }
}

// Fetch products from API
async function fetchProducts(append = false) {
  if (isLoading) return;
  isLoading = true;

  // Show loading indicator
  const spinner = btnLoadMore.querySelector('.loading-spinner');
  const btnText = btnLoadMore.querySelector('span');
  spinner.classList.remove('hidden');
  btnText.textContent = append ? 'Loading Next Page...' : 'Loading Products...';
  btnLoadMore.disabled = true;

  try {
    let url = `/api/products?limit=${limit}`;
    if (currentCategory) {
      url += `&category=${encodeURIComponent(currentCategory)}`;
    }
    if (append && currentCursor) {
      url += `&cursor=${encodeURIComponent(currentCursor)}`;
    }

    const response = await fetch(url);
    const resData = await response.json();

    if (!resData.success) {
      throw new Error(resData.error || 'Server error fetching products');
    }

    const { products, next_cursor, has_more, db_type } = resData.data;
    const { query_time_ms, sql_executed } = resData.meta;

    // Update DB Badge
    dbBadge.textContent = db_type;
    if (db_type.includes('PostgreSQL')) {
      dbBadge.className = 'db-badge postgres';
    } else {
      dbBadge.className = 'db-badge sqlite';
    }

    // Update Telemetry Panel
    queryLatency.textContent = query_time_ms.toFixed(2);
    
    currentCursor = next_cursor;
    if (currentCursor) {
      currentCursorEl.textContent = currentCursor;
      
      // Decoded preview on hover
      try {
        const decoded = JSON.parse(atob(currentCursor));
        currentCursorEl.title = `Decoded Cursor:\nTimestamp: ${decoded.created_at}\nID: ${decoded.id}`;
      } catch (e) {
        currentCursorEl.title = currentCursor;
      }
    } else {
      currentCursorEl.textContent = 'None (End of DB)';
      currentCursorEl.title = 'Reached the end of the results.';
    }

    sqlQueryEl.textContent = formatSQL(sql_executed);

    // Clear grid if not appending (i.e. changing category filters)
    if (!append) {
      productsGrid.innerHTML = '';
      loadedCount = 0;
    }

    // Render Cards
    if (products.length === 0 && !append) {
      productsGrid.innerHTML = '<div class="no-products glass">No products found in this category.</div>';
    } else {
      products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
          <div class="product-header">
            <span class="category-tag ${getCategoryTagClass(product.category)}">${product.category}</span>
            <span class="prod-id">#${product.id}</span>
          </div>
          <div class="product-body">
            <h4 class="prod-name" title="${product.name}">${product.name}</h4>
            <div class="prod-price">$${parseFloat(product.price).toFixed(2)}</div>
          </div>
          <div class="product-footer">
            <div class="meta-row">
              <span>Created</span>
              <span class="meta-val">${formatTimestamp(product.created_at)}</span>
            </div>
          </div>
        `;
        productsGrid.appendChild(card);
      });
      loadedCount += products.length;
    }

    loadedCountEl.textContent = loadedCount.toLocaleString();

    // Toggle pagination elements
    if (has_more) {
      btnLoadMore.classList.remove('hidden');
      endMessage.classList.add('hidden');
      btnText.textContent = 'Load Next Page';
    } else {
      btnLoadMore.classList.add('hidden');
      if (loadedCount > 0) {
        endMessage.classList.remove('hidden');
      } else {
        endMessage.classList.add('hidden');
      }
    }

  } catch (err) {
    console.error(err);
    showToast('⚠️ Error', err.message || 'Failed to fetch products');
  } finally {
    isLoading = false;
    spinner.classList.add('hidden');
    btnLoadMore.disabled = false;
  }
}

// Simple SQL formatter for the display console
function formatSQL(sql) {
  return sql
    .replace(/\b(SELECT|FROM|WHERE|AND|OR|ORDER BY|LIMIT)\b/g, '\n$1')
    .trim();
}

// Trigger concurrent insert simulation
async function simulateInsertion() {
  btnSimulate.disabled = true;
  btnSimulate.innerHTML = '<span class="loading-spinner"></span> Simulating...';

  try {
    const response = await fetch('/api/simulate-inserts', { method: 'POST' });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Simulation failed');
    }

    showToast(
      '🚀 Products Injected!',
      `Successfully inserted 50 products at the top of the database. Continue scrolling to observe cursor pagination consistency.`
    );
  } catch (err) {
    console.error(err);
    showToast('❌ Simulation Failed', err.message || 'Could not inject simulation data');
  } finally {
    btnSimulate.disabled = false;
    btnSimulate.innerHTML = '<span class="btn-icon">⚡</span> Inject 50 New Products';
  }
}

// Toast Notification Manager
let toastTimeout;
function showToast(title, message) {
  clearTimeout(toastTimeout);
  
  toastTitle.textContent = title;
  toastMessage.textContent = message;
  toast.classList.remove('hidden');
  
  // Auto-dismiss after 6 seconds
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 6000);
}

// Event Listeners
btnLoadMore.addEventListener('click', () => fetchProducts(true));
btnSimulate.addEventListener('click', simulateInsertion);
toastClose.addEventListener('click', () => toast.classList.add('hidden'));

categoryPills.forEach(pill => {
  pill.addEventListener('click', (e) => {
    // Update active class
    categoryPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');

    // Update state
    currentCategory = pill.dataset.category;
    currentCursor = null; // Reset pagination cursor

    // Fetch fresh records
    fetchProducts(false);
  });
});

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
  fetchProducts(false);
});
