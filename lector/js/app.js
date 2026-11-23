/*
 * app.js — Une todo: el texto, los lectores, la nube y el panel de detalle.
 */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const texto = $('#texto');
  const chkAgrupar = $('#agrupar');
  const btnRecortar = $('#btn-recortar');
  const editor = $('#editor');
  const btnEditor = $('#btn-editor');
  const detalle = $('#detalle');
  const { icono, nombreExtra } = window.NubeExtras;

  const NOMBRE_FORMATO = { renpy: "Ren'Py", ink: 'Ink' };
  const TIPOS = { inicio: 'Inicio', dialogo: 'Diálogo', opcion: 'Elección', accion: 'Acción', bloque: 'Bloque de diálogo', falta: 'Salto roto' };

  // Guardado local (si el navegador no deja, seguimos igual)
  const guardar = (k, v) => {
    try { localStorage.setItem('nube.' + k, v); } catch (e) { /* sin guardado */ }
  };
  const recuperar = (k) => {
    try { return localStorage.getItem('nube.' + k); } catch (e) { return null; }
  };

  const nube = new window.Nube($('#nube'), { alSeleccionar: mostrarDetalle });
  let grafoBase = null;
  let grafo = null;
  let primeraVez = true;
  let archivo = null; // { nombre, formato }

  // ------------------------------------------------------------ generar

  function generar(reencuadrar) {
    if (!archivo) return;
    const t = texto.value;
    const formato = archivo.formato;
    $('#formato-detectado').textContent = NOMBRE_FORMATO[formato];
    $('#vacio').hidden = !!t.trim();

    try {
      grafoBase = formato === 'ink' ? window.LectorInk.leer(t) : window.LectorRenpy.leer(t);
    } catch (e) {
      console.error(e);
      mostrarAvisos([{ linea: null, mensaje: 'No pudimos leer el texto: ' + e.message, error: true }]);
      return;
    }
    grafo = chkAgrupar.checked ? window.Modelo.agrupar(grafoBase) : grafoBase;
    nube.dibujar(grafo);
    mostrarAvisos(grafoBase.avisos);
    mostrarEstado();

    if (primeraVez || reencuadrar) {
      // Si para ver todo hay que alejarse tanto que no se lee, mostramos el principio.
      nube.ajustar();
      if (nube.vista.k < 0.55) nube.alInicio();
      primeraVez = false;
    }
    if (nube.seleccion) mostrarDetalle(grafo.porId.get(nube.seleccion));
    else cerrarDetalle();
  }

  function mostrarEstado() {
    const base = grafoBase.nodos;
    const lineas = base.filter((n) => n.tipo === 'dialogo').length;
    const opciones = base.filter((n) => n.tipo === 'opcion').length;
    const finales = grafo.nodos.filter((n) => !n.siguientes.length && n.tipo !== 'falta').length;
    const partes = [
      ['💬', lineas, lineas === 1 ? 'línea' : 'líneas'],
      ['🔀', opciones, opciones === 1 ? 'opción' : 'opciones'],
      ['🏁', finales, finales === 1 ? 'final' : 'finales'],
      ['🎭', grafoBase.personajes.length, grafoBase.personajes.length === 1 ? 'personaje' : 'personajes'],
    ];
    const estado = $('#estado');
    estado.textContent = '';
    for (const [ic, num, palabra] of partes) {
      const s = document.createElement('span');
      s.append(ic + ' ');
      const b = document.createElement('b');
      b.textContent = num;
      s.append(b, ' ' + palabra);
      estado.appendChild(s);
    }
  }

  function mostrarAvisos(avisos) {
    const caja = $('#avisos');
    caja.textContent = '';
    for (const a of avisos) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'aviso' + (a.error ? ' error' : '');
      b.textContent = '⚠️ ' + (a.linea ? 'Línea ' + a.linea + ': ' : '') + a.mensaje;
      if (a.linea) b.addEventListener('click', () => irALinea(a.linea));
      caja.appendChild(b);
    }
  }

  // ------------------------------------------------------------ detalle

  function resumen(n) {
    if (!n) return '';
    if (n.tipo === 'inicio') return '▶ Inicio';
    if (n.tipo === 'opcion') return '🔀 ' + n.texto;
    if (n.tipo === 'accion') return '⚙ ' + n.extras.map((e) => e.valor).join(', ');
    if (n.tipo === 'bloque') return (n.lineas[0].personaje ? n.lineas[0].personaje + ': ' : '') + n.lineas[0].texto;
    return (n.personaje ? n.personaje + ': ' : '') + n.texto;
  }

  function botonIr(n, condicion) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ir';
    const punto = document.createElement('i');
    punto.className = 'punto';
    punto.style.background = n.color;
    const s = document.createElement('span');
    s.textContent = resumen(n);
    b.append(punto, s);
    if (condicion) {
      const em = document.createElement('em');
      em.textContent = condicion;
      b.appendChild(em);
    }
    b.addEventListener('click', () => nube.seleccionar(n.id, true));
    return b;
  }

  function seccion(titulo) {
    const h = document.createElement('h3');
    h.textContent = titulo;
    detalle.appendChild(h);
  }

  function mostrarDetalle(n) {
    if (!n) return cerrarDetalle();
    detalle.hidden = false;
    detalle.textContent = '';

    const cabeza = document.createElement('div');
    cabeza.className = 'detalle-cabeza';
    const cuadro = document.createElement('div');
    cuadro.className = 'cuadro';
    cuadro.style.setProperty('--color', n.color);
    cuadro.textContent = n.tipo === 'opcion' ? '?' : n.tipo === 'inicio' ? '▶' : n.personaje ? Array.from(n.personaje)[0].toUpperCase() : '…';
    const titulos = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.textContent = n.tipo === 'dialogo' ? n.personaje || 'Narrador' : TIPOS[n.tipo];
    const small = document.createElement('small');
    small.textContent = TIPOS[n.tipo] + (n.linea ? ' · línea ' + n.linea : '');
    titulos.append(h2, small);
    const cerrar = document.createElement('button');
    cerrar.className = 'cerrar';
    cerrar.type = 'button';
    cerrar.title = 'Cerrar';
    cerrar.textContent = '✕';
    cerrar.addEventListener('click', () => nube.seleccionar(null));
    cabeza.append(cuadro, titulos, cerrar);
    detalle.appendChild(cabeza);

    if (n.tipo === 'bloque') {
      seccion('Líneas (' + n.lineas.length + ')');
      const ul = document.createElement('ul');
      ul.className = 'lista';
      for (const l of n.lineas) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ir';
        const punto = document.createElement('i');
        punto.className = 'punto';
        punto.style.background = l.color;
        const s = document.createElement('span');
        s.textContent = (l.personaje ? l.personaje + ': ' : '') + l.texto;
        s.style.whiteSpace = 'normal';
        const em = document.createElement('em');
        em.textContent = 'L' + l.linea;
        b.append(punto, s, em);
        b.title = 'Ver en el texto';
        b.addEventListener('click', () => irALinea(l.linea));
        li.appendChild(b);
        ul.appendChild(li);
      }
      detalle.appendChild(ul);
    } else if (n.texto && n.tipo !== 'inicio') {
      const t = document.createElement('div');
      t.className = 'detalle-texto';
      t.textContent = n.texto;
      detalle.appendChild(t);
    }

    if (n.condicion) {
      seccion('Aparece solo si');
      const c = document.createElement('div');
      c.className = 'detalle-cond';
      const code = document.createElement('code');
      code.textContent = n.condicion;
      c.appendChild(code);
      detalle.appendChild(c);
    }

    if (n.extras.length) {
      seccion('Algo más (' + n.extras.length + ')');
      const ul = document.createElement('ul');
      ul.className = 'lista';
      for (const e of n.extras) {
        const li = document.createElement('li');
        const ic = document.createElement('span');
        ic.textContent = icono(e.tipo);
        const nombre = document.createElement('b');
        nombre.textContent = nombreExtra(e.tipo) + ':';
        const code = document.createElement('code');
        code.textContent = e.valor;
        li.append(ic, nombre, code);
        ul.appendChild(li);
      }
      detalle.appendChild(ul);
    }

    const anteriores = n.anteriores.map((id) => grafo.porId.get(id)).filter(Boolean);
    if (anteriores.length) {
      seccion('Viene de (' + anteriores.length + ')');
      const ul = document.createElement('ul');
      ul.className = 'lista';
      for (const a of anteriores) {
        const li = document.createElement('li');
        const arista = a.siguientes.find((s) => s.a === n.id);
        li.appendChild(botonIr(a, arista && arista.condicion));
        ul.appendChild(li);
      }
      detalle.appendChild(ul);
    }

    const sigs = n.siguientes.map((s) => ({ n: grafo.porId.get(s.a), c: s.condicion })).filter((x) => x.n);
    const esEleccion = sigs.length > 1 && sigs.every((x) => x.n.tipo === 'opcion');
    seccion(!sigs.length ? 'Sigue' : esEleccion ? 'Elecciones (' + sigs.length + ')' : sigs.length > 1 ? 'Caminos (' + sigs.length + ')' : 'Sigue');
    if (!sigs.length) {
      const p = document.createElement('p');
      p.textContent = n.tipo === 'falta' ? '⚠️ Este salto apunta a un lugar que no existe.' : '🏁 Acá termina este camino.';
      detalle.appendChild(p);
    } else {
      const ul = document.createElement('ul');
      ul.className = 'lista';
      for (const x of sigs) {
        const li = document.createElement('li');
        li.appendChild(botonIr(x.n, x.c));
        ul.appendChild(li);
      }
      detalle.appendChild(ul);
    }

    if (n.linea) {
      const p = document.createElement('p');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'enlace';
      b.textContent = '📝 Ver en el texto (línea ' + n.linea + ')';
      b.addEventListener('click', () => irALinea(n.linea));
      p.appendChild(b);
      detalle.appendChild(p);
    }
  }

  function cerrarDetalle() {
    detalle.hidden = true;
    detalle.textContent = '';
  }

  // ------------------------------------------------------------- editor

  function mostrarEditor(visible) {
    editor.hidden = !visible;
    btnEditor.setAttribute('aria-pressed', String(visible));
    guardar('editor', visible ? '1' : '0');
  }

  function irALinea(linea) {
    mostrarEditor(true);
    const lineas = texto.value.split('\n');
    let inicio = 0;
    for (let i = 0; i < linea - 1 && i < lineas.length; i++) inicio += lineas[i].length + 1;
    const fin = inicio + (lineas[linea - 1] || '').length;
    texto.focus({ preventScroll: true });
    texto.setSelectionRange(inicio, fin);
    const alto = parseFloat(getComputedStyle(texto).lineHeight) || 19;
    texto.scrollTop = Math.max(0, (linea - 6) * alto);
  }

  // ------------------------------------------------- portada y archivos

  const FORMATO_POR_EXTENSION = { rpy: 'renpy', ink: 'ink' };

  function avisar(mensaje) {
    const m = $('#mensaje');
    m.textContent = mensaje;
    m.hidden = false;
    clearTimeout(avisar.t);
    avisar.t = setTimeout(() => (m.hidden = true), 5000);
  }

  function mostrarPortada() {
    $('#visor').hidden = true;
    $('#portada').hidden = false;
    const guardado = leerGuardado();
    const seguir = $('#btn-seguir');
    seguir.hidden = !guardado;
    if (guardado) seguir.textContent = '↩ Seguir con «' + guardado.nombre + '»';
    $('#btn-abrir').focus();
  }

  function mostrarVisor() {
    $('#portada').hidden = true;
    $('#visor').hidden = false;
  }

  function leerGuardado() {
    try {
      const a = JSON.parse(recuperar('archivo'));
      const t = recuperar('texto');
      if (a && a.nombre && FORMATO_POR_EXTENSION[a.extension] && t != null) return Object.assign(a, { texto: t });
    } catch (e) { /* nada guardado */ }
    return null;
  }

  /** Abre el contenido en el visor. El formato sale de la extensión del archivo. */
  function abrir(nombre, extension, contenido) {
    archivo = { nombre, extension, formato: FORMATO_POR_EXTENSION[extension] };
    $('#nombre-archivo').textContent = nombre;
    $('#formato-archivo').textContent = NOMBRE_FORMATO[archivo.formato];
    texto.value = contenido;
    guardar('archivo', JSON.stringify({ nombre, extension }));
    guardar('texto', contenido);
    nube.seleccion = null;
    mostrarVisor();
    generar(true);
  }

  $('#archivo').addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (f) abrirArchivo(f);
  });

  // Arrastrar y soltar un archivo en cualquier parte de la página
  let arrastres = 0;
  document.addEventListener('dragenter', (ev) => {
    if (!ev.dataTransfer || !Array.from(ev.dataTransfer.types).includes('Files')) return;
    ev.preventDefault();
    arrastres++;
    document.body.classList.add('soltando');
  });
  document.addEventListener('dragover', (ev) => {
    if (ev.dataTransfer && Array.from(ev.dataTransfer.types).includes('Files')) ev.preventDefault();
  });
  document.addEventListener('dragleave', () => {
    arrastres = Math.max(0, arrastres - 1);
    if (!arrastres) document.body.classList.remove('soltando');
  });
  document.addEventListener('drop', (ev) => {
    arrastres = 0;
    document.body.classList.remove('soltando');
    const f = ev.dataTransfer && ev.dataTransfer.files[0];
    if (!f) return;
    ev.preventDefault();
    abrirArchivo(f);
  });

  function abrirArchivo(f) {
    const m = f.name.match(/\.([^.]+)$/);
    const extension = m ? m[1].toLowerCase() : '';
    if (!FORMATO_POR_EXTENSION[extension]) {
      avisar('🚫 «' + f.name + '» no está permitido. Solo se pueden abrir archivos .rpy (Ren\'Py) o .ink (Ink).');
      return;
    }
    f.text().then(
      (t) => abrir(f.name, extension, t),
      () => avisar('No pudimos leer «' + f.name + '». Probá abrirlo de nuevo.')
    );
  }

  const elegirArchivo = () => $('#archivo').click();
  $('#btn-abrir').addEventListener('click', elegirArchivo);
  $('#btn-abrir-otro').addEventListener('click', elegirArchivo);
  $('#btn-portada').addEventListener('click', mostrarPortada);
  $('#btn-seguir').addEventListener('click', () => {
    const g = leerGuardado();
    if (g) abrir(g.nombre, g.extension, g.texto);
  });

  for (const e of window.EJEMPLOS || []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'boton';
    b.textContent = e.nombre;
    const extension = e.formato === 'ink' ? 'ink' : 'rpy';
    b.addEventListener('click', () => abrir('michi.' + extension, extension, e.texto));
    $('#lista-ejemplos').appendChild(b);
  }

  // ------------------------------------------------------------- controles

  let espera = null;
  texto.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      guardar('texto', texto.value);
      generar(false);
    }, 350);
  });
  texto.addEventListener('keydown', (ev) => {
    if (ev.key === 'Tab' && !ev.shiftKey) {
      ev.preventDefault();
      const { selectionStart: a, selectionEnd: b } = texto;
      texto.setRangeText('    ', a, b, 'end');
      texto.dispatchEvent(new Event('input'));
    }
  });

  btnEditor.addEventListener('click', () => mostrarEditor(editor.hidden));
  chkAgrupar.addEventListener('change', () => {
    guardar('agrupar', chkAgrupar.checked ? '1' : '0');
    generar(true);
  });

  function ponerRecorte(recortar) {
    btnRecortar.setAttribute('aria-pressed', String(recortar));
    nube.completo = !recortar;
    guardar('recortar', recortar ? '1' : '0');
  }
  btnRecortar.addEventListener('click', () => {
    ponerRecorte(btnRecortar.getAttribute('aria-pressed') !== 'true');
    generar(false);
  });

  $('#zoom-mas').addEventListener('click', () => nube.zoom(1.25));
  $('#zoom-menos').addEventListener('click', () => nube.zoom(0.8));
  $('#zoom-ajustar').addEventListener('click', () => nube.ajustar());
  $('#zoom-inicio').addEventListener('click', () => nube.alInicio());

  document.addEventListener('keydown', (ev) => {
    if (ev.target === texto || $('#visor').hidden) return;
    if (ev.key === 'Escape') nube.seleccionar(null);
    if (ev.key === '+' || ev.key === '=') nube.zoom(1.2);
    if (ev.key === '-') nube.zoom(1 / 1.2);
    if (ev.key === '0') nube.ajustar();
  });

  // ------------------------------------------------------------- arranque

  chkAgrupar.checked = recuperar('agrupar') === '1';
  ponerRecorte(recuperar('recortar') !== '0');
  const angosta = window.matchMedia('(max-width: 860px)').matches;
  mostrarEditor(recuperar('editor') ? recuperar('editor') === '1' : !angosta);
  mostrarPortada();
})();
