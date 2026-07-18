"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ThaiLocationRow = {
  tambon: string;
  amphoe: string;
  province: string;
  zipcode: string;
};

type ThaiLocationComboboxCopy = {
  searching: string;
  noResults: string;
  selected?: string;
  change?: string;
};

type ThaiLocationComboboxProps = {
  id: string;
  name?: string;
  label: string;
  hint?: string;
  placeholder: string;
  query: string;
  selected: ThaiLocationRow | null;
  onQueryChange: (value: string) => void;
  onSelect: (row: ThaiLocationRow) => void;
  onClear: () => void;
  copy: ThaiLocationComboboxCopy;
  disabled?: boolean;
  error?: string | null;
  required?: boolean;
  inputClassName?: string;
};

export function formatThaiLocation(row: ThaiLocationRow) {
  return `${row.tambon}, ${row.amphoe}, ${row.province}, ${row.zipcode}`;
}

export function ThaiLocationCombobox({
  id,
  name,
  label,
  hint,
  placeholder,
  query,
  selected,
  onQueryChange,
  onSelect,
  onClear,
  copy,
  disabled = false,
  error,
  required = false,
  inputClassName = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-500 focus:border-[#2726F5] focus:ring-1 focus:ring-[#2726F5]",
}: ThaiLocationComboboxProps) {
  const [suggestions, setSuggestions] = useState<ThaiLocationRow[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const comboRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const listId = `${id}-suggestions`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const fetchSuggestions = useCallback(async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    setSuggestLoading(true);

    try {
      const response = await fetch(`/api/thai-address?q=${encodeURIComponent(trimmed)}&limit=30`, {
        signal: controller.signal,
      });
      const body = (await response.json()) as { ok?: boolean; data?: ThaiLocationRow[] };
      if (controller.signal.aborted) return;
      setSuggestions(response.ok && body.ok && Array.isArray(body.data) ? body.data : []);
      setActiveIndex(-1);
    } catch {
      if (!controller.signal.aborted) {
        setSuggestions([]);
        setActiveIndex(-1);
      }
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) {
        requestRef.current = null;
        setSuggestLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    function onDocumentPointerDown(event: PointerEvent) {
      if (comboRef.current && !comboRef.current.contains(event.target as Node)) {
        setListOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("pointerdown", onDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", onDocumentPointerDown);
  }, []);

  useEffect(() => {
    if (!listOpen || selected) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void fetchSuggestions(query);
    }, 280);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [fetchSuggestions, listOpen, query, selected]);

  useEffect(() => {
    return () => {
      requestRef.current?.abort();
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, id]);

  function pick(row: ThaiLocationRow) {
    onSelect(row);
    setSuggestions([]);
    setListOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (selected) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setListOpen(true);
      if (suggestions.length > 0) {
        setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setListOpen(true);
      if (suggestions.length > 0) {
        setActiveIndex((current) => Math.max(current - 1, 0));
      }
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault();
      pick(suggestions[activeIndex]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setListOpen(false);
      setActiveIndex(-1);
    }
  }

  const showList = listOpen && !selected && Boolean(query.trim() || suggestLoading);

  return (
    <div ref={comboRef} className="relative">
      <label htmlFor={id} className="text-sm font-semibold text-slate-800">
        {label}
        {required ? <span className="text-red-500">*</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="mt-0.5 text-xs text-slate-600">
          {hint}
        </p>
      ) : null}
      <input
        ref={inputRef}
        id={id}
        name={name}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setListOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          if (!selected) setListOpen(true);
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        className={`${inputClassName} ${selected ? "border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500" : ""}`}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={Boolean(selected)}
      />

      {selected ? (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0Z"
                clipRule="evenodd"
              />
            </svg>
            {copy.selected ?? "เลือกแล้ว"}
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onClear();
              setSuggestions([]);
              setListOpen(false);
              setActiveIndex(-1);
              window.requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className="rounded px-1 text-xs text-[#2726F5] underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-[#2726F5] focus:ring-offset-2 disabled:opacity-50"
          >
            {copy.change ?? "เปลี่ยน"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {showList ? (
        <div
          id={listId}
          role="listbox"
          aria-label={`ผลการค้นหา${label}`}
          className="absolute z-30 mt-1 max-h-44 w-full touch-pan-y overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white py-1 shadow-lg [-webkit-overflow-scrolling:touch]"
        >
          {suggestLoading && suggestions.length === 0 ? (
            <p role="status" className="px-3 py-2 text-sm text-slate-600">
              {copy.searching}
            </p>
          ) : null}
          {!suggestLoading && suggestions.length === 0 && query.trim() ? (
            <p className="px-3 py-2 text-sm text-slate-600">{copy.noResults}</p>
          ) : null}
          {suggestions.map((row, index) => (
            <button
              id={`${id}-option-${index}`}
              key={`${row.tambon}|${row.amphoe}|${row.province}|${row.zipcode}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left focus:outline-none ${
                index === activeIndex ? "bg-[#2726F5]/10" : "hover:bg-slate-50 active:bg-slate-100"
              }`}
              onPointerMove={(event) => {
                if (event.pointerType === "mouse") setActiveIndex(index);
              }}
              onClick={() => pick(row)}
            >
              <span className="text-sm font-medium text-slate-900">{formatThaiLocation(row)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
