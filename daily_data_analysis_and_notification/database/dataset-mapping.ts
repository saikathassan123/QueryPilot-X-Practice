export type DatasetMapping = {
  orderId: string;
  orderDate: string;
  product?: string;
  category?: string;
  quantity?: string;
  revenue?: string;
  cost?: string;
  profit?: string;
  discount?: string;
  status?: string;
  gender?: string;
  region?: string;
  rating?: string;
};

const aliases: Record<keyof DatasetMapping, string[]> = {
  orderId: ["order_id", "orderid", "id", "invoice_id", "transaction_id", "sale_id", "order_no", "order_number", "tx_id", "receipt_id", "bill_no"],
  orderDate: ["order_date", "orderdate", "date", "sale_date", "created_at", "transaction_date", "invoice_date", "ordered_at", "purchased_at", "timestamp", "order_time"],
  product: ["product_name", "product", "item_name", "item", "sku", "title", "product_title", "name"],
  category: ["category", "product_category", "item_category", "department", "type", "group"],
  quantity: ["quantity", "qty", "units", "units_sold", "item_quantity", "order_quantity", "count"],
  revenue: ["total_revenue", "revenue", "sales", "amount", "total_amount", "net_sales", "total_price", "total", "unit_price", "price", "subtotal", "grand_total", "net_amount", "gross_total", "sale_amount", "order_total"],
  cost: ["unit_cost", "cost", "total_cost", "item_cost", "cogs", "cost_price", "purchase_price", "buying_price"],
  profit: ["gross_profit", "profit", "net_profit", "total_profit", "earnings"],
  discount: ["discount_amount", "discount", "discount_percent", "discount_rate", "discount_pct"],
  status: ["status", "order_status", "sale_status", "payment_status", "fulfillment_status"],
  gender: ["customer_gender", "gender", "sex"],
  region: ["region", "area", "location", "customer_region", "city", "state", "country", "zone"],
  rating: ["customer_rating", "rating", "review_rating", "score", "stars"]
};

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type DatasetTable = { name: string; columns: string[] };

export function detectDatasetColumns(table: DatasetTable): Partial<DatasetMapping> {
  const columns = new Map<string, string>(table.columns.map(column => [normalized(column), column]));
  const result: Partial<DatasetMapping> = {};
  for (const key of Object.keys(aliases) as Array<keyof DatasetMapping>) {
    const match = aliases[key].map(normalized).map(alias => columns.get(alias)).find(Boolean);
    if (match) result[key] = match;
  }
  return result;
}

export function suggestDatasetMapping(table: DatasetTable, overrides: Partial<DatasetMapping> = {}): DatasetMapping {
  const result: Partial<DatasetMapping> = { ...detectDatasetColumns(table) };
  for (const [key, value] of Object.entries(overrides) as Array<[keyof DatasetMapping, string | undefined]>) {
    if (typeof value === "string" && value.trim()) {
      result[key] = value.trim();
    }
  }
  if (!result.orderId || !result.orderDate) {
    throw new Error(`Select a table with order ID and order date columns. Available columns: ${table.columns.join(", ")}`);
  }
  return result as DatasetMapping;
}

export function availableMetricsForMapping(mapping: Partial<DatasetMapping>): string[] {
  const hasRevenue = Boolean(mapping.revenue);
  const hasCostOrProfit = Boolean(mapping.profit || (mapping.cost && (hasRevenue || normalized(mapping.cost).includes("profit"))));
  return [
    "totalOrders",
    "totalProductLines",
    ...(mapping.quantity ? ["totalUnitsSold"] : []),
    ...(hasRevenue ? ["totalRevenue", "averageOrderValue"] : []),
    ...(hasCostOrProfit ? ["grossProfit"] : []),
    ...(hasRevenue && hasCostOrProfit ? ["grossProfitMargin"] : []),
    ...(mapping.discount ? ["totalDiscounts"] : []),
    ...(mapping.rating ? ["averageCustomerRating"] : [])
  ];
}

