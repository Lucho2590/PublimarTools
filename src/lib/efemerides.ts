// Efemérides patrias de Argentina.
// Fechas fijas (mismo día y mes todos los años) que se muestran en el
// calendario de TODOS los usuarios, sin necesidad de cargarlas manualmente.

export type TEfemeride = {
  month: number; // 1-12
  day: number; // 1-31
  title: string;
  description?: string;
};

export const EFEMERIDES_PATRIAS: TEfemeride[] = [
  {
    month: 1,
    day: 1,
    title: "Año Nuevo",
  },
  {
    month: 3,
    day: 24,
    title: "Día Nacional de la Memoria por la Verdad y la Justicia",
  },
  {
    month: 4,
    day: 2,
    title: "Día del Veterano y de los Caídos en la Guerra de Malvinas",
  },
  {
    month: 5,
    day: 1,
    title: "Día del Trabajador",
  },
  {
    month: 5,
    day: 25,
    title: "Día de la Revolución de Mayo",
    description: "Conmemoración de la Revolución de Mayo de 1810.",
  },
  {
    month: 6,
    day: 17,
    title: "Paso a la Inmortalidad del Gral. Martín Miguel de Güemes",
  },
  {
    month: 6,
    day: 20,
    title: "Día de la Bandera",
    description: "Paso a la Inmortalidad del Gral. Manuel Belgrano.",
  },
  {
    month: 7,
    day: 9,
    title: "Día de la Independencia",
    description: "Declaración de la Independencia Argentina en 1816.",
  },
  {
    month: 8,
    day: 17,
    title: "Paso a la Inmortalidad del Gral. José de San Martín",
  },
  {
    month: 9,
    day: 11,
    title: "Día del Maestro",
    description: "Conmemoración del fallecimiento de Domingo Faustino Sarmiento.",
  },
  {
    month: 10,
    day: 12,
    title: "Día del Respeto a la Diversidad Cultural",
  },
  {
    month: 11,
    day: 20,
    title: "Día de la Soberanía Nacional",
  },
  {
    month: 12,
    day: 8,
    title: "Inmaculada Concepción de María",
  },
  {
    month: 12,
    day: 25,
    title: "Navidad",
  },
];

/** Devuelve la efeméride patria correspondiente a la fecha, si existe. */
export function getEfemeride(date: Date): TEfemeride | undefined {
  return EFEMERIDES_PATRIAS.find(
    (e) => e.month === date.getMonth() + 1 && e.day === date.getDate()
  );
}

/** Indica si la fecha coincide con una efeméride patria. */
export function isEfemeride(date: Date): boolean {
  return getEfemeride(date) !== undefined;
}
