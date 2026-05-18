"use client";

import { Loader2, Users } from "lucide-react";
import { useAdminUsers } from "@/hooks/use-admin-api";
import { Badge } from "@/components/ui/badge";
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

export function UsersTable() {
  const { data, isLoading, error, refetch, isFetching } = useAdminUsers();

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
        {data ? (
          <Badge variant="secondary">{data.total} total</Badge>
        ) : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading users…
          </div>
        ) : error ? (
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Display name</TableHead>
                <TableHead>Texas username</TableHead>
                <TableHead>Telegram ID</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead>Ends</TableHead>
                <TableHead>License</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.users ?? []).map((user) => (
                <TableRow key={user.id}>
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
                      variant={
                        user.subscription_active ? "success" : "destructive"
                      }
                    >
                      {user.subscription_active ? "Active" : "Expired"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(user.subscription_end_date)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {user.license_key_id ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
              {!data?.users.length ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No registered users yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}
        {isFetching && !isLoading ? (
          <p className="mt-2 text-xs text-muted-foreground">Refreshing…</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
