/* =====================================================================
   MOTOR del catálogo flipbook. Genérico: no edites este archivo para un
   catálogo concreto; todo lo específico va en plantilla.js (window.PLANTILLA).
   Contrato completo: references/contrato-plantilla.md
   ===================================================================== */
(() => {
  "use strict";

  const P = window.PLANTILLA;
  if (!P || !window.CATALOGO) {
    document.body.insertAdjacentHTML("beforeend", '<p style="position:fixed;inset:40% 0 auto;text-align:center">Falta data.js o plantilla.js.</p>');
    return;
  }

  /* ---------- Configuración con valores por defecto ---------- */
  const CFG = {
    nombre: P.nombre || "catalogo",
    coleccion: P.coleccion || "items",
    singular: P.etiqueta?.singular || "Ítem",
    plural: P.etiqueta?.plural || "Ítems",
    ancho: P.pagina?.ancho || 595,
    alto: P.pagina?.alto || 842,
    campoVideo: P.campoVideo || "video",
    favoritos: P.favoritos !== false,
    multilinea: P.multilinea || "[data-multilinea]",
  };
  const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const HASH = slug(CFG.singular);
  const RATIO = CFG.alto / CFG.ancho;

  let ORIGINAL = JSON.parse(JSON.stringify(window.CATALOGO));
  let state = JSON.parse(JSON.stringify(ORIGINAL));
  let book = null;
  let editing = false;
  // La edición solo existe si se entra con ?editar. No es seguridad: los cambios quedan en el
  // navegador de quien edita y solo se publican exportando data.js.
  const PUEDE_EDITAR = new URLSearchParams(location.search).has("editar");
  let favs = new Set(lsGet(`${CFG.nombre}:favs`, []));
  let paginaDeItem = new Map();   // índice de ítem → primera página donde aparece
  let totalPaginas = 0;

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const items = () => state[CFG.coleccion] || [];
  const idItem = (it, i) => (P.idItem ? P.idItem(it, i) : i + 1);
  const tituloItem = (it, i) => (P.tituloItem ? P.tituloItem(it, i) : it.titulo || it.nombre || `${CFG.singular} ${idItem(it, i)}`);

  /* ---------- Estado y almacenamiento ---------- */
  function getPath(path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), state); }
  function setPath(path, val) {
    const keys = path.split(".");
    const last = keys.pop();
    keys.reduce((o, k) => (o[k] ??= {}), state)[last] = val;
    guardar();
  }
  function lsGet(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }

  // Las fotos editadas pesan mucho para localStorage: van a IndexedDB.
  const idb = {
    open() {
      return new Promise((res, rej) => {
        try {
          const r = indexedDB.open(`catalogo-${CFG.nombre}`, 1);
          r.onupgradeneeded = () => r.result.createObjectStore("kv");
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        } catch (e) { rej(e); }
      });
    },
    async get(k) {
      try {
        const db = await idb.open();
        return await new Promise((res) => { const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); });
      } catch { return undefined; }
    },
    async set(k, v) {
      try {
        const db = await idb.open();
        await new Promise((res) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = res; t.onerror = res; });
      } catch { /* sin almacenamiento */ }
    },
    async del(k) {
      try {
        const db = await idb.open();
        await new Promise((res) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").delete(k); t.oncomplete = res; t.onerror = res; });
      } catch { /* sin almacenamiento */ }
    },
  };
  let saveTimer;
  function guardar() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => idb.set("estado", state), 400);
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove("is-on"), 2400);
  }

  /* ---------- API que reciben las funciones de la plantilla ---------- */
  const ICON = {
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  };
  const C = {
    get state() { return state; },
    get editing() { return editing; },
    get favs() { return favs; },
    items, esc, getPath, setPath, toast, ICON, idItem, tituloItem,
    // atributo para texto editable: <h2 ${C.bind("lotes.0.nombre")}>
    bind: (path) => `data-bind="${path}"`,
    // botón "Cambiar foto" visible solo en edición
    imgBtn: (path, label = "Cambiar foto") => `<button class="img-btn edit-only" data-action="img" data-path="${path}">📷 ${label}</button>`,
    // botón de favorito para una página de ítem
    favBtn: (i, extra = "") => (CFG.favoritos ? `<button class="fav ${favs.has(items()[i]?.id ?? String(i)) ? "is-on" : ""} ${extra}" data-action="fav" data-item="${i}" aria-label="Agregar a favoritos">${ICON.heart}</button>` : ""),
    abrirModal, pedirFoto, irAItem, rebuild, videoInfo,
    abrirFicha: (i) => abrirFicha(i), abrirVideo: (i) => abrirVideo(i), abrirLista: (f) => abrirDrawer(f),
    cerrarModal: () => $("#modal").close(),
    fichaHTML,
  };
  window.Catalogo = C;

  /* ---------- Libro ---------- */
  function paginasHTML() {
    const pags = P.paginas(C);
    if (pags.length % 2) console.warn(`[catálogo] ${pags.length} páginas: el total debería ser par para que los pliegos dobles calcen.`);
    return pags.join("");
  }
  function isLandscape() { return window.innerWidth >= 760; }
  function fitBook() {
    const stage = $("#stage");
    const W = stage.clientWidth - 32;
    const H = stage.clientHeight - 48;
    const cols = isLandscape() ? 2 : 1;
    const pw = Math.floor(Math.min(W / cols, H / RATIO));
    const el = $("#frame");
    el.style.width = pw * cols + "px";
    el.style.height = Math.round(pw * RATIO) + "px";
  }

  function buildBook(startPage = 0) {
    if (book) { book.destroy(); book = null; }
    // destroy() elimina el contenedor: se recrea dentro de #frame
    let el = $("#book");
    if (!el) {
      el = document.createElement("div");
      el.id = "book"; el.className = "book";
      $("#frame").append(el);
    }
    el.innerHTML = paginasHTML();
    const pages = $$(".page", el);
    totalPaginas = pages.length;
    paginaDeItem = new Map();
    pages.forEach((p, k) => { const i = p.dataset.item; if (i != null && !paginaDeItem.has(+i)) paginaDeItem.set(+i, k); });
    fitBook();
    book = new St.PageFlip(el, Object.assign({
      width: CFG.ancho, height: CFG.alto, size: "stretch",
      minWidth: 280, maxWidth: 3000, minHeight: Math.round(280 * RATIO), maxHeight: Math.round(3000 * RATIO),
      showCover: true, usePortrait: true, maxShadowOpacity: 0.55,
      mobileScrollSupport: false, flippingTime: 900, startPage: Math.min(startPage, totalPaginas - 1),
      autoSize: true, drawShadow: true,
    }, P.libro || {}));
    book.loadFromHTML(pages);
    book.on("flip", (e) => onPage(e.data));
    book.on("changeOrientation", () => onPage(book.getCurrentPageIndex()));
    wirePages(el);
    onPage(book.getCurrentPageIndex());
    if (editing) aplicarEdicion();
  }

  function rebuild() { buildBook(book ? book.getCurrentPageIndex() : 0); }

  function visiblePages(i) {
    if (!book || book.getOrientation() === "portrait") return [i];
    if (i === 0) return [0];
    return i % 2 ? [i, i + 1] : [i - 1, i];
  }

  function onPage(i) {
    const pages = $$("#book .page").slice(0, totalPaginas);
    const vis = visiblePages(i).filter((v) => v < totalPaginas);
    pages.forEach((p, k) => {
      const on = vis.includes(k);
      if (on && !p.classList.contains("is-active")) {
        p.classList.add("is-active");
        countUp(p);
        P.alActivar?.(p, C);
      } else if (!on) p.classList.remove("is-active");
    });
    const conItem = vis.map((v) => pages[v]?.dataset.item).find((x) => x != null);
    const titulo = vis.map((v) => pages[v]?.dataset.titulo).find(Boolean);
    const rango = `${vis.map((v) => v + 1).join("–")} / ${totalPaginas}`;
    let label;
    if (conItem != null) label = `${CFG.singular} ${idItem(items()[conItem], +conItem)} · ${rango}`;
    else if (titulo) label = `${titulo} · ${rango}`;
    else if (vis[0] === 0) label = "Portada";
    else if (vis.includes(totalPaginas - 1)) label = "Contraportada";
    else label = `Página ${rango}`;
    $("#counter").textContent = label;
    try {
      history.replaceState(null, "", conItem != null ? `#${HASH}-${idItem(items()[conItem], +conItem)}` : location.pathname + location.search);
    } catch { /* file:// en algunos navegadores */ }
    if (i > 0) $("#hint").classList.add("is-hidden");
  }

  // Cuenta desde 0 los números de los elementos .countup al abrir su página
  function countUp(page) {
    if (editing || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    $$(".countup", page).forEach((el) => {
      // El valor final sale de los datos (no del texto en pantalla): si la página se activa dos
      // veces seguidas, el segundo conteo tomaría como final el "0" que dejó el primero.
      const final = el.dataset.bind ? String(getPath(el.dataset.bind) ?? "") : (el.dataset.final ??= el.textContent);
      const run = (el._conteo = (el._conteo || 0) + 1);
      const parts = final.split(/(\d+)/);
      const nums = parts.map((p) => (/^\d+$/.test(p) ? +p : null));
      if (!nums.some((n) => n !== null)) return;
      const t0 = performance.now() + (+el.dataset.delay || 900);
      const dur = 1100;
      const tick = (t) => {
        if (run !== el._conteo) return;
        if (editing) { el.textContent = final; return; }
        const k = Math.min(1, Math.max(0, (t - t0) / dur));
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = parts.map((p, j) => (nums[j] !== null ? Math.round(nums[j] * e) : p)).join("");
        if (k < 1) requestAnimationFrame(tick); else el.textContent = final;
      };
      requestAnimationFrame(tick);
    });
  }

  function irAItem(i) {
    const target = paginaDeItem.get(+i);
    if (target == null) return;
    const cur = book.getCurrentPageIndex();
    if (visiblePages(cur).includes(target)) return;
    if (Math.abs(target - cur) <= 2) book.flip(target);
    else { book.turnToPage(target); onPage(target); }
  }

  /* ---------- Eventos dentro de las páginas ---------- */
  function wirePages(root) {
    // StPageFlip escucha mousedown/touchstart: los botones lo detienen para no plegar la hoja,
    // y en edición se detiene en toda la página para poder escribir.
    const stop = (e) => { if (editing || e.target.closest("button, a, input, [contenteditable='true']")) e.stopPropagation(); };
    $$(".page", root).forEach((p) => {
      p.addEventListener("mousedown", stop);
      p.addEventListener("touchstart", stop, { passive: true });
    });
    root.addEventListener("click", onAction);
    root.addEventListener("input", (e) => {
      const el = e.target.closest("[data-bind]");
      if (!el) return;
      const val = el.innerText.trim();
      setPath(el.dataset.bind, val);
      // el mismo dato puede aparecer en varias páginas
      $$(`[data-bind="${el.dataset.bind}"]`).forEach((o) => { if (o !== el) o.textContent = val; });
    });
    root.addEventListener("paste", (e) => {
      if (!e.target.closest("[data-bind]")) return;
      e.preventDefault();
      document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text"));
    });
    root.addEventListener("keydown", (e) => {
      const el = e.target.closest("[data-bind]");
      if (!el) return;
      e.stopPropagation();
      if (e.key === "Enter" && !el.matches(CFG.multilinea)) { e.preventDefault(); el.blur(); }
    });
    root.addEventListener("dragover", (e) => {
      if (!editing) return;
      const t = e.target.closest("[data-drop]");
      if (!t) return;
      e.preventDefault();
      $$(".drop-over").forEach((x) => x !== t && x.classList.remove("drop-over"));
      t.classList.add("drop-over");
    });
    root.addEventListener("dragleave", (e) => { const t = e.target.closest("[data-drop]"); if (t && !t.contains(e.relatedTarget)) t.classList.remove("drop-over"); });
    root.addEventListener("drop", (e) => {
      const t = e.target.closest("[data-drop]");
      if (!editing || !t) return;
      e.preventDefault();
      t.classList.remove("drop-over");
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith("image/")) cargarFoto(t.dataset.drop, f);
    });
  }

  function onAction(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const a = btn.dataset.action;
    const i = btn.dataset.item != null ? +btn.dataset.item : null;
    const ctx = { btn, i, item: i != null ? items()[i] : null, C, editing };
    // En edición la plantilla puede interceptar (ej. tocar un círculo = cambiar su foto)
    if (editing && P.enEdicion?.[a]?.(ctx)) return;
    switch (a) {
      case "prev": book.flipPrev(); return;
      case "next": book.flipNext(); return;
      case "indice": abrirDrawer(); return;
      case "favoritos": abrirDrawer("fav"); return;
      case "cerrar-drawer": cerrarDrawer(); return;
      case "cerrar-modal": $("#modal").close(); return;
      case "ficha": abrirFicha(i); return;
      case "video": abrirVideo(i); return;
      case "fav": toggleFav(i); return;
      case "img": pedirFoto(btn.dataset.path); return;
      case "ir": $("#modal").close(); cerrarDrawer(); irAItem(i); return;
      case "copiar": copiarEnlace(i); return;
      case "editar": toggleEdit(); return;
      case "exportar": exportar(); return;
      case "publicar": abrirPublicar(); return;
      case "imprimir": imprimir(); return;
      case "restablecer": restablecer(); return;
      case "fullscreen": pantallaCompleta(); return;
      case "whatsapp": enviarWhatsApp(); return;
      case "enlace": window.open(btn.dataset.href, "_blank", "noopener"); return;
    }
    if (P.acciones?.[a]) P.acciones[a](ctx);
    else console.warn(`[catálogo] acción sin manejar: ${a}`);
  }

  /* ---------- Modales ---------- */
  function abrirModal(html) {
    $("#modal-body").innerHTML = html;
    const m = $("#modal");
    if (!m.open) m.showModal();
  }

  // Ficha estándar; la plantilla la arma con sus datos o la reemplaza con P.ficha
  function fichaHTML({ i, foto, fotoPos = "50% 50%", kicker = "", titulo = "", sub = "", desc = "", campos = [], nota = "", botones }) {
    const it = items()[i];
    const fav = favs.has(it?.id ?? String(i));
    const video = it?.[CFG.campoVideo];
    const bts = botones ?? [
      video !== undefined ? `<button class="btn red" data-action="video" data-item="${i}">▶ Ver video</button>` : "",
      CFG.favoritos ? `<button class="btn ${fav ? "is-on" : ""}" data-action="fav" data-item="${i}">♥ ${fav ? "En favoritos" : "Me interesa"}</button>` : "",
      `<button class="btn" data-action="copiar" data-item="${i}">🔗 Copiar enlace</button>`,
      `<button class="btn primary" data-action="ir" data-item="${i}">Ir a la página</button>`,
    ].join("");
    return `
      <div class="ficha">
        <div class="foto">${foto ? `<img src="${esc(foto)}" alt="${esc(titulo)}" style="object-position:${fotoPos}">` : ""}</div>
        <div class="info">
          ${kicker ? `<span class="kicker">${esc(kicker)}</span>` : ""}
          <h3>${esc(titulo)}${sub ? `<span class="num">${esc(sub)}</span>` : ""}</h3>
          ${desc ? `<p class="desc">${esc(desc)}</p>` : ""}
          ${campos.length ? `<dl class="kv">${campos.filter((c) => c && c.valor !== undefined && c.valor !== "").map((c) => `<div><dt>${esc(c.etiqueta)}</dt><dd>${esc(c.valor)}</dd></div>`).join("")}</dl>` : ""}
          ${nota ? `<div class="nota">${nota}</div>` : ""}
          <div class="btns">${bts}</div>
        </div>
      </div>`;
  }

  function abrirFicha(i) {
    const it = items()[i];
    if (!it) return;
    abrirModal(P.ficha ? P.ficha(it, i, C) : fichaHTML({
      i, foto: it.foto, kicker: `${CFG.singular} ${idItem(it, i)}`, titulo: tituloItem(it, i),
      desc: it.descripcion, campos: P.campos ? P.campos(it, i) : [],
    }));
  }

  /* ---------- Video ---------- */
  // Acepta el enlace del navegador, el de "Compartir", Shorts/Live, el código <iframe>, Vimeo y .mp4
  function videoInfo(url) {
    const yt = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/))([\w-]{11})/);
    if (yt) return {
      tipo: "youtube",
      embed: `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0&playsinline=1`,
      ver: `https://www.youtube.com/watch?v=${yt[1]}`,
      miniatura: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`,
    };
    const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vm) return { tipo: "vimeo", embed: `https://player.vimeo.com/video/${vm[1]}?autoplay=1`, ver: `https://vimeo.com/${vm[1]}` };
    const src = url.match(/src="([^"]+)"/);
    if (src) return videoInfo(src[1]);
    if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return { tipo: "archivo", ver: url };
    return null;
  }

  function videoReproductor(v) {
    if (v.tipo === "archivo") return `<video src="${esc(v.ver)}" controls autoplay playsinline></video>`;
    // YouTube no reproduce dentro de una página abierta como archivo (file://): "Error 153".
    // Ahí se muestra la miniatura con enlace; publicado (http/https) se reproduce dentro.
    if (location.protocol === "file:") {
      return `<a class="video-thumb" href="${esc(v.ver)}" target="_blank" rel="noopener">
        ${v.miniatura ? `<img src="${esc(v.miniatura)}" alt="">` : ""}<span class="play"></span><span class="lbl">Ver en ${v.tipo === "vimeo" ? "Vimeo" : "YouTube"} ↗</span></a>`;
    }
    return `<iframe src="${esc(v.embed)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  }

  function abrirVideo(i) {
    const it = items()[i];
    const url = String(it?.[CFG.campoVideo] || "").trim();
    const v = url && videoInfo(url);
    const editor = editing ? `
      <label class="field">Enlace del video: pega el enlace de YouTube (navegador o «Compartir»), el código para insertar, Vimeo o un .mp4
        <input id="video-url" type="text" value="${esc(url)}" placeholder="https://youtu.be/…" autocomplete="off"></label>
      <div class="btns"><button class="btn primary" id="video-save">Guardar enlace</button></div>` : "";
    abrirModal(`
      ${v ? `<div class="video-wrap">${videoReproductor(v)}</div>` : ""}
      <div class="modal-pad">
        <h3>${esc(tituloItem(it, i))}</h3>
        ${!url ? "<p>El video estará disponible pronto.</p>" : ""}
        ${url && !v ? `<p>No se reconoce este enlace de video.</p><p><a class="btn red" href="${esc(url)}" target="_blank" rel="noopener">Abrir enlace ↗</a></p>` : ""}
        ${v && v.tipo !== "archivo" ? `<p class="video-alt">¿No carga? <a href="${esc(v.ver)}" target="_blank" rel="noopener">Ábrelo directamente en ${v.tipo === "vimeo" ? "Vimeo" : "YouTube"} ↗</a></p>` : ""}
        ${editor}
      </div>`);
    const save = $("#video-save");
    if (save) save.onclick = () => {
      const val = $("#video-url").value.trim();
      const info = val && videoInfo(val);
      // se guarda el enlace limpio aunque hayan pegado el <iframe>
      setPath(`${CFG.coleccion}.${i}.${CFG.campoVideo}`, info && info.tipo !== "archivo" ? info.ver : val);
      $$(`#book [data-action="video"][data-item="${i}"]`).forEach((b) => b.classList.toggle("sin-video", !items()[i][CFG.campoVideo]));
      toast(val && !info ? "Enlace guardado, pero no parece un video de YouTube o Vimeo" : "Enlace guardado");
      abrirVideo(i);
    };
  }

  function copiarEnlace(i) {
    const url = location.href.split("#")[0].replace(/[?&]editar\b/, "") + `#${HASH}-${idItem(items()[i], i)}`;
    (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast("Enlace copiado"), () => prompt("Copia este enlace:", url));
  }

  /* ---------- Favoritos ---------- */
  const favId = (i) => items()[i]?.id ?? String(i);
  function toggleFav(i) {
    const id = favId(i);
    favs.has(id) ? favs.delete(id) : favs.add(id);
    lsSet(`${CFG.nombre}:favs`, [...favs]);
    $$(`.fav[data-item="${i}"]`).forEach((b) => b.classList.toggle("is-on", favs.has(id)));
    actualizarFavCount();
    if ($("#modal").open && $(".ficha")) abrirFicha(i);
    if ($("#drawer").classList.contains("is-open")) renderLista();
    toast(favs.has(id) ? `${CFG.singular} ${idItem(items()[i], i)} agregado a favoritos` : "Quitado de favoritos");
  }
  function actualizarFavCount() { $("#fav-count").textContent = favs.size; }

  function enviarWhatsApp() {
    const elegidos = items().map((it, i) => ({ it, i })).filter(({ i }) => favs.has(favId(i)));
    const txt = P.whatsapp ? P.whatsapp(elegidos, C)
      : `Hola, me interesan estos ${CFG.plural.toLowerCase()} del catálogo ${state.marca || ""}:\n` +
        elegidos.map(({ it, i }) => `• ${CFG.singular} ${idItem(it, i)}: ${tituloItem(it, i)}`).join("\n");
    const num = String(state.whatsapp || "").replace(/\D/g, "");
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(txt)}`, "_blank", "noopener");
  }

  /* ---------- Lista de ítems (drawer) ---------- */
  let filtro = "todos";
  function renderFiltros() {
    const fs = [{ id: "todos", label: "Todos" }, ...(P.filtros || []), ...(CFG.favoritos ? [{ id: "fav", label: "♥ Favoritos" }] : [])];
    $("#filtros").innerHTML = fs.map((f) => `<button class="chip ${f.id === filtro ? "is-on" : ""}" data-filtro="${esc(f.id)}">${esc(f.label)}</button>`).join("");
  }
  function abrirDrawer(f) {
    if (f) filtro = f;
    renderFiltros();
    renderLista();
    $("#drawer").classList.add("is-open");
    $("#scrim").classList.add("is-open");
    $("#drawer").setAttribute("aria-hidden", "false");
  }
  function cerrarDrawer() {
    $("#drawer").classList.remove("is-open");
    $("#scrim").classList.remove("is-open");
    $("#drawer").setAttribute("aria-hidden", "true");
  }
  function renderLista() {
    const q = $("#buscar").value.trim().toLowerCase();
    const f = (P.filtros || []).find((x) => x.id === filtro);
    const lista = items().map((it, i) => ({ it, i })).filter(({ it, i }) => {
      if (filtro === "fav" && !favs.has(favId(i))) return false;
      if (f && !f.test(it, i)) return false;
      const texto = P.busqueda ? P.busqueda(it, i) : `${tituloItem(it, i)} ${idItem(it, i)}`;
      return !q || texto.toLowerCase().includes(q);
    });
    $("#lot-list").innerHTML = lista.length ? lista.map(({ it, i }, k) => {
      const t = P.tarjeta ? P.tarjeta(it, i, C) : { img: it.foto, kicker: `${CFG.singular} ${idItem(it, i)}`, titulo: tituloItem(it, i), meta: "" };
      return `
      <li><button class="lot-card" style="--i:${k}" data-action="ir" data-item="${i}">
        <img src="${esc(t.img || "")}" alt="" loading="lazy" style="${t.imgPos ? `object-position:${t.imgPos}` : ""}">
        <span class="t"><small>${esc(t.kicker)}</small>${esc(t.titulo)}${t.meta ? `<span class="m">${esc(t.meta)}</span>` : ""}</span>
        <span class="heart">${favs.has(favId(i)) ? "♥" : ""}</span>
      </button></li>`;
    }).join("") : `<li class="empty">${filtro === "fav" ? "Aún no marcas favoritos. Toca el ♥ en una página." : "No hay resultados con ese filtro."}</li>`;
    $("#drawer-foot").innerHTML = filtro === "fav" && favs.size
      ? `<button class="btn primary" style="width:100%;justify-content:center" data-action="whatsapp">Enviar mi selección por WhatsApp</button>` : "";
  }

  /* ---------- Fotos ---------- */
  let fotoDestino = null;
  function pedirFoto(path) { fotoDestino = path; const f = $("#file"); f.value = ""; f.click(); }
  function cargarFoto(path, file) {
    const max = P.maxFoto ? P.maxFoto(path) : 1800;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      setPath(path, c.toDataURL("image/jpeg", 0.86));
      rebuild();
      toast("Foto actualizada");
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast("No se pudo leer esa imagen"); };
    img.src = url;
  }

  /* ---------- Modo edición ---------- */
  function aplicarEdicion() {
    $$("#book [data-bind]").forEach((el) => {
      if (editing) { el.setAttribute("contenteditable", "true"); el.setAttribute("spellcheck", "false"); }
      else el.removeAttribute("contenteditable");
    });
  }
  function toggleEdit() {
    if (!PUEDE_EDITAR) return;
    editing = !editing;
    document.body.classList.toggle("editing", editing);
    $(".tb-edit").setAttribute("aria-pressed", String(editing));
    aplicarEdicion();
    toast(editing ? "Modo edición: escribe sobre los textos o cambia las fotos. Se guarda en este navegador; pulsa Publicar para que lo vean los clientes." : "Modo lectura");
  }
  const dataJS = () => "// Datos del catálogo. Generado desde el modo edición.\nwindow.CATALOGO = " + JSON.stringify(state, null, 2) + ";\n";
  function exportar() {
    const src = dataJS();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    a.download = "data.js";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Reemplaza data.js del catálogo con el archivo descargado y vuelve a publicar");
  }
  /* ---------- Publicar en GitHub (sube data.js con la API de contenidos) ----------
     El token (fine-grained, solo ese repositorio, permiso Contents: Read and write) queda en
     localStorage de este navegador. El repositorio se detecta desde usuario.github.io/repo/. */
  const ghKey = (k) => `${CFG.nombre}:gh-${k}`;
  function repoDetectado() {
    const guardado = lsGet(ghKey("repo"), null);
    if (guardado) return guardado;
    const m = location.hostname.match(/^([\w-]+)\.github\.io$/i);
    if (!m) return { repo: "", rama: "main", ruta: "data.js" };
    const seg = location.pathname.split("/").filter(Boolean);
    // usuario.github.io/<repo>/… → sitio de proyecto; usuario.github.io/… → repositorio "usuario.github.io"
    const repo = seg.length && !/\.html?$/i.test(seg[0]) ? seg[0] : `${m[1]}.github.io`;
    return { repo: `${m[1]}/${repo}`, rama: "main", ruta: "data.js" };
  }
  function abrirPublicar() {
    const cfg = repoDetectado();
    const token = lsGet(ghKey("token"), "");
    abrirModal(`
      <div class="modal-pad">
        <h3>Publicar cambios</h3>
        <p>Sube el catálogo, con todo lo que editaste, a GitHub. Los clientes lo verán en unos minutos (GitHub tarda entre 1 y 10 en actualizar).</p>
        <label class="field">Repositorio (usuario/nombre)
          <input id="gh-repo" type="text" value="${esc(cfg.repo)}" placeholder="usuario/repositorio" autocomplete="off"></label>
        <label class="field">Rama
          <input id="gh-rama" type="text" value="${esc(cfg.rama || "main")}" autocomplete="off"></label>
        <label class="field">Token de GitHub ${token ? "(guardado en este navegador)" : ""}
          <input id="gh-token" type="password" value="${esc(token)}" placeholder="github_pat_…" autocomplete="off"></label>
        <details class="nota"><summary>¿Cómo creo el token? (una sola vez)</summary>
          <ol>
            <li>Abre <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com → Settings → Developer settings → Fine-grained tokens → Generate new token</a>.</li>
            <li>Nombre: "Catálogo". Vencimiento: el que prefieras (ej. 90 días).</li>
            <li><b>Repository access</b> → <i>Only select repositories</i> → elige solo este repositorio.</li>
            <li><b>Permissions → Repository permissions → Contents</b> → <i>Read and write</i>.</li>
            <li><b>Generate token</b>, cópialo y pégalo arriba.</li>
          </ol>
          Queda guardado solo en este navegador. Quien use este navegador podrá publicar: no lo guardes en equipos compartidos.
        </details>
        <p id="gh-estado" class="nota" role="status"></p>
        <div class="btns">
          <button class="btn primary" id="gh-publicar">Publicar ahora</button>
          ${token ? `<button class="btn" id="gh-olvidar">Olvidar token</button>` : ""}
        </div>
      </div>`);
    $("#gh-publicar").onclick = () => publicar();
    const olv = $("#gh-olvidar");
    if (olv) olv.onclick = () => { try { localStorage.removeItem(ghKey("token")); } catch { /* sin almacenamiento */ } toast("Token borrado de este navegador"); abrirPublicar(); };
  }
  function b64utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  async function publicar() {
    const repo = $("#gh-repo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
    const rama = $("#gh-rama").value.trim() || "main";
    const token = $("#gh-token").value.trim();
    const btn = $("#gh-publicar");
    const decir = (t) => { $("#gh-estado").textContent = t; };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return decir("Escribe el repositorio como usuario/nombre.");
    if (!token) return decir("Falta el token (mira «¿Cómo creo el token?»).");
    const ruta = repoDetectado().ruta || "data.js";
    lsSet(ghKey("repo"), { repo, rama, ruta });
    lsSet(ghKey("token"), token);
    const contenido = dataJS();
    if (contenido.length > 20e6) return decir("El catálogo pesa más de 20 MB (muchas fotos subidas en edición). Guarda las fotos como archivos en assets/ y vuelve a intentar.");
    const api = `https://api.github.com/repos/${repo}/contents/${ruta}`;
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    btn.disabled = true;
    decir("Conectando con GitHub…");
    try {
      // sha de la versión actual: GitHub lo exige para reemplazar el archivo
      const r0 = await fetch(`${api}?ref=${encodeURIComponent(rama)}`, { headers, cache: "no-store" });
      if (r0.status === 401) throw new Error("El token no es válido o venció. Crea uno nuevo.");
      if (r0.status === 403) throw new Error("El token no tiene permiso para este repositorio (Contents: Read and write).");
      if (r0.status === 404) throw new Error("GitHub no encuentra el repositorio, la rama o data.js. Revisa el nombre (usuario/repositorio) y que el token tenga acceso a ese repositorio.");
      if (!r0.ok) throw new Error(`GitHub respondió ${r0.status} al leer el catálogo.`);
      const { sha } = await r0.json();
      decir("Subiendo cambios…");
      const fecha = new Date().toLocaleString("es", { dateStyle: "short", timeStyle: "short" });
      const r1 = await fetch(api, {
        method: "PUT", headers,
        body: JSON.stringify({ message: `Actualizo catálogo desde el modo edición (${fecha})`, content: b64utf8(contenido), sha, branch: rama }),
      });
      if (r1.status === 401) throw new Error("El token no es válido o venció. Crea uno nuevo.");
      if (r1.status === 403 || r1.status === 404) throw new Error("GitHub rechazó la publicación: el token necesita acceso a este repositorio con permiso Contents: Read and write.");
      if (r1.status === 409) throw new Error("El catálogo cambió en GitHub mientras editabas. Vuelve a pulsar Publicar.");
      if (!r1.ok) throw new Error(`GitHub respondió ${r1.status}: ${(await r1.text()).slice(0, 160)}`);
      // lo publicado pasa a ser la versión base y se descarta el borrador local
      ORIGINAL = JSON.parse(JSON.stringify(state));
      await idb.del("estado");
      decir("✔ Publicado. Los clientes lo verán en unos minutos (si no, que recarguen la página).");
      toast("Publicado en GitHub");
    } catch (e) {
      decir(e instanceof TypeError ? "Sin conexión con GitHub. Revisa internet e intenta de nuevo." : e.message);
    } finally {
      btn.disabled = false;
    }
  }

  async function restablecer() {
    if (!confirm("¿Descartar todos los cambios guardados en este navegador y volver al data.js original?")) return;
    await idb.del("estado");
    state = JSON.parse(JSON.stringify(ORIGINAL));
    rebuild();
    toast("Cambios descartados");
  }

  function imprimir() {
    $("#print-root").innerHTML = paginasHTML();
    setTimeout(() => window.print(), 300);
  }
  function pantallaCompleta() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch { /* no soportado */ }
  }

  /* ---------- Arranque ---------- */
  async function init() {
    document.documentElement.style.setProperty("--ancho", CFG.ancho);
    const mm = (pt) => (pt * 25.4 / 72).toFixed(2) + "mm";
    document.head.insertAdjacentHTML("beforeend",
      `<style>@media print{@page{size:${mm(CFG.ancho)} ${mm(CFG.alto)};margin:0}.print-root .page{width:${mm(CFG.ancho)};height:${mm(CFG.alto)}}}</style>`);
    if (!CFG.favoritos) document.body.classList.add("sin-favoritos");
    $$(".lbl-plural").forEach((e) => { e.textContent = CFG.plural; });
    const cab = P.cabecera ? P.cabecera(C) : { logo: "assets/logo.png", nombre: state.marca || "", sub: "" };
    $("#brand-logo").src = cab.logo || "";
    if (cab.logo) document.head.insertAdjacentHTML("beforeend", `<link rel="icon" href="${esc(cab.logo)}">`);
    $("#brand-nombre").textContent = cab.nombre || "";
    $("#brand-sub").textContent = cab.sub || "";
    if (cab.nombre) document.title = [cab.nombre, cab.sub].filter(Boolean).join(" · ");
    $("#buscar").placeholder = P.placeholderBusqueda || `Buscar ${CFG.plural.toLowerCase()}…`;

    // Los borradores locales solo se cargan en modo editor: el público ve siempre data.js.
    // Si IndexedDB no responde (file:// o modo privado) se sigue con data.js a los 1,5 s.
    if (PUEDE_EDITAR) {
      document.body.classList.add("can-edit");
      const guardado = await Promise.race([idb.get("estado"), new Promise((r) => setTimeout(r, 1500))]);
      if (guardado && Array.isArray(guardado[CFG.coleccion])) state = guardado;
    }

    // Leer el enlace directo (#lote-5) antes de armar: onPage reescribe el hash al arrancar
    const m = location.hash.match(new RegExp(`^#${HASH}-(.+)$`));
    const idx = m ? items().findIndex((it, i) => String(idItem(it, i)) === decodeURIComponent(m[1])) : -1;
    buildBook(0);
    if (idx >= 0 && paginaDeItem.has(idx) && paginaDeItem.get(idx) > 0) buildBook(paginaDeItem.get(idx));
    actualizarFavCount();

    document.addEventListener("click", (e) => { if (!e.target.closest("#book")) onAction(e); });
    // clic en el fondo oscuro cierra; las acciones dentro del modal las maneja el listener de document
    $("#modal").addEventListener("click", (e) => { if (e.target === $("#modal")) $("#modal").close(); });
    $("#modal").addEventListener("close", () => { $("#modal-body").innerHTML = ""; });
    $("#buscar").addEventListener("input", renderLista);
    $("#filtros").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) { filtro = c.dataset.filtro; renderFiltros(); renderLista(); } });
    $("#file").addEventListener("change", (e) => { const f = e.target.files[0]; if (f && fotoDestino) cargarFoto(fotoDestino, f); });
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input, [contenteditable='true']") || $("#modal").open) return;
      if (e.key === "ArrowRight") book.flipNext();
      if (e.key === "ArrowLeft") book.flipPrev();
      if (e.key === "Escape") cerrarDrawer();
    });
    let rt;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      const wasLandscape = book.getOrientation() === "landscape";
      fitBook();
      rt = setTimeout(() => { if (wasLandscape !== isLandscape()) rebuild(); }, 250);
    });
    window.addEventListener("afterprint", () => { $("#print-root").innerHTML = ""; });
  }
  if (window.St && St.PageFlip) init();
  else document.body.insertAdjacentHTML("beforeend", '<p style="position:fixed;inset:40% 0 auto;text-align:center">No se pudo cargar la librería del libro (se necesita internet).</p>');
})();
