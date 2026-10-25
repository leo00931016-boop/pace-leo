(function(root){
  const rad = n => n * Math.PI / 180;

  function round2(value) {
    const num = Number(value) || 0;
    return Math.round(num * 100) / 100;
  }

  function distance(a, b) {
    const dlat = rad(b.lat - a.lat);
    const dlon = rad(b.lng - a.lng);
    const h = Math.sin(dlat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function calories(met, kg, seconds) {
    const sec = Number(seconds) || 0;
    return met * 3.5 * kg / 200 * sec / 60;
  }

  function accept(previous, p, options = {}) {
    if (!p || typeof p !== 'object') {
      return { ok: false, reason: '點位資料錯誤。' };
    }

    const lat = Number(p.lat);
    const lng = Number(p.lng);
    const t = Number(p.t);
    const accuracy = Number(p.accuracy ?? 0);
    const maxAcc = Number.isFinite(options.maxAccuracy) ? Number(options.maxAccuracy) : 50;

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return { ok: false, reason: '座標超出範圍。' };
    }
    if (!Number.isFinite(t) || t < 0) {
      return { ok: false, reason: '時間資料錯誤。' };
    }
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1000) {
      return { ok: false, reason: '定位精度資料錯誤。' };
    }
    if (accuracy > maxAcc) {
      return {
        ok: false,
        reason: `GPS 精度不符合門檻：${accuracy.toFixed(1)}m（門檻：${maxAcc}m）`
      };
    }

    if (!previous) {
      return { ok: true, break: false, reason: '初始有效點。' };
    }

    const prevT = Number(previous.t);
    const dt = (t - prevT) / 1000;
    if (!Number.isFinite(dt) || dt <= 0) {
      return { ok: false, reason: '時間間隔須大於 0。' };
    }

    const d = distance(previous, p);
    if (d > 0 && dt > 0 && d / dt > 8) {
      return { ok: false, reason: '速度超過 8 m/s，已忽略。' };
    }

    if (d < 2 && dt < 15) {
      return { ok: false, reason: '微小原地漂移，已忽略。' };
    }

    return {
      ok: true,
      break: dt > 30,
      reason: dt > 30 ? '間隔超過 30 秒，視為新段。' : '有效定位點。',
      dt,
      distance: d
    };
  }

  function analyzeTrack(points, options = {}) {
    if (!Array.isArray(points)) {
      return {
        validPoints: 0,
        segments: 0,
        totalDistance: 0,
        motionTime: 0,
        avgSpeed: 0,
        maxSpeed: 0,
        straightDistance: 0,
        calories: 0,
        met: Number(options.met ?? 3.5),
        kg: Number(options.kg ?? options.weight ?? 60)
      };
    }

    const met = Number(options.met ?? 3.5);
    const kg = Number(options.kg ?? options.weight ?? 60);
    let previous = null;
    let segmentCount = 0;
    let totalDistance = 0;
    let motionTime = 0;
    let maxSpeed = 0;
    let firstValid = null;
    let lastValid = null;
    let validPoints = 0;

    for (const p of points) {
      const check = accept(previous, p, options);
      if (!check.ok) continue;

      if (!firstValid) firstValid = p;
      lastValid = p;
      validPoints += 1;

      if (!previous) {
        segmentCount = 1;
      } else if (check.break) {
        segmentCount += 1;
      }

      if (previous && !check.break) {
        const dt = Number(check.dt ?? ((Number(p.t) - Number(previous.t)) / 1000));
        const d = Number(check.distance ?? distance(previous, p));
        if (Number.isFinite(dt) && dt > 0 && Number.isFinite(d)) {
          totalDistance += d;
          motionTime += dt;
          const speed = d / dt;
          if (speed > maxSpeed) maxSpeed = speed;
        }
      }

      previous = p;
    }

    if (validPoints > 0 && segmentCount === 0) {
      segmentCount = 1;
    }

    const avgSpeed = motionTime > 0 ? (totalDistance / motionTime) * 3.6 : 0;
    const straightDistance = firstValid && lastValid ? distance(firstValid, lastValid) : 0;
    const kcal = calories(met, kg, motionTime);

    return {
      validPoints,
      segments: segmentCount,
      totalDistance: round2(totalDistance),
      motionTime: Number(motionTime.toFixed(0)),
      avgSpeed: round2(avgSpeed),
      maxSpeed: round2(maxSpeed),
      straightDistance: round2(straightDistance),
      calories: round2(kcal),
      met,
      kg
    };
  }

  function exportTrackToExcel(points, filename, options = {}) {
    if (typeof XLSX === 'undefined') {
      throw new Error('SheetJS 的 XLSX 未載入，請先引入 xlsx CDN。');
    }

    const data = analyzeTrack(points, options);
    const baseName = (typeof filename === 'string' && filename.trim()) ? filename.trim() : '運動紀錄-實作分析.xlsx';
    const fileName = /\.xlsx$/i.test(baseName) ? baseName : baseName + '.xlsx';
    const rows = [
      ['項目', '數值', '單位'],
      ['總距離', data.totalDistance, '公尺'],
      ['運動時間', data.motionTime, '秒'],
      ['平均速度', data.avgSpeed, 'km/h'],
      ['估算熱量', data.calories, 'kcal'],
      ['有效定位點數', data.validPoints, '個'],
      ['段數', data.segments, '段'],
      ['起點到終點直線距離', data.straightDistance, '公尺'],
      ['最快相鄰點速度', data.maxSpeed, 'm/s']
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 26 },
      { wch: 16 },
      { wch: 12 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '運動紀錄摘要');
    XLSX.writeFile(wb, fileName);
    return wb;
  }

  const api = { distance, calories, accept, analyzeTrack, exportTrackToExcel };
  if (typeof module !== 'undefined') {
    module.exports = api;
  } else {
    root.MoveCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
