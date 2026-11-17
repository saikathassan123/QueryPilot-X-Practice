export const SALE_STATUSES = ["Pending", "Processing", "Confirmed", "Completed", "Cancelled", "Returned"] as const;
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

export type AnalysisKpis = {
  totalRevenue: number;
  totalOrders: number;
  totalUnitsSold: number;
  totalProductLines: number;
  grossProfit: number;
  grossProfitMargin: number;
  totalDiscounts: number;
  averageOrderValue: number;
  averageCustomerRating: number | null;
};

export type AnalysisSnapshot = AnalysisKpis & {
  periodStart: string;
  periodEnd: string;
  statusDistribution: Record<SaleStatus, number>;
};

export type AnalysisDimension = {
  label: string;
  revenue: number;
  orders: number;
  units: number;
  productLines: number;
  grossProfit: number;
  discounts: number;
  averageRating: number | null;
};

export type DailyPerformance = AnalysisKpis & { date: string };
export type ReportKind = "automatic" | "historical";

export type AnalysisReport = {
  id?: number;
  generationKey?: string;
  generationStatus?: "generated" | "failed";
  pdfStatus?: "not_generated" | "generated" | "failed";
  pdfFilename?: string | null;
  pdfGeneratedAt?: string | null;
  pdfSizeBytes?: number | null;
  pdfError?: string | null;
  reportKind: ReportKind;
  reportingDate: string;
  periodStart: string;
  periodEnd: string;
  comparisonDays: number | null;
  comparisonStart: string | null;
  comparisonEnd: string | null;
  current: AnalysisSnapshot;
  comparisonDailyAverage: AnalysisKpis | null;
  comparison: AnalysisSnapshot | null;
  dailyPerformance: DailyPerformance[];
  productPerformance: AnalysisDimension[];
  categoryPerformance: AnalysisDimension[];
  regionPerformance: AnalysisDimension[];
  genderPerformance: AnalysisDimension[];
  generatedAt: string;
  status: "generated";
};

export interface SalesRepository {
  insertSale(input: SaleInput): SaleRecord;
  listSales(limit?: number): SaleRecord[];
  analyzePeriod(periodStart: string, periodEnd: string, analysisDate?: string): DailyAnalysisResult;
  listNotifications(limit?: number): DailyNotification[];
  getAnalysisSnapshot(periodStart: string, periodEnd: string): AnalysisSnapshot;
  getDailyPerformance(periodStart: string, periodEnd: string): DailyPerformance[];
  getDimensionPerformance(dimension: "product_name" | "category" | "region" | "customer_gender", periodStart: string, periodEnd: string): AnalysisDimension[];
  getFirstSaleDate(): string | null;
  getAnalysisPreference(key: string): string | null;
  setAnalysisPreference(key: string, value: string): void;
  saveAnalysisReport(report: AnalysisReport): AnalysisReport;
  getAnalysisReport(id: number): AnalysisReport | null;
  listAnalysisReports(limit?: number): AnalysisReport[];
  getAnalysisPreferences(): Record<string, string>;
  updateAnalysisReportPdf(id: number, metadata: {
    status: "generated" | "failed";
    filename?: string;
    generatedAt?: string;
    sizeBytes?: number;
    error?: string;
  }): void;
  getAnalysisReportByGenerationKey(generationKey: string): AnalysisReport | null;
}
