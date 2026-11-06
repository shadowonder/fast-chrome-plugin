// Self-contained: usable directly as an executeScript func. The token stays
// in the page context; only response data or a sanitized error is returned.
export async function requestGraphQL(
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ value: { data: Record<string, unknown>; status: number } } | { error: string }> {
  let token: string | null;
  try {
    token = sessionStorage.getItem('idToken');
  } catch {
    return { error: 'The webpage sessionStorage is inaccessible.' };
  }
  if (!token?.trim()) return { error: 'No idToken is available in webpage sessionStorage.' };

  let response: Response;
  try {
    response = await fetch(new URL('/graphql', window.location.origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.trim()}` },
      body: JSON.stringify({ query, ...(variables === undefined ? {} : { variables }) }),
      credentials: 'same-origin',
      mode: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // Do not echo request details or server text that might contain credentials.
    return { error: 'GraphQL request failed: network, timeout, or redirect blocked.' };
  }
  if (response.status === 401 || response.status === 403) {
    return { error: `GraphQL authentication failed (HTTP ${response.status}). Sign in again.` };
  }
  if (!response.ok) return { error: `GraphQL request failed (HTTP ${response.status}).` };
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') return { error: 'Invalid GraphQL response.' };
    if ('errors' in body && Array.isArray(body.errors) && body.errors.length) {
      return { error: `GraphQL returned ${body.errors.length} error(s).` };
    }
    if (
      !('data' in body) ||
      !body.data ||
      typeof body.data !== 'object' ||
      Array.isArray(body.data)
    ) {
      return { error: 'GraphQL response has no usable data.' };
    }
    return { value: { data: body.data as Record<string, unknown>, status: response.status } };
  } catch {
    return { error: 'GraphQL response is not valid JSON.' };
  }
}
