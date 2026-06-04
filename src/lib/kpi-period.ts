const MONTH_KEY = "kpi-period-month";
const YEAR_KEY  = "kpi-period-year";

export function getStoredMonth(): string {
  if (typeof window === "undefined") return String(new Date().getMonth() + 1);
  return localStorage.getItem(MONTH_KEY) || String(new Date().getMonth() + 1);
}

export function getStoredYear(): string {
  if (typeof window === "undefined") return String(new Date().getFullYear());
  return localStorage.getItem(YEAR_KEY) || String(new Date().getFullYear());
}

export function saveKpiPeriod(month: string, year: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MONTH_KEY, month);
  localStorage.setItem(YEAR_KEY, year);
}
