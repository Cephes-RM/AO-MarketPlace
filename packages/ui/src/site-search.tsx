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
  const [active, setActive] = useState(-1);
  const term = query.trim();
  const results = groups.flatMap((group) => group.items);
  const showResults = open && term.length > 0;
  const showOptions = showResults && status === "ready" && results.length > 0;

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
          setActive(-1);
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

  useEffect(() => {
    if (showOptions && active >= 0) {
      document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [active, id, showOptions]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "Tab") {
      setOpen(false);
      setActive(-1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (results.length) {
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setActive((current) => !showOptions || current < 0
          ? (direction === 1 ? 0 : results.length - 1)
          : (current + direction + results.length) % results.length);
      }
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
      <form role="search" aria-label="Directory" onSubmit={(event) => {
        event.preventDefault();
        if (showOptions && results[active]) window.location.assign(results[active].href);
      }}>
        <label className="sr-only" htmlFor={`${id}-input`}>Search players, guilds and alliances</label>
        <svg className="site-search__icon" aria-hidden="true" focusable="false" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 5 5" />
        </svg>
        <input
          ref={input}
          id={`${id}-input`}
          type="search"
          role="combobox"
          placeholder="Search players, guilds, alliances"
          autoComplete="off"
          maxLength={64}
          aria-autocomplete="list"
          aria-expanded={showOptions}
          aria-controls={showOptions ? `${id}-results` : undefined}
          aria-describedby={`${id}-hint`}
          aria-activedescendant={showOptions && results[active] ? `${id}-option-${active}` : undefined}
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
              setActive(-1);
              setStatus(nextTerm.length >= 2 ? "loading" : "idle");
            }
          }}
        />
        {query && <button className="site-search__clear" type="button" aria-label="Clear search" onClick={() => {
          setQuery(""); setGroups([]); setActive(-1); setStatus("idle"); setOpen(false); input.current?.focus();
        }}><svg aria-hidden="true" focusable="false" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m6 6 12 12M18 6 6 18" /></svg></button>}
      </form>
      <span className="sr-only" id={`${id}-hint`}>Type at least two characters. Use Up and Down to select a result, Enter to open it, and Escape to close the results.</span>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{showResults ? message || `${results.length} results available.` : ""}</span>
      {showResults && <div className="site-search__results">
        {message ? <p className="site-search__message">{message}</p> : null}
        {showOptions && <div id={`${id}-results`} role="listbox" aria-label="Directory search results">
        {groups.filter((group) => group.items.length > 0).map((group) => (
          <div className="site-search__group" key={group.name} role="group" aria-labelledby={`${id}-${group.name}`}>
            <div className="site-search__heading" id={`${id}-${group.name}`}>{group.name}</div>
            {group.items.map((item) => {
              const index = results.indexOf(item);
              return <a
                id={`${id}-option-${index}`} key={item.id} href={item.href} tabIndex={-1}
                role="option" aria-selected={active === index}
                className={`site-search__result${active === index ? " site-search__result--active" : ""}`}
                onPointerMove={() => setActive(index)}
                onPointerDown={(event) => { if (event.button === 0) event.preventDefault(); }}
                onClick={() => setOpen(false)}
              ><strong>{item.name}</strong>{item.guildName && <small>{item.guildName}</small>}</a>;
            })}
          </div>
        ))}
        </div>}
      </div>}
    </div>
  );
}
