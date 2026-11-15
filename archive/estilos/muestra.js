/* Muestra de estilo: mismo contenido y datos reales, la hoja de estilo cambia con ?e=1..5 */
(function () {
  const e = new URLSearchParams(location.search).get("e") || "1";
  document.body.className = "e" + e;

  const P = window.PUNTOS;
  const esc = { o2: 30, p: 70.3 };
  const cerca = (p) => p.p_kpa != null && Math.abs(p.o2 - esc.o2) <= 4 && p.p_kpa >= esc.p / 1.25 && p.p_kpa <= esc.p * 1.25;
  const sol = P.filter((p) => p.tipo === "solido");
  const n = P.filter(cerca);

  document.getElementById("nums").innerHTML = [
    [P.length, "pruebas leídas", "5 investigaciones · ISS y Cygnus"],
    [n.length, "cerca del escenario", "todas de FLEX, gotas"],
    [0, "sólidos con presión", `de ${sol.length} pruebas`],
    [0, "pruebas a 0.17 g", "todo es microgravedad"],
  ].map(([v, t, s]) => `<div class="num${v === 0 ? " cero" : ""}"><b>${v}</b><span>${t}</span><small>${s}</small></div>`).join("");

  const d = (p) => Math.hypot((p.o2 - esc.o2) / 4, Math.log(p.p_kpa / esc.p) / Math.log(1.25));
  const top = P.filter((p) => p.p_kpa != null).sort((a, b) => d(a) - d(b)).slice(0, 4);
  const FIN = { extincion: "Extinción", ruptura: "Ruptura", consumo_total: "Se consumió" };
  document.getElementById("cerca").innerHTML = top.map((p) =>
    `<li><span class="id">${p.inv} ${p.prueba}</span><span class="v">${p.combustible} · ${p.o2.toFixed(0)} % · ${p.p_kpa.toFixed(1)} kPa</span><span class="g">A · ${FIN[p.fin] || "—"}</span><span class="src">${p.psi} · fila ${p.fila}</span></li>`).join("");
  document.getElementById("huecos").innerHTML = [
    ["0", "sólidos probados por encima de 22.2 % O₂"],
    ["0", "pruebas en gravedad parcial"],
    ["57", "muestras sin material declarado"],
  ].map(([v, t]) => `<li><b>${v}</b><span>${t}</span></li>`).join("");

  // ---------- figura ----------
  const css = getComputedStyle(document.body);
  const v = (k) => css.getPropertyValue(k).trim();
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.getElementById("fig");
  const el = (t, a, par = svg) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); par.appendChild(n); return n; };
  const tx = (x, y, s, a = {}) => { const t = el("text", { x, y, fill: v("--eje-txt"), "font-family": v("--f-dato"), "font-size": 10.5, ...a }); t.textContent = s; return t; };

  const L = 46, R = 560, T = 16, B = 390, S0 = 590, S1 = 750;
  const x = (k) => L + (Math.log(k) - Math.log(40)) / (Math.log(600) - Math.log(40)) * (R - L);
  const y = (o) => B - (o - 10) / 26 * (B - T);
  const rnd = (i, s) => ((((Math.sin(i * 12.9898 + s * 78.233) * 43758.5453) % 1) + 1) % 1) - .5;

  const zona = v("--zona-tipo") || "rayado";
  const defs = el("defs", {});
  const pat = el("pattern", { id: "pz", width: 8, height: 8, patternUnits: "userSpaceOnUse", patternTransform: zona === "puntos" ? "" : "rotate(45)" }, defs);
  el("rect", { width: 8, height: 8, fill: v("--zona-fondo") }, pat);
  if (zona === "franjas") el("rect", { width: 4, height: 8, fill: v("--zona-linea") }, pat);
  else if (zona === "puntos") el("circle", { cx: 4, cy: 4, r: 1, fill: v("--zona-linea") }, pat);
  else el("line", { x1: 0, y1: 0, x2: 0, y2: 8, stroke: v("--zona-linea"), "stroke-width": 1 }, pat);

  [50, 70, 100, 150, 200, 300, 500].forEach((k) => {
    el("line", { x1: x(k), x2: x(k), y1: T, y2: B, stroke: v("--rejilla"), "stroke-width": 1, "stroke-dasharray": v("--rejilla-trazo") || "none" });
    tx(x(k), B + 16, k, { "text-anchor": "middle" });
  });
  [10, 15, 20, 25, 30, 35].forEach((o) => {
    el("line", { x1: L, x2: S1, y1: y(o), y2: y(o), stroke: v("--rejilla"), "stroke-width": 1, "stroke-dasharray": v("--rejilla-trazo") || "none" });
    tx(L - 8, y(o) + 4, o, { "text-anchor": "end" });
  });
  el("line", { x1: L, x2: R, y1: B, y2: B, stroke: v("--eje"), "stroke-width": 1 });
  tx(R, B + 34, "PRESIÓN, kPa →", { "text-anchor": "end", "letter-spacing": ".08em" });
  tx(L - 8, T - 4, "O₂ %", { "text-anchor": "end" });

  el("rect", { x: S0, y: T, width: S1 - S0, height: B - T, fill: v("--franja") });
  tx(S0, B + 16, "PRESIÓN NO", { "letter-spacing": ".08em" });
  tx(S0, B + 29, "REGISTRADA", { "letter-spacing": ".08em" });

  const zy0 = y(34), zy1 = y(26);
  el("rect", { x: x(esc.p / 1.25), y: zy0, width: x(esc.p * 1.25) - x(esc.p / 1.25), height: zy1 - zy0, fill: "url(#pz)", stroke: v("--esc"), "stroke-width": 1, "stroke-dasharray": "3 3" });
  el("rect", { x: S0, y: zy0, width: S1 - S0, height: zy1 - zy0, fill: "url(#pz)", stroke: v("--esc"), "stroke-width": 1, "stroke-dasharray": "3 3" });

  P.forEach((p, i) => {
    if (p.p_kpa != null) {
      const cx = x(Math.min(600, p.p_kpa)) + rnd(i, 1) * 7, cy = y(p.o2) + rnd(i, 2) * 6;
      if (p.inv === "CFI") el("rect", { x: cx - 2.4, y: cy - 2.4, width: 4.8, height: 4.8, fill: "none", stroke: v("--punto"), "stroke-width": 1.1 });
      else el("circle", { cx, cy, r: 2.5, fill: cerca(p) ? v("--punto-cerca") : v("--punto"), "fill-opacity": cerca(p) ? 1 : .75 });
    } else {
      el("circle", { cx: S0 + 12 + (rnd(i, 3) + .5) * (S1 - S0 - 24), cy: y(p.o2) + rnd(i, 4) * 6, r: 2.5, fill: v("--punto-2"), "fill-opacity": .85 });
    }
  });

  el("line", { x1: L, x2: S1, y1: y(esc.o2), y2: y(esc.o2), stroke: v("--esc"), "stroke-width": 1, "stroke-dasharray": "2 3" });
  el("line", { x1: x(esc.p), x2: x(esc.p), y1: T, y2: B, stroke: v("--esc"), "stroke-width": 1, "stroke-dasharray": "2 3" });
  el("circle", { cx: x(esc.p), cy: y(esc.o2), r: 7, fill: "none", stroke: v("--esc"), "stroke-width": 2 });
  tx(x(esc.p) + 12, y(esc.o2) - 10, "BASE LUNAR · 30 % · 70.3 kPa", { fill: v("--esc"), "font-size": 11, "font-weight": 600 });
  tx(S0 + 8, y(22.2) - 22, "Ningún sólido por", { fill: v("--anot"), "font-family": v("--f-texto"), "font-size": 11 });
  tx(S0 + 8, y(22.2) - 9, "encima de 22.2 % O₂", { fill: v("--anot"), "font-family": v("--f-texto"), "font-size": 11 });
  tx(x(101.3) + 14, y(12) + 4, "● FLEX · gotas", { fill: v("--anot") });
  tx(x(506) - 4, y(21) - 12, "□ CFI · gotas", { fill: v("--anot"), "text-anchor": "end" });
})();
