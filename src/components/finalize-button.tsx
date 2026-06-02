"use client";
import { Lock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

interface Props {
  isFinalized: boolean;
  finalizing:  boolean;
  month:       string | number;
  year:        string | number;
  onFinalize:   () => void;
  onUnfinalize: () => void;
}

export function FinalizeButton({ isFinalized, finalizing, month, year, onFinalize, onUnfinalize }: Props) {
  const monthLabel = MONTH_NAMES[Number(month) - 1] ?? "";

  if (isFinalized) {
    return (
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="outline"
              disabled={finalizing}
              className="border-green-400 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800"
            />
          }
        >
          <Lock className="mr-2 h-4 w-4" />
          Finalized
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock {monthLabel} {year}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will allow editing again for {monthLabel} {year}. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onUnfinalize}>
              Unlock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Button onClick={onFinalize} disabled={finalizing}>
      <Save className="mr-2 h-4 w-4" />
      {finalizing ? "Saving…" : "Save"}
    </Button>
  );
}
