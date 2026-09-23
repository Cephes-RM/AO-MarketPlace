"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "../lib/cn";
import {
  flattenSearchGroups,
  moveHighlight,
  toSearchGroups,
  type SearchGroup,
  type SearchOption,
  type SearchResults,
} from "../lib/search";

export interface SearchBoxProps {
  /** Endpoint taking ?q= and returning { players, guilds, alliances }. */
  endpoint?: string;
  /** Shortest query that triggers a request. */
  minLength?: number;
  /** How long to wait after the last keystroke before asking the server. */
  debounceMs?: number;
  placeholder?: string;
  className?: string;
}

/**
 * Site search. Typing queries the endpoint after a pause, results are grouped
 * by kind, and choosing one navigates to its page.
 *
 * Keyboard: arrows move, Enter opens the highlighted result (or the first one),
 * Escape closes the list.
 */
export function SearchBox({
  endpoint = "/api/search",
  minLength = 2,
  debounceMs = 300,
  placeholder = "Search players, guilds, alliances",
  className,
}: SearchBoxProps) {
  const router = useRouter();
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const options = flattenSearchGroups(groups);
  const term = query.trim();
  const searchable = term.length >= minLength;

  useEffect(() => {
    if (!searchable) {
      setGroups([]);
      setLoading(false);
      setFailed(false);
      return;
    }

    // Wait for a pause in typing, then keep only the newest request's answer.
    const controller = new AbortController();
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${endpoint}?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Search failed with ${response.status}`);

        const results = (await response.json()) as SearchResults;
        setGroups(toSearchGroups(results));
        setFailed(false);
        setHighlight(-1);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        setGroups([]);
        setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, searchable, endpoint, debounceMs]);

  // A click anywhere else closes the list.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const choose = useCallback(
    (option: SearchOption | undefined) => {
      if (!option) return;

      setOpen(false);
      setQuery("");
      setGroups([]);
      inputRef.current?.blur();
      router.push(option.href);
    },
    [router],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => moveHighlight(current, event.key === "ArrowDown" ? 1 : -1, options.length));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      choose(highlight >= 0 ? options[highlight] : options[0]);
    }
  };

  const showList = open && searchable;
  const empty = showList && !loading && !failed && options.length === 0;

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search players, guilds and alliances"
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:placeholder:text-neutral-500"
      />

      {showList ? (
        <div
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {loading && options.length === 0 ? (
            <p className="px-3 py-3 text-sm text-neutral-500 dark:text-neutral-400">Searching…</p>
          ) : null}

          {failed ? (
            <p className="px-3 py-3 text-sm text-neutral-500 dark:text-neutral-400">
              Search is unavailable right now.
            </p>
          ) : null}

          {empty ? (
            <p className="px-3 py-3 text-sm text-neutral-500 dark:text-neutral-400">
              No players, guilds or alliances match “{term}”.
            </p>
          ) : null}

          {groups.map((group) => (
            <div key={group.type} className="py-1">
              <p className="px-3 py-1 text-[11px] font-semibold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                {group.label}
              </p>
              <ul>
                {group.options.map((option) => {
                  const index = options.indexOf(option);
                  return (
                    <li key={`${option.type}-${option.id}`}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={index === highlight}
                        onMouseEnter={() => setHighlight(index)}
                        onClick={() => choose(option)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                          index === highlight
                            ? "bg-amber-50 dark:bg-neutral-800"
                            : "hover:bg-neutral-50 dark:hover:bg-neutral-800/60",
                        )}
                      >
                        <span className="truncate font-medium">{option.name}</span>
                        {option.detail ? (
                          <span className="shrink-0 text-xs text-neutral-500 tabular-nums dark:text-neutral-400">
                            {option.detail}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
