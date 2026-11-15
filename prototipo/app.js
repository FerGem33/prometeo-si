/* Prometeo · prototipo de interfaz.
   Datos reales en datos.js (window.PUNTOS), generados desde tablas de PSI.
   Sin dependencias: SVG a mano para controlar el estilo editorial. */
(function () {
  "use strict";

  const PUNTOS = window.PUNTOS || [];
  const NS = "http://www.w3.org/2000/svg";

  // Condiciones de cada hábitat. "verificar" = aún no contrastado con la fuente.
  const ESCENARIOS = [
    { id: "A", nombre: "Estación Espacial Internacional", o2: 21, p: 101.3, g: 0,
      gTxt: "microgravedad", fuente: "Atmósfera de cabina estándar", verificar: false },
    { id: "B", nombre: "Base lunar", o2: 30, p: 70.3, g: 0.17,
      gTxt: "0.17 g", fuente: "Enunciado del reto (10.2 psi)", verificar: true },
    { id: "C", nombre: "Atmósfera de exploración", o2: 34, p: 56.5, g: 0.17,
      gTxt: "0.17 g", fuente: "Referencia de diseño (8.2 psi)", verificar: true },
  ];

  // Vecindad: ±4 puntos de O2 y ±25 % de presión
  const DO2 = 4, FP = 1.25;

  let esc = ESCENARIOS[1];
  const filtros = { gota: true, solido: true };

  // ---------- utilidades ----------
  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, padre) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (padre) padre.appendChild(n);
    return n;
  };
  const fmt = (x, d = 1) => (x == null ? "—" : Number(x).toFixed(d));
  const conPresion = PUNTOS.filter((p) => p.p_kpa != null);
  const sinPresion = PUNTOS.filter((p) => p.p_kpa == null);
  const solidos = PUNTOS.filter((p) => p.tipo === "solido");
  const solidosSinP = sinPresion.filter((p) => p.tipo === "solido");
  const investigaciones = [...new Set(PUNTOS.map((p) => p.inv))];
  const FINAL = { extincion: "Extinción", ruptura: "Ruptura", consumo_total: "Se consumió", otro: "—" };

  const cerca = (p, e) =>
    p.p_kpa != null && Math.abs(p.o2 - e.o2) <= DO2 && p.p_kpa >= e.p / FP && p.p_kpa <= e.p * FP;
  const distancia = (p, e) => {
    const a = (p.o2 - e.o2) / DO2;
    if (p.p_kpa == null) return Math.abs(a);
    const b = Math.log(p.p_kpa / e.p) / Math.log(FP);
    return Math.sqrt(a * a + b * b);
  };
  // dispersión determinista para que las marcas iguales no se encimen
  const ruido = (i, s) => (((Math.sin(i * 12.9898 + s * 78.233) * 43758.5453) % 1) + 1) % 1 - 0.5;

  const fuenteTxt = (p) => `${p.psi} · ${p.fuente.replace(/^PSI-\d+_Experimental table_/, "")} · fila ${p.fila}`;

  // ---------- ficha flotante ----------
  const ficha = $("#ficha");
  function mostrarFicha(ev, p) {
    ficha.innerHTML =
      `<div class="f-tit">${p.inv} · prueba ${p.prueba}</div>` +
      `<div class="f-dat">${p.combustible}${p.original ? ` <span style="opacity:.6">(«${p.original}»)</span>` : ""}<br>` +
      `O₂ ${fmt(p.o2)} % · ${p.p_kpa == null ? "presión no registrada" : fmt(p.p_kpa) + " kPa"}` +
      `${p.fin ? " · " + FINAL[p.fin] : ""}</div>` +
      (p.nota ? `<div class="f-src" style="color:var(--senal)">${p.nota}</div>` : "") +
      `<div class="f-src">${fuenteTxt(p)}</div>`;
    ficha.hidden = false;
    const x = Math.min(ev.clientX + 14, window.innerWidth - 320);
    ficha.style.left = x + "px";
    ficha.style.top = ev.clientY + 14 + "px";
  }
  const ocultarFicha = () => (ficha.hidden = true);

  // ---------- 01 portada ----------
  function portada() {
    const svg = $("#mini-mapa");
    const W = 420, H = 300;
    const lx = (v) => 10 + ((Math.log(v) - Math.log(40)) / (Math.log(600) - Math.log(40))) * (W - 20);
    const ly = (v) => H - 14 - ((v - 10) / 26) * (H - 28);
    el("line", { x1: 10, x2: W - 10, y1: H - 6, y2: H - 6, class: "eje" , stroke: "var(--linea-2)"}, svg);
    conPresion.forEach((p, i) => {
      el("circle", { cx: lx(p.p_kpa) + ruido(i, 1) * 5, cy: ly(p.o2) + ruido(i, 2) * 5, r: 1.8, class: "punto" }, svg);
    });
    $("#mini-total").textContent = conPresion.length;

    const ol = $("#lista-escenarios");
    ESCENARIOS.forEach((e) => {
      const li = document.createElement("li");
      li.dataset.id = e.id;
      li.innerHTML =
        `<button type="button">` +
        `<span class="esc-letra">${e.id}</span>` +
        `<span class="esc-nombre">${e.nombre}${e.verificar ? `<br><span class="verificar">por verificar · ${e.fuente}</span>` : ""}</span>` +
        `<span class="esc-dato">${fmt(e.o2, 0)} %<small>oxígeno</small></span>` +
        `<span class="esc-dato">${fmt(e.p)} kPa<small>presión</small></span>` +
        `<span class="esc-dato">${e.gTxt}<small>gravedad</small></span>` +
        `<span class="esc-ir">Abrir expediente →</span>` +
        `</button>`;
      li.querySelector("button").addEventListener("click", () => {
        elegir(e);
        location.hash = "#resumen";
      });
      ol.appendChild(li);
    });
  }

  // ---------- 02 resumen ----------
  function resumen() {
    const n = conPresion.filter((p) => cerca(p, esc));
    const nInv = new Set(n.map((p) => p.inv));
    const solPres = solidos.filter((p) => p.p_kpa != null).length;
    const folio = `Expediente ${esc.id} · ${esc.nombre}`;
    $("#r-folio").textContent = folio;
    $("#m-folio").textContent = folio;
    $("#e-folio").textContent = folio;
    $("#r-titulo").textContent = esc.nombre;
    $("#r-condiciones").textContent =
      `${fmt(esc.o2, 0)} % O₂ · ${fmt(esc.p)} kPa · ${esc.gTxt}` + (esc.verificar ? "  ·  condiciones por verificar" : "");

    const grav = esc.g > 0
      ? { n: 0, txt: `pruebas a ${esc.gTxt}. Todas se hicieron en microgravedad.`, cero: true }
      : { n: PUNTOS.length, txt: "pruebas en microgravedad, igual que este hábitat.", cero: false };

    const cifras = [
      { n: PUNTOS.length, txt: `pruebas leídas de ${investigaciones.length} investigaciones en la ISS y en Cygnus.`, src: "Tablas experimentales PSI" },
      { n: n.length, txt: `pruebas cerca de este hábitat (±${DO2} puntos de O₂, ±25 % de presión).`,
        src: n.length ? [...nInv].join(", ") : "Ninguna investigación", cero: n.length === 0 },
      { n: solPres, txt: `de ${solidos.length} pruebas de materiales sólidos registran la presión.`, src: "BASS-II, SAFFIRE-I, SAFFIRE-II", cero: solPres === 0 },
      { n: grav.n, txt: grav.txt, src: "Plataformas de vuelo", cero: grav.cero },
    ];
    $("#r-cifras").innerHTML = cifras.map((c) =>
      `<div class="cifra"><div class="cifra-n${c.cero ? " cero" : ""}">${c.n}</div>` +
      `<div class="cifra-txt">${c.txt}</div><div class="cifra-fuente nota">${c.src}</div></div>`).join("");

    const gotas = n.filter((p) => p.tipo === "gota").length;
    let concl;
    if (n.length === 0) {
      concl = `Ninguna prueba se acerca a estas condiciones. <mark>Todo diseño para este hábitat se apoyaría en extrapolación.</mark>`;
    } else if (gotas === n.length && solidosSinP.some((p) => Math.abs(p.o2 - esc.o2) <= DO2)) {
      const k = solidosSinP.filter((p) => Math.abs(p.o2 - esc.o2) <= DO2).length;
      concl = `Las pruebas con presión conocida son de <b>gotas de combustible líquido</b>. Hay ${k} pruebas de sólidos con oxígeno comparable, pero <mark>su tabla no registra la presión</mark>: probablemente fue la de cabina, y eso hay que confirmarlo en los reportes.`;
    } else if (gotas === n.length) {
      concl = `Hay evidencia cerca, pero solo de <b>gotas de combustible líquido</b>. Para los materiales sólidos, que son las paredes, cables y telas de un hábitat, <mark>la presión nunca quedó registrada</mark>.`;
    } else {
      concl = `Hay evidencia directa para este hábitat en ${nInv.size} investigaciones. Revisa en el mapa qué combustibles cubre.`;
    }
    $("#r-conclusion").innerHTML = concl;
    document.querySelectorAll("#lista-escenarios li").forEach((li) => li.classList.toggle("elegido", li.dataset.id === esc.id));
  }

  // ---------- 03 mapa ----------
  function mapa() {
    const svg = $("#figura");
    svg.innerHTML = "";
    const L = 64, R = 740, T = 24, B = 500;      // área principal
    const SX0 = 790, SX1 = 950;                  // franja "sin presión"
    const PMIN = 40, PMAX = 600, OMIN = 10, OMAX = 36;
    const x = (v) => L + ((Math.log(v) - Math.log(PMIN)) / (Math.log(PMAX) - Math.log(PMIN))) * (R - L);
    const y = (v) => B - ((v - OMIN) / (OMAX - OMIN)) * (B - T);

    const defs = el("defs", {}, svg);
    const pat = el("pattern", { id: "rayado", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    el("rect", { width: 6, height: 6, fill: "var(--senal-tenue)" }, pat);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "var(--senal)", "stroke-width": 1, "stroke-opacity": .45 }, pat);

    // rejilla y ejes
    const rej = el("g", { class: "rejilla" }, svg);
    const ejeX = el("g", { class: "eje" }, svg);
    [50, 70, 100, 150, 200, 300, 500].forEach((v) => {
      el("line", { x1: x(v), x2: x(v), y1: T, y2: B }, rej);
      el("line", { x1: x(v), x2: x(v), y1: B, y2: B + 5 }, ejeX);
      const t = el("text", { x: x(v), y: B + 20, "text-anchor": "middle" }, ejeX); t.textContent = v;
    });
    el("line", { x1: L, x2: R, y1: B, y2: B }, ejeX);
    const ejeY = el("g", { class: "eje" }, svg);
    [10, 15, 20, 25, 30, 35].forEach((v) => {
      el("line", { x1: L, x2: R, y1: y(v), y2: y(v) }, rej);
      el("line", { x1: SX0, x2: SX1, y1: y(v), y2: y(v) }, rej);
      const t = el("text", { x: L - 10, y: y(v) + 4, "text-anchor": "end" }, ejeY); t.textContent = v;
    });
    let t = el("text", { x: R, y: B + 42, "text-anchor": "end", class: "rotulo-eje" }, svg); t.textContent = "Presión ambiente, kPa →";
    t = el("text", { x: L - 10, y: T - 8, "text-anchor": "end", class: "rotulo-eje" }, svg); t.textContent = "O₂ %";

    // franja de pruebas sin presión
    el("rect", { x: SX0, y: T, width: SX1 - SX0, height: B - T, class: "franja-fondo" }, svg);
    t = el("text", { x: SX0, y: B + 20, class: "rotulo-eje" }, svg); t.textContent = "Presión";
    t = el("text", { x: SX0, y: B + 34, class: "rotulo-eje" }, svg); t.textContent = "no registrada";

    // vecindad del escenario
    const vx0 = x(Math.max(PMIN, esc.p / FP)), vx1 = x(Math.min(PMAX, esc.p * FP));
    const vy0 = y(Math.min(OMAX, esc.o2 + DO2)), vy1 = y(Math.max(OMIN, esc.o2 - DO2));
    el("rect", { x: vx0, y: vy0, width: vx1 - vx0, height: vy1 - vy0, class: "vecindad" }, svg);
    // banda de O2 del escenario en la franja de sólidos
    el("rect", { x: SX0, y: vy0, width: SX1 - SX0, height: vy1 - vy0, class: "vecindad" }, svg);

    // puntos
    const g = el("g", {}, svg);
    const orden = [...PUNTOS].map((p, i) => [p, i]).sort((a, b) => (a[0].p_kpa ?? 9999) - (b[0].p_kpa ?? 9999));
    orden.forEach(([p, i], k) => {
      const visible = filtros[p.tipo];
      const esCerca = cerca(p, esc);
      let n;
      if (p.p_kpa != null) {
        const cx = x(Math.min(PMAX, p.p_kpa)) + ruido(i, 1) * 7, cy = y(p.o2) + ruido(i, 2) * 6;
        if (p.inv === "CFI") n = el("rect", { x: cx - 2.6, y: cy - 2.6, width: 5.2, height: 5.2, class: "punto cuadro" }, g);
        else n = el("circle", { cx, cy, r: 2.6, class: "punto" + (esCerca ? " cerca" : "") }, g);
      } else {
        const cx = SX0 + 14 + (ruido(i, 3) + .5) * (SX1 - SX0 - 28), cy = y(p.o2) + ruido(i, 4) * 6;
        n = el("circle", { cx, cy, r: 2.6, class: "punto solido" }, g);
      }
      n.classList.add("aparece");
      n.style.animationDelay = Math.min(900, k * 2) + "ms";
      if (!visible) n.classList.add("oculto");
      n.addEventListener("mousemove", (ev) => mostrarFicha(ev, p));
      n.addEventListener("mouseleave", ocultarFicha);
    });

    // escenario
    el("line", { x1: L, x2: SX1, y1: y(esc.o2), y2: y(esc.o2), class: "escenario-cruz", "stroke-dasharray": "2 3" }, svg);
    el("line", { x1: x(esc.p), x2: x(esc.p), y1: T, y2: B, class: "escenario-cruz", "stroke-dasharray": "2 3" }, svg);
    el("circle", { cx: x(esc.p), cy: y(esc.o2), r: 7, class: "escenario-punto" }, svg);
    const etiquetaArriba = esc.o2 < 33;
    t = el("text", { x: x(esc.p) + 12, y: y(esc.o2) + (etiquetaArriba ? -12 : 22), class: "escenario-txt" }, svg);
    t.textContent = `${esc.nombre} · ${fmt(esc.o2, 0)} % · ${fmt(esc.p)} kPa`;

    // anotaciones directas
    const cabina = conPresion.filter((p) => Math.abs(p.o2 - 21) <= 1 && Math.abs(p.p_kpa - 101.3) <= 6).length;
    if (esc.id !== "A") anotar(svg, x(101.3) + 6, y(21) + 6, x(140), y(15.5), `${cabina} pruebas en aire de cabina: 21 % y ~101 kPa`);
    const maxSol = Math.max(...solidosSinP.map((p) => p.o2));
    texto(svg, SX0 + 10, y(maxSol) - 26, "Ningún sólido por", "anotacion");
    texto(svg, SX0 + 10, y(maxSol) - 12, `encima de ${fmt(maxSol)} % O₂`, "anotacion");
    texto(svg, SX0, T - 8, `${solidosSinP.length} pruebas de sólidos`, "rotulo-eje");
    // rótulos directos en lugar de leyenda
    texto(svg, x(101.3) + 14, y(12) + 4, "● FLEX · gotas de metanol y heptano", "rotulo");
    texto(svg, x(506.6) - 6, y(21) - 12, "□ CFI · gotas de dodecano", "rotulo", "end");

    notasMapa();
  }

  function texto(svg, x, y, txt, cls, ancla = "start") {
    const t = el("text", { x, y, class: cls, "text-anchor": ancla }, svg);
    t.textContent = txt;
    return t;
  }

  function anotar(svg, x1, y1, x2, y2, texto) {
    el("path", { d: `M${x1},${y1} L${x2},${y2}`, class: "anotacion-linea" }, svg);
    const t = el("text", { x: x2, y: y2 - 6, class: "anotacion", "text-anchor": x2 < x1 ? "start" : "start" }, svg);
    t.textContent = texto;
  }

  function notasMapa() {
    const n = conPresion.filter((p) => cerca(p, esc));
    const solCerca = solidosSinP.filter((p) => Math.abs(p.o2 - esc.o2) <= DO2).length;
    const gotas = n.filter((p) => p.tipo === "gota");
    $("#m-notas").innerHTML =
      bloque(n.length, "pruebas dentro de la zona rayada", n.length ? `Todas de ${[...new Set(n.map((p) => p.inv))].join(", ")}, ${gotas.length === n.length ? "gotas de combustible líquido" : "varios tipos"}.` : "Nadie ha probado estas condiciones.") +
      bloque(solCerca, "sólidos con O₂ comparable", solCerca ? "Sin presión registrada: no se sabe si coinciden." : `Los sólidos se probaron entre ${fmt(Math.min(...solidos.map((p) => p.o2)))} y ${fmt(Math.max(...solidos.map((p) => p.o2)))} % O₂.`) +
      bloque(esc.g > 0 ? 0 : PUNTOS.length, esc.g > 0 ? `pruebas a ${esc.gTxt}` : "pruebas en microgravedad", esc.g > 0 ? "Gravedad parcial: hueco total en estas tablas." : "Misma condición de gravedad que el hábitat.");
  }
  const bloque = (n, tit, txt) =>
    `<div class="bloque"><div class="n${n === 0 ? " cero" : ""}">${n}</div><p><b>${tit}</b><br>${txt}</p></div>`;

  // ---------- 04 evidencia ----------
  function evidencia() {
    const conP = conPresion.filter((p) => filtros[p.tipo]).map((p) => [p, distancia(p, esc)]).sort((a, b) => a[1] - b[1]).slice(0, 8);
    const sinP = solidosSinP.map((p) => [p, distancia(p, esc)]).sort((a, b) => a[1] - b[1]).slice(0, 3);
    const fila = (p, d, k, grado) =>
      `<tr data-k="${k}"><td class="dato">${k}</td>` +
      `<td>${p.inv}<span class="fuente">${p.psi}</span></td>` +
      `<td class="dato">${p.prueba}<span class="fuente">fila ${p.fila}</span></td>` +
      `<td>${p.combustible}</td>` +
      `<td class="num">${fmt(p.o2)}</td><td class="num">${fmt(p.p_kpa)}</td><td class="num">${fmt(d, 2)}</td>` +
      `<td>${p.fin ? FINAL[p.fin] : "—"}</td>` +
      `<td>${grado}</td></tr>`;
    let k = 0, html = "";
    const lista = [];
    conP.forEach(([p, d]) => { lista.push(p); html += fila(p, d, ++k, `<span class="grado ${p.grado}">${p.grado} · tabla</span>`); });
    html += `<tr class="separador"><td colspan="9" class="nota" style="padding-top:20px">Sólidos más cercanos en O₂ (sin presión, la distancia solo mide oxígeno)</td></tr>`;
    sinP.forEach(([p, d]) => { lista.push(p); html += fila(p, d, ++k, `<span class="grado B">B · incompleto</span>`); });
    const tb = $("#e-tabla tbody");
    tb.innerHTML = html;
    tb.querySelectorAll("tr[data-k]").forEach((tr) => {
      const p = lista[+tr.dataset.k - 1];
      tr.addEventListener("mousemove", (ev) => mostrarFicha(ev, p));
      tr.addEventListener("mouseleave", ocultarFicha);
    });
    $("#e-metodo").textContent =
      `Distancia: 1.00 equivale a ${DO2} puntos de O₂ o a un factor de 1.25 en presión. Grado A: valor tomado de la tabla experimental. Grado B: falta un dato o el valor es aproximado.`;

    const sinMat = PUNTOS.filter((p) => /sin material/.test(p.combustible)).length;
    const solCerca = solidos.filter((p) => Math.abs(p.o2 - esc.o2) <= DO2).length;
    const huecos = [
      { n: solidos.filter((p) => p.p_kpa != null).length, t: "Sólidos con presión registrada", d: `De ${solidos.length} pruebas de BASS-II y SAFFIRE, ninguna tabla anota la presión. El motor la buscará en reportes y artículos.` },
      { n: solCerca, t: `Sólidos cerca de ${fmt(esc.o2, 0)} % O₂`, d: solCerca ? "Existen, pero sin presión no se pueden comparar del todo." : `El máximo probado fue ${fmt(Math.max(...solidos.map((p) => p.o2)))} %.` },
      ...(esc.g > 0 ? [{ n: 0, t: `Pruebas a ${esc.gTxt}`, d: "Todas las pruebas son en microgravedad (ISS y Cygnus)." }] : []),
      { n: sinMat, t: "Muestras sin material declarado", d: "La tabla describe la forma («1/4\" black rod») pero no el material. Se resuelve con el reporte de la investigación.", neutro: true },
    ];
    $("#e-huecos").innerHTML = huecos.map((h) =>
      `<li><span class="n"${h.neutro ? ' style="color:var(--grado-b)"' : ""}>${h.n}</span><span class="t"><b>${h.t}</b>${h.d}</span></li>`).join("");
  }

  // ---------- estado ----------
  function elegir(e) { esc = e; resumen(); mapa(); evidencia(); }

  document.querySelectorAll(".filtros input").forEach((inp) =>
    inp.addEventListener("change", () => { filtros[inp.dataset.tipo] = inp.checked; mapa(); evidencia(); }));

  // folio activo en la barra
  const enlaces = document.querySelectorAll(".folios a");
  const obs = new IntersectionObserver((ents) => {
    ents.forEach((en) => {
      if (en.isIntersecting) enlaces.forEach((a) => a.classList.toggle("activo", a.dataset.folio === en.target.id));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  document.querySelectorAll(".pantalla").forEach((s) => obs.observe(s));

  // ?pantalla=mapa muestra solo esa sección (capturas y presentación); ?esc=A|B|C elige hábitat
  const qs = new URLSearchParams(location.search);
  const solo = qs.get("pantalla");
  if (qs.has("estatico")) document.body.classList.add("estatico");
  if (solo) document.querySelectorAll(".pantalla").forEach((s) => { if (s.id !== solo) s.hidden = true; });
  const escQ = ESCENARIOS.find((e) => e.id === qs.get("esc"));
  if (escQ) esc = escQ;

  portada();
  elegir(esc);
})();
