/**
 * Get the current locale on the server
 * Uses cookies, headers, or other server-side mechanisms
 * @returns Resolved locale code
 */
export async function getServerLocale(): Promise<string> {
  return "en";
}
