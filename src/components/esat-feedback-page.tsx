"use client";

import { useEffect, useState, useTransition } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, ArrowUp, ArrowUpDown, Star, Trash2, Eraser, Upload } from "lucide-react";
import { deleteEsatFeedback, clearEsatFeedback } from "@/app/esat/actions";
import { useFinalized } from "@/hooks/use-finalized";
import { FinalizeButton } from "@/components/finalize-button";
import { getStoredMonth, getStoredYear } from "@/lib/kpi-period";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type EsatType = "agents" | "client";

type Feedback = {
  id: number;
  staffId: number;
  staffName: string;
  score: number;
  equivalentScore: number | null;
  remarks: string | null;
  rater: string | null;
  submittedAt: string;
};

type ImportResult = {
  inserted: number;
  skipped: number;
  total: number;
  errors: { row: number; message: string }[];
};

type SortKey = "date" | "labAdmin" | "rate" | "productRate" | "remarks";
type SortDir = "asc" | "desc";

// ─── Sub-components ────────────────────────────────────────────────────────────

function StarRating({ score }: { score: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < score ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{score}/5</span>
    </span>
  );
}

/** Response count target:
 *  5 = 20+ responses | 4 = 15-19 | 3 = 10-14 | 2 = 5-9 | 1 = 0-4
 */
