export const SALE_STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled", "Returned"] as const;
export const CUSTOMER_GENDERS = ["Male", "Female", "Other", "Not Specified"] as const;

export type SaleStatus = (typeof SALE_STATUSES)[number];
export type CustomerGender = (typeof CUSTOMER_GENDERS)[number];

export type SaleInput = {
  saleLineId?: string;
  orderId: string;
  lineNumber: number;
  orderDate: string;
  customerName: string;
  customerGender?: CustomerGender;
  customerEmail: string;
  customerPhone: string;
  productName: string;
  category: string;
  region: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discountPercent?: number;
  customerRating?: number | null;
  status?: SaleStatus;
};

export type SaleRecord = SaleInput & {
  saleLineId: string;
  customerGender: CustomerGender;
  discountPercent: number;
  customerRating: number | null;
  status: SaleStatus;
  grossAmount: number;
  discountAmount: number;
  totalRevenue: number;
  grossProfit: number;
  insertedAt: string;
};

export type DailyAnalysisResult = {
  analysisDate: string;
  periodStart: string;
  periodEnd: string;
  orderCount: number;
  lineCount: number;
  totalQuantity: number;
  totalRevenue: number;
  totalGrossProfit: number;
  averageOrderValue: number;
  generatedAt: string;
};

export type DailyNotification = {
  id: number;
  analysisDate: string;
  notificationType: string;
  message: string;
  severity: "info" | "warning";
  isRead: boolean;
  createdAt: string;
};

export interface SalesRepository {
  insertSale(input: SaleInput): SaleRecord;
  listSales(limit?: number): SaleRecord[];
  analyzePeriod(periodStart: string, periodEnd: string, analysisDate?: string): DailyAnalysisResult;
  listNotifications(limit?: number): DailyNotification[];
}
