/*
 * lector-renpy.js — Lee un guion de Ren'Py y lo convierte en un grafo de diálogo.
 *
 * No entiende TODO Ren'Py, solo lo que importa para los diálogos:
 *   define ... = Character(...)   label   menu   if / elif / else
 *   jump   call   return   $ ...   scene / show / hide / play / stop / with / pause
 *   y las líneas de diálogo:  m "Hola"  |  m feliz "Hola"  |  "Narrador"  |  "Nombre" "Hola"
 * Lo demás (screens, python, transform...) se saltea.
 */
(function (raiz) {
  'use strict';

  const Modelo = raiz.Modelo || (typeof require === 'function' ? require('./modelo.js') : null);
  const { Constructor, conCondicion } = Modelo;

  // ---------------------------------------------------------------- texto

  /** Saca el comentario (#...) de una línea, respetando lo que está entre comillas. */
  function sinComentario(linea) {
    let comilla = null;
    for (let i = 0; i < linea.length; i++) {
      const ch = linea[i];
      if (comilla) {
        if (ch === '\\') i++;
        else if (ch === comilla) comilla = null;
      } else if (ch === '"' || ch === "'") {
        comilla = ch;
      } else if (ch === '#') {
        return linea.slice(0, i);
      }
    }
    return linea;
  }

  /** Parte una línea en palabras y textos entre comillas. */
  function fichas(t) {
    const salida = [];
    let i = 0;
    while (i < t.length) {
      const ch = t[i];
      if (ch === ' ' || ch === '\t') {
        i++;
      } else if (ch === '"' || ch === "'") {
        let j = i + 1;
        let valor = '';
        while (j < t.length && t[j] !== ch) {
          if (t[j] === '\\' && j + 1 < t.length) {
            valor += t[j + 1] === 'n' ? '\n' : t[j + 1];
            j += 2;
          } else {
            valor += t[j++];
          }
        }
        salida.push({ texto: valor });
        i = j + 1;
      } else {
        let j = i;
        while (j < t.length && t[j] !== ' ' && t[j] !== '\t' && t[j] !== '"' && t[j] !== "'") j++;
        salida.push({ palabra: t.slice(i, j) });
        i = j;
      }
    }
    return salida;
  }

  /** Saca las etiquetas de formato de Ren'Py ({b}, {w}, {color=...}) para mostrar el texto limpio. */
  function limpiarTexto(s) {
    return s.replace(/\{\{/g, '\u0000').replace(/\{\/?[a-z]+(=[^}]*)?\}/g, '').replace(/\u0000/g, '{').trim();
  }

  // --------------------------------------------------------------- líneas

  /** Convierte el texto en un árbol según la sangría. */
  function arbolDeLineas(texto) {
    const raizA = { sangria: -1, hijos: [] };
    const pila = [raizA];
    texto.split(/\r?\n/).forEach((original, i) => {
      const linea = sinComentario(original.replace(/\t/g, '    '));
      if (!linea.trim()) return;
      const sangria = linea.length - linea.trimStart().length;
      const nodo = { sangria, t: linea.trim(), linea: i + 1, hijos: [] };
      while (pila[pila.length - 1].sangria >= sangria) pila.pop();
      pila[pila.length - 1].hijos.push(nodo);
      pila.push(nodo);
    });
    return raizA;
  }

  function recorrer(nodo, fn) {
    for (const h of nodo.hijos) {
      fn(h);
      recorrer(h, fn);
    }
  }

  // ------------------------------------------------------- reconocedores

  const RE_LABEL = /^label\s+([\w.]+)\s*(\([^)]*\))?\s*(hide\s*)?:$/;
  const RE_DEFINE_PERSONAJE = /^define\s+([\w.]+)\s*=\s*(?:Character|DynamicCharacter|ADVCharacter|NVLCharacter)\s*\((.*)\)\s*$/;
  const PALABRAS_RESERVADAS = new Set([
    'label', 'menu', 'if', 'elif', 'else', 'while', 'for', 'jump', 'call', 'return', 'pass', 'python', 'init',
    'define', 'default', 'image', 'screen', 'transform', 'style', 'translate', 'scene', 'show', 'hide', 'with',
    'play', 'stop', 'queue', 'voice', 'pause', 'window', 'nvl', 'camera', 'layeredimage', 'testcase', '$',
  ]);
  const BLOQUES_IGNORADOS = /^(init\b|python\b|screen\b|transform\b|style\b|translate\b|image\b|layeredimage\b|testcase\b)/;

  function leerPersonaje(argumentos) {
    const nombre = argumentos.match(/^\s*(?:_\(\s*)?(["'])((?:\\.|(?!\1).)*)\1/);
    const color = argumentos.match(/(?:^|[\s,(])color\s*=\s*["'](#[0-9a-fA-F]{3,8})["']/);
    return {
      nombre: nombre ? nombre[2] : /^\s*None\b/.test(argumentos) ? null : undefined,
      color: color ? color[1] : null,
    };
  }

  /** Si la línea es un diálogo, devuelve { quien, nombreLiteral, atributos, texto }. */
  function leerDialogo(t) {
    const fs = fichas(t);
    const primera = fs.findIndex((f) => f.texto !== undefined);
    if (primera < 0) return null;
    const antes = fs.slice(0, primera);
    if (!antes.every((f) => /^[A-Za-z_][\w.]*$/.test(f.palabra))) return null;
    if (antes.length && PALABRAS_RESERVADAS.has(antes[0].palabra)) return null;

    let nombreLiteral = null;
    let texto = fs[primera].texto;
    let resto = fs.slice(primera + 1);
    if (!antes.length && resto[0] && resto[0].texto !== undefined) {
      nombreLiteral = texto;
      texto = resto[0].texto;
      resto = resto.slice(1);
    }
    if (resto.some((f) => f.texto !== undefined)) return null;
    const restoTexto = resto.map((f) => f.palabra).join(' ');
    if (restoTexto.endsWith(':')) return null; // es una opción de menú, no un diálogo
    const transicion = restoTexto.match(/\bwith\s+(\S+)/);
    return {
      quien: antes.length ? antes[0].palabra : null,
      atributos: antes.slice(1).map((f) => f.palabra),
      nombreLiteral,
      texto,
      transicion: transicion ? transicion[1] : null,
    };
  }

  /** Si la línea es una opción de menú ("Texto" if algo:), devuelve { texto, condicion }. */
  function leerOpcion(t) {
    if (!/^["']/.test(t) || !t.endsWith(':')) return null;
    const fs = fichas(t.slice(0, -1));
    if (!fs.length || fs[0].texto === undefined) return null;
    const resto = fs.slice(1).map((f) => (f.texto !== undefined ? JSON.stringify(f.texto) : f.palabra)).join(' ');
    const m = resto.match(/^(?:\([^)]*\))?\s*(?:if\s+(.+))?$/);
    if (!m) return null;
    return { texto: fs[0].texto, condicion: m[1] ? m[1].trim() : null };
  }

  /** Comandos que no son diálogo pero queremos mostrar como "extras" del nodo. */
  function leerExtra(t) {
    let m;
    if ((m = t.match(/^\$\s*(.*)$/))) return { tipo: 'codigo', valor: m[1] };
    if ((m = t.match(/^scene\s+(.+)$/))) return { tipo: 'escena', valor: m[1] };
    if ((m = t.match(/^show\s+(.+)$/))) return { tipo: 'mostrar', valor: m[1] };
    if ((m = t.match(/^hide\s+(.+)$/))) return { tipo: 'ocultar', valor: m[1] };
    if ((m = t.match(/^play\s+music\s+(.+)$/))) return { tipo: 'musica', valor: m[1] };
    if ((m = t.match(/^play\s+\w+\s+(.+)$/))) return { tipo: 'sonido', valor: m[1] };
    if ((m = t.match(/^queue\s+\w+\s+(.+)$/))) return { tipo: 'musica', valor: m[1] };
    if ((m = t.match(/^stop\s+(.+)$/))) return { tipo: 'detener', valor: m[1] };
    if ((m = t.match(/^voice\s+(.+)$/))) return { tipo: 'voz', valor: m[1] };
    if ((m = t.match(/^with\s+(.+)$/))) return { tipo: 'transicion', valor: m[1] };
    if ((m = t.match(/^pause\b\s*(.*)$/))) return { tipo: 'pausa', valor: m[1] || '' };
    if (/^(window|nvl|camera)\b/.test(t)) return { tipo: 'otro', valor: t };
    return null;
  }

  // -------------------------------------------------------------- lector

  function leer(texto) {
    const c = new Constructor('renpy');
    const arbol = arbolDeLineas(texto);
    let avisoCall = false;

    // 1) Personajes (pueden estar en cualquier lado, incluso dentro de init:)
    recorrer(arbol, (n) => {
      const m = n.t.match(RE_DEFINE_PERSONAJE);
      if (!m) return;
      const p = leerPersonaje(m[2]);
      if (p.nombre === undefined) c.definirPersonaje(m[1], m[1], p.color);
      else c.definirPersonaje(m[1], p.nombre, p.color);
    });

    // 2) Labels de primer nivel, en orden
    const labels = [];
    let global = null;
    for (const n of arbol.hijos) {
      const m = n.t.match(RE_LABEL);
      if (m) {
        let nombre = m[1];
        if (nombre.startsWith('.')) nombre = (global || '') + nombre;
        else global = nombre.split('.')[0];
        labels.push({ nombre, global: nombre.split('.')[0], nodo: n });
      } else if (!BLOQUES_IGNORADOS.test(n.t) && !/^(define|default)\b/.test(n.t) && (leerDialogo(n.t) || /^menu\b/.test(n.t))) {
        c.aviso(n.linea, 'Esta línea está fuera de un label, así que no se puede llegar a ella.');
      }
    }

    const nombreSalto = (destino, ctx) => (destino.startsWith('.') ? ctx.global + destino : destino);

    // --- convierte una lista de líneas (un bloque) en nodos, de atrás para adelante
    function compilarBloque(lineas, siguiente, ctx) {
      const items = [];
      let pendientes = [];
      const tomarExtras = () => {
        const e = pendientes;
        pendientes = [];
        return e;
      };

      for (let i = 0; i < lineas.length; i++) {
        const s = lineas[i];
        const t = s.t;
        let m;

        if ((m = t.match(/^if\s+(.+):$/))) {
          const ramas = [{ condicion: m[1].trim(), hijos: s.hijos, linea: s.linea }];
          while (i + 1 < lineas.length) {
            const otra = lineas[i + 1].t;
            const me = otra.match(/^elif\s+(.+):$/);
            if (me) ramas.push({ condicion: me[1].trim(), hijos: lineas[i + 1].hijos });
            else if (/^else\s*:$/.test(otra)) ramas.push({ condicion: null, hijos: lineas[i + 1].hijos });
            else break;
            i++;
            if (ramas[ramas.length - 1].condicion === null) break;
          }
          items.push({ k: 'si', ramas, linea: s.linea, extras: tomarExtras() });
        } else if ((m = t.match(/^(?:elif\s+(.+)|else\s*):$/))) {
          c.aviso(s.linea, '"' + t + '" sin un "if" antes.');
        } else if ((m = t.match(/^(while|for)\s+(.+):$/))) {
          c.aviso(s.linea, 'Los "' + m[1] + '" se muestran como si se recorrieran una sola vez.');
          items.push({ k: 'si', ramas: [{ condicion: m[1] + ' ' + m[2], hijos: s.hijos }], linea: s.linea, extras: tomarExtras() });
        } else if (/^menu(\s+[\w.]+)?\s*(\(.*\))?\s*:$/.test(t)) {
          items.push({ k: 'menu', hijos: s.hijos, linea: s.linea, extras: tomarExtras() });
        } else if ((m = t.match(/^jump\s+(.+)$/))) {
          if (/^expression\b/.test(m[1])) {
            c.aviso(s.linea, 'No podemos seguir un "jump expression": el destino se calcula al jugar.');
            items.push({ k: 'fin', linea: s.linea, extras: tomarExtras() });
          } else {
            items.push({ k: 'salto', destino: nombreSalto(m[1].trim(), ctx), linea: s.linea, extras: tomarExtras() });
          }
          break; // lo que sigue después de un jump no se alcanza
        } else if ((m = t.match(/^call\s+([\w.]+)/))) {
          if (!avisoCall) {
            c.aviso(s.linea, 'Los "call" se muestran como saltos (no dibujamos la vuelta con "return").');
            avisoCall = true;
          }
          items.push({ k: 'salto', destino: nombreSalto(m[1], ctx), linea: s.linea, extras: tomarExtras() });
          break;
        } else if (/^return\b/.test(t)) {
          items.push({ k: 'fin', linea: s.linea, extras: tomarExtras() });
          break;
        } else if (/^(init\s+)?python\b.*:$/.test(t)) {
          pendientes.push({ tipo: 'codigo', valor: 'bloque de python (' + s.hijos.length + ' líneas)' });
        } else if (/^pass$/.test(t) || /^(define|default)\b/.test(t)) {
          // nada
        } else if (RE_LABEL.test(t)) {
          c.aviso(s.linea, 'Label dentro de otro bloque: lo ignoramos.');
        } else {
          const extra = leerExtra(t);
          if (extra) {
            pendientes.push(extra);
            continue;
          }
          const d = leerDialogo(t);
          if (d) {
            if (d.quien === 'extend') d.quien = ctx.ultimoQuien;
            else ctx.ultimoQuien = d.quien;
            const p = d.nombreLiteral != null ? c.personaje(d.nombreLiteral) : d.quien === 'centered' ? c.personaje(null) : c.personaje(d.quien);
            const extras = tomarExtras();
            if (d.atributos.length) extras.push({ tipo: 'cara', valor: d.atributos.join(' ') });
            if (d.transicion) extras.push({ tipo: 'transicion', valor: d.transicion });
            items.push({ k: 'dialogo', personaje: p.nombre, color: p.color, texto: limpiarTexto(d.texto), linea: s.linea, extras });
          } else {
            pendientes.push({ tipo: 'otro', valor: t });
          }
        }
      }
      if (pendientes.length) items.push({ k: 'accion', linea: lineas[lineas.length - 1].linea, extras: tomarExtras() });

      let sig = siguiente;
      for (let i = items.length - 1; i >= 0; i--) sig = compilarItem(items[i], sig, ctx);
      return sig;
    }

    function compilarItem(it, sig, ctx) {
      if (it.k === 'dialogo') {
        const n = c.nodo({ tipo: 'dialogo', personaje: it.personaje, color: it.color, texto: it.texto, extras: it.extras, linea: it.linea, siguientes: sig });
        return [{ a: n.id }];
      }
      if (it.k === 'accion') {
        const n = c.nodo({ tipo: 'accion', texto: '', extras: it.extras, linea: it.linea, siguientes: sig });
        return [{ a: n.id }];
      }

      let r;
      let extrasUsados = false;
      if (it.k === 'salto') {
        r = [{ salto: it.destino, linea: it.linea }];
      } else if (it.k === 'fin') {
        r = [];
      } else if (it.k === 'si') {
        r = [];
        for (const rama of it.ramas) {
          const entradas = compilarBloque(rama.hijos, sig, ctx);
          r.push(...conCondicion(entradas, rama.condicion === null ? 'si no' : rama.condicion));
        }
        if (it.ramas[it.ramas.length - 1].condicion !== null) r.push(...conCondicion(sig, 'si no'));
      } else if (it.k === 'menu') {
        const opciones = [];
        let pregunta = null;
        for (const h of it.hijos) {
          const o = leerOpcion(h.t);
          if (o) {
            opciones.push(Object.assign(o, { hijos: h.hijos, linea: h.linea }));
            continue;
          }
          const d = !h.hijos.length && leerDialogo(h.t);
          if (d && !pregunta) {
            const p = d.nombreLiteral != null ? c.personaje(d.nombreLiteral) : c.personaje(d.quien);
            pregunta = { personaje: p.nombre, color: p.color, texto: limpiarTexto(d.texto), linea: h.linea };
          } else if (!/^set\s/.test(h.t)) {
            c.aviso(h.linea, 'No entendimos esta línea dentro del menu.');
          }
        }
        if (!opciones.length) c.aviso(it.linea, 'Menu sin opciones.');
        const aristas = opciones.map((o) => {
          const cuerpo = o.hijos.length ? compilarBloque(o.hijos, sig, ctx) : sig;
          const n = c.nodo({ tipo: 'opcion', texto: limpiarTexto(o.texto), condicion: o.condicion, linea: o.linea, siguientes: cuerpo, color: '#c03ad6' });
          return { a: n.id };
        });
        if (pregunta) {
          const n = c.nodo(Object.assign({ tipo: 'dialogo', extras: it.extras, siguientes: aristas }, pregunta));
          extrasUsados = true;
          r = [{ a: n.id }];
        } else {
          r = aristas;
        }
      }

      if (it.extras.length && !extrasUsados) {
        const n = c.nodo({ tipo: 'accion', texto: '', extras: it.extras, linea: it.linea, siguientes: r });
        return [{ a: n.id }];
      }
      return r;
    }

    // 3) Convertimos cada label. Si un label termina sin jump, sigue con el de abajo.
    const entradas = new Map();
    labels.forEach((l, i) => {
      const siguiente = i + 1 < labels.length ? [{ salto: labels[i + 1].nombre, linea: l.nodo.linea }] : [];
      c.empezarCapitulo(l.global);
      entradas.set(l.nombre, compilarBloque(l.nodo.hijos, siguiente, { global: l.global, ultimoQuien: null }));
    });

    const primero = entradas.has('start') ? 'start' : labels.length ? labels[0].nombre : null;
    if (!labels.length) c.aviso(null, 'No encontramos ningún "label". En Ren\'Py la historia arranca en "label start:".');
    else if (!entradas.has('start')) c.aviso(null, 'No hay "label start:", arrancamos por "' + primero + '".');

    const inicio = c.nodo({ tipo: 'inicio', texto: 'Inicio', linea: primero ? labels.find((l) => l.nombre === primero).nodo.linea : null, siguientes: primero ? [{ salto: primero }] : [] });

    c.resolverSaltos((a) => (entradas.has(a.salto) ? entradas.get(a.salto) : null));
    const grafo = c.terminar(inicio.id);
    grafo.etiquetas = labels.map((l) => ({ nombre: l.nombre, linea: l.nodo.linea }));
    return grafo;
  }

  /** ¿Este texto parece Ren'Py? */
  function pareceRenpy(texto) {
    return /^\s*label\s+[\w.]+\s*(\([^)]*\))?\s*:/m.test(texto) || /=\s*Character\s*\(/.test(texto);
  }

  const LectorRenpy = { leer, pareceRenpy };
  raiz.LectorRenpy = LectorRenpy;
  if (typeof module !== 'undefined' && module.exports) module.exports = LectorRenpy;
})(typeof window !== 'undefined' ? window : globalThis);
