'use client';

import * as React from "react";
import { Input } from "@/components/ui/input";

export type AutocompleteOption = {
  id: string;
  label: string;
  sublabel?: string;
  sublabelClassName?: string;
  disabled?: boolean;
};

interface ProductAutocompleteProps {
  options: AutocompleteOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ProductAutocomplete({
  options,
  value,
  onChange,
  placeholder = "Buscar...",
  disabled = false,
  className = "",
}: ProductAutocompleteProps) {
  const selectedOption = options.find((o) => o.id === value);
  const [inputValue, setInputValue] = React.useState(selectedOption?.label || "");
  const [open, setOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const lastSelectedLabel = React.useRef(selectedOption?.label || "");
  const isSelecting = React.useRef(false);

  React.useEffect(() => {
    const opt = options.find((o) => o.id === value);
    const label = opt?.label || "";
    lastSelectedLabel.current = label;
    setInputValue(label);
  }, [value, options]);

  const filteredOptions = React.useMemo(() => {
    if (!inputValue) return options;
    if (selectedOption && inputValue === selectedOption.label) return options;
    const search = inputValue.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(search) ||
        opt.sublabel?.toLowerCase().includes(search)
    );
  }, [options, inputValue, selectedOption]);

  const handleSelect = (opt: AutocompleteOption) => {
    if (opt.disabled) return;
    isSelecting.current = true;
    lastSelectedLabel.current = opt.label;
    setInputValue(opt.label);
    setOpen(false);
    setHighlightedIndex(-1);
    onChange(opt.id);
    // Allow blur handler to see we just selected
    setTimeout(() => { isSelecting.current = false; }, 50);
  };

  const handleInputChange = (val: string) => {
    setInputValue(val);
    setOpen(true);
    setHighlightedIndex(-1);
    if (!val) {
      lastSelectedLabel.current = "";
      onChange("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      const selected = filteredOptions[highlightedIndex];
      if (selected && !selected.disabled) {
        handleSelect(selected);
        inputRef.current?.blur();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightedIndex(-1);
      setInputValue(lastSelectedLabel.current);
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
      <Input
        ref={inputRef}
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setOpen(true);
          setHighlightedIndex(-1);
          inputRef.current?.select();
        }}
        onBlur={() => {
          setTimeout(() => {
            if (!isSelecting.current) {
              setOpen(false);
              setHighlightedIndex(-1);
              setInputValue(lastSelectedLabel.current);
            }
          }, 150);
        }}
        disabled={disabled}
        className={className}
      />
      {open && (
        <ul
          ref={listRef}
          className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto"
          style={{ maxHeight: 200, zIndex: 50, listStyle: "none", padding: 4, margin: 0 }}
          onMouseDown={(e) => {
            // Prevent blur when clicking inside the dropdown
            e.preventDefault();
          }}
        >
          {filteredOptions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">
              Sin resultados
            </li>
          ) : (
            filteredOptions.map((opt, index) => (
              <li
                key={opt.id}
                className={`px-3 py-1.5 rounded-md text-sm flex justify-between items-center ${
                  opt.disabled
                    ? "opacity-40 cursor-default"
                    : "cursor-pointer"
                } ${
                  index === highlightedIndex && !opt.disabled
                    ? "bg-slate-100"
                    : ""
                }`}
                onMouseEnter={() => {
                  if (!opt.disabled) setHighlightedIndex(index);
                }}
                onClick={() => {
                  handleSelect(opt);
                  inputRef.current?.blur();
                }}
              >
                <span>{opt.label}</span>
                {opt.sublabel && (
                  <span className={`text-xs ml-2 ${opt.sublabelClassName || "text-gray-400"}`}>
                    {opt.sublabel}
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
