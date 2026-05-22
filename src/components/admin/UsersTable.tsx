"use client";

import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search, Users } from "lucide-react";
import { useAdminUsers } from "@/hooks/use-admin-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** 8-row animated skeleton while first load is in flight. */
function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i} className="border-border/40">
          {Array.from({ length: 6 }).map((__, j) => (
            <TableCell key={j}>
              <div
                className={cn(
                  "h-3.5 rounded-md bg-muted/60 animate-pulse",
                  j === 0 ? "w-32" : j === 5 ? "w-20" : "w-24"
                )}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/** Debounce hook — fires callback only after `delay` ms of inactivity. */
function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useState<ReturnType<typeof setTimeout> | null>(null);

  const tick = useCallback(
    (v: T) => {
      if (timerRef[0]) clearTimeout(timerRef[0]);
      timerRef[1](setTimeout(() => setDebounced(v), delay));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [delay]
  );

  // Sync on external changes
  if (value !== debounced) tick(value);

  return debounced;
}

export function UsersTable() {
  const [page, setPage]     = useState(1);
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounce(rawSearch, 400);

  // Reset to page 1 when search changes
  const effectivePage = rawSearch !== search ? 1 : page;

  const { data, isLoading, isFetching, error, refetch } = useAdminUsers(
    effectivePage,
    search
  );

  function handleSearchChange(v: string) {
    setRawSearch(v);
    setPage(1);
  }

  const totalPages = data?.totalPages ?? 1;

  return (
    <Card className="admin-panel border-gold/20">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-gold" />
            <span className="admin-gold-text">Registered Users</span>
          </CardTitle>
          <CardDescription>
            Masters, subscriptions, and Texas agent usernames
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {data ? (
            <Badge variant="secondary">{data.total} total</Badge>
          ) : null}
          {isFetching && !isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Search bar */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={rawSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by name or Texas username…"
            className="pl-9"
          />
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load users"}
            <button
              type="button"
              className="ml-3 underline"
              onClick={() => void refetch()}
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-md border border-border/50">
            {/* Subtle shimmer overlay while background-fetching */}
            {isFetching && !isLoading && (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 animate-pulse bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
            )}

            <Table>
              <TableHeader>
                <TableRow className="border-border/50 bg-muted/20">
                  <TableHead>Display name</TableHead>
                  <TableHead>Texas username</TableHead>
                  <TableHead>Telegram ID</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Ends</TableHead>
                  <TableHead>License</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableSkeleton />
                ) : (data?.users ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {search ? `No users matching "${search}"` : "No registered users yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  (data?.users ?? []).map((user) => (
                    <TableRow
                      key={user.id}
                      className="border-border/30 transition-colors hover:bg-muted/10"
                    >
                      <TableCell className="font-medium">
                        {user.display_name ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-gold/90">
                        {user.texas_username ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {user.telegram_id ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.subscription_active ? "success" : "destructive"}
                        >
                          {user.subscription_active ? "Active" : "Expired"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(user.subscription_end_date)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {user.license_key_id ? user.license_key_id.slice(0, 8) + "…" : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination controls */}
        {!isLoading && !error && totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {effectivePage} of {totalPages} · {data?.total ?? 0} users
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={effectivePage <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={effectivePage >= totalPages || isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
