CREATE TABLE IF NOT EXISTS daily_sales_orders (
  sale_line_id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  order_date TEXT NOT NULL CHECK (length(order_date) = 10 AND date(order_date) = order_date),
  customer_name TEXT NOT NULL CHECK (length(trim(customer_name)) > 0),
  customer_gender TEXT NOT NULL DEFAULT 'Not Specified'
    CHECK (customer_gender IN ('Male', 'Female', 'Other', 'Not Specified')),
  customer_email TEXT NOT NULL CHECK (length(trim(customer_email)) > 0),
  customer_phone TEXT NOT NULL CHECK (length(trim(customer_phone)) > 0),
  product_name TEXT NOT NULL CHECK (length(trim(product_name)) > 0),
  category TEXT NOT NULL CHECK (length(trim(category)) > 0),
  region TEXT NOT NULL CHECK (length(trim(region)) > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  unit_cost REAL NOT NULL CHECK (unit_cost >= 0 AND unit_cost <= unit_price),
  discount_percent REAL NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  gross_amount REAL GENERATED ALWAYS AS (ROUND(quantity * unit_price, 2)) STORED,
  discount_amount REAL GENERATED ALWAYS AS (ROUND(quantity * unit_price * discount_percent / 100.0, 2)) STORED,
  total_revenue REAL GENERATED ALWAYS AS (ROUND(quantity * unit_price - (quantity * unit_price * discount_percent / 100.0), 2)) STORED,
  gross_profit REAL GENERATED ALWAYS AS (ROUND((quantity * unit_price - (quantity * unit_price * discount_percent / 100.0)) - (quantity * unit_cost), 2)) STORED,
  customer_rating REAL CHECK (customer_rating IS NULL OR (customer_rating >= 0 AND customer_rating <= 5)),
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Confirmed', 'Completed', 'Cancelled', 'Returned')),
  inserted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (order_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_daily_sales_orders_order_date
  ON daily_sales_orders(order_date);

CREATE INDEX IF NOT EXISTS idx_daily_sales_orders_status
  ON daily_sales_orders(status);

CREATE TABLE IF NOT EXISTS daily_analysis_results (
  analysis_date TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  order_count INTEGER NOT NULL CHECK (order_count >= 0),
  line_count INTEGER NOT NULL CHECK (line_count >= 0),
  total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
  total_revenue REAL NOT NULL CHECK (total_revenue >= 0),
  total_gross_profit REAL NOT NULL,
  average_order_value REAL NOT NULL CHECK (average_order_value >= 0),
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (analysis_date, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS daily_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_date TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning')),
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (analysis_date, notification_type)
);
