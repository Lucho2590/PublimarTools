'use client';

import * as React from "react";
import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";

export type AddressInputProps = {
  value: string | undefined | null;
  onValueChange: (address: string) => void;
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
};

type NominatimAddress = {
  road?: string;
  house_number?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  country?: string;
};

type NominatimResult = {
  place_id: number;
  display_name: string;
  address?: NominatimAddress;
};

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 400;

// Arma la dirección en el orden "Calle Número, Ciudad, Provincia, País".
function formatAddress(r: NominatimResult): string {
  const a = r.address;
  if (!a) return r.display_name;

  const street = [a.road, a.house_number].filter(Boolean).join(" ");
  const city = a.city || a.town || a.village || a.municipality;
  const parts = [street, city, a.state, a.country].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : r.display_name;
}

export function AddressInput({
  value,
  onValueChange,
  placeholder = "Empezá a escribir la dirección...",
  id,
  name,
  disabled = false,
  className = "",
}: AddressInputProps) {
  const [inputValue, setInputValue] = React.useState(value || "");
  const [suggestions, setSuggestions] = React.useState<NominatimResult[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSelecting = React.useRef(false);
  // Última query que efectivamente disparó un fetch, para no repetir al reabrir.
  const lastQueried = React.useRef<string>("");

  // Mantener el input en sync si el valor externo cambia.
  React.useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  const fetchSuggestions = React.useCallback((query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    // Cancelar request previo en vuelo.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    lastQueried.current = trimmed;
    setLoading(true);

    const url =
      "https://nominatim.openstreetmap.org/search" +
      "?format=jsonv2&addressdetails=1&countrycodes=ar&limit=5&q=" +
      encodeURIComponent(trimmed);

    fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: NominatimResult[]) => {
        setSuggestions(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setSuggestions([]);
          setLoading(false);
        }
      });
  }, []);

  const scheduleFetch = React.useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(query), DEBOUNCE_MS);
    },
    [fetchSuggestions]
  );

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const handleInputChange = (val: string) => {
    setInputValue(val);
    onValueChange(val);
    setOpen(true);
    setHighlightedIndex(-1);
    scheduleFetch(val);
  };

  const handleSelect = (opt: NominatimResult) => {
    const formatted = formatAddress(opt);
    isSelecting.current = true;
    setInputValue(formatted);
    onValueChange(formatted);
    setOpen(false);
    setHighlightedIndex(-1);
    setTimeout(() => {
      isSelecting.current = false;
    }, 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      const selected = suggestions[highlightedIndex];
      if (selected) {
        handleSelect(selected);
        inputRef.current?.blur();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightedIndex(-1);
    }
  };

  React.useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.children;
      if (items[highlightedIndex]) {
        (items[highlightedIndex] as HTMLElement).scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex]);

  return (
    <div className="relative" style={{ zIndex: open ? 10 : undefined }}>
      <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        ref={inputRef}
        id={id}
        name={name}
        autoComplete="off"
        placeholder={placeholder}
        value={inputValue}
        disabled={disabled}
        className={`pl-9 ${className}`}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (inputValue.trim().length >= MIN_QUERY_LENGTH) setOpen(true);
        }}
        onBlur={() => {
          setTimeout(() => {
            if (!isSelecting.current) {
              setOpen(false);
              setHighlightedIndex(-1);
            }
          }, 150);
        }}
      />
      {open && inputValue.trim().length >= MIN_QUERY_LENGTH && (
        <ul
          ref={listRef}
          className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto"
          style={{ maxHeight: 240, zIndex: 50, listStyle: "none", padding: 4, margin: 0 }}
          onMouseDown={(e) => {
            // Evita el blur del input al hacer click dentro del dropdown.
            e.preventDefault();
          }}
        >
          {loading ? (
            <li className="px-3 py-2 text-sm text-gray-400">Buscando…</li>
          ) : suggestions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">Sin resultados</li>
          ) : (
            suggestions.map((opt, index) => (
              <li
                key={opt.place_id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm cursor-pointer ${
                  index === highlightedIndex ? "bg-slate-100" : ""
                }`}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => {
                  handleSelect(opt);
                  inputRef.current?.blur();
                }}
              >
                <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                <span>{formatAddress(opt)}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
