// JavaScript version of components/charts.py. It builds the same Plotly figures
// (tests/test_charts.py checks the Python side; both were compared figure by figure).
(function (root) {
  "use strict";
  const OPTIONAL_COLUMNS = ["sun_horizon", "earth_horizon"];
  const DEFAULT_LABELS = {
    sun: { title: "Sun Elevation Over Time", name: "Sun elevation" },
    earth: { title: "Earth Elevation Over Time", name: "Earth elevation" },
    xaxis: "Date and Time",
    yaxis: "Elevation (degrees)",
    horizon_line: "Horizon (0°)",
    terrain: "Terrain horizon",
    disc: "Visible disc",
  };

  // data: list of rows or {columns: {...}}. Returns one array per column, sorted by date.
  function prepareChartData(data, columnMap) {
    let rows;
    if (Array.isArray(data)) rows = data.map((r) => Object.assign({}, r));
    else if (data && typeof data === "object" && data.columns) {
      const cols = Object.keys(data.columns),
        n = data.columns[cols[0]].length;
      rows = [];
      for (let i = 0; i < n; i++) {
        const r = {};
        for (const c of cols) r[c] = data.columns[c][i];
        rows.push(r);
      }
    } else throw new TypeError("Data must be a DataFrame or a list of dictionaries.");
    columnMap = columnMap || {};
    const required = {
      datetime: columnMap.datetime || "datetime",
      sun_elevation: columnMap.sun_elevation || "sun_elevation",
      earth_elevation: columnMap.earth_elevation || "earth_elevation",
    };
    const present = new Set();
    rows.forEach((r) => Object.keys(r).forEach((k) => present.add(k)));
    const missing = Object.values(required).filter((c) => !present.has(c));
    if (missing.length) throw new Error("Missing columns in input data: " + JSON.stringify(missing));
    const optional = {};
    for (const k of OPTIONAL_COLUMNS) {
      const a = columnMap[k] || k;
      if (present.has(a)) optional[k] = a;
    }
    const all = Object.assign({}, required, optional);
    const num = (v) => {
      const x = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(x) ? x : NaN;
    };
    let out = rows
      .map((r) => {
        const o = {};
        for (const k in all) o[k] = r[all[k]];
        const d = o.datetime instanceof Date ? o.datetime : new Date(String(o.datetime).replace(" ", "T"));
        o.datetime = isNaN(d) ? null : d;
        for (const k in all) if (k !== "datetime") o[k] = num(o[k]);
        return o;
      })
      .filter((o) => o.datetime !== null);
    out.sort((a, b) => a.datetime - b.datetime);
    const cols = { datetime: [], sun_elevation: [], earth_elevation: [] };
    for (const k in optional) cols[k] = [];
    for (const o of out) for (const k in cols) cols[k].push(o[k]);
    return cols;
  }

  function mergeLabels(labels) {
    const m = {
      sun: Object.assign({}, DEFAULT_LABELS.sun),
      earth: Object.assign({}, DEFAULT_LABELS.earth),
      xaxis: DEFAULT_LABELS.xaxis,
      yaxis: DEFAULT_LABELS.yaxis,
      horizon_line: DEFAULT_LABELS.horizon_line,
      terrain: DEFAULT_LABELS.terrain,
      disc: DEFAULT_LABELS.disc,
    };
    for (const k in labels || {}) {
      if ((k === "sun" || k === "earth") && typeof labels[k] === "object") Object.assign(m[k], labels[k]);
      else m[k] = labels[k];
    }
    return m;
  }

  function plotElevation(data, body, showTerrain, labels, xValues, discRadius) {
    const text = mergeLabels(labels),
      col = body + "_elevation",
      hcol = body + "_horizon";
    const x = xValues || data.datetime;
    const traces = [{ type: "scatter", mode: "lines", name: text[body].name, x, y: data[col] }];
    if (showTerrain) {
      if (!data[hcol]) throw new Error("Missing column for terrain horizon: " + hcol);
      traces.push({
        type: "scatter",
        mode: "lines",
        name: text.terrain,
        x,
        y: data[hcol],
        line: { dash: "dot" },
      });
    }
    if (discRadius != null) {
      // shaded band for the whole disc (centre +/- apparent radius)
      traces.push({
        type: "scatter",
        mode: "lines",
        x,
        y: data[col].map((v) => v - discRadius),
        line: { width: 0 },
        showlegend: false,
        hoverinfo: "skip",
      });
      traces.push({
        type: "scatter",
        mode: "lines",
        name: text.disc,
        x,
        y: data[col].map((v) => v + discRadius),
        line: { width: 0 },
        fill: "tonexty",
        hoverinfo: "skip",
      });
    }
    const layout = {
      shapes: [
        { type: "line", x0: 0, x1: 1, xref: "x domain", y0: 0, y1: 0, yref: "y", line: { dash: "dash" } },
      ],
      annotations: [
        {
          showarrow: false,
          text: text.horizon_line,
          x: 1,
          xanchor: "right",
          xref: "x domain",
          y: 0,
          yanchor: "bottom",
          yref: "y",
        },
      ],
      title: { text: text[body].title },
      xaxis: { title: { text: text.xaxis } },
      yaxis: { title: { text: text.yaxis } },
      hovermode: "x unified",
    };
    return { data: traces, layout };
  }
  const plotSunElevation = (data, showTerrain, labels, xValues, discRadius) =>
    plotElevation(data, "sun", showTerrain, labels, xValues, discRadius);
  const plotEarthElevation = (data, showTerrain, labels, xValues, discRadius) =>
    plotElevation(data, "earth", showTerrain, labels, xValues, discRadius);

  const api = { prepareChartData, plotSunElevation, plotEarthElevation, DEFAULT_LABELS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Charts = api;
})(typeof self !== "undefined" ? self : this);
