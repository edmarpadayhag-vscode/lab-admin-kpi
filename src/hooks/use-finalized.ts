"use client";
import { useEffect, useState } from "react";

export function useFinalized(module: string, month: string | number, year: string | number) {
  const m = Number(month);
  const y = Number(year);
  const [isFinalized, setIsFinalized] = useState(false);
  const [finalizing,  setFinalizing]  = useState(false);

  useEffect(() => {
    if (!m || !y) return;
    setIsFinalized(false);
    fetch(`/api/finalized?module=${encodeURIComponent(module)}&month=${m}&year=${y}`)
      .then(r => r.json())
      .then((d: { finalized?: boolean }) => setIsFinalized(d.finalized ?? false))
      .catch(() => {});
  }, [module, m, y]);

  async function finalize() {
    setFinalizing(true);
    try {
      await fetch("/api/finalized", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ module, month: m, year: y }),
      });
      setIsFinalized(true);
    } finally {
      setFinalizing(false);
    }
  }

  async function unfinalize() {
    setFinalizing(true);
    try {
      await fetch(`/api/finalized?module=${encodeURIComponent(module)}&month=${m}&year=${y}`, {
        method: "DELETE",
      });
      setIsFinalized(false);
    } finally {
      setFinalizing(false);
    }
  }

  return { isFinalized, finalizing, finalize, unfinalize };
}
