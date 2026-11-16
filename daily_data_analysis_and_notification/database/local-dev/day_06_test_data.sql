INSERT INTO daily_sales_orders (
  sale_line_id, order_id, line_number, order_date, customer_name, customer_gender,
  customer_email, customer_phone, product_name, category, region, quantity,
  unit_price, unit_cost, discount_percent, customer_rating, status
) VALUES
  ('day06-001', 'DAY06-001', 1, date('now', '-1 day'), 'Synthetic Day06 A', 'Other', 'day06a@example.test', '+880-0000-060001', 'Backpack', 'Accessories', 'North', 2, 42, 22, 7.5, 4.5, 'Completed'),
  ('day06-001-2', 'DAY06-001', 2, date('now', '-1 day'), 'Synthetic Day06 A', 'Other', 'day06a@example.test', '+880-0000-060001', 'Keychain', 'Accessories', 'North', 3, 5, 1, 0, 4, 'Completed');
