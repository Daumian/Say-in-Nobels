/*
 * nube.js — Dibuja la nube de nodos en un <svg> y deja moverla y hacer zoom.
 */
(function (raiz) {
  'use strict';

  const SVG = 'http://www.w3.org/2000/svg';
  const HTML = 'http://www.w3.org/1999/xhtml';

  const ICONOS = {
    escena: '🏞️', fondo: '🏞️', mostrar: '🧍', ocultar: '🙈', musica: '🎵', sonido: '🔊', detener: '⏹️',
    transicion: '✨', codigo: '⚙️', cara: '🙂', pausa: '⏸️', voz: '🎙️', fija: '📌', etiqueta: '🏷️', otro: '•',
  };
  const NOMBRES_EXTRA = {
    escena: 'Escena', fondo: 'Fondo', mostrar: 'Mostrar', ocultar: 'Ocultar', musica: 'Música', sonido: 'Sonido',
    detener: 'Detener', transicion: 'Transición', codigo: 'Código', cara: 'Cara', pausa: 'Pausa', voz: 'Voz',
    fija: 'Opción fija', etiqueta: 'Etiqueta', otro: 'Otro',
  };
  const icono = (tipo) => ICONOS[tipo] || '🏷️';
  const nombreExtra = (tipo) => NOMBRES_EXTRA[tipo] || tipo;

  const ANCHO = 260;
  const MAX_LINEAS_BLOQUE = 8;

  const el = (ns, tag, attrs, padre) => {
    const e = document.createElementNS(ns, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (padre) padre.appendChild(e);
    return e;
  };
  const div = (clase, texto, padre) => {
    const d = el(HTML, 'div', { class: clase }, padre);
    if (texto != null) d.textContent = texto;
    return d;
  };
  const inicial = (nombre) => (nombre ? Array.from(nombre.trim())[0].toUpperCase() : '…');

  class Nube {
    constructor(svg, opciones) {
      this.svg = svg;
      this.alSeleccionar = (opciones && opciones.alSeleccionar) || (() => {});
      this.vista = { x: 40, y: 40, k: 1 };
      this.seleccion = null;
      this.completo = false; // false = texto recortado en una línea; true = texto completo
      this.vertical = false; // false = la historia va hacia la derecha; true = la historia baja

      const defs = el(SVG, 'defs', null, svg);
      const flecha = el(SVG, 'marker', { id: 'flecha', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, defs);
      el(SVG, 'path', { d: 'M0,0 L10,5 L0,10 z', class: 'punta' }, flecha);
      const flecha2 = el(SVG, 'marker', { id: 'flecha-activa', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, defs);
      el(SVG, 'path', { d: 'M0,0 L10,5 L0,10 z', class: 'punta activa' }, flecha2);

      this.mundo = el(SVG, 'g', { class: 'mundo' }, svg);
      this.capaAristas = el(SVG, 'g', { class: 'aristas' }, this.mundo);
      this.capaNodos = el(SVG, 'g', { class: 'nodos' }, this.mundo);
      this._moverYZoom();
    }

    // ------------------------------------------------------------ dibujo

    dibujar(grafo) {
      this.grafo = grafo;
      this.svg.classList.toggle('completo', this.completo);
      this.svg.classList.toggle('vertical', this.vertical);

      // Armamos todas las cajas en un lugar invisible para medir cuánto mide cada una
      const medidor = div('nube-medidor' + (this.completo ? ' completo' : ''), null, document.body);
      const cajas = new Map();
      for (const n of grafo.nodos) {
        const lugar = div('nube-medidor-lugar', null, medidor);
        lugar.style.width = ANCHO + 'px';
        cajas.set(n.id, this._crearCaja(n, lugar));
      }
      const altos = new Map();
      for (const [id, caja] of cajas) altos.set(id, Math.ceil(caja.getBoundingClientRect().height));
      medidor.remove();

      const res = raiz.Ubicar.ubicar(grafo, { ancho: ANCHO, altoDe: (n) => altos.get(n.id), sepX: 70, sepY: 22, vertical: this.vertical });
      this.pos = res.pos;
      this.tam = { ancho: res.ancho, alto: res.alto };
      this.capaAristas.textContent = '';
      this.capaNodos.textContent = '';
      this.elNodos = new Map();
      this.elAristas = [];

      for (const n of grafo.nodos) {
        const p = this.pos.get(n.id);
        n.siguientes.forEach((s) => {
          const q = this.pos.get(s.a);
          if (!q) return;
          const vuelve = res.atras.has(n.id + '>' + s.a) || (this.vertical ? q.y <= p.y : q.x <= p.x);
          this._arista(n, s, p, q, vuelve);
        });
      }
      for (const n of grafo.nodos) {
        const p = this.pos.get(n.id);
        const fo = el(SVG, 'foreignObject', { x: p.x, y: p.y, width: p.w, height: p.h, class: 'fo' }, this.capaNodos);
        const caja = cajas.get(n.id);
        fo.appendChild(caja);
        caja.addEventListener('click', (ev) => {
          if (this._arrastro) return;
          ev.stopPropagation();
          this.seleccionar(n.id, false);
        });
        this.elNodos.set(n.id, caja);
      }

      if (this.seleccion && !grafo.porId.has(this.seleccion)) this.seleccion = null;
      this._marcarSeleccion();
    }

    _arista(origen, s, p, q, vuelve) {
      if (this.vertical) return this._aristaVertical(origen, s, p, q, vuelve);
      const x1 = p.x + p.w;
      const y1 = p.y + Math.min(p.h / 2, 36);
      const x2 = q.x;
      const y2 = q.y + Math.min(q.h / 2, 36);
      let d;
      let medio;
      if (!vuelve) {
        const dx = Math.max(30, (x2 - x1) / 2);
        d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
        medio = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
      } else {
        // Vuelve para atrás: un arco por arriba
        const arriba = Math.min(p.y, q.y) - 34;
        d = `M${x1},${y1} C${x1 + 60},${y1} ${x1 + 60},${arriba} ${x1},${arriba} L${x2},${arriba} C${x2 - 60},${arriba} ${x2 - 60},${y2} ${x2},${y2}`;
        medio = { x: (x1 + x2) / 2, y: arriba };
      }
      this._trazar(origen, s, d, medio, vuelve);
    }

    _aristaVertical(origen, s, p, q, vuelve) {
      let d;
      let medio;
      if (!vuelve) {
        // De abajo de una caja a arriba de la otra
        const x1 = p.x + p.w / 2;
        const y1 = p.y + p.h;
        const x2 = q.x + q.w / 2;
        const y2 = q.y;
        const dy = Math.max(24, (y2 - y1) / 2);
        d = `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
        medio = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
      } else {
        // Vuelve para arriba: un arco por el costado derecho
        const x1 = p.x + p.w;
        const y1 = p.y + p.h / 2;
        const x2 = q.x + q.w;
        const y2 = q.y + q.h / 2;
        const lado = Math.max(x1, x2) + 34;
        d = `M${x1},${y1} C${lado},${y1} ${lado},${y1} ${lado},${y1 - 20} L${lado},${y2 + 20} C${lado},${y2} ${lado},${y2} ${x2},${y2}`;
        medio = { x: lado, y: (y1 + y2) / 2 };
      }
      this._trazar(origen, s, d, medio, vuelve);
    }

    _trazar(origen, s, d, medio, vuelve) {
      const g = el(SVG, 'g', { class: 'arista' + (vuelve ? ' vuelve' : '') + (s.condicion ? ' condicional' : '') }, this.capaAristas);
      el(SVG, 'path', { d, 'marker-end': 'url(#flecha)' }, g);
      if (s.condicion) {
        const texto = s.condicion.length > 34 ? s.condicion.slice(0, 33) + '…' : s.condicion;
        const ancho = texto.length * 6.4 + 14;
        const t = el(SVG, 'g', { class: 'rotulo', transform: `translate(${medio.x - ancho / 2},${medio.y - 10})` }, g);
        el(SVG, 'rect', { width: ancho, height: 20, rx: 10 }, t);
        const tx = el(SVG, 'text', { x: ancho / 2, y: 14, 'text-anchor': 'middle' }, t);
        tx.textContent = texto;
        const titulo = el(SVG, 'title', null, t);
        titulo.textContent = s.condicion;
      }
      this.elAristas.push({ g, de: origen.id, a: s.a });
    }

    _crearCaja(n, padre) {
      const caja = div('nodo tipo-' + n.tipo, null, padre);
      caja.style.setProperty('--color', n.color);
      caja.dataset.id = n.id;

      if (n.tipo === 'inicio') {
        div('inicio-texto', '▶ Inicio', caja);
      } else if (n.tipo === 'opcion') {
        div('cuadro', '?', caja);
        const cuerpo = div('cuerpo', null, caja);
        div('quien', 'Elección', cuerpo);
        div('texto una-linea', n.texto, cuerpo);
        if (n.condicion) div('condicion', '❓ si ' + n.condicion, cuerpo);
      } else if (n.tipo === 'accion') {
        div('cuadro', '⚙', caja);
        const cuerpo = div('cuerpo', null, caja);
        div('quien', 'Acción', cuerpo);
        this._extras(n, cuerpo, true);
      } else if (n.tipo === 'falta') {
        div('cuadro', '!', caja);
        const cuerpo = div('cuerpo', null, caja);
        div('quien', 'Salto roto', cuerpo);
        div('texto una-linea', n.texto, cuerpo);
      } else if (n.tipo === 'bloque') {
        const cuerpo = div('cuerpo', null, caja);
        const tope = this.completo ? n.lineas.length : MAX_LINEAS_BLOQUE;
        n.lineas.slice(0, tope).forEach((l) => {
          const fila = div('linea-bloque', null, cuerpo);
          const punto = div('punto', null, fila);
          punto.style.background = l.color;
          const t = div('texto una-linea', null, fila);
          if (l.personaje) {
            const b = el(HTML, 'b', null, t);
            b.textContent = l.personaje + ': ';
          }
          t.appendChild(document.createTextNode(l.texto));
        });
        if (n.lineas.length > tope) div('mas', '+ ' + (n.lineas.length - tope) + ' líneas más', cuerpo);
        if (n.extras.length) this._extras(n, cuerpo);
      } else {
        div('cuadro', inicial(n.personaje), caja);
        const cuerpo = div('cuerpo', null, caja);
        div('quien', n.personaje || 'Narrador', cuerpo);
        div('texto', n.texto, cuerpo);
        if (n.extras.length) this._extras(n, cuerpo);
      }

      if (!n.siguientes.length && n.tipo !== 'falta') {
        const fin = div('fin', '🏁', caja);
        fin.title = 'Final';
      }
      return caja;
    }

    _extras(n, padre, largo) {
      const fila = div('extras', null, padre);
      for (const e of n.extras.slice(0, 8)) {
        const chip = div('chip', largo ? icono(e.tipo) + ' ' + e.valor : icono(e.tipo), fila);
        chip.title = nombreExtra(e.tipo) + ': ' + e.valor;
      }
      if (n.extras.length > 8) div('chip', '+' + (n.extras.length - 8), fila);
    }

    // ------------------------------------------------------- selección

    seleccionar(id, centrar) {
      this.seleccion = id;
      this._marcarSeleccion();
      if (id && centrar) this.centrarEn(id);
      this.alSeleccionar(id ? this.grafo.porId.get(id) : null);
    }

    _marcarSeleccion() {
      const id = this.seleccion;
      this.svg.classList.toggle('con-seleccion', !!id);
      for (const [nid, caja] of this.elNodos) {
        caja.classList.toggle('elegido', nid === id);
        const vecino = id && this.grafo.porId.get(id);
        caja.classList.toggle('vecino', !!vecino && nid !== id && (vecino.anteriores.includes(nid) || vecino.siguientes.some((s) => s.a === nid)));
      }
      for (const a of this.elAristas) {
        const activa = !!id && (a.de === id || a.a === id);
        a.g.classList.toggle('activa', activa);
        a.g.querySelector('path').setAttribute('marker-end', activa ? 'url(#flecha-activa)' : 'url(#flecha)');
        if (activa) this.capaAristas.appendChild(a.g);
      }
    }

    // --------------------------------------------------- vista y zoom

    _aplicar() {
      const { x, y, k } = this.vista;
      this.mundo.setAttribute('transform', `translate(${x},${y}) scale(${k})`);
      this.svg.style.setProperty('--zoom', k);
      if (this.alMoverVista) this.alMoverVista(this.vista);
    }

    zoom(factor, cx, cy) {
      const r = this.svg.getBoundingClientRect();
      if (cx == null) {
        cx = r.width / 2;
        cy = r.height / 2;
      }
      const k = Math.min(2.5, Math.max(0.08, this.vista.k * factor));
      const f = k / this.vista.k;
      this.vista.x = cx - (cx - this.vista.x) * f;
      this.vista.y = cy - (cy - this.vista.y) * f;
      this.vista.k = k;
      this._aplicar();
    }

    ajustar() {
      if (!this.tam) return;
      const r = this.svg.getBoundingClientRect();
      const margen = 40;
      const k = Math.min(1.1, Math.max(0.08, Math.min((r.width - margen * 2) / Math.max(1, this.tam.ancho), (r.height - margen * 2) / Math.max(1, this.tam.alto))));
      this.vista = { k, x: (r.width - this.tam.ancho * k) / 2, y: Math.max(margen, (r.height - this.tam.alto * k) / 2) };
      this._aplicar();
    }

    /** Muestra el principio de la historia a un tamaño cómodo de leer. */
    alInicio() {
      const p = this.pos && this.grafo && this.pos.get(this.grafo.inicio);
      if (!p) return;
      const r = this.svg.getBoundingClientRect();
      const k = r.width < 600 ? 0.65 : 0.9;
      this.vista = this.vertical
        ? { k, x: r.width / 2 - (p.x + p.w / 2) * k, y: 24 - p.y * k }
        : { k, x: 24 - p.x * k, y: r.height / 2 - (p.y + p.h / 2) * k };
      this._aplicar();
    }

    centrarEn(id) {
      const p = this.pos.get(id);
      if (!p) return;
      const r = this.svg.getBoundingClientRect();
      const k = Math.max(this.vista.k, 0.7);
      this.vista = { k, x: r.width / 2 - (p.x + p.w / 2) * k, y: r.height / 2 - (p.y + p.h / 2) * k };
      this.mundo.classList.add('animando');
      this._aplicar();
      setTimeout(() => this.mundo.classList.remove('animando'), 320);
    }

    _moverYZoom() {
      const svg = this.svg;
      const punteros = new Map();
      let inicio = null;
      let pellizco = null;

      svg.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        const r = svg.getBoundingClientRect();
        // Pellizco del touchpad (llega con ctrl) o rueda del mouse: zoom.
        // Dos dedos en el touchpad (pasos chicos, con deltaX): mover.
        const esRueda = ev.deltaMode === 1 || (ev.deltaX === 0 && Math.abs(ev.deltaY) >= 50);
        if (ev.ctrlKey || ev.metaKey || (esRueda && !ev.shiftKey)) {
          this.zoom(Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0018)), ev.clientX - r.left, ev.clientY - r.top);
        } else if (ev.shiftKey && esRueda) {
          this.vista.x -= ev.deltaY;
          this._aplicar();
        } else {
          this.vista.x -= ev.deltaX;
          this.vista.y -= ev.deltaY;
          this._aplicar();
        }
      }, { passive: false });

      svg.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0 && ev.pointerType === 'mouse') return;
        punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        this._arrastro = false;
        if (punteros.size === 1) inicio = { x: ev.clientX, y: ev.clientY, vx: this.vista.x, vy: this.vista.y };
        if (punteros.size === 2) {
          const [a, b] = Array.from(punteros.values());
          pellizco = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.vista.k };
        }
      });
      svg.addEventListener('pointermove', (ev) => {
        if (!punteros.has(ev.pointerId)) return;
        punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (punteros.size === 2 && pellizco) {
          const [a, b] = Array.from(punteros.values());
          const r = svg.getBoundingClientRect();
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          this.zoom((pellizco.k * d) / pellizco.d / this.vista.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
          this._arrastro = true;
          return;
        }
        if (!inicio) return;
        const dx = ev.clientX - inicio.x;
        const dy = ev.clientY - inicio.y;
        if (!this._arrastro && Math.hypot(dx, dy) < 5) return;
        if (!this._arrastro) svg.setPointerCapture(ev.pointerId);
        this._arrastro = true;
        svg.classList.add('arrastrando');
        this.vista.x = inicio.vx + dx;
        this.vista.y = inicio.vy + dy;
        this._aplicar();
      });
      const soltar = (ev) => {
        punteros.delete(ev.pointerId);
        if (punteros.size < 2) pellizco = null;
        if (punteros.size === 0) {
          inicio = null;
          svg.classList.remove('arrastrando');
          setTimeout(() => (this._arrastro = false), 0);
        }
      };
      svg.addEventListener('pointerup', soltar);
      svg.addEventListener('pointercancel', soltar);
      svg.addEventListener('click', () => {
        if (!this._arrastro && this.seleccion) this.seleccionar(null);
      });
    }
  }

  raiz.Nube = Nube;
  raiz.NubeExtras = { icono, nombreExtra };
})(window);
