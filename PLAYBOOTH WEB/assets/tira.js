/* Dibuja la tira Guitarify (igual que PRODUCTO/playbooth-tira-simple.png)
   Medidas de diseño: 600 × 1800 (2 × 6 pulgadas a 300 ppp).
   Se dibuja a ESCALA × para que salga nítida (por defecto 1200 × 3600). */
(function () {
  const ANCHO = 600, ALTO = 1800;
  // Marcos de las 3 fotos (en coordenadas de diseño)
  const MARCO = { x: 24, w: 552, h: 426, ys: [24, 464, 904], radio: 6 };
  const PROPORCION_FOTO = MARCO.w / MARCO.h; // ≈ 1,296

  const ORO = "#d4a52a";
  const ROJO = "#c8102e";

  function rectRedondo(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Púa / escudo con rayo (logo). (x, y) = esquina superior izquierda, s = alto.
  function dibujarPua(ctx, x, y, s) {
    const k = s / 100;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    const pua = new Path2D("M50 97 C33 84 7 60 7 30 C7 14 27 5 50 5 C73 5 93 14 93 30 C93 60 67 84 50 97 Z");
    ctx.fillStyle = ROJO;
    ctx.fill(pua);
    ctx.lineWidth = 5;
    ctx.strokeStyle = ORO;
    ctx.stroke(pua);
    const rayo = new Path2D("M57 17 L35 55 L48 55 L42 85 L66 43 L53 43 L60 17 Z");
    ctx.fillStyle = "#f7ede0";
    ctx.fill(rayo);
    ctx.restore();
  }

  // Dibuja una foto (canvas o imagen) recortada para llenar el marco
  function dibujarCubriendo(ctx, img, x, y, w, h) {
    const iw = img.width, ih = img.height;
    const escala = Math.max(w / iw, h / ih);
    const sw = w / escala, sh = h / escala;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  }

  function dibujarQR(ctx, texto, x, y, lado) {
    const qr = qrcode(0, "M");
    qr.addData(texto);
    qr.make();
    const n = qr.getModuleCount();
    const m = lado / n;
    ctx.fillStyle = "#111";
    for (let f = 0; f < n; f++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(f, c)) {
          // +0.6 evita líneas finas entre módulos al escalar
          ctx.fillRect(x + c * m, y + f * m, m + 0.6, m + 0.6);
        }
      }
    }
  }

  async function cargarFuentes() {
    if (!document.fonts) return;
    try {
      await Promise.all([
        document.fonts.load('italic 800 64px "Montserrat"'),
        document.fonts.load('italic 700 17px "Montserrat"'),
        document.fonts.load('500 19px "Montserrat"'),
        document.fonts.load('700 18px "Montserrat"'),
        document.fonts.load('800 24px "Montserrat"'),
        document.fonts.load('600 14px "Montserrat"'),
        document.fonts.load('400 24px "Montserrat"'),
      ]);
    } catch (e) { /* si falla, usa la fuente del sistema */ }
  }

  /**
   * Compone la tira.
   * @param {Array<CanvasImageSource>} fotos  3 fotos (canvas o imágenes)
   * @param {string|null} urlQR  enlace del QR (null = recuadro vacío)
   * @param {number} escala  1 = 600×1800, 2 = 1200×3600
   * @param {"normal"|"rojo"|"minimal"} estilo  diseño de la tira
   */
  async function componerTira(fotos, urlQR, escala = 2, estilo = "normal") {
    await cargarFuentes();
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(ANCHO * escala);
    lienzo.height = Math.round(ALTO * escala);
    const ctx = lienzo.getContext("2d");
    ctx.scale(escala, escala);
    if (estilo === "rojo") dibujarRojo(ctx, fotos, urlQR);
    else if (estilo === "minimal") dibujarMinimal(ctx, fotos, urlQR);
    else dibujarNormal(ctx, fotos, urlQR);
    return lienzo;
  }

  // Logo centrado: púa + "Guitarify". yTexto = línea base del texto.
  function logoCentrado(ctx, yTexto, tamTexto, ladoPua, color = "#ffffff") {
    ctx.font = `italic 800 ${tamTexto}px "Montserrat", sans-serif`;
    ctx.textBaseline = "alphabetic";
    const anchoTexto = ctx.measureText("Guitarify").width;
    const separacion = tamTexto * 0.32;
    const inicio = (ANCHO - (ladoPua * 0.86 + separacion + anchoTexto)) / 2;
    dibujarPua(ctx, inicio - ladoPua * 0.07, yTexto - ladoPua * 0.78, ladoPua);
    ctx.fillStyle = color;
    ctx.fillText("Guitarify", inicio + ladoPua * 0.86 + separacion, yTexto);
  }

  function espaciado(ctx, px) { if ("letterSpacing" in ctx) ctx.letterSpacing = px + "px"; }

  // ===== Tira "Reproductor rojo" =====
  function dibujarRojo(ctx, fotos, urlQR) {
    const CREMA = "#ffffff";
    ctx.fillStyle = "#8e2a1e";
    ctx.fillRect(0, 0, ANCHO, ALTO);
    // tarjeta del reproductor con sombra
    ctx.save();
    ctx.shadowColor = "rgba(40, 5, 0, 0.45)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
    rectRedondo(ctx, 24, 24, 552, 1606, 28);
    ctx.fillStyle = "#5f160d";
    ctx.fill();
    ctx.restore();

    [46, 442, 838].forEach((y, i) => {
      ctx.save();
      rectRedondo(ctx, 46, y, 508, 380, 14);
      ctx.fillStyle = "#3a0d07";
      ctx.fill();
      ctx.clip();
      if (fotos[i]) dibujarCubriendo(ctx, fotos[i], 46, y, 508, 380);
      ctx.restore();
    });

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
    ctx.font = '600 13px "Montserrat", sans-serif';
    espaciado(ctx, 0.8);
    ctx.fillText("Reproduciendo en la PlayBooth", 56, 1260);
    espaciado(ctx, 0);
    ctx.fillStyle = CREMA;
    ctx.font = '800 24px "Montserrat", sans-serif';
    ctx.fillText("Descifra la música que tocas", 56, 1292);
    ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
    ctx.font = '600 16px "Montserrat", sans-serif';
    ctx.fillText("Guitarify", 56, 1318);

    // barra de progreso
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    rectRedondo(ctx, 56, 1354, 488, 4, 2); ctx.fill();
    ctx.fillStyle = CREMA;
    rectRedondo(ctx, 56, 1354, 190, 4, 2); ctx.fill();
    ctx.beginPath(); ctx.arc(246, 1356, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.font = '500 11px "Montserrat", sans-serif';
    ctx.fillText("1:26", 56, 1382);
    ctx.textAlign = "right";
    ctx.fillText("−2:14", 544, 1382);
    ctx.textAlign = "left";

    // controles: anterior, pausa, siguiente
    ctx.fillStyle = CREMA;
    const cy = 1440;
    const triangulo = (x1, x2) => { ctx.beginPath(); ctx.moveTo(x1, cy); ctx.lineTo(x2, cy - 17); ctx.lineTo(x2, cy + 17); ctx.closePath(); ctx.fill(); };
    ctx.fillRect(183, cy - 18, 5, 36); triangulo(188, 211); triangulo(211, 234);
    ctx.fillRect(412, cy - 18, 5, 36); triangulo(412, 389); triangulo(389, 366);
    ctx.beginPath(); ctx.arc(300, cy, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#5f160d";
    rectRedondo(ctx, 287, cy - 13, 9, 26, 2); ctx.fill();
    rectRedondo(ctx, 304, cy - 13, 9, 26, 2); ctx.fill();

    // volumen
    const vy = 1510;
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    const parlante = (x) => { ctx.beginPath(); ctx.moveTo(x, vy - 4); ctx.lineTo(x + 5, vy - 4); ctx.lineTo(x + 13, vy - 11); ctx.lineTo(x + 13, vy + 11); ctx.lineTo(x + 5, vy + 4); ctx.lineTo(x, vy + 4); ctx.closePath(); ctx.fill(); };
    parlante(57); parlante(512);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(526, vy, 8, -0.9, 0.9); ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    rectRedondo(ctx, 88, vy - 2, 409, 4, 2); ctx.fill();
    ctx.fillStyle = CREMA;
    rectRedondo(ctx, 88, vy - 2, 270, 4, 2); ctx.fill();
    ctx.beginPath(); ctx.arc(358, vy, 8, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.fillRect(56, 1542, 488, 1.5);
    logoCentrado(ctx, 1606, 46, 56);

    // pie
    ctx.fillStyle = CREMA;
    ctx.font = '500 17px "Montserrat", sans-serif';
    ctx.fillText("Feria de Proyectos", 36, 1691);
    ctx.fillText("Personales 2026–2027", 36, 1716);
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.font = '700 12px "Montserrat", sans-serif';
    espaciado(ctx, 5);
    ctx.fillText("UEPRIM", 36, 1748);
    espaciado(ctx, 0);
    rectRedondo(ctx, 454, 1648, 120, 120, 12);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    if (urlQR) dibujarQR(ctx, urlQR, 464, 1658, 100);
  }

  // ===== Tira "Minimal" =====
  function dibujarMinimal(ctx, fotos, urlQR) {
    const NEGRO = "#111111", ROJO_M = "#d7263d";
    ctx.fillStyle = "#fafaf7";
    ctx.fillRect(0, 0, ANCHO, ALTO);
    [30, 460, 890].forEach((y, i) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(31, y + 1, 538, 398);
      ctx.save();
      ctx.beginPath(); ctx.rect(40, y + 10, 520, 380); ctx.clip();
      ctx.fillStyle = "#ecebe6"; ctx.fillRect(40, y + 10, 520, 380);
      if (fotos[i]) dibujarCubriendo(ctx, fotos[i], 40, y + 10, 520, 380);
      ctx.restore();
      ctx.strokeStyle = "#5a5a58"; ctx.lineWidth = 1.5;
      ctx.strokeRect(31, y + 1, 538, 398);
      ctx.fillStyle = NEGRO;
      ctx.font = '800 11px "Montserrat", sans-serif';
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      espaciado(ctx, 3);
      ctx.fillText("0" + (i + 1), 31, y + 422);
      espaciado(ctx, 0);
    });
    ctx.fillStyle = ROJO_M;
    ctx.fillRect(557, 1298, 11, 11);

    ctx.fillStyle = NEGRO;
    ctx.font = '400 24px "Montserrat", sans-serif';
    ctx.textAlign = "center";
    espaciado(ctx, 17);
    ctx.fillText("PLAYBOOTH", 300 + 8.5, 1392);
    espaciado(ctx, 0);
    ctx.textAlign = "left";
    ctx.fillStyle = ROJO_M;
    ctx.fillRect(250, 1414, 100, 3);

    ctx.fillStyle = NEGRO;
    ctx.fillRect(27, 1452, 546, 104);
    logoCentrado(ctx, 1519, 46, 58);

    ctx.fillStyle = NEGRO;
    ctx.font = '500 17px "Montserrat", sans-serif';
    ctx.fillText("Feria de Proyectos", 27, 1622);
    ctx.fillText("Personales 2026–2027", 27, 1647);
    ctx.fillStyle = ROJO_M;
    ctx.font = '800 12px "Montserrat", sans-serif';
    espaciado(ctx, 5);
    ctx.fillText("UEPRIM", 27, 1685);
    espaciado(ctx, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(444, 1591, 129, 129);
    ctx.strokeStyle = NEGRO; ctx.lineWidth = 1.5;
    ctx.strokeRect(444.75, 1591.75, 127.5, 127.5);
    ctx.fillStyle = "#f6f0e5";
    ctx.fillRect(454, 1601, 109, 109);
    if (urlQR) dibujarQR(ctx, urlQR, 457, 1604, 103);
  }

  // ===== Tira "Clásica" (la original) =====
  function dibujarNormal(ctx, fotos, urlQR) {
    // Fondo negro con brillo rojo abajo a la izquierda y dorado a la derecha
    ctx.fillStyle = "#0b0a09";
    ctx.fillRect(0, 0, ANCHO, ALTO);
    let g = ctx.createRadialGradient(70, 1660, 0, 70, 1660, 620);
    g.addColorStop(0, "rgba(92, 12, 22, 0.95)");
    g.addColorStop(0.45, "rgba(52, 9, 15, 0.7)");
    g.addColorStop(1, "rgba(11, 10, 9, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ANCHO, ALTO);
    g = ctx.createRadialGradient(640, 1440, 0, 640, 1440, 330);
    g.addColorStop(0, "rgba(64, 50, 18, 0.75)");
    g.addColorStop(1, "rgba(11, 10, 9, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ANCHO, ALTO);

    // Las 3 fotos
    MARCO.ys.forEach((y, i) => {
      ctx.save();
      rectRedondo(ctx, MARCO.x, y, MARCO.w, MARCO.h, MARCO.radio);
      ctx.fillStyle = "#2b2622";
      ctx.fill();
      ctx.clip();
      if (fotos[i]) dibujarCubriendo(ctx, fotos[i], MARCO.x, y, MARCO.w, MARCO.h);
      ctx.restore();
      rectRedondo(ctx, MARCO.x + 0.5, y + 0.5, MARCO.w - 1, MARCO.h - 1, MARCO.radio);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(212, 165, 42, 0.7)";
      ctx.stroke();
    });

    // Logo: púa + "Guitarify", centrado
    ctx.font = 'italic 800 64px "Montserrat", sans-serif';
    ctx.textBaseline = "alphabetic";
    const textoLogo = "Guitarify";
    const anchoTexto = ctx.measureText(textoLogo).width;
    const ladoPua = 76, separacion = 18;
    const inicio = (ANCHO - (ladoPua * 0.86 + separacion + anchoTexto)) / 2;
    dibujarPua(ctx, inicio - ladoPua * 0.07, 1402, ladoPua);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(textoLogo, inicio + ladoPua * 0.86 + separacion, 1462);

    // Línea divisoria
    ctx.fillStyle = "rgba(212, 165, 42, 0.32)";
    ctx.fillRect(24, 1537, 552, 1.2);

    // Textos de la feria
    ctx.fillStyle = "#ddd3c6";
    ctx.font = '500 19px "Montserrat", sans-serif';
    ctx.fillText("Feria de Proyectos", 24, 1656);
    ctx.fillText("Personales 2026–2027", 24, 1682);
    ctx.fillStyle = "#ffffff";
    ctx.font = '700 18px "Montserrat", sans-serif';
    if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
    ctx.fillText("UEPRIM", 24, 1707);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.fillStyle = ORO;
    ctx.font = 'italic 700 17px "Montserrat", sans-serif';
    ctx.fillText("Descifra la música que tocas.", 24, 1770);

    // Recuadro del QR (abajo a la derecha)
    rectRedondo(ctx, 426, 1626, 150, 150, 9);
    ctx.fillStyle = "#f6f0e5";
    ctx.fill();
    if (urlQR) dibujarQR(ctx, urlQR, 436, 1636, 130);
  }

  window.Tira = { componerTira, dibujarPua, PROPORCION_FOTO, ANCHO, ALTO };
})();
