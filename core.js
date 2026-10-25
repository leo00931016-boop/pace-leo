(function(root){
  'use strict';

  const rad = n => n * Math.PI / 180;

  function distance(a, b) {
    if (!a || !b) return 0;
    const dlat = rad(b.lat - a.lat);
    const dlon = rad(b.lng - a.lng);
    const h = Math.sin(dlat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }

  function calories(met, kg, seconds) {
    const m = Number(met) || 0;
    const w = Number(kg) || 0;
    const s = Number(seconds) || 0;
    return (m * 3.5 * w / 200) * (s / 60);
  }

  function accept(previous, p) {
    if (!p || typeof p !== 'object') {
      return { ok: false, reason: 'point missing', break: false, meters: 0, dt: 0 };
    }

    const lat = Number(p.lat);
    const lng = Number(p.lng);
    const t = Number(p.t);
    const accuracy = Number(p.accuracy);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !Number.isFinite(t) ||
      !Number.isFinite(accuracy) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180 ||
      accuracy < 0
    ) {
      return { ok: false, reason: 'invalid point', break: false, meters: 0, dt: 0 };
    }

    if (!previous) {
      return { ok: true, reason: 'first valid point', break: true, meters: 0, dt: 0 };
    }

    const prevT = Number(previous.t);
    if (!Number.isFinite(prevT)) {
      return { ok: false, reason: 'previous time invalid', break: false, meters: 0, dt: 0 };
    }

    const dt = (t - prevT) / 1000; // seconds
    if (!Number.isFinite(dt) || dt <= 0) {
      return { ok: false, reason: 'time sequence invalid', break: false, meters: 0, dt: 0 };
    }

    if (dt > 30) {
      return { ok: true, reason: 'gap exceeds 30s', break: true, meters: 0, dt };
    }

    const meters = distance(previous, p);
    if (!Number.isFinite(meters) || meters < 0) {
      return { ok: false, reason: 'distance invalid', break: false, meters: 0, dt };
    }

    return { ok: true, reason: 'valid step', break: false, meters, dt };
  }

  function analyzeTrack(points, options = {}) {
    const arr = Array.isArray(points) ? points : [];
    const met = Number(options.met ?? 3.5);
    const kg = Number(options.kg ?? 60);

    let totalMeters = 0;
    let totalSeconds = 0;
    let validPoints = 0;
    let segments = 0;
    let firstValidPoint = null;
    let previousValidPoint = null;
    let fastestAdjacentSpeed = 0;

    for (const p of arr) {
      const res = accept(previousValidPoint, p);
      if (!res.ok) continue;

      if (firstValidPoint === null) {
        firstValidPoint = p;
        previousValidPoint = p;
        validPoints = 1;
        segments = 1;
        continue;
      }

      if (res.break === true) {
        segments += 1;
        previousValidPoint = p;
        continue;
      }

      const meters = Number(res.meters) || 0;
      const dt = Number(res.dt) || 0;

      if (dt > 0 && meters > 0) {
        totalMeters += meters;
        totalSeconds += dt;

        const v = meters / dt; // m/s
        if (v > fastestAdjacentSpeed) {
          fastestAdjacentSpeed = v;
        }
      }

      previousValidPoint = p;
      validPoints += 1;
    }

    let straightDistance = 0;
    if (firstValidPoint && previousValidPoint && validPoints >= 2) {
      straightDistance = distance(firstValidPoint, previousValidPoint);
    }

    const averageSpeed = totalSeconds > 0 ? (totalMeters / totalSeconds) * 3.6 : 0;
    const kcal = calories(met, kg, totalSeconds);

    return {
      meters: Number(totalMeters.toFixed(2)),
      seconds: Math.round(totalSeconds),
      averageSpeed: Number(averageSpeed.toFixed(2)),
      calories: Number(kcal.toFixed(2)),
      validPoints,
      segments,
      straightDistance: Number(straightDistance.toFixed(2)),
      fastestSpeed: Number(fastestAdjacentSpeed.toFixed(2)),
      distance: Number(totalMeters.toFixed(2)),
      speed: Number(averageSpeed.toFixed(2)),
      kcal: Number(kcal.toFixed(2)),
      pointCount: validPoints,
      segmentCount: segments,
      directDistance: Number(straightDistance.toFixed(2)),
      maxSpeed: Number(fastestAdjacentSpeed.toFixed(2))
    };
  }

  const api = { distance, calories, accept, analyzeTrack };

  if (typeof module !== 'undefined') {
    module.exports = api;
  } else {
    root.MoveCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);