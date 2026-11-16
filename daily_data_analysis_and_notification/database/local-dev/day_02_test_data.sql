INSERT INTO daily_sales_orders (
  sale_line_id, order_id, line_number, order_date, customer_name, customer_gender,
  customer_email, customer_phone, product_name, category, region, quantity,
  unit_price, unit_cost, discount_percent, customer_rating, status
) VALUES
  ('day02-001', 'DAY02-001', 1, date('now', '-5 days'), 'Synthetic Day02 A', 'Female', 'day02a@example.test', '+880-0000-020001', 'T-Shirt', 'Apparel', 'South', 3, 24, 11, 10, 4.5, 'Completed'),
  ('day02-002', 'DAY02-002', 1, date('now', '-5 days'), 'Synthetic Day02 B', 'Other', 'day02b@example.test', '+880-0000-020002', 'Notebook', 'Stationery', 'East', 4, 6, 2, 0, 3.5, 'Confirmed');
