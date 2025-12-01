export async function fetchTranslations(
  targetLocale: string,
  hashes?: string[],
  serverUrl?: string,
): Promise<Record<string, string>> {
  if (!serverUrl) {
    return {};
  }
  const url = `${serverUrl}/translations/${targetLocale}`;

  let response;
  if (!hashes || hashes.length === 0) {
    response = await fetch(url);
  } else {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hashes }),
    });
  }

  if (!response.ok) {
    throw new Error(`Translation API error: ${response.statusText}`);
  }

  return await response.json();
}
