INSERT INTO daily_sales_orders (
  sale_line_id, order_id, line_number, order_date, customer_name, customer_gender,
  customer_email, customer_phone, product_name, category, region, quantity,
  unit_price, unit_cost, discount_percent, customer_rating, status
) VALUES
  ('day07-001', 'DAY07-001', 1, date('now'), 'Synthetic Day07 A', 'Not Specified', 'day07a@example.test', '+880-0000-070001', 'Wireless Keyboard', 'Electronics', 'East', 1, 48, 27, 5, 4, 'Completed'),
  ('day07-002', 'DAY07-002', 1, date('now'), 'Synthetic Day07 B', 'Female', 'day07b@example.test', '+880-0000-070002', 'Planner', 'Stationery', 'South', 2, 13, 5, 0, 5, 'Confirmed');
