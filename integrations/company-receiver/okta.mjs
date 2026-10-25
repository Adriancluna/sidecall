// One explicitly configured test tenant. Incoming commands cannot select an API
// host, endpoint, credential, or provider user ID. No redirects or automatic retries.
export function oktaProvider({ orgUrl, token, fetchImpl = fetch }) {
  const url = new URL(orgUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash ||
      !/^[a-z0-9-]+\.(okta\.com|oktapreview\.com|okta-emea\.com)$/.test(url.hostname)) throw new Error('Use an official HTTPS Okta tenant origin.');
  if (typeof token !== 'string' || token.trim().length < 20) throw new Error('Receiver-only Okta token required.');
  const request = async (id, suffix = '', method = 'GET') => {
    if (!/^00u[A-Za-z0-9]{8,64}$/.test(id)) throw new Error('Invalid allowlisted Okta user ID.');
    const response = await fetchImpl(`${url.origin}/api/v1/users/${id}${suffix}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { authorization: `SSWS ${token}`, accept: 'application/json', 'content-type': 'application/json' },
    });
    // Do not expose provider responses (which can contain user information or URLs).
    if (!response.ok) throw new Error('Provider did not confirm the operation.');
    if (method !== 'GET') return null;
    const user = await response.json();
    if (user.id !== id || !['ACTIVE', 'SUSPENDED'].includes(user.status)) throw new Error('Provider user is not in a supported state.');
    return user.status;
  };
  return {
    kind: 'okta', binding: url.origin,
    state: id => request(id),
    pause: id => request(id, '/lifecycle/suspend', 'POST'),
    revokeSessions: id => request(id, '/sessions?oauthTokens=true', 'DELETE'),
    restore: id => request(id, '/lifecycle/unsuspend', 'POST'),
  };
}
