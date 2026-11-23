/*
 * app.js — Une todo: el texto, los lectores, la nube y el panel de detalle.
 */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const texto = $('#texto');
  const selFormato = $('#formato');
  const selEjemplo = $('#ejemplo');
  const chkAgrupar = $('#agrupar');
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

  // ------------------------------------------------------------ generar

  function detectarFormato(t) {
    if (selFormato.value !== 'auto') return selFormato.value;
    const esRenpy = window.LectorRenpy.pareceRenpy(t);
    const esInk = window.LectorInk.pareceInk(t);
    if (esInk && !esRenpy) return 'ink';
    return 'renpy';
  }

  function generar(reencuadrar) {
    const t = texto.value;
    const formato = detectarFormato(t);
    $('#formato-detectado').textContent = NOMBRE_FORMATO[formato] + (selFormato.value === 'auto' ? ' (auto)' : '');
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

  function cargar(contenido, formato) {
    texto.value = contenido;
    if (formato) selFormato.value = formato;
    guardar('texto', contenido);
    guardar('formato', selFormato.value);
    nube.seleccion = null;
    generar(true);
  }

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
  selFormato.addEventListener('change', () => {
    guardar('formato', selFormato.value);
    generar(true);
  });
  chkAgrupar.addEventListener('change', () => {
    guardar('agrupar', chkAgrupar.checked ? '1' : '0');
    generar(true);
  });

  for (const e of window.EJEMPLOS || []) {
    const o = document.createElement('option');
    o.value = e.id;
    o.textContent = e.nombre;
    selEjemplo.appendChild(o);
  }
  selEjemplo.addEventListener('change', () => {
    const e = (window.EJEMPLOS || []).find((x) => x.id === selEjemplo.value);
    if (e) cargar(e.texto, 'auto');
    selEjemplo.value = '';
  });

  $('#archivo').addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const formato = /\.ink$/i.test(f.name) ? 'ink' : /\.rpy$/i.test(f.name) ? 'renpy' : 'auto';
    f.text().then((t) => cargar(t, formato));
    ev.target.value = '';
  });

  $('#zoom-mas').addEventListener('click', () => nube.zoom(1.25));
  $('#zoom-menos').addEventListener('click', () => nube.zoom(0.8));
  $('#zoom-ajustar').addEventListener('click', () => nube.ajustar());
  $('#zoom-inicio').addEventListener('click', () => nube.alInicio());

  document.addEventListener('keydown', (ev) => {
    if (ev.target === texto) return;
    if (ev.key === 'Escape') nube.seleccionar(null);
    if (ev.key === '+' || ev.key === '=') nube.zoom(1.2);
    if (ev.key === '-') nube.zoom(1 / 1.2);
    if (ev.key === '0') nube.ajustar();
  });

  // ------------------------------------------------------------- arranque

  const textoGuardado = recuperar('texto');
  selFormato.value = recuperar('formato') || 'auto';
  chkAgrupar.checked = recuperar('agrupar') === '1';
  const angosta = window.matchMedia('(max-width: 860px)').matches;
  mostrarEditor(recuperar('editor') ? recuperar('editor') === '1' : !angosta);
  texto.value = textoGuardado != null && textoGuardado.trim() ? textoGuardado : (window.EJEMPLOS && window.EJEMPLOS[0].texto) || '';
  generar(true);
})();
