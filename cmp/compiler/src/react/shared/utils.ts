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

  // TODO (AleksandrSl 02/12/2025): Handle errors in the context.
  const result = await response.json();

  // Server returns { locale, translations, errors }
  // Extract just the translations dictionary
  return result.translations || {};
}
