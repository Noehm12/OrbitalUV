// Runs the heavy terrain work (horizons, shadow maps, date maps) without freezing the page.
importScripts("lunar.js?v=3");
let DEM = null;
let HZ = null;
self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      DEM = m.dem;
      self.postMessage({ type: "ready" });
    } else if (m.type === "horizon") {
      const H = Lunar.horizonFromDEM(DEM, m.x, m.y, 720, 0);
      self.postMessage({ type: "horizon", id: m.id, H }, [H.buffer]);
    } else if (m.type === "initH") {
      HZ = { data: m.data, meta: m.meta };
      self.postMessage({ type: "initH", id: m.id });
    } else if (m.type === "dateMaps") {
      const maps = Lunar.visibilityMaps(HZ.data, HZ.meta, m.sun, m.earth, (f) =>
        self.postMessage({ type: "progress", id: m.id, f }),
      );
      self.postMessage({ type: "dateMaps", id: m.id, maps }, [maps.sun.buffer, maps.earth.buffer, maps.both.buffer]);
    } else if (m.type === "shadow") {
      const mask = Lunar.shadowMask(DEM, m.grid, m.sunKm);
      self.postMessage({ type: "shadow", id: m.id, mask }, [mask.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: "error", id: m.id, message: String((err && err.message) || err) });
  }
};
