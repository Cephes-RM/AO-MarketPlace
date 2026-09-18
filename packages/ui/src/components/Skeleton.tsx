import { cn } from "../lib/cn";
import { Card } from "./Card";

export interface SkeletonProps {
  className?: string;
}

/** A single shimmering placeholder block. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800", className)}
    />
  );
}

export interface TableSkeletonProps {
  rows?: number;
  className?: string;
}

/**
 * The loading shape of a table.
 * Use it as the Suspense fallback for a slow section, so the rest of the page
 * (and its HTTP status) is decided before anything streams.
 */
export function TableSkeleton({ rows = 4, className }: TableSkeletonProps) {
  return (
    <Card
      role="status"
      aria-label="Loading"
      className={cn("flex flex-col gap-3 p-4", className)}
    >
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </Card>
  );
}

export interface ProfileSkeletonProps {
  /** How many stat cards the real page will show. */
  stats?: number;
  /** How many table rows to suggest below the stats. */
  rows?: number;
  className?: string;
}

/**
 * The loading shape of a profile page: header, stat cards, then a table.
 * Used by every route's loading.tsx so all three pages load the same way.
 */
export function ProfileSkeleton({ stats = 4, rows = 4, className }: ProfileSkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("flex flex-col gap-6", className)}
    >
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: stats }, (_, i) => (
          <Card key={i} className="flex flex-col gap-2 p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-24" />
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-40" />
        <Card className="flex flex-col gap-3 p-4">
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </Card>
      </div>
    </div>
  );
}
