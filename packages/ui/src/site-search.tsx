"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

type SearchResult = { id: string; name: string; guildName?: string | null; href: string };
type SearchGroup = { name: string; items: SearchResult[] };
type SearchStatus = "idle" | "loading" | "ready" | "error";

function readGroups(value: unknown): SearchGroup[] {
  if (typeof value !== "object" || value === null) throw new Error("Invalid search response");
  const source = value as Record<string, unknown>;
  return ([
    ["players", "Players"], ["guilds", "Guilds"], ["alliances", "Alliances"],
  ] as const).map(([key, name]) => {
    if (!Array.isArray(source[key])) throw new Error("Invalid search response");
    const items = source[key].flatMap((item: unknown) => {
      if (typeof item !== "object" || item === null) return [];
      const record = item as Record<string, unknown>;
      if (typeof record.id !== "string" || !record.id.trim() || typeof record.name !== "string" || !record.name.trim()) return [];
      return [{
        id: record.id,
        name: record.name,
        guildName: typeof record.guildName === "string" ? record.guildName : null,
        href: `/${key}/${encodeURIComponent(record.id)}`,
      }];
    }).slice(0, 5);
    return { name, items };
  });
}

export function SiteSearch() {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const term = query.trim();
  const results = groups.flatMap((group) => group.items);
  const showResults = open && term.length > 0;

  useEffect(() => {
    if (term.length < 2 || term.length > 64) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search unavailable");
        const nextGroups = readGroups(await response.json());
        if (!controller.signal.aborted) {
          setGroups(nextGroups);
          setStatus("ready");
          setActive(0);
        }
      } catch {
        if (!controller.signal.aborted) {
          setGroups([]);
          setStatus("error");
        }
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (results.length) setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
    }
  }

  let message = "";
  if (term.length === 1) message = "Type at least 2 characters to search.";
  else if (status === "loading") message = "Searching…";
  else if (status === "error") message = "Search is unavailable. Try changing your search.";
  else if (status === "ready" && results.length === 0) message = `No results for “${term}”.`;

  return (
    <div className="site-search" ref={root} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <form role="search" onSubmit={(event) => {
        event.preventDefault();
        if (open && status === "ready" && results[active]) window.location.assign(results[active].href);
      }}>
        <label className="sr-only" htmlFor={`${id}-input`}>Search players, guilds and alliances</label>
        <span className="site-search__icon" aria-hidden="true">⌕</span>
        <input
          ref={input}
          id={`${id}-input`}
          type="search"
          role="combobox"
          placeholder="Search players, guilds, alliances"
          autoComplete="off"
          maxLength={64}
          aria-autocomplete="list"
          aria-expanded={showResults}
          aria-controls={showResults ? `${id}-results` : undefined}
          aria-activedescendant={showResults && status === "ready" && results[active] ? `${id}-option-${active}` : undefined}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            const nextTerm = next.trim();
            setQuery(next);
            setOpen(true);
            if (nextTerm !== term) {
              setGroups([]);
              setActive(0);
              setStatus(nextTerm.length >= 2 ? "loading" : "idle");
            }
          }}
        />
        {query && <button className="site-search__clear" type="button" aria-label="Clear search" onClick={() => {
          setQuery(""); setGroups([]); setStatus("idle"); setOpen(false); input.current?.focus();
        }}>×</button>}
      </form>
      <span className="sr-only" role="status" aria-live="polite">{showResults ? message || `${results.length} results. Use the arrow keys and Enter to open a profile.` : ""}</span>
      {showResults && <div className="site-search__results" id={`${id}-results`} role="listbox" aria-label="Directory search results">
        {message ? <p className="site-search__message">{message}</p> : groups.filter((group) => group.items.length > 0).map((group) => (
          <div className="site-search__group" key={group.name} role="group" aria-labelledby={`${id}-${group.name}`}>
            <p className="site-search__heading" id={`${id}-${group.name}`}>{group.name}</p>
            {group.items.map((item) => {
              const index = results.indexOf(item);
              return <a
                id={`${id}-option-${index}`} key={item.id} href={item.href}
                role="option" aria-selected={active === index}
                className={`site-search__result${active === index ? " site-search__result--active" : ""}`}
                onPointerMove={() => setActive(index)}
                onClick={() => setOpen(false)}
              ><strong>{item.name}</strong>{item.guildName && <small>{item.guildName}</small>}</a>;
            })}
          </div>
        ))}
      </div>}
    </div>
  );
}
