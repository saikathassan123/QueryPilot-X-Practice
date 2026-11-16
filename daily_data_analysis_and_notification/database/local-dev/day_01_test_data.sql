INSERT INTO daily_sales_orders (
  sale_line_id, order_id, line_number, order_date, customer_name, customer_gender,
  customer_email, customer_phone, product_name, category, region, quantity,
  unit_price, unit_cost, discount_percent, customer_rating, status
) VALUES
  ('day01-001', 'DAY01-001', 1, date('now', '-6 days'), 'Synthetic Day01 A', 'Male', 'day01a@example.test', '+880-0000-010001', 'Mouse', 'Electronics', 'North', 2, 20, 9, 0, 4, 'Completed'),
  ('day01-001-2', 'DAY01-001', 2, date('now', '-6 days'), 'Synthetic Day01 A', 'Male', 'day01a@example.test', '+880-0000-010001', 'Mouse Pad', 'Accessories', 'North', 1, 12, 4, 5, 4, 'Completed');
