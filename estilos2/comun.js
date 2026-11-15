/* Datos y utilidades compartidas por las 5 muestras (datos reales de ../prototipo/datos.js) */
(function () {
  const P = window.PUNTOS;
  const esc = { nombre: "Base lunar", o2: 30, p: 70.3, g: 0.17 };
  const cerca = (p) => p.p_kpa != null && Math.abs(p.o2 - esc.o2) <= 4 && p.p_kpa >= esc.p / 1.25 && p.p_kpa <= esc.p * 1.25;
  const conP = P.filter((p) => p.p_kpa != null);
  const sol = P.filter((p) => p.tipo === "solido");
  const solSinP = sol.filter((p) => p.p_kpa == null);
  const n = P.filter(cerca);
  const dist = (p) => Math.hypot((p.o2 - esc.o2) / 4, Math.log(p.p_kpa / esc.p) / Math.log(1.25));
  const top = conP.slice().sort((a, b) => dist(a) - dist(b)).slice(0, 5);
  const FIN = { extincion: "extinción", ruptura: "ruptura", consumo_total: "se consumió" };
  const maxSol = Math.max(...sol.map((p) => p.o2));
  const sinMat = P.filter((p) => /sin material/.test(p.combustible)).length;
  const rnd = (i, s) => ((((Math.sin(i * 12.9898 + s * 78.233) * 43758.5453) % 1) + 1) % 1) - 0.5;

  const NS = "http://www.w3.org/2000/svg";
  const el = (par, t, a = {}, txt) => {
    const e = document.createElementNS(NS, t);
    for (const k in a) e.setAttribute(k, a[k]);
    if (txt != null) e.textContent = txt;
    par.appendChild(e);
    return e;
  };
  // escalas: presión logarítmica, O2 lineal
  const escalas = (L, R, T, B, pmin = 40, pmax = 600, omin = 10, omax = 36) => ({
    x: (k) => L + (Math.log(k) - Math.log(pmin)) / (Math.log(pmax) - Math.log(pmin)) * (R - L),
    y: (o) => B - (o - omin) / (omax - omin) * (B - T),
    L, R, T, B, pmin, pmax, omin, omax,
  });

  window.D = { P, esc, cerca, conP, sol, solSinP, n, top, FIN, maxSol, sinMat, rnd, el, escalas, dist };
})();
