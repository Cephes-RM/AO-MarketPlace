import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "../lib/cn";
import { SearchBox, type SearchBoxProps } from "./SearchBox";

export interface SiteHeaderProps {
  /** Product name, shown next to the mark and linking home. */
  productName: string;
  /** Optional mark shown before the name, e.g. a crest. */
  logo?: ReactNode;
  /** Passed through to the search box. */
  search?: SearchBoxProps;
  className?: string;
}

/** Site header: the product name linking home, and the search box. */
export function SiteHeader({ productName, logo, search, className }: SiteHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-neutral-200 bg-white/85 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/85",
        className,
      )}
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-display text-base font-bold tracking-wide hover:text-amber-600 dark:hover:text-amber-400"
        >
          {logo}
          {productName}
        </Link>

        <div className="min-w-[12rem] flex-1 sm:max-w-md sm:min-w-0">
          <SearchBox {...search} />
        </div>
      </div>
    </header>
  );
}
