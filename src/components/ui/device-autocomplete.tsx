'use client';

import * as React from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";

export type DeviceOption = {
  id: string;
  name: string;
  description?: string;
};

interface DeviceAutocompleteProps {
  devices: DeviceOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function DeviceAutocomplete({
  devices,
  value,
  onChange,
  placeholder = "Buscar o seleccionar dispositivo...",
  disabled = false,
}: DeviceAutocompleteProps) {
  const [inputValue, setInputValue] = React.useState(value);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const [dropdownPosition, setDropdownPosition] = React.useState({ top: 0, left: 0, width: 0 });
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLUListElement>(null);

  // Actualizar inputValue cuando value cambia externamente
  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Calcular posición del dropdown cuando se abre
  React.useEffect(() => {
    if (showDropdown && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 2,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [showDropdown]);

  // Filtrar dispositivos basado en la búsqueda
  const filteredDevices = React.useMemo(() => {
    if (!inputValue) return devices;
    const search = inputValue.toLowerCase();
    return devices.filter((device) =>
      device.name.toLowerCase().includes(search) ||
      device.description?.toLowerCase().includes(search)
    );
  }, [devices, inputValue]);

  const handleSelect = (deviceName: string) => {
    onChange(deviceName);
    setInputValue(deviceName);
    setShowDropdown(false);
    setHighlightedIndex(-1);
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    onChange(value);
    setShowDropdown(true);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredDevices.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      const selectedDevice = filteredDevices[highlightedIndex];
      handleSelect(selectedDevice.name);
      if (inputRef.current) inputRef.current.blur();
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  };

  const dropdown = showDropdown && devices && devices.length > 0 && typeof document !== 'undefined' ? createPortal(
    <ul
      ref={dropdownRef}
      style={{
        position: "absolute",
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
        zIndex: 9999,
        background: "white",
        border: "1px solid #e5e7eb",
        padding: 6,
        borderRadius: 6,
        maxHeight: 180,
        overflowY: "auto",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        listStyle: "none",
        margin: 0,
      }}
    >
      {filteredDevices.length === 0 ? (
        <li
          style={{
            padding: 8,
            color: "#6b7280",
            fontSize: "0.875rem",
          }}
        >
          No se encontró &quot;{inputValue}&quot;. Usá este valor.
        </li>
      ) : (
        filteredDevices.map((device, index) => (
          <li
            key={device.id}
            style={{
              padding: 8,
              borderRadius: 6,
              cursor: "pointer",
              backgroundColor: index === highlightedIndex ? "#f1f5f9" : "transparent",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={() => setHighlightedIndex(index)}
            onMouseDown={() => {
              handleSelect(device.name);
              if (inputRef.current) inputRef.current.blur();
            }}
          >
            {device.name}
          </li>
        ))
      )}
    </ul>,
    document.body
  ) : null;

  return (
    <div style={{ position: "relative" }}>
      <Input
        ref={inputRef}
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setShowDropdown(true);
          setHighlightedIndex(-1);
        }}
        onBlur={() =>
          setTimeout(() => {
            setShowDropdown(false);
            setHighlightedIndex(-1);
          }, 150)
        }
        disabled={disabled}
      />
      {dropdown}
    </div>
  );
}
