"use client";

import { useEffect, useState, useTransition } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, ArrowUpDown, Star, Trash2, Upload } from "lucide-react";
import { deleteEsatFeedback } from "./actions";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Feedback = {
  id: number;
  staffId: number;
  staffName: string;
  score: number;
  remarks: string | null;
  submittedAt: string;
};

type ImportResult = {
  inserted: number;
  skipped: number;
  total: number;
  errors: { row: number; message: string }[];
};

type SortKey = "date" | "labAdmin" | "rate" | "remarks";
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

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey | null; sortDir: SortDir }) {
  if (sortKey !== col) return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />;
  return sortDir === "asc"
    ? <ArrowUp className="ml-1 inline h-3.5 w-3.5" />
    : <ArrowDown className="ml-1 inline h-3.5 w-3.5" />;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function EsatPage() {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [isPending, startTransition] = useTransition();

  // sort
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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
    const res = await fetch("/api/esat").then((r) => r.json());
    setFeedback(res);
  }
  useEffect(() => { load(); }, []);

  // ── derived: sort ───────────────────────────────────────────────────────────

  const displayed = (() => {
    if (!sortKey) return feedback;
    return [...feedback].sort((a, b) => {
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
      await deleteEsatFeedback(id);
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
      const res = await fetch("/api/esat/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Import failed");
      } else {
        setImportResult(data);
        if (data.inserted > 0) {
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
          <h1 className="text-2xl font-bold">ESAT Feedback</h1>
        </div>

        <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) resetImport(); }}>
          <DialogTrigger render={<Button><Upload className="mr-2 h-4 w-4" />Import Excel</Button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>Import ESAT Feedback from Excel</DialogTitle></DialogHeader>
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
                <div className="space-y-0.5">
                  <p><span className="font-medium text-foreground">Date</span> — <code>Start time</code></p>
                  <p><span className="font-medium text-foreground">Lab Admin</span> — <code>Who assisted you?</code></p>
                  <p><span className="font-medium text-foreground">Rate</span> — <code>Please rate the assistance provided by the lab admins…</code></p>
                  <p><span className="font-medium text-foreground">Remarks</span> — <code>What influenced your decision to give this rating?</code></p>
                </div>
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
            <TableHead>
              <button
                onClick={() => toggleSort("rate")}
                className="flex items-center font-semibold hover:text-foreground transition-colors"
              >
                Rate <SortIcon col="rate" sortKey={sortKey} sortDir={sortDir} />
              </button>
            </TableHead>
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
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No feedback yet. Import an Excel file to get started.
              </TableCell>
            </TableRow>
          )}
          {displayed.map((fb) => (
            <TableRow key={fb.id}>
              <TableCell>{new Date(fb.submittedAt).toLocaleDateString()}</TableCell>
              <TableCell className="font-medium">{fb.staffName}</TableCell>
              <TableCell><StarRating score={fb.score} /></TableCell>
              <TableCell className="max-w-64 truncate">{fb.remarks ?? "—"}</TableCell>
              <TableCell>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDelete(fb.id)}
                  disabled={isPending}
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
