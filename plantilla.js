/* Plantilla: Proyecto Ubre (Vanguardia Ganadera) — remate de ganado Brahman.
   Ejemplo completo: portada, pliego por lote (foto + genealogía), contraportada.
   Medidas en puntos del A4 original (595 × 842) usando calc(var(--u) * N). */
(() => {
  const ROLES = {
    abueloPaterno: "Abuelo paterno", abuelaPaterna: "Abuela paterna",
    abueloMaterno: "Abuelo materno", abuelaMaterna: "Abuela materna",
    padre: "Padre", madre: "Madre",
  };
  // Centro y radio (pt) de cada círculo de la genealogía, medidos en el PDF
  const CIRC = {
    abueloPaterno: [78, 313, 35], abuelaPaterna: [224, 313, 35],
    abueloMaterno: [353, 313, 35], abuelaMaterna: [499, 313, 35],
    padre: [149, 458, 35], madre: [424, 458, 35],
  };
  const DELAY = { abueloPaterno: 250, abuelaPaterna: 350, abueloMaterno: 450, abuelaMaterna: 550, padre: 850, madre: 950 };
  const ICON_KG = '<svg viewBox="0 0 24 24"><path d="M7 8h10l2 12H5L7 8z"/><circle cx="12" cy="5.5" r="2"/><path d="M9.5 16v-4m0 2l2-2m-2 2l2 2M14 12.5a1.6 1.6 0 1 0 0 3h1v-1.3"/></svg>';
  const ICON_EDAD = '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4M8 14h2m4 0h2m-8 3h2"/></svg>';
  const LOGO = "assets/logo.png";

  function portada(C) {
    const { esc, bind, imgBtn } = C;
    const p = C.state.portada;
    return `
    <div class="page" data-density="hard"><div class="sheet cover" data-drop="portada.foto">
      <img class="bg kenburns" src="${esc(p.foto)}" alt="">
      <div class="shade"></div>
      <img class="logo anim a-pop" style="--d:300" src="${LOGO}" alt="${esc(C.state.marca)}">
      <div class="tagline anim a-up" style="--d:700"><span ${bind("portada.titulo1")}>${esc(p.titulo1)}</span><br><span ${bind("portada.titulo2")}>${esc(p.titulo2)}</span></div>
      <div class="edicion anim a-up" style="--d:1000"><span ${bind("portada.subtitulo")}>${esc(p.subtitulo)}</span><b ${bind("portada.anio")}>${esc(p.anio)}</b></div>
      ${imgBtn("portada.foto")}
    </div></div>`;
  }

  function paginaLote(C, l, i) {
    const { esc, bind, imgBtn, favBtn } = C;
    const b = `lotes.${i}`;
    return `
    <div class="page" data-item="${i}"><div class="sheet lote" data-drop="${b}.foto">
      <img class="bg kenburns" src="${esc(l.foto)}" alt="${esc(l.nombre)}">
      <div class="shade"></div>
      ${favBtn(i, "anim a-pop")}
      <button class="lote-tab anim a-drop" style="--d:100" data-action="indice" title="Ver todos los lotes"><span>Lote</span><b>${esc(l.lote)}</b></button>
      <div class="titulo anim a-up" style="--d:250"><h2 ${bind(b + ".nombre")}>${esc(l.nombre)}</h2><div class="reg" ${bind(b + ".registro")}>${esc(l.registro)}</div></div>
      <div class="regla anim a-line" style="--d:500"></div>
      <div class="cat anim a-fade" style="--d:800" ${bind(b + ".categoria")}>${esc(l.categoria)}</div>
      <button class="hotspot" style="left:calc(var(--u)*250);top:calc(var(--u)*440)" data-action="ficha" data-item="${i}"><i></i>Ver ficha del ejemplar</button>
      <div class="stats">
        <div class="stat anim a-pop" style="--d:900"><span class="ico">${ICON_KG}</span><b class="countup" ${bind(b + ".peso")}>${esc(l.peso)}</b><small>Peso actual</small></div>
        <div class="stat anim a-pop" style="--d:1050"><span class="ico">${ICON_EDAD}</span><b class="countup" ${bind(b + ".edad")}>${esc(l.edad)}</b><small>Edad actual</small></div>
      </div>
      ${imgBtn(b + ".foto")}
    </div></div>`;
  }

  function circulo(C, l, i, key) {
    const { esc, bind } = C;
    const [cx, cy, r] = CIRC[key];
    const a = l.genealogia[key];
    const path = `lotes.${i}.genealogia.${key}`;
    const parent = key === "padre" || key === "madre";
    return `
      <button class="circ anim a-pop ${a.foto ? "" : "vacio"}" data-drop="${path}.foto" data-action="ancestro" data-item="${i}" data-key="${key}"
        style="--d:${DELAY[key]};left:calc(var(--u)*${cx - r});top:calc(var(--u)*${cy - r});width:calc(var(--u)*${r * 2});height:calc(var(--u)*${r * 2})"
        aria-label="${esc(ROLES[key])}: ${esc(a.nombre)}">${a.foto ? `<img src="${esc(a.foto)}" alt="">` : ""}</button>
      <div class="nm anim a-fade ${parent ? "parent" : ""}" style="--d:${DELAY[key] + 150};left:calc(var(--u)*${cx - 62});top:calc(var(--u)*${cy + (parent ? 44 : 43)})">
        <b ${bind(path + ".nombre")}>${esc(a.nombre)}</b><small>${ROLES[key]}</small>
      </div>`;
  }

  function paginaGenealogia(C, l, i) {
    const { esc, bind } = C;
    const b = `lotes.${i}`;
    const foto = l.fotoEjemplar || l.foto;
    // Sin foto propia, el círculo grande encuadra la cabeza del ejemplar desde la foto del lote
    const encuadre = l.fotoEjemplar ? "background-size:cover;background-position:center" : "background-size:330%;background-position:88% 41%";
    const paths = [
      ["M78 398V418H120", 600], ["M224 398V418H182", 650], ["M353 398V418H396", 700], ["M499 398V418H458", 750],
      ["M149 548V596H206", 1100], ["M424 548V596H368", 1150],
    ];
    return `
    <div class="page" data-item="${i}"><div class="sheet gen">
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
        ${paths.map(([d, dl]) => { const x = d.match(/H(\d+)$/)[1]; const y = d.match(/V(\d+)/)[1]; return `<circle class="anim a-pop" style="--d:${dl + 700}" cx="${x}" cy="${y}" r="2.2"/>`; }).join("")}
      </svg>
      ${Object.keys(CIRC).map((k) => circulo(C, l, i, k)).join("")}
      <span class="ring loop" style="left:calc(var(--u)*216);top:calc(var(--u)*516);width:calc(var(--u)*144);height:calc(var(--u)*144)"></span>
      <button class="circ main anim a-pop" style="--d:1300;left:calc(var(--u)*216);top:calc(var(--u)*516);width:calc(var(--u)*144);height:calc(var(--u)*144)"
        data-action="ficha" data-item="${i}" data-drop="${b}.fotoEjemplar" aria-label="Ficha de ${esc(l.nombre)}">
        <span class="main-foto" style="background-image:url('${esc(foto)}');${encuadre}"></span>
      </button>
      <div class="nm main-name anim a-up" style="--d:1500;left:calc(var(--u)*138);top:calc(var(--u)*679)">
        <span ${bind(b + ".nombre")}>${esc(l.nombre)}</span> <span class="num" ${bind(b + ".registro")}>${esc(l.registro)}</span>
      </div>
      <button class="video-btn anim a-up ${l.video ? "" : "sin-video"}" style="--d:1700" data-action="video" data-item="${i}">
        <span class="yt"><span></span></span><span class="pill">Ver video del ejemplar aquí</span>
      </button>
      <img class="logo anim a-fade" style="--d:1800" src="${LOGO}" alt="">
    </div></div>`;
  }

  function contraportada(C) {
    const { esc, bind } = C;
    const c = C.state.contraportada;
    return `
    <div class="page" data-density="hard"><div class="sheet back">
      <img class="bg" src="assets/fondo-oscuro.jpg" alt="">
      <img class="logo anim a-pop" style="--d:200" src="${LOGO}" alt="${esc(C.state.marca)}">
      <h2 class="anim a-up" style="--d:500" ${bind("contraportada.texto")}>${esc(c.texto)}</h2>
      <p class="anim a-fade" style="--d:800" data-multilinea ${bind("contraportada.contacto")}>${esc(c.contacto)}</p>
    </div></div>`;
  }

  window.PLANTILLA = {
    nombre: "ubre",                    // también nombra el almacenamiento local (favoritos, borradores)
    coleccion: "lotes",
    etiqueta: { singular: "Lote", plural: "Lotes" },
    pagina: { ancho: 595, alto: 842 },
    cabecera: (C) => ({ logo: LOGO, nombre: "Proyecto Ubre", sub: `Catálogo ${C.state.portada.anio}` }),

    paginas: (C) => [
      portada(C),
      ...C.items().flatMap((l, i) => [paginaLote(C, l, i), paginaGenealogia(C, l, i)]),
      contraportada(C),
    ],

    idItem: (l) => l.lote,
    tituloItem: (l) => `${l.nombre} ${l.registro}`,
    tarjeta: (l) => ({ img: l.foto, imgPos: "80% 45%", kicker: `Lote ${l.lote}`, titulo: `${l.nombre} ${l.registro}`, meta: `${l.raza} · ${l.sexo} · ${l.edad}` }),
    filtros: [
      { id: "hembra", label: "Hembras", test: (l) => l.sexo === "Hembra" },
      { id: "macho", label: "Machos", test: (l) => l.sexo === "Macho" },
      { id: "rojo", label: "Rojo", test: (l) => /rojo/i.test(l.raza) },
      { id: "gris", label: "Gris", test: (l) => /gris/i.test(l.raza) },
    ],
    placeholderBusqueda: "Buscar por nombre o registro…",
    busqueda: (l) => `${l.nombre} ${l.registro} ${l.lote}`,

    ficha: (l, i, C) => C.fichaHTML({
      i, foto: l.fotoEjemplar || l.foto, fotoPos: "75% 50%",
      kicker: `Lote ${l.lote} · ${l.categoria}`, titulo: l.nombre, sub: l.registro,
      campos: [
        { etiqueta: "Raza", valor: l.raza }, { etiqueta: "Sexo", valor: l.sexo },
        { etiqueta: "Nacimiento", valor: l.nacimiento }, { etiqueta: "Edad", valor: l.edad },
        { etiqueta: "Peso", valor: l.peso },
      ],
      nota: `Padre: <b>${C.esc(l.genealogia.padre.nombre)}</b><br>Madre: <b>${C.esc(l.genealogia.madre.nombre)}</b>`,
    }),

    acciones: {
      ancestro: ({ btn, i, item: l, C }) => {
        const key = btn.dataset.key;
        const a = l.genealogia[key];
        C.abrirModal(`
          <div class="ancestro">
            <div class="big">${a.foto ? `<img src="${C.esc(a.foto)}" alt="">` : ""}</div>
            <div class="modal-pad" style="padding:0">
              <span class="kicker">${ROLES[key]} de</span>
              <p style="color:var(--text)">${C.esc(l.nombre)} ${C.esc(l.registro)} · Lote ${C.esc(l.lote)}</p>
              <h3 style="font-size:22px;text-transform:uppercase">${C.esc(a.nombre)}</h3>
              ${a.foto ? "" : "<p>Todavía no hay foto de este ejemplar.</p>"}
              <div class="btns"><button class="btn primary" data-action="ficha" data-item="${i}">Ver ficha del lote</button></div>
            </div>
          </div>`);
      },
    },
    // En modo edición, tocar un círculo pide la foto en vez de abrir la ficha
    enEdicion: {
      ancestro: ({ btn, i, C }) => (C.pedirFoto(`lotes.${i}.genealogia.${btn.dataset.key}.foto`), true),
      ficha: ({ btn, i, C }) => (btn.classList.contains("main") ? (C.pedirFoto(`lotes.${i}.fotoEjemplar`), true) : false),
    },
    maxFoto: (path) => (/genealogia/.test(path) ? 500 : 1800),
    whatsapp: (elegidos) => `Hola, me interesan estos lotes del catálogo Proyecto Ubre:\n` +
      elegidos.map(({ it }) => `• Lote ${it.lote}: ${it.nombre} ${it.registro}`).join("\n"),
  };
})();
