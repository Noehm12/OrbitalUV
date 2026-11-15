// Lunar Landing Site Navigator - page logic: screens, maps, calculator and results.
// Uses Plotly, Lunar (lunar.js), Charts (charts.js) and the texts in i18n.js.
(function () {
  "use strict";
  // Texts and light/dark theme
  let LANG = "es";
  function t(k, vars) {
    let s = T[LANG][k];
    if (s === undefined) s = T.es[k];
    if (s === undefined) return k;
    if (vars && typeof s === "string") for (const v in vars) s = s.split("{" + v + "}").join(vars[v]);
    return s;
  }
  const fmt = (v, d) =>
    new Intl.NumberFormat(LANG === "es" ? "es-ES" : "en-GB", {
      minimumFractionDigits: d || 0,
      maximumFractionDigits: d || 0,
    }).format(v);
  // percentages: one decimal, and a value that is not exactly 100 (or 0) is never shown as 100 (or 0),
  // otherwise a spot with a 25 min night would read "100 %" of sunlight
  const pct = (v) => {
    if (!Number.isFinite(v)) return "—";
    if (v > 99.95 && v < 100) return ">" + fmt(99.9, 1);
    if (v > 0 && v < 0.05) return "<" + fmt(0.1, 1);
    return fmt(v, 1);
  };
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (e) {}
    },
  };
  const currentTheme = () =>
    document.documentElement.getAttribute("data-theme") ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function updateThemeBtn() {
    const b = document.getElementById("themeBtn"),
      dk = currentTheme() === "dark";
    b.innerHTML = dk
      ? '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></g></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="currentColor"/></svg>';
    b.insertAdjacentHTML(
      "beforeend",
      `<span class="tool-label">${esc(t(dk ? "theme_short_light" : "theme_short_dark"))}</span>`,
    );
    b.setAttribute("aria-label", dk ? t("theme_light") : t("theme_dark"));
    b.title = b.getAttribute("aria-label");
    b.setAttribute("aria-pressed", String(dk));
  }
  function applyI18n() {
    document.documentElement.lang = LANG;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.innerHTML = t(el.getAttribute("data-i18n"));
    });
    document
      .querySelectorAll("[data-i18n-aria]")
      .forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
    const lb = document.getElementById("langBtn");
    lb.textContent = LANG === "es" ? "EN" : "ES";
    lb.setAttribute("aria-label", LANG === "es" ? "English" : "Español");
    document.title = LANG === "es" ? "OrbitalUV · Polo sur lunar" : "OrbitalUV · Lunar south pole";
    document.getElementById("menuBtn").setAttribute("aria-label", t("menu_label"));
    document.getElementById("brandBtn").setAttribute("aria-label", t("nav_home") + " · OrbitalUV");
    document.getElementById("mainNav").setAttribute("aria-label", t("main_nav_label"));
    updateThemeBtn();
    document.querySelectorAll("#lsteps [data-s]").forEach((li) => {
      li.textContent = t(li.dataset.s, { n: C.length });
    });
  }
  const fmtLL = (lat, lon) =>
    fmt(Math.abs(lat), 2) + "° " + t("lat") + ", " + fmt(Math.abs(lon), 2) + "° " + (lon >= 0 ? t("E") : t("W"));
  // the map grid stores the longest night in 4 h steps, clipped at 254 steps (1016 h): a 0 there with less
  // than 100 % sunlight means a night shorter than 4 h, and 1016 means 1016 h or more
  const nightText = (h, fromGrid, sun) => {
    if (!Number.isFinite(h)) return "—";
    if (fromGrid && h >= 1016) return "> " + fmtDur(1016);
    if (fromGrid && h === 0 && sun < 100) return "< " + fmtDur(4);
    return h > 0 ? fmtDur(h) : t("none");
  };
  function fmtDur(h) {
    if (h >= 48) return fmt(h / 24, 1) + " " + t("days");
    const tot = Math.round(h * 60),
      hh = Math.floor(tot / 60),
      mm = tot % 60;
    if (hh === 0) return mm + " " + t("min");
    return hh + " " + t("h") + (mm ? " " + mm + " " + t("min") : "");
  }

  // Time zones (the calculator works in Spain time or UTC)
  function tzOffsetMs(ms, tz) {
    if (tz === "UTC") return 0;
    const p = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).formatToParts(new Date(ms)),
      g = (k) => +p.find((x) => x.type === k).value;
    return (
      Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second")) -
      Math.floor(ms / 1000) * 1000
    );
  }
  function zonedToUtc(d, h, tz) {
    const [Y, Mo, Dd] = d.split("-").map(Number),
      [hh, mm] = h.split(":").map(Number),
      guess = Date.UTC(Y, Mo - 1, Dd, hh, mm);
    let u = guess - tzOffsetMs(guess, tz);
    const o2 = tzOffsetMs(u, tz);
    if (guess - o2 !== u) u = guess - o2;
    return u;
  }
  function partsIn(ms, tz) {
    const d = new Date(ms + tzOffsetMs(ms, tz)),
      pad = (n) => String(n).padStart(2, "0");
    return {
      date: d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()),
      time: pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()),
    };
  }
  const plotX = (ms, tz) => {
    const p = partsIn(ms, tz);
    return p.date + " " + p.time;
  };
  const fmtWhen = (ms, tz, y) =>
    new Date(ms).toLocaleString(LANG === "es" ? "es-ES" : "en-GB", {
      timeZone: tz,
      day: "numeric",
      month: "short",
      year: y ? "numeric" : undefined,
      hour: "2-digit",
      minute: "2-digit",
    });
  const tzShort = (tz) => (tz === "UTC" ? t("tz_short_utc") : t("tz_short_es"));

  // Data loading
  let D,
    M,
    NX,
    NY,
    STEP,
    HILL,
    DEM,
    worker,
    workerReady,
    C = [];
  const G = {},
    OVER = {},
    LAYERS = ["sun", "earth", "both", "relief"];
  const loadImg = (src) =>
    new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
  // The map layers are read as raw bytes (see DATA.md), not through a canvas:
  // some browsers add noise to canvas reads and the numbers would change.
  const dataFetch = (name) => fetch("data/" + name, { cache: "no-store" });
  async function rasterBytes(entry, w, h) {
    if (!entry || entry.width !== w || entry.height !== h || entry.channels !== 3)
      throw new Error("Invalid scientific raster metadata");
    const response = await dataFetch(entry.file);
    if (!response.ok) throw new Error("Raster not found: " + entry.file);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== w * h * 3) throw new Error("Invalid scientific raster size: " + entry.file);
    if (globalThis.crypto && crypto.subtle) {
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (x) =>
        x.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== entry.sha256) throw new Error("Scientific raster checksum mismatch: " + entry.file);
    }
    return bytes;
  }
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  // Colour scales: one blue ramp for the three visibility layers (dark = low %, light = high %),
  // a grey ramp for the relief
  const BLUES = ["#13233b", "#193b61", "#20517e", "#28699c", "#4185b6", "#69a2cf", "#92c0e4", "#c2def4", "#f1f8ff"];
  const CMAP = {
    sun: { min: 0, max: 100, unit: " %", stops: BLUES },
    earth: { min: 0, max: 100, unit: " %", stops: BLUES },
    both: { min: 0, max: 100, unit: " %", stops: BLUES },
    relief: {
      min: -4000,
      max: 5000,
      unit: "",
      stops: ["#18212b", "#303a45", "#49535e", "#626c76", "#7f8891", "#9ca4ac", "#b9c0c6", "#d5dade", "#f1f3f5"],
    },
  };
  Object.values(CMAP).forEach((c) => (c.rgb = c.stops.map(hex)));
  function colorFor(L, v) {
    const c = CMAP[L],
      x = Math.max(0, Math.min(1, (v - c.min) / (c.max - c.min))) * 8,
      i = Math.min(7, Math.floor(x)),
      f = x - i;
    return [0, 1, 2].map((j) => c.rgb[i][j] + (c.rgb[i + 1][j] - c.rgb[i][j]) * f);
  }
  let EPH_OK = false;
  async function loadEphem() {
    const r = await dataFetch("ephem_6h.json");
    if (!r.ok) throw new Error("ephem " + r.status);
    const j = await r.json(),
      bin = atob(j.data),
      u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    Lunar.loadEphem(u8.buffer);
    EPH_OK = true;
    const [a, b] = Lunar.ephemRange(),
      iso = (ms) => new Date(ms).toISOString().slice(0, 10);
    for (const id of ["d0", "d1", "ltDate", "dmDate"]) {
      const el = document.getElementById(id);
      if (el) {
        el.min = iso(a);
        el.max = iso(b - 86400000);
      }
    }
  }
  async function loadData() {
    const r = await dataFetch("site.json");
    if (!r.ok) throw new Error("data " + r.status);
    D = await r.json();
    M = D.meta;
    NX = M.nx;
    NY = M.ny;
    STEP = M.step;
    CMAP.relief.min = Math.round(M.relief_range[0] / 100) * 100;
    CMAP.relief.max = Math.round(M.relief_range[1] / 100) * 100;
    const manifestResponse = await dataFetch("rasters.json");
    if (!manifestResponse.ok) throw new Error("Missing raster manifest");
    const manifest = await manifestResponse.json();
    const [hill, pd, pe, pa, po, px] = await Promise.all([
      loadImg(D.img.hill),
      rasterBytes(manifest.data, NX, NY),
      rasterBytes(manifest.elev, NX, NY),
      rasterBytes(manifest.aux, NX, NY),
      rasterBytes(manifest.own, NX, NY),
      rasterBytes(manifest.dem, D.dem.nx, D.dem.ny),
    ]);
    HILL = hill;
    const n = NX * NY;
    for (const k of ["sun", "earth", "both", "z", "slope", "dark", "osun", "oearth"]) G[k] = new Float32Array(n);
    G.valid = new Uint8Array(n);
    G.psr = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const r0 = pd[i * 3];
      G.valid[i] = r0 > 200 || pd[i * 3 + 1] > 200 || pd[i * 3 + 2] > 200 ? 0 : 1;
      G.sun[i] = r0 / 2;
      G.earth[i] = pd[i * 3 + 1] / 2;
      G.both[i] = pd[i * 3 + 2] / 2;
      G.z[i] = pe[i * 3] * 256 + pe[i * 3 + 1] - 10000;
      G.slope[i] = pe[i * 3 + 2] / 4;
      G.dark[i] = pa[i * 3] * 4;
      G.psr[i] = pa[i * 3 + 1] > 127 ? 1 : 0;
      // our own Nov 2026 - Dec 2027 figures (sun, earth, both from the same calculation)
      G.osun[i] = po[i * 3] / 2;
      G.oearth[i] = po[i * 3 + 1] / 2;
    }
    for (const L of LAYERS) {
      const c = document.createElement("canvas");
      c.width = NX;
      c.height = NY;
      const g = c.getContext("2d"),
        im = g.createImageData(NX, NY);
      for (let i = 0; i < n; i++) {
        if (!G.valid[i]) continue;
        const col = colorFor(L, L === "relief" ? G.z[i] : G[L][i]);
        im.data[i * 4] = col[0];
        im.data[i * 4 + 1] = col[1];
        im.data[i * 4 + 2] = col[2];
        im.data[i * 4 + 3] = 255;
      }
      g.putImageData(im, 0, 0);
      OVER[L] = c;
    }
    const pc = document.createElement("canvas");
    pc.width = NX;
    pc.height = NY;
    const pg = pc.getContext("2d"),
      pim = pg.createImageData(NX, NY);
    for (let i = 0; i < n; i++)
      if (G.psr[i]) {
        pim.data[i * 4] = 0;
        pim.data[i * 4 + 1] = 230;
        pim.data[i * 4 + 2] = 255;
        pim.data[i * 4 + 3] = 210;
      }
    pg.putImageData(pim, 0, 0);
    OVER.psr = pc;
    const dz = new Float32Array(D.dem.nx * D.dem.ny);
    for (let i = 0; i < dz.length; i++) {
      const v = px[i * 3] * 256 + px[i * 3 + 1];
      dz[i] = v === 0 ? NaN : v * D.dem.scale + D.dem.offset;
    }
    DEM = { z: dz, nx: D.dem.nx, ny: D.dem.ny, x0: D.dem.x0, y0: D.dem.y0, px: D.dem.px };
    const bin = atob(D.candH.b64),
      u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const naz = D.candH.naz;
    if (u8.length !== D.cands.length * naz * 2) throw new Error("Invalid candidate horizon size");
    const h16 = new Int16Array(u8.buffer);
    C = D.cands.map((c, k) => {
      const H = new Float32Array(naz);
      for (let a = 0; a < naz; a++) H[a] = h16[k * naz + a] * D.candH.scale;
      return Object.assign({}, c, { H });
    });
    worker = new Worker("js/worker.js");
    workerReady = new Promise((res, rej) => {
      worker.onmessage = (e) => {
        if (e.data.type === "ready") res();
        else onWorker(e.data);
      };
      worker.onerror = (e) => rej(new Error("worker: " + (e.message || "error")));
    });
    worker.postMessage({ type: "init", dem: DEM });
  }
  const pending = new Map();
  let reqId = 0;
  function onWorker(m) {
    const p = pending.get(m.id);
    if (!p) return;
    if (m.type === "progress") {
      if (p.progress) p.progress(m.f);
      return;
    }
    pending.delete(m.id);
    if (m.type === "error") p.rej(new Error(m.message));
    else p.res(m);
  }
  async function ask(msg, progress, transfer) {
    await workerReady;
    return new Promise((res, rej) => {
      const id = ++reqId;
      pending.set(id, { res, rej, progress });
      worker.postMessage(Object.assign({ id }, msg), transfer || []);
    });
  }

  const LISTS = { both: [], sun: [], earth: [] };
  // Place name from the IAU list: the crater/mountain whose circle (official diameter) contains the point,
  // otherwise the closest one.
  function placeName(x, y) {
    let best = null;
    for (const f of D.features) {
      if (f.d < 5) continue;
      const edge = Math.hypot(x - f.x, y - f.y) / 1000 - f.d / 2,
        key = edge < 0 ? edge / f.d : edge;
      if (!best || key < best.key) best = { key, name: f.name, inside: edge < 0, km: Math.max(0, edge) };
    }
    return best;
  }
  const nameOf = (p) => {
    const n = p._pn || (p._pn = placeName(p.x, p.y));
    return t(n.inside ? "in_f" : "near", { n: n.name });
  };
  function prepPoints() {
    D.points.forEach((p) => (p.H = Float32Array.from(p.horizon720)));
    LISTS.both = D.points.filter((p) => p.kinds.includes("both")).sort((a, b) => b.both - a.both);
    LISTS.sun = D.points.filter((p) => p.kinds.includes("sun")).sort((a, b) => b.nasa_sun - a.nasa_sun);
    LISTS.earth = D.points
      .filter((p) => p.kinds.includes("earth"))
      .sort((a, b) => b.nasa_earth - a.nasa_earth || b.nasa_sun - a.nasa_sun);
  }
  function gridAt(x, y) {
    const i = Math.floor((x - M.xmin) / STEP),
      j = Math.floor((M.ymax - y) / STEP);
    if (i < 0 || j < 0 || i >= NX || j >= NY) return -1;
    return j * NX + i;
  }
  function bearingKm(a, b) {
    const [, lon] = Lunar.xyToLatLon(a.x, a.y),
      l = (lon * Math.PI) / 180,
      dx = b.x - a.x,
      dy = b.y - a.y,
      no = dx * Math.sin(l) + dy * Math.cos(l),
      ea = dx * Math.cos(l) - dy * Math.sin(l);
    return {
      km: Math.hypot(dx, dy) / 1000,
      dir: t("dirnames")[Math.round((((Math.atan2(ea, no) * 180) / Math.PI + 360) % 360) / 45) % 8],
    };
  }

  // Map view (canvas with zoom and pan)
  const rhoOfLat = (lat) => 2 * Lunar.R * Math.tan(((90 + lat) * Math.PI) / 360);
  class MapView {
    constructor(canvas, box, opts) {
      this.cv = canvas;
      this.box = box;
      this.ctx = canvas.getContext("2d");
      this.o = opts;
      this.layer = opts.layer || "sun";
      this.view = null;
      this.CW = 400;
      this.FIT = 1;
      this.opt = { names: true, grid: true, psr: false, terrain: true };
      this.readout = box.querySelector(".readout");
      this.ptrs = new Map();
      this.moved = false;
      this.pinch = null;
      this.last = null;
      const c = canvas;
      c.addEventListener("pointerdown", (e) => {
        c.setPointerCapture(e.pointerId);
        this.ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
        this.moved = false;
        this.last = { x: e.offsetX, y: e.offsetY };
        if (this.ptrs.size === 2) {
          const [a, b] = [...this.ptrs.values()];
          this.pinch = {
            d: Math.hypot(a.x - b.x, a.y - b.y),
            mpp: this.view.mpp,
            mid: this.toW((a.x + b.x) / 2, (a.y + b.y) / 2),
          };
        }
      });
      c.addEventListener("pointermove", (e) => {
        if (this.ptrs.has(e.pointerId)) {
          this.ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
          if (this.ptrs.size === 2 && this.pinch) {
            const [a, b] = [...this.ptrs.values()],
              d = Math.hypot(a.x - b.x, a.y - b.y);
            this.view.mpp = (this.pinch.mpp * this.pinch.d) / Math.max(d, 1);
            const mu = (a.x + b.x) / 2,
              mv = (a.y + b.y) / 2;
            this.view.cx = this.pinch.mid[0] - (mu - this.CW / 2) * this.view.mpp;
            this.view.cy = this.pinch.mid[1] + (mv - this.CW / 2) * this.view.mpp;
            this.moved = true;
            this.draw();
            return;
          }
          const dx = e.offsetX - this.last.x,
            dy = e.offsetY - this.last.y;
          if (Math.abs(dx) + Math.abs(dy) > 4 || this.moved) {
            this.moved = true;
            c.classList.add("dragging");
            this.view.cx -= dx * this.view.mpp;
            this.view.cy += dy * this.view.mpp;
            this.last = { x: e.offsetX, y: e.offsetY };
            this.draw();
          }
        } else if (e.pointerType === "mouse") {
          const [x, y] = this.toW(e.offsetX, e.offsetY);
          this.setReadout(x, y);
          c.style.cursor = this.hit(e.offsetX, e.offsetY) ? "pointer" : "grab";
        }
      });
      const end = (e) => {
        if (!this.ptrs.has(e.pointerId)) return;
        this.ptrs.delete(e.pointerId);
        c.classList.remove("dragging");
        if (this.ptrs.size < 2) this.pinch = null;
        if (!this.moved && this.ptrs.size === 0 && e.type === "pointerup") {
          const m = this.hit(e.offsetX, e.offsetY);
          if (m) {
            if (m.zone !== undefined) this.o.onZone && this.o.onZone(m.zone);
            else this.o.onMarker && this.o.onMarker(m.obj);
          } else {
            const [x, y] = this.toW(e.offsetX, e.offsetY),
              i = gridAt(x, y);
            this.setReadout(x, y);
            if (i >= 0 && G.valid[i] && this.o.onPick) this.o.onPick(x, y);
          }
        }
        if (this.ptrs.size === 0) this.moved = false;
      };
      c.addEventListener("pointerup", end);
      c.addEventListener("pointercancel", end);
      c.addEventListener("pointerleave", (e) => {
        if (e.pointerType === "mouse" && !this.ptrs.size) this.setReadout(null);
      });
      c.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          const [x, y] = this.toW(e.offsetX, e.offsetY);
          this.view.mpp *= Math.exp(e.deltaY * 0.0015);
          this.clamp();
          this.view.cx = x - (e.offsetX - this.CW / 2) * this.view.mpp;
          this.view.cy = y + (e.offsetY - this.CW / 2) * this.view.mpp;
          this.draw();
        },
        { passive: false },
      );
      box.querySelectorAll(".zoom button").forEach(
        (b) =>
          (b.onclick = () => {
            const z = b.dataset.z;
            if (z === "in") this.view.mpp /= 1.6;
            else if (z === "out") this.view.mpp *= 1.6;
            else this.reset();
            this.draw();
          }),
      );
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(box);
    }
    reset() {
      this.view = { cx: (M.xmin + M.xmax) / 2, cy: (M.ymin + M.ymax) / 2, mpp: this.FIT };
      if (this.o.fit) this.o.fit(this);
    }
    resize() {
      const w = this.cv.clientWidth;
      if (!w) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.cv.width = Math.round(w * dpr);
      this.cv.height = Math.round(w * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fit = (M.xmax - M.xmin) / w;
      if (!this.view) {
        this.CW = w;
        this.FIT = fit;
        this.reset();
      } else {
        this.view.mpp *= fit / this.FIT;
        this.FIT = fit;
        this.CW = w;
      }
      this.draw();
      this.setReadout(null);
    }
    toS(x, y) {
      return [(x - this.view.cx) / this.view.mpp + this.CW / 2, (this.view.cy - y) / this.view.mpp + this.CW / 2];
    }
    toW(u, v) {
      return [this.view.cx + (u - this.CW / 2) * this.view.mpp, this.view.cy - (v - this.CW / 2) * this.view.mpp];
    }
    clamp() {
      const v = this.view;
      v.mpp = Math.max(25, Math.min(this.FIT * 1.25, v.mpp));
      const half = (this.CW / 2) * v.mpp,
        wx = (M.xmax - M.xmin) / 2;
      const lo = M.xmin + Math.min(half, wx),
        hi = M.xmax - Math.min(half, wx);
      v.cx = Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), v.cx));
      const lo2 = M.ymin + Math.min(half, wx),
        hi2 = M.ymax - Math.min(half, wx);
      v.cy = Math.max(Math.min(lo2, hi2), Math.min(Math.max(lo2, hi2), v.cy));
    }
    flyTo(x, y, z) {
      if (!this.view) return;
      this.view.mpp = this.FIT / (z || 3);
      this.view.cx = x;
      this.view.cy = y;
      this.draw();
    }
    hit(u, v) {
      let best = null,
        bd = 20;
      for (const m of this.o.markers ? this.o.markers() : []) {
        if (m.dot) continue;
        const [a, b] = this.toS(m.x, m.y),
          d = Math.hypot(a - u, b - v);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      if (best) return best;
      for (const z of this.o.zones ? this.o.zones() : []) {
        const [a, b] = this.toS(z.cx, z.cy);
        if (Math.hypot(a - u, b - v) <= Math.max(16, z.r / this.view.mpp)) return { zone: z.id };
      }
      return null;
    }
    setReadout(x, y) {
      if (!this.readout) return;
      if (x === null) {
        this.readout.textContent = t("ro_hint");
        this.readout.classList.add("idle");
        return;
      }
      this.readout.classList.remove("idle");
      const i = gridAt(x, y);
      if (this.layer === "relief" && i >= 0 && G.valid[i]) {
        this.readout.innerHTML = `<b>${t("ro_relief", { z: fmt(G.z[i]), p: fmt(G.slope[i]) })}</b><br>${fmtLL(...Lunar.xyToLatLon(x, y))}`;
        return;
      }
      const d = this === moreMap ? dateValues(x, y) : null;
      if (d && i >= 0 && G.valid[i]) {
        this.readout.innerHTML = `<b>${t("ro_dates", { s: pct(d.sun), e: pct(d.earth), b: pct(d.both), z: fmt(G.z[i]) })}</b><br>${fmtLL(...Lunar.xyToLatLon(x, y))}`;
        return;
      }
      if ((this === moreMap && DM.mode === "dates" && !d && this.layer !== "relief") || i < 0 || !G.valid[i]) {
        this.readout.textContent = t("ro_nodata");
        return;
      }
      const [la, lo] = Lunar.xyToLatLon(x, y);
      this.readout.innerHTML =
        this.layer === "both"
          ? `<b>${t("ro_own", { s: pct(G.osun[i]), e: pct(G.oearth[i]), b: pct(G.both[i]), z: fmt(G.z[i]) })}</b><br>${fmtLL(la, lo)}`
          : `<b>${t("ro_line", { s: fmt(G.sun[i], 1), e: fmt(G.earth[i], 1), z: fmt(G.z[i]), p: fmt(G.slope[i]) })}</b><br>${fmtLL(la, lo)}`;
    }
    label(s, u, v, color, size, weight) {
      const g = this.ctx;
      g.font = `${weight || 600} ${size}px "Segoe UI", Arial, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineWidth = 3.5;
      g.strokeStyle = "rgba(6,8,12,.85)";
      g.strokeText(s, u, v);
      g.fillStyle = color;
      g.fillText(s, u, v);
    }
    draw() {
      if (!this.view || !HILL) return;
      this.clamp();
      const g = this.ctx,
        CW = this.CW;
      g.clearRect(0, 0, CW, CW);
      g.fillStyle = "#06080c";
      g.fillRect(0, 0, CW, CW);
      const [u0, v0] = this.toS(M.xmin, M.ymax),
        [u1, v1] = this.toS(M.xmax, M.ymin);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.save();
      g.beginPath();
      g.rect(u0, v0, u1 - u0, v1 - v0);
      g.clip();
      // relief underneath, colours on top; with the relief switched off the colours match the legend exactly
      g.drawImage(HILL, u0, v0, u1 - u0, v1 - v0);
      // "Your dates" before the user has calculated anything: relief only
      const waiting = this === moreMap && DM.mode === "dates" && !DM.maps && this.layer !== "relief";
      if (this.layer !== "plain" && !waiting) {
        g.globalAlpha = this.opt.terrain ? 0.65 : 1;
        const dm = this === moreMap ? dateLayer(this.layer) : null;
        if (dm) {
          const [a0, b0] = this.toS(dm.xmin, dm.ymax),
            [a1, b1] = this.toS(dm.xmax, dm.ymin);
          g.imageSmoothingEnabled = false; // show the 1 km cells as they are, no blending
          g.drawImage(dm.canvas, 0, 0, dm.canvas.width, dm.canvas.height, a0, b0, a1 - a0, b1 - b0);
          g.imageSmoothingEnabled = true;
        } else g.drawImage(OVER[this.layer], u0, v0, u1 - u0, v1 - v0);
      }
      g.restore();
      if (this.opt.psr) {
        g.imageSmoothingEnabled = false;
        g.drawImage(OVER.psr, u0, v0, u1 - u0, v1 - v0);
        g.imageSmoothingEnabled = true;
      }
      const [pu, pv] = this.toS(0, 0),
        mpp = this.view.mpp;
      if (this.opt.grid) {
        g.lineWidth = 1;
        for (const lat of [-89, -88, -87, -86, -85, -84, -83]) {
          g.strokeStyle = lat === -84 ? "rgba(255,255,255,.75)" : "rgba(255,255,255,.2)";
          g.setLineDash(lat === -84 ? [6, 5] : []);
          g.beginPath();
          g.arc(pu, pv, rhoOfLat(lat) / mpp, 0, Math.PI * 2);
          g.stroke();
        }
        g.setLineDash([]);
        g.strokeStyle = "rgba(255,255,255,.12)";
        for (let lon = 0; lon < 360; lon += 30) {
          const a = (lon * Math.PI) / 180,
            r = rhoOfLat(-80) / mpp;
          g.beginPath();
          g.moveTo(pu, pv);
          g.lineTo(pu + Math.sin(a) * r, pv - Math.cos(a) * r);
          g.stroke();
        }
        for (const lat of [-88, -86, -84]) {
          const r = rhoOfLat(lat) / mpp,
            a = (-135 * Math.PI) / 180;
          this.label(
            lat === -84 ? t("zone84") : fmt(-lat, 0) + "° " + t("lat"),
            pu + Math.sin(a) * r,
            pv - Math.cos(a) * r,
            "rgba(255,255,255,.85)",
            11,
          );
        }
      }
      g.strokeStyle = "#fff";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(pu - 6, pv);
      g.lineTo(pu + 6, pv);
      g.moveTo(pu, pv - 6);
      g.lineTo(pu, pv + 6);
      g.stroke();
      if (this.opt.names) {
        const zoom = this.FIT / mpp;
        for (const f of D.features) {
          const minD = zoom > 4 ? 0 : zoom > 2 ? 10 : 20;
          if (f.d < minD) continue;
          const [u, v] = this.toS(f.x, f.y);
          if (u > -60 && v > -20 && u < CW + 60 && v < CW + 20)
            this.label(
              f.name,
              u,
              v,
              f.type === "Mons" ? "#ffe9a8" : "rgba(255,255,255,.92)",
              f.d >= 40 ? 13 : 11.5,
              f.d >= 40 ? 700 : 600,
            );
        }
      }
      for (const z of this.o.zones ? this.o.zones() : []) {
        const [u, v] = this.toS(z.cx, z.cy),
          r = Math.max(10, z.r / mpp);
        g.fillStyle = z.active ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)";
        g.beginPath();
        g.arc(u, v, r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = z.active ? "#fff" : "rgba(255,255,255,.75)";
        g.lineWidth = z.active ? 2.5 : 1.5;
        g.setLineDash(z.active ? [] : [5, 4]);
        g.stroke();
        g.setLineDash([]);
        if (z.label) {
          const ly = v - r - 13;
          g.beginPath();
          g.arc(u, ly, 12, 0, Math.PI * 2);
          g.fillStyle = z.active ? "#fff" : "rgba(20,24,32,.9)";
          g.fill();
          g.strokeStyle = "#fff";
          g.lineWidth = 1.5;
          g.stroke();
          g.fillStyle = z.active ? "#111" : "#fff";
          g.font = '800 13px "Public Sans", sans-serif';
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(z.label, u, ly + 0.5);
        }
      }
      for (const m of this.o.markers ? this.o.markers() : []) {
        const [u, v] = this.toS(m.x, m.y),
          R = m.size || 11;
        if (m.dot) {
          g.beginPath();
          g.arc(u, v, 3, 0, Math.PI * 2);
          g.fillStyle = "rgba(255,255,255,.8)";
          g.fill();
          continue;
        }
        g.beginPath();
        g.arc(u, v, R, 0, Math.PI * 2);
        g.fillStyle = m.fill || (m.sel ? "#ffffff" : m.color);
        g.fill();
        g.lineWidth = m.sel ? 3 : m.fill ? 2 : 1.5;
        g.strokeStyle = m.sel ? "#7bb7ff" : m.fill ? "#ffffff" : "#06080c";
        g.stroke();
        g.fillStyle = m.ink || "#06080c";
        g.font = `800 ${R > 10 ? 12 : 10.5}px "Public Sans", sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(m.label, u, v + 0.5);
      }
      // scale bar: the largest round distance that fits in about a fifth of the map
      const target = (this.view.mpp * Math.min(90, CW / 5)) / 1000;
      const scaleKm = [1, 2, 5, 10, 20, 50, 100].filter((v) => v <= target).pop() || 0.5;
      const length = (scaleKm * 1000) / this.view.mpp;
      const sx = CW - length - 20,
        sy = CW - 58;
      g.save();
      g.fillStyle = "rgba(6,8,12,.82)";
      g.fillRect(sx - 10, sy - 24, length + 20, 35);
      g.strokeStyle = "#fff";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(sx, sy - 5);
      g.lineTo(sx, sy);
      g.lineTo(sx + length, sy);
      g.lineTo(sx + length, sy - 5);
      g.stroke();
      g.font = '600 12px "Segoe UI", Arial, sans-serif';
      g.fillStyle = "#fff";
      g.textAlign = "center";
      g.textBaseline = "bottom";
      g.fillText(`${scaleKm} km`, sx + length / 2, sy - 7);
      g.restore();
      if (this.o.cross) {
        const c = this.o.cross();
        if (c) {
          const [u, v] = this.toS(c.x, c.y);
          g.strokeStyle = "#fff";
          g.lineWidth = 2.5;
          g.beginPath();
          g.arc(u, v, 9, 0, Math.PI * 2);
          g.stroke();
        }
      }
    }
  }
  function legendHTML(L, caption) {
    const c = CMAP[L],
      grad = c.stops.map((s, i) => `${s} ${(i / 8) * 100}%`).join(",");
    const ticks = [0, 1, 2, 3, 4]
      .map((k) => `<span class="num">${fmt(c.min + ((c.max - c.min) * k) / 4)}${c.unit}</span>`)
      .join("");
    return `<div class="bar" style="background:linear-gradient(90deg,${grad})"></div><div class="ticks">${ticks}</div><div class="cap">${caption || t("LG_" + L)}</div>`;
  }

  // Small canvas charts
  function prepCanvas(c) {
    const w = c.clientWidth,
      h = parseInt(c.getAttribute("height")),
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.height = h + "px";
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [g, w, h];
  }
  const SUNC = () => cssv("--sun"),
    EARTHC = () => cssv("--earth");
  // 360 deg view from the spot: mountain outline and the paths of the Sun and the Earth
  function drawPanorama(c, hz, sunTr, earthTr) {
    if (!c || !c.clientWidth) return;
    const [g, w, h] = prepCanvas(c);
    const pad = { l: 43, r: 12, t: 10, b: 28 },
      pw = w - pad.l - pad.r,
      ph = h - pad.t - pad.b,
      els = hz.concat(
        sunTr.map((s) => s[1]),
        earthTr.map((s) => s[1]),
      );
    let lo = Math.max(-10, Math.floor(Math.min(...els) - 0.5)),
      hi = Math.ceil(Math.max(...els) + 0.8);
    hi = Math.max(hi, lo + 4);
    const X = (a) => pad.l + (a / 360) * pw,
      Y = (e) => pad.t + ((hi - Math.max(lo, Math.min(hi, e))) / (hi - lo)) * ph;
    g.fillStyle = cssv("--chart-bg");
    g.fillRect(0, 0, w, h);
    g.font = "14px 'Public Sans', Arial, sans-serif";
    g.fillStyle = cssv("--chart-ink");
    g.strokeStyle = cssv("--chart-grid");
    g.lineWidth = 1;
    const step = hi - lo > 12 ? 4 : hi - lo > 6 ? 2 : 1;
    for (let e = Math.ceil(lo / step) * step; e <= hi; e += step) {
      g.beginPath();
      g.moveTo(pad.l, Y(e));
      g.lineTo(w - pad.r, Y(e));
      g.stroke();
      g.textAlign = "right";
      g.textBaseline = "middle";
      g.fillText(e + "°", pad.l - 5, Y(e));
    }
    const dirs = t("dirs");
    for (let k = 0; k <= 4; k++) {
      g.textAlign = "center";
      g.textBaseline = "top";
      g.fillText(dirs[k], X(k * 90), h - pad.b + 5);
    }
    g.beginPath();
    g.moveTo(X(0), Y(lo));
    for (let a = 0; a < 360; a++) g.lineTo(X(a), Y(hz[a]));
    g.lineTo(X(360), Y(hz[0]));
    g.lineTo(X(360), Y(lo));
    g.closePath();
    g.fillStyle = cssv("--hz-fill");
    g.fill();
    g.strokeStyle = cssv("--hz-line");
    g.stroke();
    const dots = (arr, col) => {
      g.strokeStyle = col;
      g.lineCap = "round";
      for (let i = 1; i < arr.length; i++) {
        const [a0, e0, v0] = arr[i - 1],
          [a1, e1, v1] = arr[i];
        if (Math.abs(a1 - a0) > 180) continue;
        const vis = v0 && v1;
        g.globalAlpha = vis ? 1 : 0.35;
        g.lineWidth = vis ? 3 : 1.5;
        g.setLineDash(vis ? [] : [3, 3]);
        g.beginPath();
        g.moveTo(X(a0), Y(e0));
        g.lineTo(X(a1), Y(e1));
        g.stroke();
      }
      g.globalAlpha = 1;
      g.setLineDash([]);
      g.lineWidth = 1;
    };
    dots(earthTr, EARTHC());
    dots(sunTr, SUNC());
    const ends = (arr, col, name) => {
      if (!arr.length) return;
      const [a0, e0] = arr[0],
        [a1, e1] = arr[arr.length - 1];
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.fillStyle = cssv("--chart-bg");
      g.beginPath();
      g.arc(X(a0), Y(e0), 5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = col;
      g.beginPath();
      g.arc(X(a1), Y(e1), 5.5, 0, Math.PI * 2);
      g.fill();
      g.font = "600 14px 'Public Sans', Arial, sans-serif";
      g.textBaseline = "bottom";
      const right = X(a1) > w - 70;
      g.textAlign = right ? "right" : "left";
      g.fillText(name, X(a1) + (right ? -9 : 9), Y(e1) - 3);
      g.lineWidth = 1;
    };
    ends(earthTr, EARTHC(), t("ch_earth_n"));
    ends(sunTr, SUNC(), t("ch_sun_n"));
  }
  // Close-up of the Earth with the same scale on both axes, so its real size and monthly wobble are visible
  function drawEarthZoom(c, hzAt, earthTr) {
    if (!c || !c.clientWidth || !earthTr.length) return;
    const [g, w, h] = prepCanvas(c);
    const unwrap = (a) => {
      const d = ((a - earthTr[0][0] + 540) % 360) - 180;
      return earthTr[0][0] + d;
    };
    const az = earthTr.map((p) => unwrap(p[0])),
      el = earthTr.map((p) => p[1]);
    const cA = (Math.min(...az) + Math.max(...az)) / 2,
      cE = (Math.min(...el) + Math.max(...el)) / 2;
    const half = Math.max(
      4,
      (Math.max(...az) - Math.min(...az)) / 2 + 2.5,
      (((Math.max(...el) - Math.min(...el)) / 2 + 2.5) * w) / h,
    );
    const k = w / (2 * half),
      X = (a) => w / 2 + (a - cA) * k,
      Y = (e) => h / 2 - (e - cE) * k;
    g.fillStyle = cssv("--chart-bg");
    g.fillRect(0, 0, w, h);
    g.strokeStyle = cssv("--chart-grid");
    g.lineWidth = 1;
    g.font = "13px 'Public Sans', Arial, sans-serif";
    g.fillStyle = cssv("--chart-ink");
    for (let e = Math.ceil((cE - h / 2 / k) / 2) * 2; e <= cE + h / 2 / k; e += 2) {
      g.beginPath();
      g.moveTo(0, Y(e));
      g.lineTo(w, Y(e));
      g.stroke();
      if (Y(e) > 14) {
        g.textAlign = "left";
        g.textBaseline = "bottom";
        g.fillText(e + "°", 3, Y(e) - 1);
      }
    }
    g.beginPath();
    g.moveTo(0, h);
    for (let px = 0; px <= w; px += 2) {
      const a = cA + (px - w / 2) / k;
      g.lineTo(px, Y(hzAt(a)));
    }
    g.lineTo(w, h);
    g.closePath();
    g.fillStyle = cssv("--hz-fill");
    g.fill();
    g.strokeStyle = cssv("--hz-line");
    g.stroke();
    const col = EARTHC();
    g.strokeStyle = col;
    g.globalAlpha = 0.55;
    g.lineWidth = 1.5;
    g.beginPath();
    az.forEach((a, i) => (i ? g.lineTo(X(a), Y(el[i])) : g.moveTo(X(a), Y(el[i]))));
    g.stroke();
    g.globalAlpha = 1;
    const r = Lunar.EARTH_R * k,
      disc = (i, fill) => {
        g.beginPath();
        g.arc(X(az[i]), Y(el[i]), r, 0, Math.PI * 2);
        g.lineWidth = 2;
        g.strokeStyle = col;
        if (fill) {
          g.fillStyle = col;
          g.fill();
        } else {
          g.fillStyle = cssv("--chart-bg");
          g.globalAlpha = 0.85;
          g.fill();
          g.globalAlpha = 1;
          g.stroke();
        }
      };
    disc(0, false);
    disc(az.length - 1, true);
    g.fillStyle = cssv("--chart-ink");
    g.textAlign = "center";
    g.textBaseline = "top";
    g.font = "13px 'Public Sans', Arial, sans-serif";
    g.fillText(t("zoom_start"), X(az[0]), Y(el[0]) + r + 3);
    g.fillText(t("zoom_end"), X(az[az.length - 1]), Y(el[el.length - 1]) + r + 3);
  }
  const localHorizon = (p) => {
    const out = [];
    for (let a = 0; a < 360; a++) out.push(Lunar.horizonAtBearing(p.H, p.lon + a));
    return out;
  };
  function tracksFrom(res, maxN) {
    const n = res.sunEl.length,
      ev = Math.max(1, Math.ceil(n / (maxN || 500))),
      s = [],
      e = [];
    for (let i = 0; i < n; i += ev) {
      s.push([res.sunAz[i], res.sunEl[i], res.sunVis[i]]);
      e.push([res.earthAz[i], res.earthEl[i], res.earthVis[i]]);
    }
    return [s, e];
  }
  function drawMonthly(c, p) {
    if (!c || !c.clientWidth) return;
    const [g, w, h] = prepCanvas(c);
    const pad = { l: 47, r: 8, t: 10, b: 32 },
      pw = w - pad.l - pad.r,
      ph = h - pad.t - pad.b,
      n = p.monthly.length,
      bw = pw / n,
      Y = (v) => pad.t + ((100 - v) / 100) * ph;
    g.fillStyle = cssv("--chart-bg");
    g.fillRect(0, 0, w, h);
    g.font = "14px 'Public Sans', Arial, sans-serif";
    g.fillStyle = cssv("--chart-ink");
    g.strokeStyle = cssv("--chart-grid");
    for (const v of [0, 50, 100]) {
      g.beginPath();
      g.moveTo(pad.l, Y(v));
      g.lineTo(w - pad.r, Y(v));
      g.stroke();
      g.textAlign = "right";
      g.textBaseline = "middle";
      g.fillText(v + "%", pad.l - 5, Y(v));
    }
    p.monthly.forEach((m, i) => {
      const x = pad.l + i * bw,
        b = Math.max(2, bw * 0.36);
      g.fillStyle = SUNC();
      g.fillRect(x + bw * 0.12, Y(m[1]), b, Y(0) - Y(m[1]));
      g.fillStyle = EARTHC();
      g.fillRect(x + bw * 0.12 + b, Y(m[2]), b, Y(0) - Y(m[2]));
      const mo = parseInt(m[0].slice(5, 7)) - 1;
      g.fillStyle = cssv("--chart-ink");
      g.textAlign = "center";
      g.textBaseline = "top";
      if (bw > 22 || i % 2 === 0) g.fillText(t("months")[mo], x + bw / 2, h - pad.b + 4);
    });
  }

  // Shadow maps
  const SH_N = 480,
    shGrid = () => ({ nx: SH_N, xmin: M.xmin, ymax: M.ymax, cell: (M.xmax - M.xmin) / SH_N });
  function sunInfo(s) {
    const n = Math.hypot(...s);
    return {
      el: (Math.asin(-s[2] / n) * 180) / Math.PI,
      bearing: ((Math.atan2(s[1], s[0]) * 180) / Math.PI + 360) % 360,
    };
  }
  function renderShadow(canvas, mask, info, zones) {
    const W = canvas.parentElement.clientWidth;
    if (!W) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = W * dpr;
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, W);
    g.drawImage(HILL, 0, 0, W, W);
    if (mask && mask.length === SH_N * SH_N) {
      const oc = document.createElement("canvas");
      oc.width = SH_N;
      oc.height = SH_N;
      const og = oc.getContext("2d"),
        im = og.createImageData(SH_N, SH_N);
      for (let i = 0; i < mask.length; i++) if (!mask[i]) im.data[i * 4 + 3] = 225;
      og.putImageData(im, 0, 0);
      g.drawImage(oc, 0, 0, W, W);
    }
    const sx = (x) => ((x - M.xmin) / (M.xmax - M.xmin)) * W,
      sy = (y) => ((M.ymax - y) / (M.ymax - M.ymin)) * W;
    g.font = "600 13px 'Public Sans', Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const f of D.features) {
      if (f.d < 30) continue;
      g.lineWidth = 3;
      g.strokeStyle = "rgba(0,0,0,.85)";
      g.strokeText(f.name, sx(f.x), sy(f.y));
      g.fillStyle = "#fff";
      g.fillText(f.name, sx(f.x), sy(f.y));
    }
    (zones || []).forEach((z, k) => {
      const r = (20000 / (M.xmax - M.xmin)) * W;
      g.strokeStyle = "#fff";
      g.lineWidth = z.active ? 2.5 : 1.5;
      g.beginPath();
      g.arc(sx(z.cx), sy(z.cy), r, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 3;
      g.strokeStyle = "#000";
      g.strokeText(String(k + 1), sx(z.cx), sy(z.cy) - r - 8);
      g.fillStyle = "#fff";
      g.fillText(String(k + 1), sx(z.cx), sy(z.cy) - r - 8);
    });
    if (info) {
      const a = (info.bearing * Math.PI) / 180,
        c = W / 2,
        R2 = W * 0.47;
      g.fillStyle = "#ffc24a";
      g.beginPath();
      g.arc(c + Math.sin(a) * R2, c - Math.cos(a) * R2, 9, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#000";
      g.lineWidth = 1.5;
      g.stroke();
    }
  }
  const maskLit = (m) => {
    let s = 0;
    for (let i = 0; i < m.length; i++) s += m[i];
    return (100 * s) / m.length;
  };

  // Screens (#inicio, #calculadora, #cargando, #resultados, #mas)
  const SCREENS = ["inicio", "calculadora", "cargando", "resultados", "mas", "info", "equipo"];
  let ROUTE = "inicio",
    RESULT = null,
    BUSY = false;
  function show(route) {
    if (!SCREENS.includes(route)) route = "inicio";
    if (route === "resultados" && !RESULT) route = "calculadora";
    if (route === "cargando" && !BUSY) route = RESULT ? "resultados" : "calculadora";
    ROUTE = route;
    document.body.dataset.route = route;
    document.getElementById("menuBtn").setAttribute("aria-expanded", "false");
    for (const s of SCREENS) document.getElementById("scr-" + s).hidden = s !== route;
    document
      .querySelectorAll("nav.main a")
      .forEach((a) =>
        a.setAttribute(
          "aria-current",
          a.dataset.route === route || (["resultados", "cargando"].includes(route) && a.dataset.route === "calculadora")
            ? "page"
            : "false",
        ),
      );
    document.querySelector("footer").hidden = route === "cargando";
    window.scrollTo(0, 0);
    requestAnimationFrame(() => {
      if (route === "mas") {
        moreMap.resize();
        renderMorePanel();
        if (LT.frames.length) showLT(LT.i);
        else renderShadow(document.getElementById("moreShadow"), null, null);
      }
      if (route === "equipo") renderTeam();
      if (route === "resultados" && resMap) {
        resMap.resize();
        renderSpotCharts();
      }
    });
  }
  function go(r) {
    if (location.hash !== "#" + r) location.hash = r;
    else show(r);
  }
  window.addEventListener("hashchange", () => show((location.hash || "#inicio").slice(1) || "inicio"));

  // Calculator
  let STAY = 7;
  // Reads the form and checks the dates are inside the ephemeris table (2025-2040)
  function readDates() {
    const tz = document.getElementById("tz").value,
      d0 = document.getElementById("d0").value,
      h0 = document.getElementById("h0").value;
    if (!d0 || !h0) return { err: "err_fill" };
    const a = zonedToUtc(d0, h0, tz);
    if (!isFinite(a)) return { err: "err_fill" };
    const [E0, E1] = Lunar.ephemRange();
    if (a < E0 || a > E1) return { err: "err_range" };
    let b;
    if (document.getElementById("customEnd").checked) {
      const d1 = document.getElementById("d1").value,
        h1 = document.getElementById("h1").value;
      if (!d1 || !h1) return { err: "err_fill" };
      b = zonedToUtc(d1, h1, tz);
    } else b = a + STAY * 86400000;
    if (b > E1) return { err: "err_range" };
    if (b <= a) return { err: "err_order" };
    if (b - a < 3600000) return { err: "err_min" };
    if (b - a > 3 * 366 * 86400000) return { err: "err_max" };
    return { a, b, tz };
  }
  // time step: the finest of these that keeps the run under ~6000 instants
  const pickStep = (ms) => {
    for (const m of [5, 10, 15, 30, 60, 120, 180, 360]) if (ms / (m * 60000) <= 6000) return m * 60000;
    return 720 * 60000;
  };
  function updateSummary() {
    const r = readDates(),
      s = document.getElementById("summary"),
      err = document.getElementById("calcErr");
    if (r.err) {
      s.textContent = "";
      err.textContent = r.err === "err_fill" ? "" : t(r.err);
      return;
    }
    err.textContent = "";
    s.textContent =
      t("c_sum", { a: fmtWhen(r.a, r.tz, true), b: fmtWhen(r.b, r.tz, true) }) + " (" + tzShort(r.tz) + ")";
  }
  function setStart(ms) {
    const tz = document.getElementById("tz").value,
      p = partsIn(ms, tz);
    document.getElementById("d0").value = p.date;
    document.getElementById("h0").value = p.time;
    syncEnd();
    updateSummary();
  }
  function syncEnd() {
    if (document.getElementById("customEnd").checked) return;
    const r = readDates();
    if (r.err) return;
    const p = partsIn(r.b, r.tz);
    document.getElementById("d1").value = p.date;
    document.getElementById("h1").value = p.time;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Analyse every candidate spot for the chosen dates, group them into 20 km zones
  // and show the rocket screen while it runs.
  async function runCalc() {
    if (BUSY) return;
    const err = document.getElementById("calcErr");
    if (!EPH_OK) {
      err.textContent = t("err_lib");
      return;
    }
    const r = readDates();
    if (r.err) {
      err.textContent = t(r.err);
      return;
    }
    BUSY = true;
    go("cargando");
    const steps = ["ls1", "ls2", "ls3", "ls4", "ls5"],
      ul = document.getElementById("lsteps");
    ul.innerHTML = steps.map((s) => `<li data-s="${s}">${t(s, { n: C.length })}</li>`).join("");
    const progress = document.getElementById("launchProgress"),
      stage = document.getElementById("launchStage");
    const mark = (s, st) => {
      const li = ul.querySelector(`[data-s="${s}"]`);
      if (li) li.className = st;
      const count = ul.querySelectorAll("li.done").length;
      stage.textContent = `${count} / ${steps.length}`;
      progress.setAttribute("aria-valuenow", count);
      progress.firstElementChild.style.width = `${(count / steps.length) * 100}%`;
    };
    const launch = document.getElementById("launch"),
      cd = document.getElementById("countdown");
    launch.classList.remove("go", "airborne");
    mark("ls1", "");
    cd.textContent = "T−03";
    void launch.offsetWidth;
    launch.classList.add("go");
    const t0 = performance.now();
    const launchTimers = [
      setTimeout(() => (cd.textContent = "T−02"), 700),
      setTimeout(() => (cd.textContent = "T−01"), 1400),
      setTimeout(() => {
        cd.textContent = t("liftoff");
        launch.classList.add("airborne");
      }, 2100),
      setTimeout(() => (cd.textContent = t("launch_flight")), 3900),
    ];
    try {
      mark("ls1", "doing");
      await sleep(300);
      mark("ls1", "done");
      mark("ls2", "doing");
      const step = pickStep(r.b - r.a),
        n = Math.floor((r.b - r.a) / step) + 1,
        eph = { T: new Float64Array(n), S: new Float64Array(n * 3), E: new Float64Array(n * 3), n, step };
      for (let i = 0; i < n; i++) {
        const tm = r.a + i * step,
          m = Lunar.moonFixed(tm);
        eph.T[i] = tm;
        eph.S.set(m.sun, i * 3);
        eph.E.set(m.earth, i * 3);
        if (i % 300 === 299) await sleep(0);
      }
      mark("ls2", "done");
      mark("ls3", "doing");
      const stats = [];
      for (let k = 0; k < C.length; k++) {
        stats.push(Lunar.analyse(C[k], eph, C[k].H).stats);
        if (k % 20 === 19) await sleep(0);
      }
      mark("ls3", "done");
      mark("ls4", "doing");
      await sleep(150);
      const periodH = (r.b - r.a) / 3600000,
        zones = Lunar.rankZones(C, stats, periodH, { radius: 20000, minSep: 40000, maxZones: 6, perZone: 6 });
      if (!zones.length) {
        BUSY = false;
        go("calculadora");
        err.textContent = t("err_none");
        return;
      }
      mark("ls4", "done");
      mark("ls5", "doing");
      zones.forEach((z) => (z.value = z.members.reduce((a, j) => a + stats[j].both, 0) / z.members.length));
      RESULT = { r, eph, stats, periodH, zones, zi: 0, si: 0, cache: new Map(), shadows: null };
      const wait = (matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 4350) - (performance.now() - t0);
      if (wait > 0) await sleep(wait);
      mark("ls5", "done");
      await sleep(250);
      BUSY = false;
      renderResults();
      go("resultados");
    } catch (e) {
      console.error(e);
      BUSY = false;
      go("calculadora");
      err.textContent = e.message;
    } finally {
      launchTimers.forEach(clearTimeout);
      launch.classList.remove("go", "airborne");
    }
  }

  // Results
  let resMap = null;
  const zoneName = (z) => nameOf(C[z.main]);
  function spotAnalysis(ci) {
    if (!RESULT.cache.has(ci)) RESULT.cache.set(ci, Lunar.analyse(C[ci], RESULT.eph, C[ci].H));
    return RESULT.cache.get(ci);
  }
  function resMarkers() {
    const R0 = RESULT;
    if (!R0) return [];
    const out = [];
    R0.zones.forEach((z, k) => {
      if (k !== R0.zi) z.members.forEach((ci) => out.push({ x: C[ci].x, y: C[ci].y, dot: true }));
    });
    R0.zones[R0.zi].members.forEach((ci, j) =>
      out.push({
        x: C[ci].x,
        y: C[ci].y,
        label: j ? String(j) : "P",
        color: j ? "#dfe3ea" : "#ffd36b",
        sel: j === R0.si,
        obj: { zone: R0.zi, spot: j },
        size: j ? 10 : 12,
      }),
    );
    return out;
  }
  function fitZones() {
    if (!resMap || !RESULT || !resMap.view) return;
    let x0 = 1e9,
      x1 = -1e9,
      y0 = 1e9,
      y1 = -1e9;
    for (const z of RESULT.zones) {
      const c = C[z.center];
      x0 = Math.min(x0, c.x - 30000);
      x1 = Math.max(x1, c.x + 30000);
      y0 = Math.min(y0, c.y - 30000);
      y1 = Math.max(y1, c.y + 44000);
    }
    resMap.view.cx = (x0 + x1) / 2;
    resMap.view.cy = (y0 + y1) / 2;
    resMap.view.mpp = Math.max(x1 - x0, y1 - y0) / resMap.CW;
    resMap.draw();
  }
  function selectZone(k, scroll) {
    RESULT.zi = k;
    RESULT.si = 0;
    renderZoneList();
    renderDetail();
    const z = RESULT.zones[k];
    resMap.flyTo(C[z.center].x, C[z.center].y, 4);
    if (scroll)
      document.getElementById("detail").scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
  }
  function selectSpot(j) {
    RESULT.si = j;
    resMap.draw();
    renderDetail();
  }
  function renderResults() {
    const R0 = RESULT,
      r = R0.r;
    if (resMap && resMap.observer) resMap.observer.disconnect();
    document.getElementById("resWrap").innerHTML = `
    <div class="journey"><a href="#calculadora"><b>01</b> ${t("step_dates")}</a><span class="active"><b>02</b> ${t("step_results")}</span><a href="#mas"><b>03</b> ${t("step_explore")}</a></div>
    <div class="res-head"><div><h1 style="font-size:clamp(30px,4vw,42px)">${t("r_h")}</h1><p class="muted num">${esc(t("r_period", { a: fmtWhen(r.a, r.tz, true), b: fmtWhen(r.b, r.tz, true), d: fmtDur(R0.periodH) }))} · ${tzShort(r.tz)}</p></div>
      <div class="res-actions"><button class="btn" id="resMaps">${t("see_maps")}</button><a class="btn" href="#calculadora">${t("r_change")}</a></div></div>
    <p class="result-intro muted">${t("result_intro")}</p>
    <div class="res-grid">
      <div class="result-map-panel"><h2 class="panel-title">${t("result_map")}</h2><div class="mapbox" id="resMapBox"><canvas id="resMap" role="img" aria-label="Mapa"></canvas><div class="north">${t("toEarth")}</div>
        <div class="zoom"><button data-z="in" aria-label="${t("zoom_in")}">+</button><button data-z="out" aria-label="${t("zoom_out")}">−</button><button data-z="reset" aria-label="${t("zoom_reset")}" style="font-size:16px">⟲</button></div><div class="readout"></div></div>
        <p class="small muted" style="margin-top:8px">${t("r_hint")}</p></div>
      <div class="result-list-panel"><h2 class="panel-title">${t("result_zones")}</h2><div class="zlist" id="zoneList"></div></div>
    </div>
    <div class="detail" id="detail"></div>`;
    document.getElementById("resMaps").onclick = () => openDateMaps(r.a, r.b);
    resMap = new MapView(document.getElementById("resMap"), document.getElementById("resMapBox"), {
      layer: "plain",
      markers: resMarkers,
      fit: () => requestAnimationFrame(fitZones),
      zones: () =>
        RESULT
          ? RESULT.zones.map((z, k) => ({
              id: k,
              cx: C[z.center].x,
              cy: C[z.center].y,
              r: 20000,
              active: k === RESULT.zi,
              label: String(k + 1),
            }))
          : [],
      onZone: (k) => selectZone(k, false),
      onMarker: (o) => {
        if (o.zone === RESULT.zi) selectSpot(o.spot);
      },
    });
    resMap.opt.grid = false;
    renderZoneList();
    renderDetail();
  }
  function renderZoneList() {
    const R0 = RESULT;
    document.getElementById("zoneList").innerHTML = R0.zones
      .map((z, k) => {
        const s = R0.stats[z.main];
        return `<button class="zrow" data-k="${k}" aria-pressed="${k === R0.zi}"><span class="n">${k + 1}</span><span><b>${esc(zoneName(z))}</b><span class="vals"><span class="sun">${t("sun_w")} ${pct(s.sun)} %</span> · <span class="earth">${t("earth_w")} ${pct(s.earth)} %</span> · ${t("spots_n", { n: z.members.length })}</span></span>
      <span class="big num">${pct(s.both)} %<small>${t("both_short")}</small></span></button>`;
      })
      .join("");
    document.querySelectorAll("#zoneList .zrow").forEach((b) => (b.onclick = () => selectZone(+b.dataset.k, true)));
  }
  function renderDetail() {
    const R0 = RESULT,
      z = R0.zones[R0.zi],
      ci = z.members[R0.si],
      c = C[ci],
      s = spotAnalysis(ci).stats,
      r = R0.r;
    const longest = s.windows.reduce((b, w) => (!b || w[1] - w[0] > b[1] - b[0] ? w : b), null);
    const spots = z.members
      .map((cj, j) => {
        const sj = R0.stats[cj],
          bk = j ? bearingKm(C[z.members[0]], C[cj]) : null;
        return `<button class="spot" data-j="${j}" aria-pressed="${j === R0.si}"><b>${j ? t("d_backup", { k: j }) : t("d_main")}</b><span class="num">${pct(sj.both)} % ${t("both_short")}${bk ? " · " + fmt(bk.km, 1) + " km " + bk.dir : ""}</span></button>`;
      })
      .join("");
    const rows = z.members
      .map((cj, j) => {
        const sj = R0.stats[cj],
          bk = j ? bearingKm(C[z.members[0]], C[cj]) : null;
        return `<tr class="${j === R0.si ? "sel" : ""}"><td>${j ? t("d_backup", { k: j }) : t("d_main")}</td><td class="num">${fmtLL(C[cj].lat, C[cj].lon)}</td><td class="r">${bk ? fmt(bk.km, 1) + " km " + bk.dir : "—"}</td><td class="r">${fmt(C[cj].z)} m</td><td class="r">${fmt(C[cj].slope, 1)}°</td><td class="r">${pct(sj.both)} %</td><td class="r">${pct(sj.sun)} %</td><td class="r">${pct(sj.earth)} %</td><td class="r">${fmtDur(sj.longestDarkH)}</td><td class="r">${fmtDur(sj.longestGapH)}</td></tr>`;
      })
      .join("");
    const wins = s.windows,
      winRows = wins
        .slice(0, 30)
        .map(
          (w) =>
            `<tr><td>${esc(fmtWhen(w[0], r.tz, true))}</td><td>${esc(fmtWhen(w[1], r.tz, true))}</td><td class="r">${fmtDur((w[1] - w[0] + R0.eph.step) / 3600000)}</td></tr>`,
        )
        .join("");
    const zrows = R0.zones
      .map((zz, k) => {
        const sm = R0.stats[zz.main];
        return `<tr class="click ${k === R0.zi ? "sel" : ""}" data-k="${k}"><td>${k + 1}</td><td>${esc(zoneName(zz))}</td><td class="r">${pct(zz.value)} %</td><td class="r">${pct(sm.both)} %</td><td class="r">${pct(sm.sun)} %</td><td class="r">${pct(sm.earth)} %</td><td class="r">${fmtDur(sm.longestDarkH)}</td></tr>`;
      })
      .join("");
    const nSh = Math.max(2, Math.min(12, Math.round(R0.periodH)));
    document.getElementById("detail").innerHTML = `
    <div><p class="eyebrow">${t("result_detail")}</p><h2>${esc(t("zone", { n: R0.zi + 1 }))} · ${esc(zoneName(z))}</h2><p class="muted num">${R0.si ? t("d_backup", { k: R0.si }) : t("d_main")} · ${fmtLL(c.lat, c.lon)} · ${fmt(c.z)} m</p></div>
    <div class="kpis">
      <div><b class="num bothc">${pct(s.both)} %</b><span>${t("k_both")}</span></div>
      <div><b class="num sun">${pct(s.sun)} %</b><span>${t("k_sun")}</span></div>
      <div><b class="num earth">${pct(s.earth)} %</b><span>${t("k_earth")}</span></div>
      <div><b class="num">${s.longestDarkH > 0 ? fmtDur(s.longestDarkH) : t("none")}</b><span>${t("k_night")}</span></div>
    </div>
    <p class="small muted">${t("result_note")}</p>
    <p class="callout">${longest ? esc(t("best_moment", { a: fmtWhen(longest[0], r.tz), b: fmtWhen(longest[1], r.tz), d: fmtDur((longest[1] - longest[0] + R0.eph.step) / 3600000) })) : t("no_moment")}</p>
    <div><h3>${t("backups_h")}</h3><p class="small muted" style="margin:2px 0 10px">${t("backups_p")}</p><div class="spots">${spots}</div></div>
    <details class="analysis-disclosure" id="chartDetails"><summary>${t("result_charts")}</summary><h3>${t("ch_h")}</h3><p class="small muted" style="margin:2px 0 8px">${t("ch_p")}</p><div class="charts"><div id="plotSun" class="plot"></div><div id="plotEarth" class="plot"></div></div></details>
    <details class="analysis-disclosure" id="panoDetails"><summary>${t("result_horizon")}</summary><h3>${t("pano_h")}</h3><p class="small muted" style="margin:2px 0 8px">${t("pano_p")}</p><div class="panoRow"><canvas class="chart" id="resPano" height="200"></canvas><figure class="zoomBox"><canvas class="chart" id="resZoom" height="200"></canvas><figcaption class="small muted">${t("zoom_cap")}</figcaption></figure></div><details class="why"><summary>${t("why_h")}</summary><p class="small">${t("why_p")}</p></details></details>
    <div class="info"><h3>${t("result_data")}</h3>
      <details><summary>${t("i_table")}</summary><div class="tablewrap"><table><thead><tr><th>${t("th_spot")}</th><th>${t("th_coord")}</th><th class="r">${t("th_dist")}</th><th class="r">${t("th_alt")}</th><th class="r">${t("th_slope")}</th><th class="r">${t("th_both")}</th><th class="r">${t("th_sun")}</th><th class="r">${t("th_earth")}</th><th class="r">${t("th_night")}</th><th class="r">${t("th_gap")}</th></tr></thead><tbody>${rows}</tbody></table></div></details>
      <details><summary>${t("i_windows", { n: fmt(wins.length) })}</summary>${wins.length ? `<div class="tablewrap"><table style="min-width:460px"><thead><tr><th>${t("th_from")}</th><th>${t("th_to")}</th><th class="r">${t("th_dur")}</th></tr></thead><tbody>${winRows}</tbody></table></div>${wins.length > 30 ? `<p>${t("w_more", { n: wins.length - 30 })}</p>` : ""}` : `<p>${t("w_none")}</p>`}</details>
      <details><summary>${t("i_zones")}</summary><div class="tablewrap"><table><thead><tr><th>${t("th_zone")}</th><th></th><th class="r">${t("th_zavg")}</th><th class="r">${t("th_both")}</th><th class="r">${t("th_sun")}</th><th class="r">${t("th_earth")}</th><th class="r">${t("th_night")}</th></tr></thead><tbody>${zrows}</tbody></table></div></details>
      <details id="shDetails"><summary>${t("i_shadow")}</summary><p style="margin-bottom:10px">${t("sh_p", { n: nSh })}</p>
        <div class="shadowgrid"><div class="shadowbox"><canvas id="resShadow"></canvas></div><div class="ctrl"><div class="prog"><span id="resProg"></span></div><p class="small muted" id="resShStat"></p>
          <b class="num" id="resShLabel">—</b><input type="range" id="resShSlider" min="0" max="0" value="0" aria-label="Momento"><button class="btn" id="resShPlay">${t("play")}</button><p class="small muted" id="resShInfo"></p></div></div></details>
      <details><summary>${t("i_how")}</summary><p>${t("i_how_p", { c: fmt(C.length), s: fmtDur(R0.eph.step / 3600000) })}</p></details>
    </div>`;
    document.querySelectorAll("#detail .spot").forEach((b) => (b.onclick = () => selectSpot(+b.dataset.j)));
    document.querySelectorAll("#detail tr.click").forEach((tr) => (tr.onclick = () => selectZone(+tr.dataset.k, true)));
    for (const id of ["chartDetails", "panoDetails"]) {
      const panel = document.getElementById(id);
      panel.open = !!R0[id];
      panel.addEventListener("toggle", () => {
        R0[id] = panel.open;
        if (panel.open) requestAnimationFrame(renderSpotCharts);
      });
    }
    const det = document.getElementById("shDetails");
    if (R0.shOpen) det.open = true;
    det.addEventListener("toggle", () => {
      R0.shOpen = det.open;
      if (det.open) {
        if (!R0.shadows) startResultShadows();
        else updateResShadow();
      }
    });
    const sl = document.getElementById("resShSlider");
    sl.oninput = () => {
      stopResPlay();
      R0.shI = +sl.value;
      updateResShadow();
    };
    document.getElementById("resShPlay").onclick = toggleResPlay;
    if (R0.shadows) sl.max = Math.max(0, R0.shadows.length - 1);
    requestAnimationFrame(() => {
      renderSpotCharts();
      if (R0.shadows && det.open) updateResShadow();
    });
  }
  function alphaOf(c, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
    if (!m) return c;
    const v = parseInt(m[1], 16);
    return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
  }
  function plotTheme(fig, color) {
    const L = fig.layout,
      ink = cssv("--chart-ink"),
      grid = cssv("--chart-grid");
    Object.assign(L, {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: cssv("--chart-bg"),
      font: { family: "Public Sans, Arial, Helvetica, sans-serif", color: ink, size: 15 },
      margin: { l: 66, r: 15, t: 65, b: 64 },
      legend: { orientation: "h", x: 0, y: 1.12 },
      height: 350,
    });
    L.title.font = { size: 19, color: cssv("--text") };
    L.title.x = 0;
    L.xaxis.gridcolor = grid;
    L.yaxis.gridcolor = grid;
    L.xaxis.zeroline = false;
    L.yaxis.zeroline = false;
    L.shapes[0].line.color = ink;
    L.annotations[0].font = { color: ink, size: 13 };
    L.hoverlabel = { bgcolor: cssv("--bg"), bordercolor: cssv("--line"), font: { color: cssv("--text") } };
    fig.data[0].line = { color, width: 2 };
    if (fig.data[1]) fig.data[1].line = Object.assign({ color: cssv("--hz-line"), width: 1.5 }, fig.data[1].line);
    if (fig.data[3]) {
      fig.data[3].fillcolor = alphaOf(color, 0.22);
      fig.data[3].line = { width: 0, color };
    }
    return fig;
  }
  // Sun and Earth height charts (components/charts.py logic) plus the 360 deg horizon view
  function renderSpotCharts() {
    if (!RESULT || ROUTE !== "resultados" || !document.getElementById("plotSun")) return;
    const R0 = RESULT,
      ci = R0.zones[R0.zi].members[R0.si],
      res = spotAnalysis(ci),
      tz = R0.r.tz,
      n = res.sunEl.length;
    if (window.Plotly && document.getElementById("chartDetails").open) {
      const dates = [],
        xs = [];
      for (let i = 0; i < n; i++) {
        dates.push(new Date(R0.eph.T[i]));
        xs.push(plotX(R0.eph.T[i], tz));
      }
      const data = Charts.prepareChartData({
        columns: {
          datetime: dates,
          sun_elevation: Array.from(res.sunEl),
          earth_elevation: Array.from(res.earthEl),
          sun_horizon: Array.from(res.sunHz),
          earth_horizon: Array.from(res.earthHz),
        },
      });
      const labels = {
        sun: { title: t("ch_sun_t"), name: t("ch_sun_n") },
        earth: { title: t("ch_earth_t"), name: t("ch_earth_n") },
        xaxis: t("ch_x", { tz: tzShort(tz) }),
        yaxis: t("ch_y"),
        horizon_line: t("ch_hl"),
        terrain: t("ch_terr"),
        disc: t("ch_disc"),
      };
      const cfg = {
        responsive: true,
        displaylogo: false,
        locale: LANG,
        modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
      };
      const fs = plotTheme(Charts.plotSunElevation(data, true, labels, xs), SUNC()),
        fe = plotTheme(Charts.plotEarthElevation(data, true, labels, xs, Lunar.EARTH_R), EARTHC());
      Plotly.react("plotSun", fs.data, fs.layout, cfg);
      Plotly.react("plotEarth", fe.data, fe.layout, cfg);
    }
    if (!document.getElementById("panoDetails").open) return;
    const [sT, eT] = tracksFrom(res, 600);
    drawPanorama(document.getElementById("resPano"), localHorizon(C[ci]), sT, eT);
    drawEarthZoom(document.getElementById("resZoom"), (a) => Lunar.horizonAtBearing(C[ci].H, C[ci].lon + a), eT);
  }
  let resTimer = null;
  async function startResultShadows() {
    const R0 = RESULT,
      r = R0.r,
      N = Math.max(2, Math.min(12, Math.round(R0.periodH)));
    R0.shadowTimes = [];
    R0.shadows = [];
    R0.shI = 0;
    for (let i = 0; i < N; i++) R0.shadowTimes.push(r.a + ((r.b - r.a) * i) / (N - 1));
    for (let i = 0; i < N; i++) {
      if (RESULT !== R0) return;
      const s = Lunar.moonFixed(R0.shadowTimes[i]).sun,
        m = await ask({ type: "shadow", sunKm: s, grid: shGrid() });
      if (RESULT !== R0) return;
      R0.shadows.push({ mask: m.mask, info: sunInfo(s), lit: maskLit(m.mask) });
      const sl = document.getElementById("resShSlider");
      if (sl) sl.max = R0.shadows.length - 1;
      updateResShadow();
    }
  }
  function updateResShadow() {
    const R0 = RESULT;
    if (!R0 || !R0.shadows) return;
    const c = document.getElementById("resShadow");
    if (!c || !c.clientWidth) return;
    const i = Math.min(R0.shI || 0, Math.max(0, R0.shadows.length - 1)),
      s = R0.shadows[i];
    renderShadow(
      c,
      s ? s.mask : null,
      s ? s.info : null,
      R0.zones.map((z, k) => ({ cx: C[z.center].x, cy: C[z.center].y, active: k === R0.zi })),
    );
    const sl = document.getElementById("resShSlider");
    if (sl) sl.value = i;
    const pr = document.getElementById("resProg");
    if (pr) pr.style.width = (100 * R0.shadows.length) / R0.shadowTimes.length + "%";
    const st = document.getElementById("resShStat");
    if (st)
      st.textContent =
        R0.shadows.length < R0.shadowTimes.length
          ? t("sh_calc", { i: R0.shadows.length, n: R0.shadowTimes.length })
          : t("sh_ready");
    if (s) {
      document.getElementById("resShLabel").textContent = fmtWhen(R0.shadowTimes[i], R0.r.tz, true);
      // the picture uses the 400 m relief; the line about the selected spot uses its own 80 m horizon,
      // the same one behind its percentages, so the two never contradict each other
      const res = spotAnalysis(R0.zones[R0.zi].members[R0.si]),
        k = Math.max(0, Math.min(res.stats.n - 1, Math.round((R0.shadowTimes[i] - R0.eph.T[0]) / R0.eph.step)));
      document.getElementById("resShInfo").textContent =
        t(res.sunVis[k] ? "sh_spot_sun" : "sh_spot_dark") +
        " · " +
        t("lit") +
        ": " +
        fmt(s.lit, 1) +
        " % · " +
        t("sun_el") +
        ": " +
        fmt(s.info.el, 1) +
        "°";
    }
  }
  function stopResPlay() {
    if (resTimer) {
      clearInterval(resTimer);
      resTimer = null;
      const b = document.getElementById("resShPlay");
      if (b) b.textContent = t("play");
    }
  }
  function toggleResPlay() {
    if (resTimer) {
      stopResPlay();
      return;
    }
    if (!RESULT.shadows || !RESULT.shadows.length) return;
    document.getElementById("resShPlay").textContent = t("pause");
    resTimer = setInterval(() => {
      if (!RESULT || ROUTE !== "resultados" || !RESULT.shadows.length) {
        stopResPlay();
        return;
      }
      RESULT.shI = ((RESULT.shI || 0) + 1) % RESULT.shadows.length;
      updateResShadow();
    }, 800);
  }

  // Maps for the user's dates. The horizons of every 1 km cell are precomputed
  // (build_data.py horizons); the worker checks the Sun and the Earth against them.
  const DM = { mode: "nasa", meta: null, hz: null, ready: null, maps: null, canvas: {}, days: 30, run: 0 };
  function loadHorizons() {
    if (DM.ready) return DM.ready;
    DM.ready = (async () => {
      const r = await dataFetch("horizons_1km.json");
      if (!r.ok) throw new Error("horizons " + r.status);
      const meta = await r.json();
      if (
        ![meta.nx, meta.ny, meta.naz].every(Number.isSafeInteger) ||
        meta.nx <= 0 ||
        meta.ny <= 0 ||
        meta.naz <= 0 ||
        !Number.isFinite(meta.scale) ||
        meta.scale <= 0
      )
        throw new Error("Invalid horizon metadata");
      const expected = meta.nx * meta.ny * meta.naz;
      let hz;
      if (meta.binary) {
        const response = await dataFetch(meta.binary);
        if (!response.ok) throw new Error("horizons " + response.status);
        hz = new Uint8Array(await response.arrayBuffer());
      } else {
        throw new Error("Legacy image horizons are not supported. Use the complete updated package.");
      }
      if (hz.length !== expected) throw new Error(`Invalid horizon data: ${hz.length} bytes, expected ${expected}`);
      if (
        meta.nx !== 381 ||
        meta.ny !== 381 ||
        meta.naz !== 90 ||
        meta.step !== 1000 ||
        meta.x0 !== -190000 ||
        meta.y0 !== 190000
      )
        throw new Error("Unexpected horizon grid geometry");
      DM.valid = null;
      if (meta.valid) {
        const response = await dataFetch(meta.valid);
        if (!response.ok) throw new Error("Invalid horizon mask");
        DM.valid = new Uint8Array(await response.arrayBuffer());
        if (DM.valid.length !== meta.nx * meta.ny) throw new Error("Invalid horizon mask length");
      }
      DM.meta = meta;
      await ask({ type: "initH", data: hz, meta }, null, [hz.buffer]);
    })();
    DM.ready.catch(() => (DM.ready = null));
    return DM.ready;
  }
  // finest step that keeps the job around 250 instants (a few seconds)
  const dmStep = (ms) => {
    for (const h of [1, 2, 3, 6, 12, 24, 48]) if (ms / (h * 3600000) <= 250) return h * 3600000;
    return 96 * 3600000;
  };
  function dateLayer(L) {
    if (DM.mode !== "dates" || !DM.maps || !DM.canvas[L]) return null;
    const m = DM.meta,
      h = m.step / 2;
    return {
      canvas: DM.canvas[L],
      xmin: m.x0 - h,
      xmax: m.x0 + (m.nx - 1) * m.step + h,
      ymax: m.y0 + h,
      ymin: m.y0 - (m.ny - 1) * m.step - h,
    };
  }
  function dateValues(x, y) {
    if (DM.mode !== "dates" || !DM.maps) return null;
    const m = DM.meta,
      i = Math.round((x - m.x0) / m.step),
      j = Math.round((m.y0 - y) / m.step);
    if (i < 0 || j < 0 || i >= m.nx || j >= m.ny) return null;
    const k = j * m.nx + i;
    if (DM.valid && !DM.valid[k]) return null;
    return { sun: DM.maps.sun[k], earth: DM.maps.earth[k], both: DM.maps.both[k] };
  }
  // Numbers for the selected spot. The map uses 1 km cells, which can miss a narrow ridge,
  // so the panel recomputes the spot itself with its own 720-direction horizon.
  function spotDateStats(p) {
    if (!DM.spot) DM.spot = new Map();
    if (DM.spot.has(p)) return DM.spot.get(p);
    if (!p.H) {
      requestHorizon(p);
      return null;
    }
    if (!DM.eph) {
      const step = Math.max(3600000, Math.ceil((DM.b - DM.a) / 4000 / 3600000) * 3600000);
      DM.eph = Lunar.ephemeris(DM.a, DM.b, step);
    }
    const st = Lunar.analyse(p, DM.eph, p.H).stats;
    DM.spot.set(p, st);
    return st;
  }
  async function requestHorizon(p) {
    if (p.hzPending) return;
    p.hzPending = true;
    const i = gridAt(p.x, p.y);
    if (p.z === undefined && i >= 0) p.z = G.z[i];
    const r = await ask({ type: "horizon", x: p.x, y: p.y });
    p.H = r.H;
    if (MCUSTOM === p || SEL === p) renderMorePanel();
  }
  function dateRows(p) {
    if (DM.mode !== "dates" || !DM.maps) return "";
    const d = spotDateStats(p),
      v = (k) => (d ? pct(d[k]) + " %" : "…");
    // only the numbers of the period shown on the map, so the two sets are never mixed
    return `<p class="small muted rows-cap">${t("pp_dates", { a: fmtWhen(DM.a, "Europe/Madrid", true), b: fmtWhen(DM.b, "Europe/Madrid", true) })}</p>
      <div><span>${t("r_sunG")}</span><b class="num sun">${v("sun")}</b></div>
      <div><span>${t("r_earthG")}</span><b class="num earth">${v("earth")}</b></div>
      <div><span>${t("r_bothG")}</span><b class="num bothc">${v("both")}</b></div>`;
  }
  function paintDateMaps() {
    const m = DM.meta,
      n = m.nx * m.ny;
    for (const L of ["sun", "earth", "both"]) {
      const c = document.createElement("canvas");
      c.width = m.nx;
      c.height = m.ny;
      const g = c.getContext("2d"),
        im = g.createImageData(m.nx, m.ny);
      if (DM.maps[L].length !== n) throw new Error("Invalid date map size");
      if (!DM.maps[L].every((v) => Number.isFinite(v) && v >= 0 && v <= 100))
        throw new Error("Invalid date map values");
      for (let k = 0; k < n; k++) {
        if ((DM.valid && !DM.valid[k]) || !Number.isFinite(DM.maps[L][k])) continue;
        const col = colorFor(L, DM.maps[L][k]);
        im.data[k * 4] = col[0];
        im.data[k * 4 + 1] = col[1];
        im.data[k * 4 + 2] = col[2];
        im.data[k * 4 + 3] = 255;
      }
      g.putImageData(im, 0, 0);
      DM.canvas[L] = c;
    }
  }
  function dmInfoText() {
    if (!DM.maps) return t("dm_hint");
    return (
      t("dm_info", { a: fmtWhen(DM.a, "Europe/Madrid", true), b: fmtWhen(DM.b, "Europe/Madrid", true), n: fmt(DM.n) }) +
      (DM.meta.approximate ? " · " + t("dm_approx_short") : "")
    );
  }
  function setPeriod(mode) {
    DM.mode = mode;
    document.querySelectorAll("#periodTabs .tab").forEach((b) => b.setAttribute("aria-selected", b.dataset.p === mode));
    document.getElementById("dmCtl").hidden = mode !== "dates";
    document.getElementById("dmInfo").textContent = dmInfoText();
    if (LAYER === "relief" && mode === "dates") LAYER = "both";
    if (moreMap) {
      moreMap.layer = LAYER;
      renderLayerTabs();
      renderMorePanel();
      moreMap.draw();
    }
  }
  async function runDateMaps(a, b) {
    const info = document.getElementById("dmInfo"),
      prog = document.getElementById("dmProg"),
      btn = document.getElementById("dmGo"),
      [E0, E1] = Lunar.ephemRange();
    if (!(a >= E0 && b <= E1)) {
      info.textContent = t("err_range");
      return;
    }
    const run = ++DM.run;
    btn.disabled = true;
    prog.style.width = "2%";
    info.textContent = t("dm_busy");
    try {
      await loadHorizons();
      const step = dmStep(b - a),
        times = [];
      for (let tm = a; tm <= b; tm += step) times.push(tm);
      const dirs = Lunar.directionsFromPole(times),
        res = await ask({ type: "dateMaps", sun: dirs.sun, earth: dirs.earth }, (f) => {
          if (run === DM.run) prog.style.width = Math.max(2, f * 100) + "%";
        });
      if (run !== DM.run) return;
      DM.maps = res.maps;
      DM.a = a;
      DM.b = b;
      DM.n = times.length;
      DM.spot = null;
      DM.eph = null;
      DM.ranked = null;
      paintDateMaps();
      prog.style.width = "100%";
      setPeriod("dates");
    } catch (e) {
      info.textContent = t("dm_err");
      console.error(e);
    } finally {
      if (run === DM.run) btn.disabled = false;
    }
  }
  function runDateMapsFromForm() {
    const d = document.getElementById("dmDate").value;
    if (!d) return;
    const a = zonedToUtc(d, "00:00", "Europe/Madrid");
    runDateMaps(a, a + DM.days * 86400000);
  }
  // "See the maps for these dates" from the results screen
  function openDateMaps(a, b) {
    document.getElementById("dmDate").value = partsIn(a, "Europe/Madrid").date;
    location.hash = "#mas";
    setTimeout(() => {
      setPeriod("dates");
      document.getElementById("explorer").scrollIntoView({ behavior: "smooth" });
      runDateMaps(a, b);
    }, 150);
  }

  // "More" screen
  let moreMap,
    LAYER = "sun",
    SEL = null,
    MCUSTOM = null,
    RANK = "both";
  const listFor = (L) => (L === "earth" ? LISTS.earth : L === "sun" ? LISTS.sun : LISTS.both);
  function renderLayerTabs() {
    const el = document.getElementById("layerTabs");
    el.innerHTML = "";
    for (const L of LAYERS) {
      const b = document.createElement("button");
      b.className = "tab";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", L === LAYER);
      b.textContent = t("L_" + L);
      b.onclick = () => {
        LAYER = L;
        moreMap.layer = L;
        renderLayerTabs();
        renderMorePanel();
        moreMap.draw();
      };
      el.appendChild(b);
    }
    const isDate = !!dateLayer(LAYER);
    const awaiting = DM.mode === "dates" && !DM.maps && LAYER !== "relief";
    document.getElementById("legend").innerHTML =
      (awaiting ? `<p class="map-notice">${t("dm_hint")}</p>` : legendHTML(LAYER, isDate ? t("LGD_" + LAYER) : null)) +
      (isDate && DM.meta.approximate ? `<p class="map-notice">${t("dm_approx")}</p>` : "") +
      `<details class="map-explainer"><summary>${t("legend_help")}</summary><p>${t("layer_help")}</p>${isDate ? `<p>${t("dm_note")}</p>` : ""}</details>`;
    document.getElementById("mapStatus").textContent = awaiting
      ? t("dm_hint")
      : isDate
        ? t("map_dates_active")
        : t(LAYER === "relief" ? "map_relief_active" : "map_reference_active");
  }
  function renderMorePanel() {
    const el = document.getElementById("morePanel"),
      p = MCUSTOM && !SEL ? MCUSTOM : SEL;
    if (!p) {
      el.innerHTML = "";
      return;
    }
    const i = gridAt(p.x, p.y),
      gv = (k) => (i >= 0 ? G[k][i] : NaN);
    const nm = nameOf(p);
    el.innerHTML = `<h3 style="font-size:22px">${esc(nm)}</h3><p class="small muted num" style="margin-bottom:10px">${fmtLL(p.lat, p.lon)}</p>
    <div class="rows">
      ${
        dateRows(p) ||
        `<p class="small muted rows-cap">${t("pp_nasa")}</p>
      <div><span>${t("r_sunG")}</span><b class="num sun">${fmt(p.nasa_sun !== undefined ? p.nasa_sun : gv("sun"), 1)} %</b></div>
      <div><span>${t("r_earthG")}</span><b class="num earth">${fmt(p.nasa_earth !== undefined ? p.nasa_earth : gv("earth"), 1)} %</b></div>
      <p class="small muted rows-cap">${t("pp_own")}</p>
      <div><span>${t("r_sunG")}</span><b class="num sun">${pct(p.sun !== undefined ? p.sun : gv("osun"))} %</b></div>
      <div><span>${t("r_earthG")}</span><b class="num earth">${pct(p.earth !== undefined ? p.earth : gv("oearth"))} %</b></div>
      <div><span>${t("r_bothG")}</span><b class="num bothc">${pct(p.both !== undefined ? p.both : gv("both"))} %</b></div>
      <div><span>${t("r_night")}</span><b class="num">${p.dark_h !== undefined ? nightText(p.dark_h) : nightText(gv("dark"), true, gv("osun"))}</b></div>`
      }
      <div><span>${t("r_psr")}</span><b>${(p.psr !== undefined ? p.psr : gv("psr")) ? t("yes") : t("no")}</b></div>
      <div><span>${t("r_alt")}</span><b class="num">${fmt(p.z !== undefined ? p.z : gv("z"))} m</b></div>
      <div><span>${t("r_slope")}</span><b class="num">${fmt(p.slope !== undefined ? p.slope : gv("slope"), 1)}°</b></div>
    </div>
    <div class="tabs" style="margin-top:14px" id="pickList"></div>
    ${
      p.H
        ? `<details id="moreDet" style="margin-top:6px"><summary>${t("more_point")}</summary><p class="small muted">${t("hz_p30")}</p><canvas class="chart" id="morePano" height="170"></canvas>
      ${p.monthly ? `<p class="small muted" style="margin-top:10px">${t("mo_h")}</p><canvas class="chart" id="moreMonthly" height="140"></canvas>` : ""}</details>`
        : ""
    }
    <a class="btn primary" href="#calculadora" style="margin-top:12px;width:100%">${t("calc_here")}</a>`;
    const pl = document.getElementById("pickList");
    for (const k of ["both", "sun", "earth"]) {
      const b = document.createElement("button");
      b.className = "tab";
      b.textContent = t("list_" + k);
      b.onclick = () => {
        const q = rankedFor(k)[0];
        if (!q) return;
        SEL = q;
        MCUSTOM = null;
        LAYER = k;
        moreMap.layer = k;
        renderLayerTabs();
        renderMorePanel();
        moreMap.flyTo(q.x, q.y, 3);
      };
      pl.appendChild(b);
    }
    const det = document.getElementById("moreDet");
    if (det)
      det.addEventListener("toggle", () => {
        if (!det.open) return;
        if (p.monthly) drawMonthly(document.getElementById("moreMonthly"), p);
        if (EPH_OK) {
          const now = Math.floor(Date.now() / 3600000) * 3600000,
            eph = Lunar.ephemeris(now, now + 30 * 86400000, 3 * 3600000),
            res = Lunar.analyse(p, eph, p.H),
            [s, e] = tracksFrom(res, 400);
          drawPanorama(document.getElementById("morePano"), localHorizon(p), s, e);
        }
      });
  }
  // Numbered spots for the layer on screen, best first: by Sun on the sunlight map, by Earth on
  // the Earth map, by both on the Sun+Earth map. With "your dates" they are ranked for those dates
  // among all the candidate spots. The relief map shows no spots.
  function rankedFor(L) {
    if (L === "relief") return [];
    if (!(DM.mode === "dates" && DM.maps)) return listFor(L);
    if (!DM.ranked) DM.ranked = {};
    if (DM.ranked[L]) return DM.ranked[L];
    const other = L === "earth" ? "sun" : L === "sun" ? "earth" : "sun";
    const scored = C.concat(D.points)
      .map((p) => ({ p, st: spotDateStats(p) }))
      .filter((o) => o.st && o.st[L] > 0)
      .sort((a, b) => b.st[L] - a.st[L] || b.st[other] - a.st[other]);
    const out = [];
    for (const o of scored) {
      if (out.every((q) => Math.hypot(q.x - o.p.x, q.y - o.p.y) > 8000)) out.push(o.p);
      if (out.length >= 10) break;
    }
    return (DM.ranked[L] = out);
  }
  function moreMarkers() {
    const exact = dateLayer(LAYER) && LAYER !== "relief";
    return rankedFor(LAYER).map((p, i) => {
      const m = { x: p.x, y: p.y, label: String(i + 1), color: "#ffffff", sel: SEL === p, obj: p, size: 10 };
      // with "your dates" each spot is painted with its own exact value, not the 1 km cell under it
      const st = exact ? spotDateStats(p) : null;
      if (st) {
        const [r, g, b] = colorFor(LAYER, st[LAYER]);
        m.fill = `rgb(${r | 0},${g | 0},${b | 0})`;
        m.ink = 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#06080c" : "#ffffff";
        m.size = 11;
      }
      return m;
    });
  }
  function renderExtra() {
    const v = M.validation,
      b = M.best_lit,
      ff = (x, d) => fmt(x, d === undefined ? 1 : d);
    let h = EXTRA[LANG];
    const rep = {
      psr: ff(M.pct_psr),
      nfeat: D.features.length,
      n: fmt(v.sun_all.n),
      s_mae: ff(v.sun_all.mean_abs),
      s_p90: ff(v.sun_all.p90_abs),
      s_r: ff(v.sun_all.r, 3),
      e_mae: ff(v.earth_all.mean_abs),
      e_p90: ff(v.earth_all.p90_abs),
      e_r: ff(v.earth_all.r, 3),
      best: ff(b.sun),
      blat: fmt(Math.abs(b.lat), 2),
      blon: fmt(Math.abs(b.lon), 2),
      bew: b.lon >= 0 ? t("E") : t("W"),
      bnear: nameOf({ x: Lunar.latLonToXY(b.lat, b.lon)[0], y: Lunar.latLonToXY(b.lat, b.lon)[1] }),
      rmin: fmt(CMAP.relief.min),
      rmax: fmt(CMAP.relief.max),
    };
    for (const k in rep) h = h.split("{" + k + "}").join(rep[k]);
    document.getElementById("extraInfo").innerHTML = h;
    renderRanking();
  }
  function renderRanking() {
    const tabs = document.getElementById("rankTabs");
    if (!tabs) return;
    tabs.innerHTML = "";
    for (const k of ["both", "sun", "earth"]) {
      const b = document.createElement("button");
      b.className = "tab";
      b.setAttribute("aria-selected", k === RANK);
      b.textContent = t("list_" + k);
      b.onclick = () => {
        RANK = k;
        renderRanking();
      };
      tabs.appendChild(b);
    }
    document.getElementById("rankHead").innerHTML =
      `<tr><th>#</th><th></th><th>${t("th_coord")}</th><th class="r">${t("th_alt")}</th><th class="r">${t("r_sunN")}</th><th class="r">${t("r_earthN")}</th><th class="r">${t("r_sunO")}</th><th class="r">${t("r_earthO")}</th><th class="r">${t("r_bothO")}</th></tr>`;
    const list = listFor(RANK);
    document.getElementById("rankBody").innerHTML = list
      .map(
        (p, i) =>
          `<tr class="click" data-i="${i}" tabindex="0"><td>${i + 1}</td><td>${esc(nameOf(p))}</td><td class="num">${fmtLL(p.lat, p.lon)}</td><td class="r">${fmt(p.z)} m</td><td class="r">${fmt(p.nasa_sun, 1)} %</td><td class="r">${fmt(p.nasa_earth, 1)} %</td><td class="r">${pct(p.sun)} %</td><td class="r">${pct(p.earth)} %</td><td class="r">${pct(p.both)} %</td></tr>`,
      )
      .join("");
    document.querySelectorAll("#rankBody tr").forEach((tr) => {
      const g2 = () => {
        const p = list[+tr.dataset.i];
        LAYER = RANK;
        moreMap.layer = RANK;
        renderLayerTabs();
        SEL = p;
        MCUSTOM = null;
        renderMorePanel();
        moreMap.flyTo(p.x, p.y);
        jump("explorer");
      };
      tr.onclick = g2;
      tr.onkeydown = (e) => {
        if (e.key === "Enter") g2();
      };
    });
  }
  function jump(id) {
    const el = document.getElementById(id);
    if (el)
      el.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
  }
  const LT = { frames: [], i: 0, timer: null, run: 0 };
  async function runLT() {
    if (!EPH_OK) return;
    const d = document.getElementById("ltDate").value;
    if (!d) return;
    const start = zonedToUtc(d, "12:00", "Europe/Madrid");
    if (!(start >= Lunar.ephemRange()[0] && start + 29 * 86400000 <= Lunar.ephemRange()[1])) return;
    const run = ++LT.run;
    LT.frames = [];
    LT.i = 0;
    stopLT();
    const sl = document.getElementById("ltSlider"),
      prog = document.getElementById("ltProg");
    sl.max = 0;
    for (let k = 0; k < 30; k++) {
      const tm = start + k * 86400000,
        s = Lunar.moonFixed(tm).sun,
        m = await ask({ type: "shadow", sunKm: s, grid: shGrid() });
      if (run !== LT.run) return;
      LT.frames.push({ tm, mask: m.mask, info: sunInfo(s), lit: maskLit(m.mask) });
      prog.style.width = (100 * (k + 1)) / 30 + "%";
      sl.max = LT.frames.length - 1;
      if (k === 0 && ROUTE === "mas") showLT(0);
    }
  }
  function showLT(i) {
    const f = LT.frames[i];
    if (!f) return;
    LT.i = i;
    renderShadow(document.getElementById("moreShadow"), f.mask, f.info, []);
    document.getElementById("ltSlider").value = i;
    document.getElementById("ltLabel").textContent = fmtWhen(f.tm, "Europe/Madrid", true);
    document.getElementById("ltInfo").textContent =
      t("lit") + ": " + fmt(f.lit, 1) + " % · " + t("sun_el") + ": " + fmt(f.info.el, 1) + "°";
  }
  function stopLT() {
    if (LT.timer) {
      clearInterval(LT.timer);
      LT.timer = null;
      document.getElementById("ltPlay").textContent = t("play");
    }
  }

  // Start-up
  function rerender() {
    applyI18n();
    updateSummary();
    renderLayerTabs();
    renderMorePanel();
    renderExtra();
    moreMap.setReadout(null);
    moreMap.draw();
    if (RESULT && !BUSY) {
      renderResults();
      if (ROUTE === "resultados") requestAnimationFrame(() => resMap.resize());
    }
    if (LT.frames.length) showLT(LT.i);
    if (ROUTE === "equipo") renderTeam();
  }

  // "Who we are" page, filled from data/team.json (copied from config/team.json)
  let TEAM = null;
  async function loadTeam() {
    try {
      const r = await fetch("data/team.json");
      if (r.ok) TEAM = await r.json();
    } catch (e) {
      TEAM = null;
    }
  }
  function renderTeam() {
    const el = document.getElementById("teamWrap"),
      tm = TEAM || {},
      en = LANG === "en";
    const members = (tm.members || [])
      .map((m) => {
        const initials = String(m.name || "?")
          .split(/\s+/)
          .map((w) => w[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();
        const pic = m.photo ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}">` : esc(initials);
        const link = m.linkedin
          ? `<a class="member-link" href="${esc(m.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>`
          : "";
        return `<li class="member"><div class="avatar">${pic}</div><b>${esc(m.name)}</b><span class="small muted">${t("tm_study")}</span>${link}</li>`;
      })
      .join("");
    el.innerHTML = `
      <p class="eyebrow">${esc(tm.event || t("tm_event"))}</p>
      <h1>${t("tm_h")}</h1>
      <h2 class="team-name">${esc(tm.group_name || "OrbitalUV")}</h2>
      <p class="intro">${esc((en && tm.group_description_en) || tm.group_description || "")}</p>
      <h3>${t("tm_members")}</h3>
      <ul class="members">${members}</ul>
      <div class="team-cols">
        <div><h3>${t("tm_why_h")}</h3><p>${t("tm_why_p")}</p></div>
        <div><h3>${t("tm_data_h")}</h3>
          <ul class="datalist"><li>${t("tm_d1")}</li><li>${t("tm_d2")}</li><li>${t("tm_d3")}</li><li>${t("tm_d4")}</li></ul>
          <button class="btn" id="tmMore">${t("tm_more")}</button></div>
      </div>`;
    document.getElementById("tmMore").onclick = () => {
      go("info");
      setTimeout(() => jump("extra"), 250);
    };
  }
  async function boot() {
    const savedLanguage = store.get("lsp-language");
    if (savedLanguage === "es" || savedLanguage === "en") LANG = savedLanguage;
    const saved = store.get("lsp-theme");
    document.documentElement.setAttribute("data-theme", saved === "light" || saved === "dark" ? saved : currentTheme());
    applyI18n();
    document.getElementById("bootMsg").textContent = t("boot");
    await Promise.all([loadData(), loadEphem(), loadTeam()]);
    prepPoints();
    if (window.Plotly)
      Plotly.register({
        moduleType: "locale",
        name: "es",
        dictionary: {},
        format: {
          days: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
          shortDays: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
          months: [
            "enero",
            "febrero",
            "marzo",
            "abril",
            "mayo",
            "junio",
            "julio",
            "agosto",
            "septiembre",
            "octubre",
            "noviembre",
            "diciembre",
          ],
          shortMonths: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
          date: "%d/%m/%Y",
          decimal: ",",
          thousands: ".",
        },
      });
    document.getElementById("homeBg").src = D.img.hill;
    document.getElementById("homeCount").textContent = C.length;
    moreMap = new MapView(document.getElementById("moreMap"), document.getElementById("moreMapBox"), {
      layer: "sun",
      markers: moreMarkers,
      cross: () => (MCUSTOM && !SEL ? MCUSTOM : null),
      onMarker: (p) => {
        SEL = p;
        MCUSTOM = null;
        renderMorePanel();
        moreMap.draw();
      },
      onPick: (x, y) => {
        const [la, lo] = Lunar.xyToLatLon(x, y);
        MCUSTOM = { x, y, lat: la, lon: lo };
        SEL = null;
        renderMorePanel();
        moreMap.draw();
      },
    });
    document.getElementById("optTerrain").onchange = (e) => {
      moreMap.opt.terrain = e.target.checked;
      moreMap.draw();
    };
    document.getElementById("optNames").onchange = (e) => {
      moreMap.opt.names = e.target.checked;
      moreMap.draw();
    };
    document.getElementById("optGrid").onchange = (e) => {
      moreMap.opt.grid = e.target.checked;
      moreMap.draw();
    };
    document.getElementById("optPsr").onchange = (e) => {
      moreMap.opt.psr = e.target.checked;
      moreMap.draw();
    };
    SEL = LISTS.sun[0];
    setStart(Math.ceil(Date.now() / 3600000) * 3600000);
    ["d0", "h0"].forEach((id) =>
      document.getElementById(id).addEventListener("input", () => {
        syncEnd();
        updateSummary();
      }),
    );
    ["d1", "h1"].forEach((id) => document.getElementById(id).addEventListener("input", updateSummary));
    document.querySelectorAll("#stayChips button").forEach(
      (b) =>
        (b.onclick = () => {
          STAY = +b.dataset.d;
          document.getElementById("customEnd").checked = false;
          document.getElementById("endFields").hidden = true;
          document.querySelectorAll("#stayChips button").forEach((x) => x.setAttribute("aria-pressed", x === b));
          syncEnd();
          updateSummary();
        }),
    );
    document.getElementById("customEnd").onchange = (e) => {
      document.getElementById("endFields").hidden = !e.target.checked;
      document
        .querySelectorAll("#stayChips button")
        .forEach((x) => x.setAttribute("aria-pressed", !e.target.checked && +x.dataset.d === STAY));
      if (!e.target.checked) syncEnd();
      updateSummary();
    };
    let prevTz = "Europe/Madrid";
    document.getElementById("tz").onchange = (e) => {
      const d0 = document.getElementById("d0").value,
        h0 = document.getElementById("h0").value;
      if (d0 && h0) {
        const a = zonedToUtc(d0, h0, prevTz);
        const custom = document.getElementById("customEnd").checked;
        const d1 = document.getElementById("d1").value,
          h1 = document.getElementById("h1").value;
        const end = custom && d1 && h1 ? zonedToUtc(d1, h1, prevTz) : null;
        prevTz = e.target.value;
        if (end !== null && Number.isFinite(end)) {
          const p = partsIn(end, prevTz);
          document.getElementById("d1").value = p.date;
          document.getElementById("h1").value = p.time;
        }
        setStart(a);
      } else prevTz = e.target.value;
    };
    document.getElementById("calcBtn").onclick = runCalc;
    document.getElementById("ltDate").value = partsIn(Date.now(), "Europe/Madrid").date;
    document.getElementById("ltGo").onclick = runLT;
    document.getElementById("dmDate").value = partsIn(Date.now(), "Europe/Madrid").date;
    document.getElementById("dmGo").onclick = runDateMapsFromForm;
    document.querySelectorAll("#periodTabs .tab").forEach((b) => (b.onclick = () => setPeriod(b.dataset.p)));
    document.querySelectorAll("#dmChips button").forEach(
      (b) =>
        (b.onclick = () => {
          DM.days = +b.dataset.d;
          document.querySelectorAll("#dmChips button").forEach((x) => x.setAttribute("aria-pressed", x === b));
        }),
    );
    setPeriod("nasa");
    document.getElementById("ltSlider").oninput = (e) => {
      stopLT();
      showLT(+e.target.value);
    };
    document.getElementById("ltPlay").onclick = () => {
      if (LT.timer) {
        stopLT();
        return;
      }
      if (!LT.frames.length) return;
      document.getElementById("ltPlay").textContent = t("pause");
      LT.timer = setInterval(() => showLT((LT.i + 1) % LT.frames.length), 650);
    };
    document.querySelectorAll("[data-jump]").forEach(
      (a) =>
        (a.onclick = (e) => {
          e.preventDefault();
          jump(a.dataset.jump);
        }),
    );
    document.getElementById("brandBtn").onclick = () => go("inicio");
    document.querySelector(".skip-link").onclick = (e) => {
      e.preventDefault();
      document.getElementById("mainContent").focus();
    };
    document.getElementById("homeResults").onclick = (e) => {
      e.preventDefault();
      go(RESULT ? "resultados" : "calculadora");
    };
    const menu = document.getElementById("menuBtn");
    const closeMenu = () => menu.setAttribute("aria-expanded", "false");
    menu.onclick = () => menu.setAttribute("aria-expanded", String(menu.getAttribute("aria-expanded") !== "true"));
    document.querySelectorAll("#mainNav a").forEach((a) => a.addEventListener("click", closeMenu));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menu.getAttribute("aria-expanded") === "true") {
        closeMenu();
        menu.focus();
      }
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".top")) closeMenu();
    });
    document.getElementById("langBtn").onclick = () => {
      LANG = LANG === "es" ? "en" : "es";
      store.set("lsp-language", LANG);
      rerender();
    };
    document.getElementById("themeBtn").onclick = () => {
      const nx = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", nx);
      store.set("lsp-theme", nx);
      updateThemeBtn();
      if (ROUTE === "resultados" && RESULT) {
        renderSpotCharts();
        if (resMap) resMap.draw();
        if (RESULT.shadows && document.getElementById("shDetails")?.open) updateResShadow();
      }
      if (ROUTE === "mas") {
        const open = document.getElementById("moreDet")?.open;
        renderMorePanel();
        const det = document.getElementById("moreDet");
        if (det && open) det.open = true;
        moreMap.draw();
        if (LT.frames.length) showLT(LT.i);
      }
    };
    rerender();
    show((location.hash || "#inicio").slice(1) || "inicio");
    document.getElementById("boot").hidden = true;
    if (EPH_OK) runLT();
  }
  boot().catch((e) => {
    console.error(e);
    document.getElementById("bootMsg").textContent = t("bootErr") + " (" + e.message + ")";
  });
})();
