INSERT INTO daily_sales_orders (
  sale_line_id, order_id, line_number, order_date, customer_name, customer_gender,
  customer_email, customer_phone, product_name, category, region, quantity,
  unit_price, unit_cost, discount_percent, customer_rating, status
) VALUES
  ('day03-001', 'DAY03-001', 1, date('now', '-4 days'), 'Synthetic Day03 A', 'Female', 'day03a@example.test', '+880-0000-030001', 'Desk Lamp', 'Furniture', 'West', 2, 30, 14, 5, 4, 'Completed'),
  ('day03-002', 'DAY03-002', 1, date('now', '-4 days'), 'Synthetic Day03 B', 'Not Specified', 'day03b@example.test', '+880-0000-030002', 'Yoga Mat', 'Sports', 'North', 1, 35, 18, 0, 5, 'Pending');
