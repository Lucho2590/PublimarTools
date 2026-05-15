// Paleta cíclica para distinguir eventos visualmente (espejo del patrón de salidas)
const COLORS = [
  { bar: "border-l-blue-600", chip: "bg-blue-100 text-blue-800" },
  { bar: "border-l-green-600", chip: "bg-green-100 text-green-800" },
  { bar: "border-l-orange-600", chip: "bg-orange-100 text-orange-800" },
  { bar: "border-l-purple-600", chip: "bg-purple-100 text-purple-800" },
  { bar: "border-l-pink-600", chip: "bg-pink-100 text-pink-800" },
  { bar: "border-l-teal-600", chip: "bg-teal-100 text-teal-800" },
  { bar: "border-l-indigo-600", chip: "bg-indigo-100 text-indigo-800" },
  { bar: "border-l-red-600", chip: "bg-red-100 text-red-800" },
  { bar: "border-l-amber-600", chip: "bg-amber-100 text-amber-800" },
  { bar: "border-l-cyan-600", chip: "bg-cyan-100 text-cyan-800" },
];

function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getEventColor(id: string) {
  return COLORS[hash(id || "") % COLORS.length];
}
