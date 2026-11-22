/* PlayBooth Guitarify: lógica de la cabina */
(function () {
  // ===== Ajustes fáciles de cambiar =====
  const CONFIG = {
    ESPEJO: true,                 // la vista y las fotos salen como en un espejo (como selfie)
    SEGUNDOS_CUENTA: 3,           // cuenta regresiva 3-2-1
    REINICIO_AUTOMATICO_SEG: 120, // en la pantalla final, vuelve al inicio solo tras 2 min sin tocar nada
    // Dirección pública para el QR. Déjalo en null para usar la misma web
    // (en Vercel es lo correcto). También se puede pasar ?base=https://... en la URL.
    URL_PUBLICA: null,
    CALIDAD_JPG: 0.9,
  };

  const TOTAL = 3;
  const $ = (id) => document.getElementById(id);
  const app = document.querySelector(".app");
  const video = $("video");
  const revision = $("revision");

  let estado = "inicio";
  let fotos = [null, null, null];  // canvas aceptados
  let actual = 0;                  // índice de la foto que se está tomando
  let capturada = null;            // canvas recién tomado (sin aceptar)
  let flujo = null;                // MediaStream de la cámara
  let sesion = null;               // { id, url, tiraBlob, fotosBlobs }
  let temporizadorReinicio = null;
  let segundosReinicio = 0;

  // ===== Utilidades =====
  function idAleatorio(n = 10) {
    const letras = "abcdefghjkmnpqrstuvwxyz23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    return Array.from(bytes, (b) => letras[b % letras.length]).join("");
  }
  const enCanvas = (lienzo, tipo = "image/jpeg", calidad = CONFIG.CALIDAD_JPG) =>
    new Promise((ok) => lienzo.toBlob(ok, tipo, calidad));

  let audio = null;
  function pitido(frecuencia = 880, duracion = 0.12, volumen = 0.15) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audio.createOscillator();
      const g = audio.createGain();
      osc.frequency.value = frecuencia;
      g.gain.setValueAtTime(volumen, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duracion);
      osc.connect(g).connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + duracion);
    } catch (e) { /* sin sonido */ }
  }

  // Sonido de cámara al tomar cada foto (assets/camara.mp3)
  const audioCamara = new Audio("assets/camara.mp3");
  audioCamara.preload = "auto";
  audioCamara.volume = 0.7;
  function sonidoCamara() {
    try {
      audioCamara.currentTime = 0;
      const p = audioCamara.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* sin sonido */ }
  }

  // ===== Filtros (Normal, Blanco y negro, Calor) =====
  // Mismas tablas que los <filter> del index.html, para que la foto salga igual que la vista en vivo.
  const TABLAS = {
    bn: [[0, 0.06, 0.5, 0.94, 1], [0, 0.06, 0.5, 0.94, 1], [0, 0.06, 0.5, 0.94, 1]],
    calor: [[0.10, 0.55, 0.85, 1, 1], [0.01, 0.04, 0.16, 0.62, 0.95], [0.03, 0.06, 0.15, 0.45, 0.86]],
    frio: [[0.02, 0.05, 0.22, 0.66, 0.93], [0.04, 0.18, 0.48, 0.84, 0.98], [0.12, 0.45, 0.84, 1, 1]],
  };
  // Filtros que se dibujan encima del video en un canvas (no son solo color)
  const CON_CAPA = ["pixel", "gafas"];
  const FILTROS = ["normal", ...Object.keys(TABLAS), ...CON_CAPA];
  const LUTS = {};
  for (const [nombre, canales] of Object.entries(TABLAS)) {
    LUTS[nombre] = canales.map((t) => {
      const lut = new Uint8ClampedArray(256), n = t.length - 1;
      for (let v = 0; v < 256; v++) {
        const x = (v / 255) * n, k = Math.min(Math.floor(x), n - 1);
        lut[v] = Math.round((t[k] + (x - k) * (t[k + 1] - t[k])) * 255);
      }
      return lut;
    });
  }
  let filtro = "normal";
  function aplicarFiltro(lienzo) {
    if (!TABLAS[filtro]) return;
    const [lr, lg, lb] = LUTS[filtro];
    const ctx = lienzo.getContext("2d");
    const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      d[i] = lr[y]; d[i + 1] = lg[y]; d[i + 2] = lb[y];
    }
    ctx.putImageData(img, 0, 0);
  }
  function elegirFiltro(nombre) {
    filtro = FILTROS.includes(nombre) ? nombre : "normal";
    video.style.filter = TABLAS[filtro] ? `url(#f-${filtro})` : "";
    capa.hidden = !CON_CAPA.includes(filtro);
    if (filtro === "gafas") cargarDetector();
    document.querySelectorAll("#filtros .filtro").forEach((b) =>
      b.classList.toggle("activo", b.dataset.filtro === filtro));
  }

  // ===== Pixel =====
  const BLOQUES_PIXEL = 56; // cuadritos a lo ancho
  const lienzoChico = document.createElement("canvas");
  function pixelar(origen, sx, sy, sw, sh, ctx, ancho, alto) {
    lienzoChico.width = BLOQUES_PIXEL;
    lienzoChico.height = Math.max(1, Math.round(BLOQUES_PIXEL * sh / sw));
    const c = lienzoChico.getContext("2d");
    c.imageSmoothingEnabled = true;
    c.drawImage(origen, sx, sy, sw, sh, 0, 0, lienzoChico.width, lienzoChico.height);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(lienzoChico, 0, 0, lienzoChico.width, lienzoChico.height, 0, 0, ancho, alto);
    ctx.restore();
  }

  // ===== Gafas de guitarra (detección de cara con MediaPipe) =====
  const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
  const MODELO_CARA = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
  const imgGafas = new Image();
  imgGafas.src = "assets/gafas.svg";
  // En gafas.svg el punto (0,0) está entre los lentes, a 270 × 380 de la esquina; los lentes están a 250 de distancia.
  const GAFAS = { origenX: 270, origenY: 380, ancho: 540, alto: 490, entreLentes: 250 };
  let detector = null, cargandoDetector = null, detectorFallo = false;
  let cara = null, ultimaCara = 0, ultimoTiempoVideo = -1;

  function cargarDetector() {
    if (detector || cargandoDetector || detectorFallo) return cargandoDetector;
    cargandoDetector = (async () => {
      try {
        const vision = await import(`${MP}/vision_bundle.mjs`);
        const archivos = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
        const opciones = (delegate) => ({
          baseOptions: { modelAssetPath: MODELO_CARA, delegate },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.5,
        });
        try {
          detector = await vision.FaceDetector.createFromOptions(archivos, opciones("GPU"));
        } catch (e) {
          detector = await vision.FaceDetector.createFromOptions(archivos, opciones("CPU"));
        }
      } catch (e) {
        console.warn("No se pudo cargar la detección de cara; las gafas irán al centro.", e);
        detectorFallo = true;
      }
      cargandoDetector = null;
    })();
    return cargandoDetector;
  }

  function detectarCara() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (detectorFallo) {
      // Sin detección: gafas fijas al centro, a la altura de los ojos
      cara = { x: vw / 2, y: vh * 0.42, d: vw * 0.16, ang: 0 };
      return;
    }
    if (!detector || video.readyState < 2 || video.currentTime === ultimoTiempoVideo) return;
    ultimoTiempoVideo = video.currentTime;
    let res;
    try { res = detector.detectForVideo(video, performance.now()); } catch (e) { return; }
    const caras = (res && res.detections) || [];
    let mejor = null;
    for (const c of caras) {
      if (!c.keypoints || c.keypoints.length < 2) continue;
      const area = c.boundingBox ? c.boundingBox.width * c.boundingBox.height : 0;
      if (!mejor || area > mejor.area) mejor = { c, area };
    }
    if (!mejor) {
      if (performance.now() - ultimaCara > 700) cara = null;
      return;
    }
    let [a, b] = mejor.c.keypoints;
    if (a.x > b.x) [a, b] = [b, a];
    const ax = a.x * vw, ay = a.y * vh, bx = b.x * vw, by = b.y * vh;
    const nueva = {
      x: (ax + bx) / 2, y: (ay + by) / 2,
      d: Math.hypot(bx - ax, by - ay), ang: Math.atan2(by - ay, bx - ax),
    };
    // suaviza un poco para que las gafas no tiemblen
    const k = cara ? 0.55 : 1;
    cara = cara ? {
      x: cara.x + (nueva.x - cara.x) * k, y: cara.y + (nueva.y - cara.y) * k,
      d: cara.d + (nueva.d - cara.d) * k, ang: cara.ang + (nueva.ang - cara.ang) * k,
    } : nueva;
    ultimaCara = performance.now();
  }

  function dibujarGafas(ctx, c) {
    if (!c || !imgGafas.complete || !imgGafas.naturalWidth) return;
    const s = (c.d / GAFAS.entreLentes) * 1.25; // un poco más grandes que la distancia entre los ojos
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.ang);
    ctx.drawImage(imgGafas, -GAFAS.origenX * s, -GAFAS.origenY * s, GAFAS.ancho * s, GAFAS.alto * s);
    ctx.restore();
  }

  // Capa en vivo (pixel o gafas) encima del video
  const capa = $("capa");
  const ctxCapa = capa.getContext("2d");
  function pintarCapa() {
    requestAnimationFrame(pintarCapa);
    if (!CON_CAPA.includes(filtro)) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    if (capa.width !== vw || capa.height !== vh) { capa.width = vw; capa.height = vh; }
    ctxCapa.clearRect(0, 0, vw, vh);
    if (filtro === "pixel") pixelar(video, 0, 0, vw, vh, ctxCapa, vw, vh);
    else { detectarCara(); dibujarGafas(ctxCapa, cara); }
  }
  requestAnimationFrame(pintarCapa);

  // ===== Cámara =====
  async function abrirCamara() {
    $("avisoCamara").hidden = true;
    if (flujo) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      mostrarErrorCamara("Este navegador no permite usar la cámara aquí. Abre la página con https:// o desde localhost, en Chrome o Edge.");
      return false;
    }
    try {
      flujo = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" },
        audio: false,
      });
      video.srcObject = flujo;
      video.classList.toggle("espejo", CONFIG.ESPEJO);
      capa.classList.toggle("espejo", CONFIG.ESPEJO);
      await video.play().catch(() => {});
      return true;
    } catch (e) {
      const texto = e && e.name === "NotAllowedError"
        ? "El permiso de cámara está bloqueado. Haz clic en el candado de la barra de direcciones, permite la cámara y vuelve a intentar."
        : e && e.name === "NotFoundError"
          ? "No se encontró ninguna cámara conectada."
          : "La cámara está ocupada o no responde. Cierra otras apps que la usen (Zoom, Teams, Cámara) y vuelve a intentar.";
      mostrarErrorCamara(texto);
      return false;
    }
  }
  function mostrarErrorCamara(texto) {
    $("avisoCamaraTexto").textContent = texto;
    $("avisoCamara").hidden = false;
  }

  function capturar() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const prop = Tira.PROPORCION_FOTO;
    // recorte central con la proporción del marco de la tira
    let sw = vw, sh = vw / prop;
    if (sh > vh) { sh = vh; sw = vh * prop; }
    const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(sw);
    lienzo.height = Math.round(sh);
    const ctx = lienzo.getContext("2d");
    if (CONFIG.ESPEJO) { ctx.translate(lienzo.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, lienzo.width, lienzo.height);
    if (filtro === "gafas") {
      // mismas coordenadas que el video (ya con el espejo aplicado)
      ctx.scale(lienzo.width / sw, lienzo.height / sh);
      ctx.translate(-sx, -sy);
      dibujarGafas(ctx, cara);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (filtro === "pixel") pixelar(lienzo, 0, 0, lienzo.width, lienzo.height, ctx, lienzo.width, lienzo.height);
    aplicarFiltro(lienzo);
    return lienzo;
  }

  // ===== Interfaz =====
  function miniatura(lienzo) {
    const c = document.createElement("canvas");
    c.width = 160; c.height = Math.round(160 / Tira.PROPORCION_FOTO);
    c.getContext("2d").drawImage(lienzo, 0, 0, c.width, c.height);
    return c;
  }

  function pintarLista() {
    const ol = $("pistas");
    ol.innerHTML = "";
    const sePuedeElegir = estado === "camara" || estado === "revisar";
    for (let i = 0; i < TOTAL; i++) {
      const li = document.createElement("li");
      const esActual = (estado === "camara" || estado === "contando" || estado === "revisar") && i === actual;
      li.className = "pista" + (fotos[i] ? " lista" : "") + (esActual ? " actual" : "") +
        (sePuedeElegir && fotos[i] ? " se-puede" : "");
      // Fotos tomadas: "Foto 1 (lista)" + "Click para repetir". Las que faltan: "Pendiente".
      const nombreTxt = fotos[i] ? `Foto ${i + 1} (lista)` : `Foto ${i + 1}`;
      const estadoTxt = fotos[i] ? (sePuedeElegir ? "Click para repetir" : "") : "Pendiente";
      li.innerHTML = `<span class="pista-num">${i + 1}</span><span class="pista-mini"></span>
        <span><div class="pista-nombre">${nombreTxt}</div><div class="pista-estado">${estadoTxt}</div></span>`;
      const mini = li.querySelector(".pista-mini");
      if (fotos[i]) mini.appendChild(miniatura(fotos[i]));
      else mini.innerHTML = '<svg><use href="#i-camara"/></svg>';
      if (sePuedeElegir && fotos[i]) {
        li.title = "Repetir esta foto";
        li.addEventListener("click", () => elegirFoto(i));
      }
      ol.appendChild(li);
    }
    const hechas = fotos.filter(Boolean).length;
    $("cuenta").textContent = `${hechas} / ${TOTAL}`;
    // barra de progreso
    $("progreso").querySelectorAll("span").forEach((s, i) => {
      s.className = fotos[i] ? "hecho" : (i === actual && estado !== "inicio" && estado !== "final" ? "actual" : "");
    });
  }

  function pintarBarra() {
    const titulo = $("repTitulo");
    const mini = $("repMini");
    const enFoto = ["camara", "contando", "revisar"].includes(estado);
    titulo.textContent =
      estado === "inicio" ? "Listos para empezar" :
      enFoto ? `Foto ${actual + 1} de ${TOTAL}` :
      estado === "procesando" ? "Armando tu tira" : "Tu tira está lista";
    mini.innerHTML = "";
    if (enFoto && fotos[actual]) mini.appendChild(miniatura(fotos[actual]));
    else if (estado === "revisar" && capturada) mini.appendChild(miniatura(capturada));
    else mini.innerHTML = '<svg><use href="#i-pua"/></svg>';

    $("btnDisparar").disabled = !(estado === "camara" || estado === "inicio");
    $("btnRepetir").disabled = estado !== "revisar";
    $("btnUsar").disabled = estado !== "revisar";
    $("btnNueva").hidden = estado !== "final";
    $("etiqueta").innerHTML = `Foto <b>${actual + 1}</b> de ${TOTAL}`;
  }

  function cambiarEstado(nuevo) {
    estado = nuevo;
    app.dataset.estado = nuevo;
    $("resultado").hidden = !(nuevo === "final" || nuevo === "procesando");
    const sePuedeFiltrar = nuevo === "inicio" || nuevo === "camara" || nuevo === "revisar";
    document.querySelectorAll("#filtros .filtro").forEach((b) => { b.disabled = !sePuedeFiltrar; });
    pintarLista();
    pintarBarra();
  }

  // ===== Flujo =====
  async function empezar() {
    fotos = [null, null, null];
    actual = 0;
    capturada = null;
    sesion = null;
    cambiarEstado("camara");
    await abrirCamara();
  }

  function elegirFoto(i) {
    actual = i;
    capturada = null;
    cambiarEstado("camara");
  }

  async function disparar() {
    if (estado === "inicio") return empezar();
    if (estado !== "camara") return;
    if (!flujo && !(await abrirCamara())) return;
    cambiarEstado("contando");
    const numero = $("cuentaAtras");
    for (let n = CONFIG.SEGUNDOS_CUENTA; n >= 1; n--) {
      numero.textContent = n;
      numero.classList.remove("late"); void numero.offsetWidth; numero.classList.add("late");
      pitido(n === 1 ? 990 : 660);
      await new Promise((r) => setTimeout(r, 1000));
    }
    numero.classList.remove("late");
    numero.textContent = "";
    capturada = capturar();
    const destello = $("destello");
    destello.classList.remove("activo"); void destello.offsetWidth; destello.classList.add("activo");
    sonidoCamara();
    if (!capturada) { cambiarEstado("camara"); return; }
    revision.width = capturada.width;
    revision.height = capturada.height;
    revision.getContext("2d").drawImage(capturada, 0, 0);
    cambiarEstado("revisar");
  }

  function repetir() {
    if (estado !== "revisar") return;
    capturada = null;
    cambiarEstado("camara");
  }

  function usar() {
    if (estado !== "revisar" || !capturada) return;
    fotos[actual] = capturada;
    capturada = null;
    const siguiente = fotos.findIndex((f) => !f);
    if (siguiente === -1) return terminar();
    actual = siguiente;
    cambiarEstado("camara");
  }

  // ===== Tira + QR + subida =====
  async function urlBase() {
    const param = new URLSearchParams(location.search).get("base");
    if (param) return param.replace(/\/$/, "");
    if (CONFIG.URL_PUBLICA) return CONFIG.URL_PUBLICA.replace(/\/$/, "");
    try {
      const r = await fetch("api/config", { cache: "no-store" });
      if (r.ok) {
        const datos = await r.json();
        if (datos && datos.base) return datos.base.replace(/\/$/, "");
      }
    } catch (e) { /* sin servidor: usa la misma web */ }
    return location.origin;
  }

  async function terminar() {
    cambiarEstado("procesando");
    $("qrCaja").innerHTML = '<div class="cargando"><span></span><span></span><span></span></div>';
    $("imgTira").removeAttribute("src");
    ponerEstadoSubida("Armando tu tira…", "");
    $("textoFinal").hidden = true;
    $("btnReintentarSubida").hidden = true;

    const id = idAleatorio();
    const url = `${await urlBase()}/t/${id}`;
    const tira = await Tira.componerTira(fotos, url, 2);
    const tiraBlob = await enCanvas(tira, "image/jpeg", 0.92);
    const fotosBlobs = await Promise.all(fotos.map((f) => enCanvas(f)));
    sesion = { id, url, tiraBlob, fotosBlobs };

    const urlLocal = URL.createObjectURL(tiraBlob);
    $("imgTira").src = urlLocal;
    const enlace = $("btnDescargarAqui");
    enlace.href = urlLocal;
    enlace.download = `playbooth-guitarify-${id}.jpg`;

    cambiarEstado("final");
    iniciarReinicio();
    await subir();
  }

  function ponerEstadoSubida(texto, clase) {
    const p = $("estadoSubida");
    p.textContent = texto;
    p.className = "resultado-estado" + (clase ? " " + clase : "");
  }

  async function subirArchivo(id, nombre, blob) {
    const r = await fetch(`api/subir?id=${id}&nombre=${nombre}`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: blob,
    });
    if (!r.ok) throw new Error(`${nombre}: ${r.status} ${await r.text().catch(() => "")}`);
  }

  async function subir() {
    if (!sesion) return;
    const { id, url, tiraBlob, fotosBlobs } = sesion;
    $("btnReintentarSubida").hidden = true;
    $("textoFinal").hidden = true;
    ponerEstadoSubida("Subiendo tu tira…", "");
    $("qrCaja").innerHTML = '<div class="cargando"><span></span><span></span><span></span></div>';
    try {
      // primero la tira (lo más importante), luego las fotos sueltas
      await subirArchivo(id, "tira", tiraBlob);
      await Promise.all(fotosBlobs.map((b, i) => subirArchivo(id, `foto${i + 1}`, b)));
      if (!sesion || sesion.id !== id) return; // ya empezó otra sesión
      const qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      $("qrCaja").innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
      ponerEstadoSubida("Descarga tus fotos y no olvides evaluar este proyecto.", "ok");
      $("textoFinal").hidden = false;
    } catch (e) {
      console.error("Error al subir", e);
      if (!sesion || sesion.id !== id) return;
      $("qrCaja").innerHTML = '<div style="color:#7d756b;font-weight:700;text-align:center">Sin conexión</div>';
      ponerEstadoSubida("No se pudo subir la tira. Revisa la conexión a internet y vuelve a intentarlo.", "mal");
      $("btnReintentarSubida").hidden = false;
    }
  }

  function iniciarReinicio() {
    clearInterval(temporizadorReinicio);
    segundosReinicio = CONFIG.REINICIO_AUTOMATICO_SEG;
    const mostrar = () => {
      const m = Math.floor(segundosReinicio / 60), s = String(segundosReinicio % 60).padStart(2, "0");
      $("repReinicio").textContent = `Vuelve al inicio en ${m}:${s}`;
    };
    mostrar();
    temporizadorReinicio = setInterval(() => {
      segundosReinicio--;
      if (segundosReinicio <= 0) return volverAlInicio();
      mostrar();
    }, 1000);
  }

  function volverAlInicio() {
    clearInterval(temporizadorReinicio);
    $("repReinicio").textContent = "";
    if (sesion) {
      const src = $("imgTira").src;
      if (src && src.startsWith("blob:")) URL.revokeObjectURL(src);
    }
    sesion = null;
    fotos = [null, null, null];
    actual = 0;
    capturada = null;
    elegirFiltro("normal");
    cambiarEstado("inicio");
  }

  // ===== Eventos =====
  $("btnEmpezar").addEventListener("click", empezar);
  document.querySelectorAll("#filtros .filtro").forEach((b) =>
    b.addEventListener("click", () => elegirFiltro(b.dataset.filtro)));
  $("btnDisparar").addEventListener("click", disparar);
  $("btnRepetir").addEventListener("click", repetir);
  $("btnUsar").addEventListener("click", usar);
  $("btnNueva").addEventListener("click", volverAlInicio);
  $("btnReintentarSubida").addEventListener("click", subir);
  $("btnReintentarCamara").addEventListener("click", async () => {
    flujo = null;
    await abrirCamara();
  });

  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const k = e.key;
    const principal = k === " " || k === "Enter" || k === "PageDown" || k === "ArrowRight" || k === "AudioVolumeUp";
    const atras = k === "r" || k === "R" || k === "Backspace" || k === "PageUp" || k === "ArrowLeft" || k === "AudioVolumeDown";
    if (estado === "final") { iniciarReinicio(); }
    if (principal) {
      e.preventDefault();
      if (estado === "inicio") empezar();
      else if (estado === "camara") disparar();
      else if (estado === "revisar") usar();
      // en la pantalla final no se reinicia con teclas, para no borrar el QR antes de escanearlo
    } else if (atras) {
      if (estado === "revisar") { e.preventDefault(); repetir(); }
    }
  });
  document.addEventListener("pointerdown", () => { if (estado === "final") iniciarReinicio(); });

  // Arranque: prende la cámara de una vez para que se vea detrás de la portada
  cambiarEstado("inicio");
  abrirCamara();
})();
