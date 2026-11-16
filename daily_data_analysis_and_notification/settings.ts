import type { SalesRepository } from "./types";

export type AnalysisSettings = {
  comparisonDays: number;
  timezone: string;
  dailyReportEnabled: boolean;
  notificationEnabled: boolean;
  scheduledTime: string;
};

const DEFAULT_SETTINGS: AnalysisSettings = {
  comparisonDays: 30,
  timezone: "Asia/Dhaka",
  dailyReportEnabled: false,
  notificationEnabled: false,
  scheduledTime: "00:15"
};

function parseBoolean(value: string | undefined, key: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${key} must be true or false.`);
}

function parseComparisonDays(value: unknown) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new Error("comparisonDays must be a whole number between 1 and 3650.");
  }
  return days;
}

function parseTimezone(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 100) {
    throw new Error("timezone must be a valid non-empty timezone name.");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
  } catch {
    throw new Error("timezone must be a valid IANA timezone.");
  }
  return value;
}

function parseScheduledTime(value: unknown) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error("scheduledTime must use HH:mm.");
  }
  return value;
}

export function readAnalysisSettings(repository: SalesRepository): AnalysisSettings {
  const stored = repository.getAnalysisPreferences();
  return {
    comparisonDays: stored.comparisonDays === undefined ? DEFAULT_SETTINGS.comparisonDays : parseComparisonDays(stored.comparisonDays),
    timezone: stored.timezone === undefined ? DEFAULT_SETTINGS.timezone : parseTimezone(stored.timezone),
    dailyReportEnabled: stored.dailyReportEnabled === undefined ? DEFAULT_SETTINGS.dailyReportEnabled : parseBoolean(stored.dailyReportEnabled, "dailyReportEnabled"),
    notificationEnabled: stored.notificationEnabled === undefined ? DEFAULT_SETTINGS.notificationEnabled : parseBoolean(stored.notificationEnabled, "notificationEnabled"),
    scheduledTime: stored.scheduledTime === undefined ? DEFAULT_SETTINGS.scheduledTime : parseScheduledTime(stored.scheduledTime)
  };
}

export function parseAnalysisSettings(body: unknown, current: AnalysisSettings): AnalysisSettings {
  if (!body || typeof body !== "object") throw new Error("A JSON object is required.");
  const value = body as Record<string, unknown>;
  return {
    comparisonDays: value.comparisonDays === undefined ? current.comparisonDays : parseComparisonDays(value.comparisonDays),
    timezone: value.timezone === undefined ? current.timezone : parseTimezone(value.timezone),
    dailyReportEnabled: value.dailyReportEnabled === undefined ? current.dailyReportEnabled : parseBoolean(String(value.dailyReportEnabled), "dailyReportEnabled"),
    notificationEnabled: value.notificationEnabled === undefined ? current.notificationEnabled : parseBoolean(String(value.notificationEnabled), "notificationEnabled"),
    scheduledTime: value.scheduledTime === undefined ? current.scheduledTime : parseScheduledTime(value.scheduledTime)
  };
}

export function saveAnalysisSettings(repository: SalesRepository, settings: AnalysisSettings) {
  repository.setAnalysisPreference("comparisonDays", String(settings.comparisonDays));
  repository.setAnalysisPreference("timezone", settings.timezone);
  repository.setAnalysisPreference("dailyReportEnabled", String(settings.dailyReportEnabled));
  repository.setAnalysisPreference("notificationEnabled", String(settings.notificationEnabled));
  repository.setAnalysisPreference("scheduledTime", settings.scheduledTime);
}
