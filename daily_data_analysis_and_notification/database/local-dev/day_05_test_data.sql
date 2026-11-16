INSERT INTO daily_sales_orders (
  sale_line_id, order_id, line_number, order_date, customer_name, customer_gender,
  customer_email, customer_phone, product_name, category, region, quantity,
  unit_price, unit_cost, discount_percent, customer_rating, status
) VALUES
  ('day05-001', 'DAY05-001', 1, date('now', '-2 days'), 'Synthetic Day05 A', 'Female', 'day05a@example.test', '+880-0000-050001', 'Water Bottle', 'Sports', 'East', 5, 15, 6, 5, 4, 'Completed'),
  ('day05-002', 'DAY05-002', 1, date('now', '-2 days'), 'Synthetic Day05 B', 'Male', 'day05b@example.test', '+880-0000-050002', 'Pen Set', 'Stationery', 'West', 10, 4, 1, 0, 3, 'Cancelled');
