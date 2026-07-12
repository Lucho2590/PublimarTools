/**
 * Tope de respaldo para queries de lista SIN filtro acotante.
 *
 * Las listas cargan la colección completa para calcular KPIs exactos y buscar/
 * paginar en el cliente. Cuando una query ya está acotada (ej. Ventas por rango
 * de fechas) no se aplica ningún tope. Este límite se usa solo como red de
 * seguridad para evitar descargar una colección entera cuando la query no tiene
 * ningún `where` que la acote (ej. Ventas sin rango de fechas seleccionado).
 */
export const LIST_FETCH_CAP = 500;
