/**
 * Builds a PostgREST `or` filter that matches `term` (case-insensitive substring) in any of `columns`.
 * The value is double-quoted and escaped, so reserved characters in user input (`,` `.` `:` `(` `)`)
 * can't break out of the filter and inject extra conditions.
 */
export function ilikeAnyFilter(columns: string[], term: string): string {
  const safe = term.slice(0, 100).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return columns.map((col) => `${col}.ilike."%${safe}%"`).join(',');
}
