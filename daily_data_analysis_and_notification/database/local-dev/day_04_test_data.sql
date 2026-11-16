INSERT INTO daily_sales_orders (
  sale_line_id, order_id, line_number, order_date, customer_name, customer_gender,
  customer_email, customer_phone, product_name, category, region, quantity,
  unit_price, unit_cost, discount_percent, customer_rating, status
) VALUES
  ('day04-001', 'DAY04-001', 1, date('now', '-3 days'), 'Synthetic Day04 A', 'Male', 'day04a@example.test', '+880-0000-040001', 'Headphones', 'Electronics', 'South', 1, 65, 35, 12.5, 4.5, 'Completed'),
  ('day04-001-2', 'DAY04-001', 2, date('now', '-3 days'), 'Synthetic Day04 A', 'Male', 'day04a@example.test', '+880-0000-040001', 'Cable', 'Electronics', 'South', 2, 8, 2, 0, 4, 'Completed');
