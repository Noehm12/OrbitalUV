// Lunar maths used by the page and by the web worker.
// Map: south polar stereographic on a 1737.4 km sphere (same as the NASA LOLA files).
// Vectors are Moon-fixed (MOON_ME frame), in km.
(function (root) {
  "use strict";
  const R = 1737400,
    D2R = Math.PI / 180;

  function xyToLatLon(x, y) {
    const rho = Math.hypot(x, y);
    return [-(90 - (2 * Math.atan(rho / (2 * R))) / D2R), Math.atan2(x, y) / D2R];
  }
  function latLonToXY(lat, lon) {
    const c = (90 + lat) * D2R,
      rho = 2 * R * Math.tan(c / 2);
    return [rho * Math.sin(lon * D2R), rho * Math.cos(lon * D2R)];
  }

  // DEM: {z: Float32Array, nx, ny, x0, y0, px}, x0/y0 are the left and top edges in map metres
  function demAt(dem, x, y) {
    const c = (x - dem.x0) / dem.px - 0.5,
      r = (dem.y0 - y) / dem.px - 0.5;
    if (c < 0 || r < 0 || c >= dem.nx - 1 || r >= dem.ny - 1) return NaN;
    const c0 = c | 0,
      r0 = r | 0,
      fc = c - c0,
      fr = r - r0,
      i = r0 * dem.nx + c0,
      z = dem.z;
    return (
      (z[i] * (1 - fc) + z[i + 1] * fc) * (1 - fr) + (z[i + dem.nx] * (1 - fc) + z[i + dem.nx + 1] * fc) * fr
    );
  }
  // Horizon height (deg) in naz directions around a point. Bearings are clockwise from +y (longitude 0).
  function horizonFromDEM(dem, x0, y0, naz, mast, zOverride) {
    naz = naz || 720;
    mast = mast || 0;
    const zs = zOverride !== undefined && zOverride === zOverride ? zOverride : demAt(dem, x0, y0);
    const H = new Float32Array(naz),
      z0 = zs + mast;
    const rho = Math.hypot(x0, y0),
      c = 2 * Math.atan(rho / (2 * R)),
      k = 2 / (1 + Math.cos(c));
    const step0 = dem.px * 0.5;
    for (let a = 0; a < naz; a++) {
      const b = (a * 2 * Math.PI) / naz,
        sx = Math.sin(b),
        sy = Math.cos(b);
      let best = -1e9,
        d = step0;
      while (d < 150000) {
        const z = demAt(dem, x0 + sx * d * k, y0 + sy * d * k);
        if (z !== z) break;
        const t = (z - z0 - (d * d) / (2 * R)) / d;
        if (t > best) best = t;
        d += Math.max(step0, d * 0.01);
      }
      H[a] = Math.atan(best) / D2R;
    }
    return H;
  }
  function horizonAtBearing(H, bearing) {
    const n = H.length,
      f = (((bearing % 360) + 360) % 360) / (360 / n),
      a0 = Math.floor(f) % n,
      w = f - Math.floor(f);
    return H[a0] * (1 - w) + H[(a0 + 1) % n] * w;
  }

  // Sun and Earth positions come from our table (web/data/ephem_6h.json), made with the NASA NAIF
  // kernels by build_data.py: one row every 6 h from 2025-01-01 UTC. Between rows we use Catmull-Rom
  // interpolation; the error is below 0.00015 deg.
  const EPH = { t0: Date.UTC(2025, 0, 1), step: 6 * 3600000, n: 0, V: null };
  function loadEphem(buffer) {
    EPH.V = new Float32Array(buffer);
    EPH.n = EPH.V.length / 6;
    return EPH;
  }
  function ephemRange() {
    return [EPH.t0, EPH.t0 + (EPH.n - 1) * EPH.step];
  }
  function moonFixed(date) {
    const ms = +date,
      u = (ms - EPH.t0) / EPH.step,
      V = EPH.V;
    if (!V || u < 0 || u > EPH.n - 1) throw new Error("date outside ephemeris table");
    let i = Math.min(Math.floor(u), EPH.n - 2);
    const f = u - i,
      f2 = f * f,
      f3 = f2 * f;
    const i0 = Math.max(i - 1, 0) * 6,
      i1 = i * 6,
      i2 = (i + 1) * 6,
      i3 = Math.min(i + 2, EPH.n - 1) * 6,
      o = new Array(6);
    for (let k = 0; k < 6; k++) {
      const p0 = V[i0 + k],
        p1 = V[i1 + k],
        p2 = V[i2 + k],
        p3 = V[i3 + k];
      o[k] =
        0.5 *
        (2 * p1 + (p2 - p0) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (3 * p1 - p0 - 3 * p2 + p3) * f3);
    }
    return { sun: o.slice(0, 3), earth: o.slice(3) };
  }
  function ephemeris(t0ms, t1ms, stepMs) {
    const n = Math.floor((t1ms - t0ms) / stepMs) + 1;
    const T = new Float64Array(n),
      S = new Float64Array(n * 3),
      E = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const tm = t0ms + i * stepMs;
      T[i] = tm;
      const m = moonFixed(tm);
      S.set(m.sun, i * 3);
      E.set(m.earth, i * 3);
    }
    return { T, S, E, n, step: stepMs };
  }
  // Azimuth (from north, clockwise) and elevation of a body seen from the surface.
  // We subtract the observer position because the Earth is close enough for it to matter (~0.25 deg).
  function frame(lat, lon) {
    const p = lat * D2R,
      l = lon * D2R;
    return {
      U: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)],
      E: [-Math.sin(l), Math.cos(l), 0],
      N: [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)],
    };
  }
  function azel(F, vx, vy, vz, rKm) {
    const dx = vx - rKm * F.U[0],
      dy = vy - rKm * F.U[1],
      dz = vz - rKm * F.U[2],
      n = Math.hypot(dx, dy, dz);
    const u = (dx * F.U[0] + dy * F.U[1] + dz * F.U[2]) / n;
    const e = (dx * F.E[0] + dy * F.E[1]) / n,
      no = (dx * F.N[0] + dy * F.N[1] + dz * F.N[2]) / n;
    return [(Math.atan2(e, no) / D2R + 360) % 360, Math.asin(Math.max(-1, Math.min(1, u))) / D2R];
  }

  // Visibility of the Sun and the Earth from one spot over a list of instants
  const EARTH_R = 0.95; // apparent radius of Earth from the Moon (deg): visible if any part of the disc clears the horizon
  function analyse(pt, eph, H) {
    const [lat, lon] = xyToLatLon(pt.x, pt.y),
      F = frame(lat, lon),
      rKm = (R + (pt.z || 0)) / 1000,
      n = eph.n;
    const out = {
      sunEl: new Float32Array(n),
      sunAz: new Float32Array(n),
      sunHz: new Float32Array(n),
      earthEl: new Float32Array(n),
      earthAz: new Float32Array(n),
      earthHz: new Float32Array(n),
      sunVis: new Uint8Array(n),
      earthVis: new Uint8Array(n),
    };
    let cs = 0,
      ce = 0,
      cb = 0,
      run = 0,
      longDark = 0,
      runE = 0,
      longGap = 0;
    for (let i = 0; i < n; i++) {
      const [sa, se] = azel(F, eph.S[i * 3], eph.S[i * 3 + 1], eph.S[i * 3 + 2], rKm);
      const [ea, ee] = azel(F, eph.E[i * 3], eph.E[i * 3 + 1], eph.E[i * 3 + 2], rKm);
      const sh = horizonAtBearing(H, lon + sa),
        eh = horizonAtBearing(H, lon + ea);
      const sv = se > sh ? 1 : 0,
        ev = ee + EARTH_R > eh ? 1 : 0;
      out.sunEl[i] = se;
      out.sunAz[i] = sa;
      out.sunHz[i] = sh;
      out.earthEl[i] = ee;
      out.earthAz[i] = ea;
      out.earthHz[i] = eh;
      out.sunVis[i] = sv;
      out.earthVis[i] = ev;
      cs += sv;
      ce += ev;
      cb += sv & ev;
      run = sv ? 0 : run + 1;
      if (run > longDark) longDark = run;
      runE = ev ? 0 : runE + 1;
      if (runE > longGap) longGap = runE;
    }
    // windows when both are visible
    const windows = [];
    let ws = -1;
    for (let i = 0; i <= n; i++) {
      const both = i < n && out.sunVis[i] && out.earthVis[i];
      if (both && ws < 0) ws = i;
      if (!both && ws >= 0) {
        windows.push([eph.T[ws], eph.T[i - 1]]);
        ws = -1;
      }
    }
    const h = eph.step / 3600000;
    out.stats = {
      sun: (100 * cs) / n,
      earth: (100 * ce) / n,
      both: (100 * cb) / n,
      longestDarkH: longDark * h,
      longestGapH: longGap * h,
      lat,
      lon,
      windows,
      n,
    };
    return out;
  }

  // Lit / shadowed cells of a whole grid for one Sun position. grid: {nx, xmin, ymax, cell}
  function shadowMask(dem, grid, sunKm, out) {
    const N = grid.nx,
      mask = out || new Uint8Array(N * N);
    for (let r = 0; r < N; r++) {
      const y = grid.ymax - (r + 0.5) * grid.cell;
      for (let c = 0; c < N; c++) {
        const x = grid.xmin + (c + 0.5) * grid.cell;
        const [lat, lon] = xyToLatLon(x, y),
          F = frame(lat, lon);
        const z0 = demAt(dem, x, y);
        if (z0 !== z0) {
          mask[r * N + c] = 0;
          continue;
        }
        const [az, el] = azel(F, sunKm[0], sunKm[1], sunKm[2], (R + z0) / 1000);
        let lit = 1;
        if (el < -2.5) lit = 0;
        else {
          const b = (lon + az) * D2R,
            sx = Math.sin(b),
            sy = Math.cos(b),
            tl = Math.tan(el * D2R);
          let d = dem.px * 0.75;
          while (d < 150000) {
            const z = demAt(dem, x + sx * d, y + sy * d);
            if (z !== z) break;
            if ((z - z0 - 2 - (d * d) / (2 * R)) / d > tl) {
              lit = 0;
              break;
            }
            d += Math.max(dem.px * 0.75, d * 0.015);
          }
        }
        mask[r * N + c] = lit;
      }
    }
    return mask;
  }

  // A spot is as good as the % of time it has the Sun AND the Earth (power + direct link to Earth).
  // Zones: the best spot within `radius` is the main one, the next best (up to perZone - 1) are backups.
  // Ties go to more sunlight, then to the shorter longest night.
  function spotScore(st, periodH) {
    return st.both + 0.01 * st.sun - 1e-6 * st.longestDarkH;
  }
  function rankZones(cands, stats, periodH, opts) {
    opts = opts || {};
    const radius = opts.radius || 20000,
      minSep = opts.minSep || 40000,
      maxZones = opts.maxZones || 6,
      perZone = opts.perZone || 6;
    const sc = stats.map((s) => spotScore(s, periodH));
    const zones = [];
    // a spot that never has the Sun and the Earth at once is no use, not even as a backup
    const order = cands.map((c, i) => i).filter((i) => stats[i].both > 0);
    // a zone is centred on its best spot: a candidate starts a zone if nothing better is within `radius`
    const val = [];
    for (const i of order) {
      const mem = order
        .filter((j) => Math.hypot(cands[j].x - cands[i].x, cands[j].y - cands[i].y) <= radius)
        .sort((a, b) => sc[b] - sc[a]);
      if (mem[0] !== i) continue;
      const top = mem.slice(0, perZone),
        backups = top.slice(1),
        b = backups.length ? backups.reduce((a, j) => a + sc[j], 0) / backups.length : 0;
      val.push({ i, mem: top, v: sc[i], b });
    }
    // zones are ordered by their main spot (the % shown in the list); ties go to the zone
    // whose backups are better on average, then to the one with more backups
    val.sort((a, b) => b.v - a.v || b.b - a.b || b.mem.length - a.mem.length);
    // zones need a main spot and at least 2 backups; if no area has that many, show what there is
    const minMembers = val.some((z) => z.mem.length >= 3) ? 3 : 1;
    for (const z of val) {
      if (z.mem.length < minMembers) continue;
      if (zones.some((o) => Math.hypot(cands[o.i].x - cands[z.i].x, cands[o.i].y - cands[z.i].y) < minSep))
        continue;
      zones.push(z);
      if (zones.length >= maxZones) break;
    }
    return zones.map((z) => ({
      center: z.i,
      members: z.mem,
      main: z.mem[0],
      value: z.v,
      scores: z.mem.map((j) => sc[j]),
    }));
  }


  // Maps for a period: share of time each 1 km cell sees the Sun, the Earth and both.
  // hz holds every cell's horizon (meta.naz directions, 8 bits, from horizons_1km.bin).
  // sunDirs / earthDirs: unit vectors (3 per instant) seen from the pole; across the
  // map the Earth's direction changes by less than 0.05 deg, so one observer is enough.
  function visibilityMaps(hz, meta, sunDirs, earthDirs, onProgress) {
    const nx = meta.nx,
      ny = meta.ny,
      naz = meta.naz,
      nt = sunDirs.length / 3,
      perDir = naz / 360;
    const out = { sun: new Float32Array(nx * ny), earth: new Float32Array(nx * ny), both: new Float32Array(nx * ny) };
    const horizon = (base, bearing) => {
      const f = bearing * perDir,
        a0 = Math.floor(f) % naz,
        a1 = (a0 + 1) % naz,
        w = f - Math.floor(f);
      return (hz[base + a0] * (1 - w) + hz[base + a1] * w) * meta.scale + meta.offset;
    };
    for (let j = 0; j < ny; j++) {
      const y = meta.y0 - j * meta.step;
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i,
          [lat, lon] = xyToLatLon(meta.x0 + i * meta.step, y),
          p = lat * D2R,
          l = lon * D2R,
          base = k * naz;
        const ux = Math.cos(p) * Math.cos(l), uy = Math.cos(p) * Math.sin(l), uz = Math.sin(p);
        const ex = -Math.sin(l), ey = Math.cos(l);
        const nx_ = -Math.sin(p) * Math.cos(l), ny_ = -Math.sin(p) * Math.sin(l), nz_ = Math.cos(p);
        let cs = 0, ce = 0, cb = 0;
        for (let t = 0; t < nt; t++) {
          let dx = sunDirs[3 * t], dy = sunDirs[3 * t + 1], dz = sunDirs[3 * t + 2];
          let el = Math.asin(dx * ux + dy * uy + dz * uz) / D2R;
          let az = Math.atan2(dx * ex + dy * ey, dx * nx_ + dy * ny_ + dz * nz_) / D2R;
          const sv = el > horizon(base, (((lon + az) % 360) + 360) % 360);
          dx = earthDirs[3 * t]; dy = earthDirs[3 * t + 1]; dz = earthDirs[3 * t + 2];
          el = Math.asin(dx * ux + dy * uy + dz * uz) / D2R;
          az = Math.atan2(dx * ex + dy * ey, dx * nx_ + dy * ny_ + dz * nz_) / D2R;
          const ev = el + EARTH_R > horizon(base, (((lon + az) % 360) + 360) % 360);
          if (sv) cs++;
          if (ev) ce++;
          if (sv && ev) cb++;
        }
        out.sun[k] = (100 * cs) / nt;
        out.earth[k] = (100 * ce) / nt;
        out.both[k] = (100 * cb) / nt;
      }
      if (onProgress && j % 8 === 7) onProgress((j + 1) / ny);
    }
    return out;
  }
  // Unit directions of the Sun and the Earth for a list of instants, seen from the pole
  function directionsFromPole(times) {
    const n = times.length, sun = new Float64Array(3 * n), earth = new Float64Array(3 * n), rz = -R / 1000;
    for (let i = 0; i < n; i++) {
      const m = moonFixed(times[i]),
        s = m.sun,
        e = [m.earth[0], m.earth[1], m.earth[2] - rz],
        ns = Math.hypot(s[0], s[1], s[2]),
        ne = Math.hypot(e[0], e[1], e[2]);
      for (let c = 0; c < 3; c++) {
        sun[3 * i + c] = s[c] / ns;
        earth[3 * i + c] = e[c] / ne;
      }
    }
    return { sun, earth };
  }
  const api = {
    spotScore,
    rankZones,
    R,
    xyToLatLon,
    latLonToXY,
    demAt,
    horizonFromDEM,
    horizonAtBearing,
    moonFixed,
    ephemeris,
    loadEphem,
    ephemRange,
    frame,
    azel,
    analyse,
    shadowMask,
    visibilityMaps,
    directionsFromPole,
    EARTH_R,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Lunar = api;
})(typeof self !== "undefined" ? self : this);
