/* Catálogo Proyecto Ubre: libro interactivo con modo edición. */
(() => {
  "use strict";

  const ORIGINAL = JSON.parse(JSON.stringify(window.CATALOGO));
  let state = JSON.parse(JSON.stringify(ORIGINAL));
  let book = null;
  let editing = false;
  // La edición solo existe si se entra con ?editar en la dirección (no es seguridad: los
  // cambios quedan en el navegador de quien edita y solo se publican exportando data.js).
  const PUEDE_EDITAR = new URLSearchParams(location.search).has("editar");
  let favs = new Set(lsGet("ubre:favs", []));

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const ROLES = {
    abueloPaterno: "Abuelo paterno", abuelaPaterna: "Abuela paterna",
    abueloMaterno: "Abuelo materno", abuelaMaterna: "Abuela materna",
    padre: "Padre", madre: "Madre",
  };
  // Centro (en puntos del A4 original) de cada círculo de la genealogía
  const CIRC = {
    abueloPaterno: [78, 313, 35], abuelaPaterna: [224, 313, 35],
    abueloMaterno: [353, 313, 35], abuelaMaterna: [499, 313, 35],
    padre: [149, 458, 35], madre: [424, 458, 35],
  };
  const DELAY = { abueloPaterno: 250, abuelaPaterna: 350, abueloMaterno: 450, abuelaMaterna: 550, padre: 850, madre: 950 };

  /* ---------- Utilidades de estado ---------- */
  function getPath(path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), state); }
  function setPath(path, val) {
    const keys = path.split(".");
    const last = keys.pop();
    keys.reduce((o, k) => o[k], state)[last] = val;
    guardar();
  }
  function lsGet(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }

  // Las fotos editadas pesan mucho para localStorage: van a IndexedDB.
  const idb = {
    open() {
      return new Promise((res, rej) => {
        try {
          const r = indexedDB.open("catalogo-ubre", 1);
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
    toast.t = setTimeout(() => t.classList.remove("is-on"), 2200);
  }

  /* ---------- Plantillas de página ---------- */
  const ICON_KG = '<svg viewBox="0 0 24 24"><path d="M7 8h10l2 12H5L7 8z"/><circle cx="12" cy="5.5" r="2"/><path d="M9.5 16v-4m0 2l2-2m-2 2l2 2M14 12.5a1.6 1.6 0 1 0 0 3h1v-1.3"/></svg>';
  const ICON_EDAD = '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4M8 14h2m4 0h2m-8 3h2"/></svg>';
  const ICON_HEART = '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';

  const bind = (path) => `data-bind="${path}"`;
  const imgBtn = (path, label = "Cambiar foto") => `<button class="img-btn edit-only" data-action="img" data-path="${path}">📷 ${label}</button>`;

  function pageCover() {
    const p = state.portada;
    return `
    <div class="page" data-density="hard"><div class="sheet cover" data-drop="portada.foto">
      <img class="bg kenburns" src="${esc(p.foto)}" alt="" data-src="portada.foto">
      <div class="shade"></div>
      <img class="logo anim a-pop" style="--d:300" src="assets/logo.png" alt="Vanguardia Ganadera · Proyecto Ubre">
      <div class="tagline anim a-up" style="--d:700"><span ${bind("portada.titulo1")}>${esc(p.titulo1)}</span><br><span ${bind("portada.titulo2")}>${esc(p.titulo2)}</span></div>
      <div class="edicion anim a-up" style="--d:1000"><span ${bind("portada.subtitulo")}>${esc(p.subtitulo)}</span><b ${bind("portada.anio")}>${esc(p.anio)}</b></div>
      ${imgBtn("portada.foto")}
    </div></div>`;
  }

  function pageLote(l, i) {
    const b = `lotes.${i}`;
    return `
    <div class="page" data-lote="${i}"><div class="sheet lote" data-drop="${b}.foto">
      <img class="bg kenburns" src="${esc(l.foto)}" alt="${esc(l.nombre)}" data-src="${b}.foto">
      <div class="shade"></div>
      <button class="fav anim a-pop ${favs.has(l.id) ? "is-on" : ""}" style="--d:900" data-action="fav" data-lote="${i}" aria-label="Me interesa este lote">${ICON_HEART}</button>
      <button class="lote-tab anim a-drop" style="--d:100" data-action="indice" title="Ver todos los lotes"><span>Lote</span><b>${esc(l.lote)}</b></button>
      <div class="titulo anim a-up" style="--d:250"><h2 ${bind(b + ".nombre")}>${esc(l.nombre)}</h2><div class="reg" ${bind(b + ".registro")}>${esc(l.registro)}</div></div>
      <div class="regla anim a-line" style="--d:500"></div>
      <div class="cat anim a-fade" style="--d:800" ${bind(b + ".categoria")}>${esc(l.categoria)}</div>
      <button class="hotspot" data-action="ficha" data-lote="${i}"><i></i>Ver ficha del ejemplar</button>
      <div class="stats">
        <div class="stat anim a-pop" style="--d:900"><span class="ico">${ICON_KG}</span><b class="countup" ${bind(b + ".peso")}>${esc(l.peso)}</b><small>Peso actual</small></div>
        <div class="stat anim a-pop" style="--d:1050"><span class="ico">${ICON_EDAD}</span><b class="countup" ${bind(b + ".edad")}>${esc(l.edad)}</b><small>Edad actual</small></div>
      </div>
      ${imgBtn(b + ".foto")}
    </div></div>`;
  }

  function circulo(l, i, key) {
    const [cx, cy, r] = CIRC[key];
    const a = l.genealogia[key];
    const path = `lotes.${i}.genealogia.${key}`;
    const parent = key === "padre" || key === "madre";
    const top = parent ? cy + 44 : cy + 43;
    return `
      <button class="circ anim a-pop ${a.foto ? "" : "vacio"}" data-drop="${path}.foto" data-action="ancestro" data-lote="${i}" data-key="${key}"
        style="--d:${DELAY[key]};left:calc(var(--u)*${cx - r});top:calc(var(--u)*${cy - r});width:calc(var(--u)*${r * 2});height:calc(var(--u)*${r * 2})"
        aria-label="${esc(ROLES[key])}: ${esc(a.nombre)}">${a.foto ? `<img src="${esc(a.foto)}" alt="" data-src="${path}.foto">` : ""}</button>
      <div class="nm anim a-fade ${parent ? "parent" : ""}" style="--d:${DELAY[key] + 150};left:calc(var(--u)*${cx - 62});top:calc(var(--u)*${top})">
        <b ${bind(path + ".nombre")}>${esc(a.nombre)}</b><small>${ROLES[key]}</small>
      </div>`;
  }

  function pageGenealogia(l, i) {
    const b = `lotes.${i}`;
    const foto = l.fotoEjemplar || l.foto;
    // Sin foto propia, se encuadra la cabeza del ejemplar desde la foto del lote
    const encuadre = l.fotoEjemplar ? "background-size:cover;background-position:center" : "background-size:330%;background-position:88% 41%";
    const paths = [
      ["M78 398V418H120", 600], ["M224 398V418H182", 650], ["M353 398V418H396", 700], ["M499 398V418H458", 750],
      ["M149 548V596H206", 1100], ["M424 548V596H368", 1150],
    ];
    return `
    <div class="page" data-lote="${i}"><div class="sheet gen">
      <img class="bg" src="assets/fondo-oscuro.jpg" alt="">
      <h3 class="h anim a-up" style="top:calc(var(--u)*53);--d:100">DATOS DEL EJEMPLAR</h3>
      <div class="datos anim a-fade" style="--d:250">
        <div class="row">
          <div><b>RAZA</b><span ${bind(b + ".raza")}>${esc(l.raza)}</span></div>
          <div><b>NACIMIENTO</b><span class="num" ${bind(b + ".nacimiento")}>${esc(l.nacimiento)}</span></div>
        </div>
        <div class="sexo"><b>SEXO</b><span ${bind(b + ".sexo")}>${esc(l.sexo)}</span></div>
      </div>
      <h3 class="h anim a-up" style="top:calc(var(--u)*238);--d:200">GENEALOGÍA</h3>
      <svg class="lines" viewBox="0 0 595 842" preserveAspectRatio="none" aria-hidden="true">
        ${paths.map(([d, dl]) => `<path pathLength="1" d="${d}" style="--d:${dl}"/>`).join("")}
        ${paths.map(([d, dl]) => { const m = d.match(/H(\d+)$/); const y = d.match(/V(\d+)/)[1]; return `<circle class="anim a-pop" style="--d:${dl + 700}" cx="${m[1]}" cy="${y}" r="2.2"/>`; }).join("")}
      </svg>
      ${Object.keys(CIRC).map((k) => circulo(l, i, k)).join("")}
      <span class="ring" style="left:calc(var(--u)*216);top:calc(var(--u)*516);width:calc(var(--u)*144);height:calc(var(--u)*144)"></span>
      <button class="circ main anim a-pop" style="--d:1300;left:calc(var(--u)*216);top:calc(var(--u)*516);width:calc(var(--u)*144);height:calc(var(--u)*144)"
        data-action="ficha" data-lote="${i}" data-drop="${b}.fotoEjemplar" aria-label="Ficha de ${esc(l.nombre)}">
        <span class="main-foto" style="background-image:url('${esc(foto)}');${encuadre}"></span>
      </button>
      <div class="nm main-name anim a-up" style="--d:1500;left:calc(var(--u)*138);top:calc(var(--u)*679)">
        <span ${bind(b + ".nombre")}>${esc(l.nombre)}</span> <span class="num" ${bind(b + ".registro")}>${esc(l.registro)}</span>
      </div>
      <button class="video-btn anim a-up ${l.video ? "" : "sin-video"}" style="--d:1700" data-action="video" data-lote="${i}">
        <span class="yt"><span></span></span><span class="pill">Ver video del ejemplar aquí</span>
      </button>
      <img class="logo anim a-fade" style="--d:1800" src="assets/logo.png" alt="">
    </div></div>`;
  }

  function pageBack() {
    const c = state.contraportada;
    return `
    <div class="page" data-density="hard"><div class="sheet back">
      <img class="bg" src="assets/fondo-oscuro.jpg" alt="">
      <img class="logo anim a-pop" style="--d:200" src="assets/logo.png" alt="Vanguardia Ganadera · Proyecto Ubre">
      <h2 class="anim a-up" style="--d:500" ${bind("contraportada.texto")}>${esc(c.texto)}</h2>
      <p class="anim a-fade" style="--d:800" ${bind("contraportada.contacto")}>${esc(c.contacto)}</p>
    </div></div>`;
  }

  function allPagesHTML() {
    return pageCover() + state.lotes.map((l, i) => pageLote(l, i) + pageGenealogia(l, i)).join("") + pageBack();
  }

  /* ---------- Libro ---------- */
  const PAGE_RATIO = 842 / 595;
  function isLandscape() { return window.innerWidth >= 760; }
  function fitBook() {
    const stage = $("#stage");
    const W = stage.clientWidth - 32;
    const H = stage.clientHeight - 48;
    const cols = isLandscape() ? 2 : 1;
    const pw = Math.floor(Math.min(W / cols, H / PAGE_RATIO));
    const el = $("#frame");
    el.style.width = pw * cols + "px";
    el.style.height = Math.round(pw * PAGE_RATIO) + "px";
    return pw;
  }

  function buildBook(startPage = 0) {
    if (book) { book.destroy(); book = null; }
    // destroy() elimina el contenedor: lo recreamos
    let el = $("#book");
    if (!el) {
      el = document.createElement("div");
      el.id = "book"; el.className = "book";
      $("#frame").append(el);
    } else { el.innerHTML = ""; }
    el.innerHTML = allPagesHTML();
    fitBook();
    book = new St.PageFlip(el, {
      width: 595, height: 842, size: "stretch",
      minWidth: 280, maxWidth: 2000, minHeight: 396, maxHeight: 2830,
      showCover: true, usePortrait: true, maxShadowOpacity: 0.55,
      mobileScrollSupport: false, flippingTime: 900, startPage,
      autoSize: true, drawShadow: true,
    });
    book.loadFromHTML($$(".page", el));
    book.on("flip", (e) => onPage(e.data));
    book.on("changeOrientation", () => onPage(book.getCurrentPageIndex()));
    wirePages(el);
    onPage(book.getCurrentPageIndex());
  }

  function visiblePages(i) {
    if (!book || book.getOrientation() === "portrait") return [i];
    if (i === 0) return [0];
    return i % 2 ? [i, i + 1] : [i - 1, i];
  }

  function onPage(i) {
    const pages = $$("#book .page");
    const vis = visiblePages(i);
    pages.forEach((p, k) => {
      const on = vis.includes(k);
      if (on && !p.classList.contains("is-active")) {
        p.classList.add("is-active");
        countUp(p);
      } else if (!on) p.classList.remove("is-active");
    });
    const total = state.lotes.length * 2 + 2;
    const lote = pages[vis[0]]?.dataset.lote ?? pages[vis[vis.length - 1]]?.dataset.lote;
    let label;
    if (vis[0] === 0) label = "Portada";
    else if (vis.includes(total - 1) && lote == null) label = "Contraportada";
    else label = `Lote ${state.lotes[lote].lote} · ${vis.map((v) => v + 1).join("–")} / ${total}`;
    $("#counter").textContent = label;
    try { history.replaceState(null, "", lote != null ? `#lote-${state.lotes[lote].lote}` : location.pathname + location.search); } catch { /* file:// */ }
    if (i > 0) $("#hint").classList.add("is-hidden");
  }

  function countUp(page) {
    if (editing || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    $$(".countup", page).forEach((el) => {
      const final = el.textContent;
      const parts = final.split(/(\d+)/);
      const nums = parts.map((p) => (/^\d+$/.test(p) ? +p : null));
      if (!nums.some((n) => n !== null)) return;
      const t0 = performance.now() + 900;
      const dur = 1100;
      const tick = (t) => {
        if (editing) { el.textContent = final; return; }
        const k = Math.min(1, Math.max(0, (t - t0) / dur));
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = parts.map((p, j) => (nums[j] !== null ? Math.round(nums[j] * e) : p)).join("");
        if (k < 1) requestAnimationFrame(tick); else el.textContent = final;
      };
      requestAnimationFrame(tick);
    });
  }

  function irALote(i) {
    const target = 1 + i * 2;
    const cur = book.getCurrentPageIndex();
    if (visiblePages(cur).includes(target)) return;
    if (Math.abs(target - cur) <= 2) book.flip(target); else book.turnToPage(target), onPage(target);
  }

  /* ---------- Eventos dentro de las páginas ---------- */
  function wirePages(root) {
    // Que los clics en botones no arranquen el pliegue de la página
    const stop = (e) => {
      if (editing || e.target.closest("button, a, [contenteditable='true']")) e.stopPropagation();
    };
    $$(".page", root).forEach((p) => {
      p.addEventListener("mousedown", stop);
      p.addEventListener("touchstart", stop, { passive: true });
    });

    root.addEventListener("click", onAction);

    // Edición de textos
    root.addEventListener("input", (e) => {
      const el = e.target.closest("[data-bind]");
      if (el) {
        setPath(el.dataset.bind, el.innerText.trim());
        // Mantener sincronizados los textos repetidos (nombre en ambas páginas)
        $$(`[data-bind="${el.dataset.bind}"]`).forEach((o) => { if (o !== el) o.textContent = el.innerText.trim(); });
      }
    });
    root.addEventListener("paste", (e) => {
      if (!e.target.closest("[data-bind]")) return;
      e.preventDefault();
      document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text"));
    });
    root.addEventListener("keydown", (e) => {
      if (e.target.closest("[data-bind]")) {
        e.stopPropagation();
        if (e.key === "Enter" && !e.target.closest("[data-bind^='contraportada']")) { e.preventDefault(); e.target.blur(); }
      }
    });

    // Arrastrar y soltar fotos
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
    const i = btn.dataset.lote != null ? +btn.dataset.lote : null;
    // En edición, los círculos piden foto directamente
    if (editing && a === "ancestro") { pedirFoto(`lotes.${i}.genealogia.${btn.dataset.key}.foto`); return; }
    if (editing && a === "ficha" && btn.classList.contains("main")) { pedirFoto(`lotes.${i}.fotoEjemplar`); return; }
    switch (a) {
      case "prev": book.flipPrev(); break;
      case "next": book.flipNext(); break;
      case "indice": abrirDrawer(); break;
      case "favoritos": abrirDrawer("fav"); break;
      case "cerrar-drawer": cerrarDrawer(); break;
      case "cerrar-modal": $("#modal").close(); break;
      case "ficha": abrirFicha(i); break;
      case "ancestro": abrirAncestro(i, btn.dataset.key); break;
      case "video": abrirVideo(i); break;
      case "fav": toggleFav(i); break;
      case "img": pedirFoto(btn.dataset.path); break;
      case "ir": $("#modal").close(); cerrarDrawer(); irALote(i); break;
      case "copiar": copiarEnlace(i); break;
      case "editar": toggleEdit(); break;
      case "exportar": exportar(); break;
      case "imprimir": imprimir(); break;
      case "restablecer": restablecer(); break;
      case "fullscreen": pantallaCompleta(); break;
      case "quitar-foto": setFoto(btn.dataset.path, ""); $("#modal").close(); break;
      case "whatsapp": enviarWhatsApp(); break;
    }
  }

  /* ---------- Modales ---------- */
  function abrirModal(html) {
    $("#modal-body").innerHTML = html;
    const m = $("#modal");
    if (!m.open) m.showModal();
  }

  function abrirFicha(i) {
    const l = state.lotes[i];
    const g = l.genealogia;
    const fav = favs.has(l.id);
    abrirModal(`
      <div class="ficha">
        <div class="foto"><img src="${esc(l.fotoEjemplar || l.foto)}" alt="${esc(l.nombre)}"></div>
        <div class="info">
          <span class="kicker">Lote ${esc(l.lote)} · ${esc(l.categoria)}</span>
          <h3>${esc(l.nombre)}<span class="num">${esc(l.registro)}</span></h3>
          <dl class="kv">
            <div><dt>Raza</dt><dd>${esc(l.raza)}</dd></div>
            <div><dt>Sexo</dt><dd>${esc(l.sexo)}</dd></div>
            <div><dt>Nacimiento</dt><dd>${esc(l.nacimiento)}</dd></div>
            <div><dt>Edad</dt><dd>${esc(l.edad)}</dd></div>
            <div><dt>Peso</dt><dd>${esc(l.peso)}</dd></div>
          </dl>
          <div class="padres">Padre: <b>${esc(g.padre.nombre)}</b><br>Madre: <b>${esc(g.madre.nombre)}</b></div>
          <div class="btns">
            <button class="btn red" data-action="video" data-lote="${i}">▶ Ver video</button>
            <button class="btn ${fav ? "is-on" : ""}" data-action="fav" data-lote="${i}">♥ ${fav ? "Te interesa" : "Me interesa"}</button>
            <button class="btn" data-action="copiar" data-lote="${i}">🔗 Copiar enlace</button>
            <button class="btn primary" data-action="ir" data-lote="${i}">Ir al lote</button>
          </div>
        </div>
      </div>`);
  }

  function abrirAncestro(i, key) {
    const l = state.lotes[i];
    const a = l.genealogia[key];
    abrirModal(`
      <div class="ancestro">
        <div class="big">${a.foto ? `<img src="${esc(a.foto)}" alt="">` : ""}</div>
        <div class="modal-pad" style="padding:0">
          <span class="kicker" style="color:var(--gold);font-size:12px;letter-spacing:.12em;text-transform:uppercase">${ROLES[key]} de</span>
          <p style="color:var(--text)">${esc(l.nombre)} ${esc(l.registro)} · Lote ${esc(l.lote)}</p>
          <h3 style="font-size:22px;text-transform:uppercase">${esc(a.nombre)}</h3>
          ${a.foto ? "" : "<p>Todavía no hay foto de este ejemplar. Actívala con «Editar» y toca el círculo para subirla.</p>"}
          <div class="btns"><button class="btn primary" data-action="ficha" data-lote="${i}">Ver ficha del lote</button></div>
        </div>
      </div>`);
  }

  // Acepta el enlace del navegador, el de "Compartir", Shorts/Live y el código <iframe> de YouTube.
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
    // YouTube rechaza reproducir dentro de una página abierta como archivo (file://): Error 153.
    // En ese caso se muestra la miniatura y se abre en YouTube; publicado (http/https) se reproduce aquí.
    if (location.protocol === "file:") {
      return `<a class="video-thumb" href="${esc(v.ver)}" target="_blank" rel="noopener">
        ${v.miniatura ? `<img src="${esc(v.miniatura)}" alt="">` : ""}<span class="play"></span><span class="lbl">Ver en ${v.tipo === "vimeo" ? "Vimeo" : "YouTube"} ↗</span></a>`;
    }
    return `<iframe src="${esc(v.embed)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  }

  function abrirVideo(i) {
    const l = state.lotes[i];
    const url = (l.video || "").trim();
    const v = url && videoInfo(url);
    const editor = editing ? `
      <label class="field">Enlace del video: pega el enlace de YouTube (navegador o «Compartir»), el código para insertar, Vimeo o un .mp4
        <input id="video-url" type="text" value="${esc(url)}" placeholder="https://youtu.be/…" autocomplete="off"></label>
      <div class="btns"><button class="btn primary" id="video-save">Guardar enlace</button></div>` : "";
    abrirModal(`
      ${v ? `<div class="video-wrap">${videoReproductor(v)}</div>` : ""}
      <div class="modal-pad">
        <h3>${esc(l.nombre)} ${esc(l.registro)}</h3>
        ${!url ? "<p>El video de este ejemplar estará disponible pronto.</p>" : ""}
        ${url && !v ? `<p>No se reconoce este enlace de video.</p><p><a class="btn red" href="${esc(url)}" target="_blank" rel="noopener">Abrir enlace ↗</a></p>` : ""}
        ${v && v.tipo !== "archivo" ? `<p class="video-alt">¿No carga? <a href="${esc(v.ver)}" target="_blank" rel="noopener">Ábrelo directamente en ${v.tipo === "vimeo" ? "Vimeo" : "YouTube"} ↗</a></p>` : ""}
        ${editor}
      </div>`);
    const save = $("#video-save");
    if (save) save.onclick = () => {
      const val = $("#video-url").value.trim();
      const info = val && videoInfo(val);
      // Guardar siempre el enlace limpio, aunque hayan pegado el código <iframe>
      setPath(`lotes.${i}.video`, info && info.tipo !== "archivo" ? info.ver : val);
      $$(`.video-btn[data-lote="${i}"]`).forEach((b) => b.classList.toggle("sin-video", !state.lotes[i].video));
      toast(val && !info ? "Enlace guardado, pero no parece un video de YouTube o Vimeo" : "Enlace guardado");
      abrirVideo(i);
    };
  }

  function copiarEnlace(i) {
    const url = location.href.split("#")[0] + `#lote-${state.lotes[i].lote}`;
    (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast("Enlace copiado"), () => prompt("Copia este enlace:", url));
  }

  /* ---------- Favoritos ---------- */
  function toggleFav(i) {
    const id = state.lotes[i].id;
    favs.has(id) ? favs.delete(id) : favs.add(id);
    lsSet("ubre:favs", [...favs]);
    $$(`.fav[data-lote="${i}"]`).forEach((b) => b.classList.toggle("is-on", favs.has(id)));
    actualizarFavCount();
    if ($("#modal").open && $(".ficha")) abrirFicha(i);
    if ($("#drawer").classList.contains("is-open")) renderLista();
    toast(favs.has(id) ? `Lote ${state.lotes[i].lote} agregado a tus favoritos` : "Quitado de favoritos");
  }
  function actualizarFavCount() { $("#fav-count").textContent = favs.size; }

  function enviarWhatsApp() {
    const lista = state.lotes.filter((l) => favs.has(l.id)).map((l) => `• Lote ${l.lote}: ${l.nombre} ${l.registro}`).join("\n");
    const txt = `Hola, me interesan estos lotes del catálogo Proyecto Ubre:\n${lista}`;
    const num = String(state.whatsapp || "").replace(/\D/g, "");
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(txt)}`, "_blank", "noopener");
  }

  /* ---------- Drawer de lotes ---------- */
  let filtro = "todos";
  function abrirDrawer(f) {
    if (f) setFiltro(f);
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
  function setFiltro(f) {
    filtro = f;
    $$("#filtros .chip").forEach((c) => c.classList.toggle("is-on", c.dataset.filtro === f));
  }
  function renderLista() {
    const q = $("#buscar").value.trim().toLowerCase();
    const items = state.lotes.map((l, i) => ({ l, i })).filter(({ l }) => {
      if (filtro === "fav" && !favs.has(l.id)) return false;
      if (filtro === "Hembra" || filtro === "Macho") { if (l.sexo !== filtro) return false; }
      if (filtro === "Rojo" || filtro === "Gris") { if (!l.raza.includes(filtro)) return false; }
      return !q || `${l.nombre} ${l.registro} ${l.lote}`.toLowerCase().includes(q);
    });
    $("#lot-list").innerHTML = items.length ? items.map(({ l, i }, k) => `
      <li><button class="lot-card" style="--i:${k}" data-action="ir" data-lote="${i}">
        <img src="${esc(l.foto)}" alt="" loading="lazy">
        <span class="t"><small>Lote ${esc(l.lote)}</small>${esc(l.nombre)} ${esc(l.registro)}
          <span class="m">${esc(l.raza)} · ${esc(l.sexo)} · ${esc(l.edad)}</span></span>
        <span class="heart">${favs.has(l.id) ? "♥" : ""}</span>
      </button></li>`).join("") : `<li class="empty">${filtro === "fav" ? "Aún no marcas lotes. Toca el ♥ en la foto de un ejemplar." : "No hay lotes con ese filtro."}</li>`;
    $("#drawer-foot").innerHTML = filtro === "fav" && favs.size
      ? `<button class="btn primary" style="width:100%;justify-content:center" data-action="whatsapp">Enviar mi selección por WhatsApp</button>` : "";
  }

  /* ---------- Fotos ---------- */
  let fotoDestino = null;
  function pedirFoto(path) { fotoDestino = path; const f = $("#file"); f.value = ""; f.click(); }

  function cargarFoto(path, file) {
    const max = /genealogia/.test(path) ? 500 : 1800;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      setFoto(path, c.toDataURL("image/jpeg", 0.86));
      toast("Foto actualizada");
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast("No se pudo leer esa imagen"); };
    img.src = url;
  }

  function setFoto(path, dataUrl) {
    setPath(path, dataUrl);
    rebuild();
  }

  function rebuild() {
    const cur = book ? book.getCurrentPageIndex() : 0;
    buildBook(cur);
    if (editing) aplicarEdicion();
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
    toast(editing
      ? "Modo edición: escribe sobre los textos, toca los círculos o arrastra fotos. Se guarda solo."
      : "Modo lectura");
  }

  function exportar() {
    const src = "// Datos del catálogo. Generado desde el modo edición.\nwindow.CATALOGO = " + JSON.stringify(state, null, 2) + ";\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    a.download = "data.js";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Reemplaza catalogo-web/data.js con el archivo descargado");
  }

  async function restablecer() {
    if (!confirm("¿Descartar todos los cambios guardados en este navegador y volver al data.js original?")) return;
    await idb.del("estado");
    state = JSON.parse(JSON.stringify(ORIGINAL));
    rebuild();
    toast("Cambios descartados");
  }

  function imprimir() {
    const root = $("#print-root");
    root.innerHTML = allPagesHTML();
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
    // Si IndexedDB no responde (modo privado, file:// restringido), arrancar con data.js
    // Los borradores locales solo se cargan en modo editor: el público ve siempre data.js
    if (PUEDE_EDITAR) {
      document.body.classList.add("can-edit");
      const guardado = await Promise.race([idb.get("estado"), new Promise((r) => setTimeout(r, 1500))]);
      if (guardado && Array.isArray(guardado.lotes)) state = guardado;
    }

    const m = location.hash.match(/lote-(\d+)/);
    const idx = m ? state.lotes.findIndex((l) => String(l.lote) === m[1]) : -1;
    buildBook(idx >= 0 ? 1 + idx * 2 : 0);
    actualizarFavCount();

    document.addEventListener("click", (e) => { if (!e.target.closest("#book")) onAction(e); });
    $("#modal").addEventListener("click", (e) => { if (e.target === $("#modal")) $("#modal").close(); });
    $("#modal").addEventListener("close", () => { $("#modal-body").innerHTML = ""; });
    $("#buscar").addEventListener("input", renderLista);
    $("#filtros").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) { setFiltro(c.dataset.filtro); renderLista(); } });
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
  else document.body.insertAdjacentHTML("beforeend", '<p style="position:fixed;inset:auto 0 40%;text-align:center">No se pudo cargar la librería del libro (se necesita internet la primera vez).</p>');
})();
