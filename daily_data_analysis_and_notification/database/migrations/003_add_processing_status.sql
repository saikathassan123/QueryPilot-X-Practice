CREATE TABLE daily_sales_orders_with_processing (
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
    CHECK (status IN ('Pending', 'Processing', 'Confirmed', 'Completed', 'Cancelled', 'Returned')),
  inserted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (order_id, line_number)
);

INSERT INTO daily_sales_orders_with_processing (
  sale_line_id, order_id, line_number, order_date, customer_name, customer_gender,
  customer_email, customer_phone, product_name, category, region, quantity,
  unit_price, unit_cost, discount_percent, customer_rating, status, inserted_at
)
SELECT sale_line_id, order_id, line_number, order_date, customer_name, customer_gender,
  customer_email, customer_phone, product_name, category, region, quantity,
  unit_price, unit_cost, discount_percent, customer_rating, status, inserted_at
FROM daily_sales_orders;

DROP TABLE daily_sales_orders;
ALTER TABLE daily_sales_orders_with_processing RENAME TO daily_sales_orders;

CREATE INDEX IF NOT EXISTS idx_daily_sales_orders_order_date
  ON daily_sales_orders(order_date);

CREATE INDEX IF NOT EXISTS idx_daily_sales_orders_status
  ON daily_sales_orders(status);
