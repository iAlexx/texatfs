"use client";

import { useState } from "react";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { LicenseDurationMonths } from "@/lib/admin/auth";
import { useGenerateLicense } from "@/hooks/use-admin-api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DURATIONS: { months: LicenseDurationMonths; label: string }[] = [
  { months: "1", label: "1 Month" },
  { months: "3", label: "3 Months" },
  { months: "12", label: "12 Months" },
];

export function LicenseGenerator() {
  const [notes, setNotes] = useState("");
  const [lastKey, setLastKey] = useState<string | null>(null);
  const generate = useGenerateLicense();

  async function handleGenerate(durationMonths: LicenseDurationMonths) {
    try {
      const result = await generate.mutateAsync({
        durationMonths,
        notes: notes || undefined,
      });
      setLastKey(result.key);
      toast.success(`License key generated (${durationMonths} mo)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    }
  }

  async function copyKey() {
    if (!lastKey) return;
    await navigator.clipboard.writeText(lastKey);
    toast.success("Copied to clipboard");
  }

  return (
    <Card className="admin-panel border-gold/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-gold" />
          <span className="admin-gold-text">License Generator</span>
        </CardTitle>
        <CardDescription>
          Creates unused keys via Supabase RPC{" "}
          <code className="text-xs text-gold/80">generate_license_key</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Input
            id="notes"
            placeholder="e.g. Master Ahmad — March promo"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          {DURATIONS.map(({ months, label }) => (
            <Button
              key={months}
              variant="gold"
              disabled={generate.isPending}
              onClick={() => void handleGenerate(months)}
            >
              {generate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {label}
            </Button>
          ))}
        </div>

        {lastKey ? (
          <div className="rounded-md border border-gold/30 bg-black/40 p-4">
            <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              Latest key
            </p>
            <div className="flex items-center justify-between gap-3">
              <code className="font-mono text-sm text-gold">{lastKey}</code>
              <Button variant="outline" size="sm" onClick={() => void copyKey()}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
