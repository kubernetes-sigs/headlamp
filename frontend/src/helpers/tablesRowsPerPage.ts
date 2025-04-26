const tablesRowsPerPageKey = 'tables_rows_per_page';

/**
 * Gets the number of rows per page for tables from local storage.
 *
 * @param defaultRowsPerPage - The default number of rows per page if not set in local storage.
 * @returns {number} - The number of rows per page.
 * If not set, returns the default value.
 */
export function getTablesRowsPerPage(defaultRowsPerPage: number = 5) {
  const perPageStr = localStorage.getItem(tablesRowsPerPageKey);
  if (!perPageStr) {
    return defaultRowsPerPage;
  }

  return parseInt(perPageStr);
}

/**
 * Sets the number of rows per page for tables in local storage.
 *
 * @param perPage - The number of rows per page.
 * @returns {void}
 */
export function setTablesRowsPerPage(perPage: number) {
  localStorage.setItem(tablesRowsPerPageKey, perPage.toString());
}
