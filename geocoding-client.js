// Transient browser cache only; the shared, expiring cache lives in the Edge Function.
window.createStandGeocoder = function ({ client, config, onCoordinates, onStatus, getStands }) {
  const cache = new Map(), pending = new Set(), retryAfter = new Map(), inFlight = new Map();
  let unavailableUntil = 0, pendingTimer = null;
  const cacheKey = stand => JSON.stringify([stand.id, stand.address]);
  return async function locateStands(stands, { retry = false } = {}) {
    if (!client || !config?.enabled) return;
    // Manual refresh retries transient client failures. Shared server limits still apply.
    if (retry) { unavailableUntil = 0; retryAfter.clear(); }
    const now = Date.now(), missing = [];
    // An explicit save must wait for lookups already started by Realtime/map reloads.
    const waiting = [...new Set(stands.map(stand => inFlight.get(cacheKey(stand))).filter(Boolean))];
    for (const [key, saved] of cache) if (saved.expiresAt <= now) cache.delete(key);
    for (const stand of stands) {
      const key = cacheKey(stand), saved = cache.get(key);
      if (saved && saved.expiresAt > now) { onCoordinates([saved]); continue; }
      cache.delete(key);
      if (Number.isFinite(stand.lat) && Number.isFinite(stand.lng) &&
          (stand.geocodingSource !== 'maps-co' || stand.geocodingExpiresAt > now)) continue;
      if (stand.geocodingSource === 'maps-co') onCoordinates([{ id: stand.id, address: stand.address, lat: null, lng: null, expiresAt: 0 }]);
      if (!pending.has(key) && (retryAfter.get(key) || 0) <= now) missing.push({ id: stand.id, address: stand.address, key });
    }
    if (!missing.length) { await Promise.all(waiting); if (!pending.size) onStatus(''); return; }
    if (unavailableUntil > now) { await Promise.all(waiting); return; }
    let resolveLookup;
    const completion = new Promise(resolve => { resolveLookup = resolve; });
    missing.forEach(stand => pending.add(stand.key));
    missing.forEach(stand => inFlight.set(stand.key, completion));
    onStatus('Standpositionen werden ermittelt …');
    let failed = false;
    try {
      for (let start = 0; start < missing.length; start += 10) {
        const batch = missing.slice(start, start + 10);
        const { data, error } = await client.functions.invoke(config.functionName || 'geocode-stands', {
          body: { standIds: batch.map(stand => stand.id) },
        });
        if (error || !Array.isArray(data?.coordinates) || !Array.isArray(data?.unresolved)) {
          unavailableUntil = Date.now() + 5 * 60000;
          failed = true;
          break;
        }
        const received = new Set();
        const coordinates = [];
        for (const value of data.coordinates) {
          const requested = batch.find(stand => stand.id === value.id && stand.address === value.address);
          const expiresAt = Date.parse(value.expiresAt);
          if (!requested || !Number.isFinite(value.lat) || !Number.isFinite(value.lng) ||
              Math.abs(value.lat) > 90 || Math.abs(value.lng) > 180 || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) continue;
          const saved = { id: value.id, address: requested.address, lat: value.lat, lng: value.lng,
            expiresAt: Math.min(expiresAt, Date.now() + 30 * 86400000) };
          cache.set(requested.key, saved);
          received.add(value.id);
          coordinates.push(saved);
        }
        onCoordinates(coordinates);
        for (const stand of batch) {
          if (received.has(stand.id)) continue;
          const issue = data.unresolved.find(value => value.id === stand.id);
          // A competing lookup is retried soon; failed addresses get a longer pause.
          const providerRetry = Date.parse(issue?.retryAt);
          retryAfter.set(stand.key, issue?.code === 'PENDING' ? Date.now() + 10000 :
            Number.isFinite(providerRetry) && providerRetry > Date.now() ? Math.min(providerRetry, Date.now() + 6 * 3600000) : Date.now() + 3600000);
          if (issue?.code === 'PENDING' && getStands && !pendingTimer) {
            pendingTimer = setTimeout(() => {
              pendingTimer = null;
              locateStands(getStands());
            }, 11000);
          }
          failed = true;
        }
      }
    } catch {
      unavailableUntil = Date.now() + 5 * 60000;
      failed = true;
    } finally {
      missing.forEach(stand => pending.delete(stand.key));
      missing.forEach(stand => inFlight.delete(stand.key));
      resolveLookup();
      onStatus(failed ? 'Einige Standpositionen konnten gerade nicht ermittelt werden. Die Adressen findest du in der Standliste.' : '');
    }
    await Promise.all(waiting);
  };
};