function responseCountScore(count: number): number {
  if (count >= 20) return 5;
  if (count >= 15) return 4;
  if (count >= 10) return 3;
  if (count >= 5)  return 2;
  return 1;
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey | null; sortDir: SortDir }) {
  if (sortKey !== col) return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />;
  return sortDir === "asc"
    ? <ArrowUp className="ml-1 inline h-3.5 w-3.5" />
    : <ArrowDown className="ml-1 inline h-3.5 w-3.5" />;
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface EsatFeedbackPageProps {
  esatType: EsatType;
}

const LABELS: Record<EsatType, string> = {
  agents: "Agents ESAT",
  client: "Client ESAT",
};

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

export default function EsatFeedbackPage({ esatType }: EsatFeedbackPageProps) {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [isPending, startTransition] = useTransition();

  // month / year filter
  const [filterMonth, setFilterMonth] = useState(getStoredMonth);
  const [filterYear,  setFilterYear]  = useState(getStoredYear);

  // sort
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { isFinalized, finalizing, finalize, unfinalize } = useFinalized(`esat-${esatType}`, filterMonth, filterYear);

  // clear dialog
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  // import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── data loading ────────────────────────────────────────────────────────────

  async function load() {
    const res = await fetch(`/api/esat?type=${esatType}`);
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) setFeedback(data);
  }
  useEffect(() => { load(); }, [esatType]);

  // ── derived: filter + sort ──────────────────────────────────────────────────

  const monthPrefix = `${filterYear}-${String(Number(filterMonth)).padStart(2, "0")}`;
  const filtered = feedback.filter((fb) => fb.submittedAt.startsWith(monthPrefix));

  const displayed = (() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      let va: string | number, vb: string | number;
      if (sortKey === "date") {
        va = new Date(a.submittedAt).getTime();
        vb = new Date(b.submittedAt).getTime();
      } else if (sortKey === "labAdmin") {
        va = a.staffName.toLowerCase();
        vb = b.staffName.toLowerCase();
      } else if (sortKey === "rate") {
        va = a.score;
        vb = b.score;
      } else if (sortKey === "productRate") {
        va = a.equivalentScore ?? -1;
        vb = b.equivalentScore ?? -1;
      } else {
        va = (a.remarks ?? "").toLowerCase();
        vb = (b.remarks ?? "").toLowerCase();
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  })();

  // ── handlers ────────────────────────────────────────────────────────────────

  function toggleSort(col: SortKey) {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteEsatFeedback(id, esatType);
      await load();
    });
  }

  async function handleImport(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!importFile) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("type", esatType);
      const res = await fetch("/api/esat/import", { method: "POST", body: fd });
      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        setImportError(res.ok ? "Unexpected server response" : `Server error ${res.status}`);
        return;
      }
      if (!res.ok) {
        setImportError((data.error as string) ?? "Import failed");
      } else {
        setImportResult(data as ImportResult);
        if ((data.inserted as number) > 0) {
          await load();
          setToast(`${data.inserted} row${data.inserted === 1 ? "" : "s"} imported`);
        }
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    try {
      await clearEsatFeedback(esatType);
      await load();
      setClearOpen(false);
      setToast("All feedback cleared");
    } finally {
      setClearing(false);
    }
  }

  function resetImport() {
    setImportFile(null);
    setImportResult(null);
    setImportError(null);
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* ── toolbar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <h1 className="text-2xl font-bold">{LABELS[esatType]}</h1>
        </div>

        <div className="flex items-center gap-2">
          <FinalizeButton isFinalized={isFinalized} finalizing={finalizing} month={filterMonth} year={filterYear} onFinalize={finalize} onUnfinalize={unfinalize} />
          {/* ── Clear ── */}
          <Dialog open={clearOpen} onOpenChange={setClearOpen}>
            <DialogTrigger render={
              <Button variant="outline" disabled={isFinalized || feedback.length === 0}>
                <Eraser className="mr-2 h-4 w-4" />Clear
              </Button>
            } />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clear all {LABELS[esatType]} entries?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This will permanently delete all <strong>{feedback.length}</strong> feedback{" "}
                {feedback.length === 1 ? "entry" : "entries"} for <strong>{LABELS[esatType]}</strong>.
                This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setClearOpen(false)} disabled={clearing}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleClear} disabled={clearing}>
                  {clearing ? "Clearing…" : "Clear all"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ── Import ── */}
          <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) resetImport(); }}>
          <DialogTrigger render={<Button disabled={isFinalized}><Upload className="mr-2 h-4 w-4" />Import Excel</Button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>Import {LABELS[esatType]} from Excel</DialogTitle></DialogHeader>
            <form onSubmit={handleImport} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="esat-file">Excel file (.xlsx, .xls, .csv)</Label>
                <Input
                  id="esat-file"
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  required
                />
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Expected columns (Microsoft Forms export):</p>
                <table className="w-full mt-1 border-separate border-spacing-y-0.5">
                  <thead>
                    <tr>
                      <th className="text-left font-medium text-foreground w-24 pr-2">Column</th>
                      <th className="text-left font-medium text-foreground">File header</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="pr-2 font-medium text-foreground align-top">Date</td>
                      <td><code>Start Time</code></td>
                    </tr>
                    <tr>
                      <td className="pr-2 font-medium text-foreground align-top">Lab Admin</td>
                      <td><code>Who assisted you?</code></td>
                    </tr>
                    {esatType === "agents" ? (
                      <>
                        <tr>
                          <td className="pr-2 font-medium text-foreground align-top">Staff Rate</td>
                          <td><code>Staff were approachable and accommodating.</code></td>
                        </tr>
                        <tr>
                          <td className="pr-2 font-medium text-foreground align-top">Product Rate</td>
                          <td>
                            <code>Products, devices, tablets, and computer are working. (If the devices were not working, please add your remarks)</code>
                            <span className="block mt-0.5 text-muted-foreground">Yes = 5 · No = 1 · empty = not counted</span>
                          </td>
                        </tr>
                        <tr>
                          <td className="pr-2 font-medium text-foreground align-top">Remarks</td>
                          <td><code>Please provide feedback if your answer to question 8 is &quot;No&quot;</code></td>
                        </tr>
                      </>
                    ) : (
                      <>
                        <tr>
                          <td className="pr-2 font-medium text-foreground align-top">Rate</td>
                          <td><code>Please rate the assistance provided by the lab admins, with 1 being the lowest and 5 being the highest.</code></td>
                        </tr>
                        <tr>
                          <td className="pr-2 font-medium text-foreground align-top">Remarks</td>
                          <td><code>What influenced your decision to give this rating?</code></td>
                        </tr>
                        <tr>
                          <td className="pr-2 font-medium text-foreground align-top">Rater</td>
                          <td><code>Name</code> <span className="text-muted-foreground">(optional — blank is accepted)</span></td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
                <p className="pt-1">Other columns are ignored. Lab Admin must match an employee name.</p>
              </div>
              {importError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {importError}
                </div>
              )}
              {importResult && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
                  <p>
                    Inserted <strong>{importResult.inserted}</strong> of <strong>{importResult.total}</strong> rows
                    {importResult.skipped > 0 && <> · skipped <strong>{importResult.skipped}</strong></>}
                  </p>
                  {importResult.errors.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-muted-foreground">
                        View {importResult.errors.length} error{importResult.errors.length === 1 ? "" : "s"}
                      </summary>
                      <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
                        {importResult.errors.map((err, i) => (
                          <li key={i} className="text-xs text-muted-foreground">
                            Row {err.row}: {err.message}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={!importFile || importing}>
                {importing ? "Importing…" : "Import"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* ── Month / year filter ── */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Month</Label>
          <Select value={filterMonth} onValueChange={(v) => v !== null && setFilterMonth(v)}>
            <SelectTrigger className="w-40">
              <SelectValue>{(v) => MONTH_NAMES[Number(v) - 1] ?? v}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Year</Label>
          <Select value={filterYear} onValueChange={(v) => v !== null && setFilterYear(v)}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── average rating widget ── */}
      {filtered.length > 0 && (() => {
        type EmployeeEntry = {
          name: string;
          staffTotal: number; staffCount: number;
          productTotal: number; productCount: number;
        };
        const map = new Map<number, EmployeeEntry>();
        for (const fb of filtered) {
          const entry = map.get(fb.staffId) ?? {
            name: fb.staffName,
            staffTotal: 0, staffCount: 0,
            productTotal: 0, productCount: 0,
          };
          entry.staffTotal += fb.score;
          entry.staffCount += 1;
          if (fb.equivalentScore != null) {
            entry.productTotal += fb.equivalentScore;
            entry.productCount += 1;
          }
          map.set(fb.staffId, entry);
        }
        const entries = [...map.values()].sort(
          (a, b) => b.staffTotal / b.staffCount - a.staffTotal / a.staffCount
        );

        function AvgRow({ label, avg, count }: { label: string; avg: number; count: number }) {
          const rounded = Math.round(avg * 10) / 10;
          return (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="flex items-center gap-0.5">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className={`h-3 w-3 ${i < Math.round(avg) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`}
                  />
                ))}
                <span className="ml-1 text-sm font-bold">{rounded.toFixed(1)}</span>
                <span className="text-xs text-muted-foreground"> / 5</span>
              </span>
              <span className="text-xs text-muted-foreground">{count} response{count === 1 ? "" : "s"}</span>
            </div>
          );
        }

        return (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Average Rating per Lab Admin — {MONTH_NAMES[Number(filterMonth) - 1]} {filterYear}
            </p>
            <div className="flex flex-wrap gap-3">
              {entries.map((e) => (
                <Card key={e.name} className="min-w-[200px]">
                  <CardContent className="p-4 flex flex-col gap-3">
                    <p className="text-sm font-semibold leading-tight">{e.name}</p>
                    {esatType === "agents" ? (
                      <>
                        <AvgRow
                          label="Staff Rate"
                          avg={e.staffTotal / e.staffCount}
                          count={e.staffCount}
                        />
                        {e.productCount > 0 ? (
                          <AvgRow
                            label="Product Rate"
                            avg={e.productTotal / e.productCount}
                            count={e.productCount}
                          />
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-muted-foreground">Product Rate</span>
                            <span className="text-xs text-muted-foreground">No data</span>
                          </div>
                        )}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs text-muted-foreground">Response Count</span>
                          <span className="flex items-center gap-0.5">
                            <StarRating score={responseCountScore(e.staffCount)} />
                          </span>
                          <span className="text-xs text-muted-foreground">{e.staffCount} response{e.staffCount === 1 ? "" : "s"}</span>
                        </div>
                      </>
                    ) : (
                      <AvgRow
                        label="Rating"
                        avg={e.staffTotal / e.staffCount}
                        count={e.staffCount}
                      />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── table ── */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <button
                onClick={() => toggleSort("date")}
                className="flex items-center font-semibold hover:text-foreground transition-colors"
              >
                Date <SortIcon col="date" sortKey={sortKey} sortDir={sortDir} />
              </button>
            </TableHead>
            <TableHead>
              <button
                onClick={() => toggleSort("labAdmin")}
                className="flex items-center font-semibold hover:text-foreground transition-colors"
              >
                Lab Admin <SortIcon col="labAdmin" sortKey={sortKey} sortDir={sortDir} />
              </button>
            </TableHead>
            {esatType === "agents" ? (
              <>
                <TableHead>
                  <button
                    onClick={() => toggleSort("rate")}
                    className="flex items-center font-semibold hover:text-foreground transition-colors"
                  >
                    Staff Rate <SortIcon col="rate" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    onClick={() => toggleSort("productRate")}
                    className="flex items-center font-semibold hover:text-foreground transition-colors"
                  >
                    Product Rate <SortIcon col="productRate" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </TableHead>
              </>
            ) : (
              <TableHead>
                <button
                  onClick={() => toggleSort("rate")}
                  className="flex items-center font-semibold hover:text-foreground transition-colors"
                >
                  Rate <SortIcon col="rate" sortKey={sortKey} sortDir={sortDir} />
                </button>
              </TableHead>
            )}
            {esatType === "client" && (
              <TableHead>
                <span className="font-semibold">Rater</span>
              </TableHead>
            )}
            <TableHead>
              <button
                onClick={() => toggleSort("remarks")}
                className="flex items-center font-semibold hover:text-foreground transition-colors"
              >
                Remarks <SortIcon col="remarks" sortKey={sortKey} sortDir={sortDir} />
              </button>
            </TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayed.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                No feedback for {MONTH_NAMES[Number(filterMonth) - 1]} {filterYear}.
              </TableCell>
            </TableRow>
          )}
          {displayed.map((fb) => (
            <TableRow key={fb.id}>
              <TableCell>{new Date(fb.submittedAt).toLocaleDateString()}</TableCell>
              <TableCell className="font-medium">{fb.staffName}</TableCell>
              {esatType === "agents" ? (
                <>
                  <TableCell><StarRating score={fb.score} /></TableCell>
                  <TableCell>
                    {fb.equivalentScore != null
                      ? <StarRating score={Math.round(fb.equivalentScore)} />
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </>
              ) : (
                <TableCell><StarRating score={fb.score} /></TableCell>
              )}
              {esatType === "client" && (
                <TableCell className="text-muted-foreground">{fb.rater ?? "—"}</TableCell>
              )}
              <TableCell className="max-w-64 truncate">{fb.remarks ?? "—"}</TableCell>
              <TableCell>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDelete(fb.id)}
                  disabled={isPending || isFinalized}
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg animate-in fade-in-0 slide-in-from-bottom-2"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
