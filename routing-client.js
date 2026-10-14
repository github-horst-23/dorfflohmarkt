// Walking matrix from the FOSSGIS foot instance; never use a driving profile.
// OSRM: https://project-osrm.org/docs/v5.24.0/api/#table-service
// Usage policy: https://routing.openstreetmap.de/about.html (max. one request/s).
window.createFavoriteRouter = function () {
  let nextRequestAt = 0;
  const pause = (ms, signal) => new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); reject(new DOMException('Abgebrochen', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
  });
  const valid = point => Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;

  function getLocation() {
    return new Promise((resolve, reject) => {
      if (!window.isSecureContext || !navigator.geolocation) {
        reject(new Error('Die Standortabfrage benötigt einen unterstützten Browser und eine sichere HTTPS-Verbindung.')); return;
      }
      navigator.geolocation.getCurrentPosition(position => {
        const origin = { lat: position.coords.latitude, lng: position.coords.longitude,
          accuracy: position.coords.accuracy, timestamp: position.timestamp };
        if (!valid(origin)) { reject(new Error('Der aktuelle Standort konnte nicht bestimmt werden.')); return; }
        resolve(origin);
      }, error => reject(new Error(error.code === 1
        ? 'Bitte erlaube den Standortzugriff in den Browser- oder Geräteeinstellungen und plane erneut.'
        : error.code === 3 ? 'Die Standortabfrage hat zu lange gedauert. Bitte erneut versuchen.'
          : 'Dein Standort ist gerade nicht verfügbar. Bitte Standortdienste und Empfang prüfen.')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    });
  }

  // Held-Karp: exact minimum-duration open path, fixed origin, free last stop.
  // Yield regularly so cancellation and the rest of the app remain responsive.
  async function exactOrder(matrix, count, signal) {
    const size = 1 << count, costs = new Float64Array(size * count);
    const previous = new Int8Array(size * count);
    costs.fill(Infinity); previous.fill(-1);
    for (let j = 0; j < count; j++) costs[(1 << j) * count + j] = matrix[0][j + 1];
    for (let mask = 1; mask < size; mask++) {
      if (mask % 512 === 0) await pause(0, signal);
      for (let last = 0; last < count; last++) {
        if (!(mask & (1 << last))) continue;
        const base = costs[mask * count + last];
        if (!Number.isFinite(base)) continue;
        for (let next = 0; next < count; next++) {
          if (mask & (1 << next)) continue;
          const index = (mask | (1 << next)) * count + next;
          const candidate = base + matrix[last + 1][next + 1];
          if (candidate < costs[index]) { costs[index] = candidate; previous[index] = last; }
        }
      }
    }
    const full = size - 1;
    let last = 0;
    for (let j = 1; j < count; j++) if (costs[full * count + j] < costs[full * count + last]) last = j;
    if (!Number.isFinite(costs[full * count + last])) throw new Error('Nicht alle Favoriten sind durch Fußwege erreichbar. Es wurde kein Stand ausgelassen.');
    const order = [];
    for (let mask = full; mask;) {
      order.push(last + 1);
      const before = previous[mask * count + last];
      mask ^= 1 << last; last = before;
    }
    return order.reverse();
  }

  const pathCost = (order, matrix) => order.reduce((total, point, index) =>
    total + matrix[index ? order[index - 1] : 0][point], 0);

  // Larger selections: try every first stop, then improve the best open path.
  // Full directed costs also account for one-way links and asymmetric routing.
  async function approximateOrder(matrix, count, signal) {
    let best = null, bestCost = Infinity;
    for (let first = 1; first <= count; first++) {
      await pause(0, signal);
      const order = [first], remaining = new Set(Array.from({ length: count }, (_, j) => j + 1));
      remaining.delete(first);
      while (remaining.size) {
        const last = order.at(-1);
        let next = -1, minimum = Infinity;
        for (const candidate of remaining) if (matrix[last][candidate] < minimum) {
          next = candidate; minimum = matrix[last][candidate];
        }
        if (next === -1) break;
        order.push(next); remaining.delete(next);
      }
      const cost = remaining.size ? Infinity : pathCost(order, matrix);
      if (cost < bestCost) { best = order; bestCost = cost; }
    }
    if (!best) throw new Error('Für alle Favoriten zusammen konnte kein durchgehender Fußweg gefunden werden. Es wurde kein Stand ausgelassen.');
    for (let pass = 0; pass < 8; pass++) {
      let improved = false;
      for (let i = 0; i < count; i++) {
        await pause(0, signal);
        for (let j = i + 1; j < count; j++) {
          const candidate = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
          const cost = pathCost(candidate, matrix);
          if (cost < bestCost - 0.001) { best = candidate; bestCost = cost; improved = true; }
        }
      }
      if (!improved) break;
    }
    return best;
  }

  async function plan({ origin, stops, signal, onProgress = () => {} }) {
    if (!valid(origin) || !stops.length || stops.some(stop => !valid(stop)))
      throw new Error('Für die Planung fehlen genaue Standpositionen. Bitte die Standdaten aktualisieren.');
    // Keep one on-demand matrix request within the public service's usual table size.
    if (stops.length > 99) throw new Error('Der Routendienst unterstützt hier höchstens 99 Favoriten pro Planung. Bitte verkleinere deine Auswahl; es werden keine Stopps automatisch ausgelassen.');
    onProgress('Fußwege zwischen deinem Standort und allen Favoriten werden ermittelt …');
    await pause(Math.max(0, nextRequestAt - Date.now()), signal);
    nextRequestAt = Date.now() + 1100;
    const coordinates = [origin, ...stops].map(point => `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`).join(';');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.throwIfAborted(); signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), 25000);
    let data;
    try {
      const response = await fetch(`https://routing.openstreetmap.de/routed-foot/table/v1/foot/${coordinates}?annotations=duration,distance&generate_hints=false`,
        { signal: controller.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'strict-origin-when-cross-origin' });
      if (!response.ok) throw new Error('service');
      data = await response.json();
    } catch {
      signal?.throwIfAborted();
      throw new Error('Der Fußwege-Dienst ist gerade nicht erreichbar oder die Anfrage ist zu groß. Bitte Internetverbindung prüfen und später erneut planen.');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    signal?.throwIfAborted();
    const size = stops.length + 1;
    const isMatrix = matrix => Array.isArray(matrix) && matrix.length === size && matrix.every(row =>
      Array.isArray(row) && row.length === size && row.every(value => value === null || (Number.isFinite(value) && value >= 0)));
    if (data.code !== 'Ok' || !isMatrix(data.durations) || !isMatrix(data.distances))
      throw new Error('Der Fußwege-Dienst konnte keine vollständige Route liefern. Bitte später erneut versuchen.');
    const durations = data.durations.map(row => row.map(value => value === null ? Infinity : value));
    onProgress('Die günstigste Reihenfolge der Fußwege wird berechnet …');
    const exact = stops.length <= 16;
    const order = await (exact ? exactOrder : approximateOrder)(durations, stops.length, signal);
    signal?.throwIfAborted();
    let duration = 0, distance = 0, before = 0;
    const legs = order.map(index => {
      const seconds = durations[before][index], meters = data.distances[before][index];
      if (!Number.isFinite(seconds) || !Number.isFinite(meters)) throw new Error('Für einen Favoriten fehlt der Fußweg. Es wurde kein Stand ausgelassen.');
      duration += seconds; distance += meters; before = index;
      return { stop: stops[index - 1], duration: seconds, distance: meters };
    });
    return { origin, legs, duration, distance, exact };
  }
  return { getLocation, plan };
};
