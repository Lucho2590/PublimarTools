/**
 * Tope de documentos que las páginas de lista traen de Firestore.
 *
 * Las listas cargan la colección en el cliente para buscar/filtrar/paginar en el
 * navegador. Sin tope, colecciones grandes vuelven la carga muy lenta. Con este
 * límite se traen los N más recientes/relevantes (según el orderBy de cada query)
 * y la búsqueda de texto opera dentro de ese conjunto. Cuando una lista llega al
 * tope conviene mostrar un aviso para que el usuario refine con los filtros.
 */
export const LIST_FETCH_CAP = 500;
