import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/session";
import { CUSTOMER_GENDERS, SALE_STATUSES, type SaleInput } from "./types";

export function developmentOnly() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Local development data is disabled outside development mode." }, { status: 404 });
  }
  return null;
}

export async function requireDailyAnalysisAccess(request: Request, protectOrigin = false) {
  const unavailable = developmentOnly();
  if (unavailable) return unavailable;
  if (protectOrigin && !sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  return null;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function parseSaleInput(body: unknown): SaleInput {
  if (!body || typeof body !== "object") throw new Error("A JSON object is required.");
  const value = body as Record<string, unknown>;
  const requiredStrings = ["orderId", "orderDate", "customerName", "customerEmail", "customerPhone", "productName", "category", "region"];
  for (const field of requiredStrings) {
    if (typeof value[field] !== "string" || !value[field].trim()) throw new Error(`${field} is required.`);
  }
  if (!isDate(value.orderDate)) throw new Error("orderDate must use YYYY-MM-DD.");
  if (!Number.isInteger(value.lineNumber) || Number(value.lineNumber) < 1) throw new Error("lineNumber must be a positive integer.");
  if (!Number.isInteger(value.quantity) || Number(value.quantity) < 1) throw new Error("quantity must be a positive integer.");
  for (const field of ["unitPrice", "unitCost"]) {
    if (typeof value[field] !== "number" || !Number.isFinite(value[field]) || value[field] < 0) throw new Error(`${field} must be a non-negative number.`);
  }
  if (Number(value.unitCost) > Number(value.unitPrice)) throw new Error("unitCost cannot exceed unitPrice.");
  if (value.discountPercent !== undefined && (typeof value.discountPercent !== "number" || value.discountPercent < 0 || value.discountPercent > 100)) {
    throw new Error("discountPercent must be between 0 and 100.");
  }
  if (value.customerRating !== undefined && value.customerRating !== null && (typeof value.customerRating !== "number" || value.customerRating < 0 || value.customerRating > 5)) {
    throw new Error("customerRating must be between 0 and 5.");
  }
  if (value.customerGender !== undefined && !CUSTOMER_GENDERS.includes(value.customerGender as typeof CUSTOMER_GENDERS[number])) {
    throw new Error("Invalid customerGender.");
  }
  if (value.status !== undefined && !SALE_STATUSES.includes(value.status as typeof SALE_STATUSES[number])) {
    throw new Error("Invalid status.");
  }

  return {
    saleLineId: typeof value.saleLineId === "string" && value.saleLineId.trim() ? value.saleLineId : undefined,
    orderId: value.orderId as string,
    lineNumber: value.lineNumber as number,
    orderDate: value.orderDate as string,
    customerName: value.customerName as string,
    customerGender: value.customerGender as SaleInput["customerGender"],
    customerEmail: value.customerEmail as string,
    customerPhone: value.customerPhone as string,
    productName: value.productName as string,
    category: value.category as string,
    region: value.region as string,
    quantity: value.quantity as number,
    unitPrice: value.unitPrice as number,
    unitCost: value.unitCost as number,
    discountPercent: value.discountPercent as number | undefined,
    customerRating: value.customerRating as number | null | undefined,
    status: value.status as SaleInput["status"]
  };
}

export function isUniqueConstraintError(error: unknown) {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}
