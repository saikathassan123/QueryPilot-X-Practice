INSERT INTO daily_sales_orders (
  sale_line_id, order_id, line_number, order_date, customer_name,
  customer_gender, customer_email, customer_phone, product_name, category,
  region, quantity, unit_price, unit_cost, discount_percent, customer_rating, status
) VALUES
  ('demo-365-001', 'DEMO-365-001', 1, date('now', '-364 days'), 'Synthetic Customer 001', 'Female', 'customer001@example.test', '+880-0000-000001', 'Wireless Keyboard', 'Electronics', 'North', 2, 45.00, 25.00, 5, 4.5, 'Completed'),
  ('demo-180-001', 'DEMO-180-001', 1, date('now', '-180 days'), 'Synthetic Customer 002', 'Male', 'customer002@example.test', '+880-0000-000002', 'Office Chair', 'Furniture', 'South', 1, 180.00, 110.00, 10, 4.0, 'Completed'),
  ('demo-90-001', 'DEMO-90-001', 1, date('now', '-90 days'), 'Synthetic Customer 003', 'Other', 'customer003@example.test', '+880-0000-000003', 'Notebook Pack', 'Stationery', 'East', 6, 8.50, 4.00, 0, 3.5, 'Confirmed'),
  ('demo-45-001', 'DEMO-45-001', 1, date('now', '-45 days'), 'Synthetic Customer 004', 'Not Specified', 'customer004@example.test', '+880-0000-000004', 'USB-C Hub', 'Electronics', 'West', 3, 32.00, 18.00, 7.5, 5.0, 'Completed'),
  ('demo-30-001', 'DEMO-30-001', 1, date('now', '-30 days'), 'Synthetic Customer 005', 'Female', 'customer005@example.test', '+880-0000-000005', 'Desk Lamp', 'Furniture', 'North', 2, 28.00, 12.00, 5, 4.0, 'Completed'),
  ('demo-14-001', 'DEMO-14-001', 1, date('now', '-14 days'), 'Synthetic Customer 006', 'Male', 'customer006@example.test', '+880-0000-000006', 'Running Shoes', 'Sports', 'South', 1, 75.00, 42.00, 15, 4.5, 'Returned'),
  ('demo-07-001', 'DEMO-07-001', 1, date('now', '-7 days'), 'Synthetic Customer 007', 'Female', 'customer007@example.test', '+880-0000-000007', 'Water Bottle', 'Sports', 'East', 4, 14.00, 6.00, 0, 4.0, 'Completed'),
  ('demo-07-001-2', 'DEMO-07-001', 2, date('now', '-7 days'), 'Synthetic Customer 007', 'Female', 'customer007@example.test', '+880-0000-000007', 'Fitness Band', 'Electronics', 'East', 1, 55.00, 30.00, 5, 4.0, 'Completed'),
  ('demo-03-001', 'DEMO-03-001', 1, date('now', '-3 days'), 'Synthetic Customer 008', 'Not Specified', 'customer008@example.test', '+880-0000-000008', 'Backpack', 'Accessories', 'West', 2, 40.00, 21.00, 8, 3.0, 'Pending'),
  ('demo-01-001', 'DEMO-01-001', 1, date('now', '-1 day'), 'Synthetic Customer 009', 'Other', 'customer009@example.test', '+880-0000-000009', 'Desk Organizer', 'Stationery', 'North', 5, 11.00, 4.50, 2.5, 4.5, 'Completed');
