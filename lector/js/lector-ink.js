/*
 * lector-ink.js — Lee una historia de Ink y la convierte en un grafo de diálogo.
 *
 * Entiende lo principal de Ink:
 *   === nudo ===    = puntada    -> desvío    -> END / DONE
 *   * opción   + opción fija   * * opción anidada   - reunión (gather)
 *   * {condición} [texto]      ~ código      # etiquetas
 *   { condición:  ...  - else: ... }   (bloques condicionales de varias líneas)
 * Por costumbre, una línea "NOMBRE: texto" se toma como dicha por NOMBRE.
 */
(function (raiz) {
  'use strict';

  const Modelo = raiz.Modelo || (typeof require === 'function' ? require('./modelo.js') : null);
  const { Constructor, conCondicion } = Modelo;

  // ---------------------------------------------------------------- texto

  /** Saca comentarios // y /* *\/ de todo el texto, manteniendo los números de línea. */
  function sinComentarios(texto) {
    let salida = '';
    let i = 0;
    while (i < texto.length) {
      if (texto.startsWith('/*', i)) {
        const fin = texto.indexOf('*/', i + 2);
        const trozo = fin < 0 ? texto.slice(i) : texto.slice(i, fin + 2);
        salida += trozo.replace(/[^\n]/g, '');
        i += trozo.length;
      } else if (texto.startsWith('//', i) && texto[i - 1] !== ':') {
        while (i < texto.length && texto[i] !== '\n') i++;
      } else {
        salida += texto[i++];
      }
    }
    return salida;
  }

  /** Separa "texto #tag1 #clave:valor" en texto y etiquetas. */
  function separarEtiquetas(t) {
    const partes = t.split('#');
    return {
      texto: partes[0].trim(),
      extras: partes
        .slice(1)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          const m = p.match(/^([\wáéíóúñ-]+)\s*:\s*(.+)$/i);
          return m ? { tipo: m[1].toLowerCase(), valor: m[2].trim() } : { tipo: 'etiqueta', valor: p };
        }),
    };
  }

  /** Separa "texto -> destino" en texto y desvío. */
  function separarDesvio(t) {
    const m = t.match(/^(.*?)\s*->\s*([\w.]+)\s*(->)?\s*$/);
    if (!m || t.includes('->->')) return { texto: t.replace(/->->\s*$/, '').trim(), desvio: null, tunel: t.includes('->->') };
    return { texto: m[1].trim(), desvio: m[2], tunel: !!m[3] };
  }

  /** "MICA: hola" -> { personaje: 'MICA', texto: 'hola' } */
  function separarPersonaje(t) {
    const m = t.match(/^([A-ZÁÉÍÓÚÑÜ][\wÁÉÍÓÚÑÜáéíóúñü .'-]{0,29}?)\s*:\s+(.+)$/);
    return m ? { personaje: m[1].trim(), texto: m[2].trim() } : { personaje: null, texto: t };
  }

  function limpiar(t) {
    return t.replace(/<>/g, '').replace(/\s+/g, ' ').trim();
  }

  /** ¿Las llaves de esta línea quedan abiertas? Devuelve la diferencia. */
  function balanceLlaves(t) {
    let b = 0;
    for (const ch of t) {
      if (ch === '{') b++;
      else if (ch === '}') b--;
    }
    return b;
  }

  // ---------------------------------------------------------------- lector

  function leer(texto) {
    const c = new Constructor('ink');
    const lineas = sinComentarios(texto)
      .split(/\r?\n/)
      .map((t, i) => ({ t: t.trim(), linea: i + 1 }))
      .filter((l) => l.t);

    // 1) Partimos en: contenido de arriba, nudos y puntadas
    const arriba = [];
    const nudos = []; // { nombre, lineas, puntadas: [{ nombre, lineas }], linea }
    let destino = arriba;
    let nudoActual = null;
    let enFuncion = false;
    for (const l of lineas) {
      let m;
      if ((m = l.t.match(/^={2,}\s*(function\s+)?([\w]+)\s*(\([^)]*\))?\s*=*\s*$/))) {
        enFuncion = !!m[1];
        if (enFuncion) continue;
        nudoActual = { nombre: m[2], lineas: [], puntadas: [], linea: l.linea };
        nudos.push(nudoActual);
        destino = nudoActual.lineas;
      } else if (enFuncion) {
        continue;
      } else if ((m = l.t.match(/^=\s*([\w]+)\s*(\([^)]*\))?\s*$/)) && nudoActual) {
        const p = { nombre: m[1], lineas: [], linea: l.linea };
        nudoActual.puntadas.push(p);
        destino = p.lineas;
      } else if (/^(VAR|CONST|LIST|EXTERNAL|INCLUDE)\b/.test(l.t)) {
        if (/^INCLUDE\b/.test(l.t)) c.aviso(l.linea, 'Los INCLUDE no se leen: pegá acá el otro archivo si lo necesitás.');
      } else {
        destino.push(l);
      }
    }

    // 2) Cada línea pasa a ser un "item"
    function leerItems(ls) {
      const items = [];
      for (let i = 0; i < ls.length; i++) {
        const l = ls[i];
        const t = l.t;
        let m;

        // Bloque condicional de varias líneas: { cond: ... - else: ... }
        if (t.startsWith('{') && balanceLlaves(t) > 0) {
          let prof = balanceLlaves(t);
          const internas = [];
          let j = i + 1;
          while (j < ls.length && prof > 0) {
            prof += balanceLlaves(ls[j].t);
            if (prof > 0) internas.push(ls[j]);
            else {
              const antesDeCerrar = ls[j].t.replace(/}\s*$/, '').trim();
              if (antesDeCerrar) internas.push({ t: antesDeCerrar, linea: ls[j].linea });
            }
            j++;
          }
          const cabeza = t.slice(1).trim();
          const ramas = [];
          let rama = null;
          if (cabeza) {
            const mc = cabeza.match(/^(.+?):\s*(.*)$/);
            if (mc) {
              rama = { condicion: mc[1].trim(), lineas: [] };
              if (mc[2]) rama.lineas.push({ t: mc[2], linea: l.linea });
              ramas.push(rama);
            }
          }
          for (const li of internas) {
            const mr = li.t.match(/^-\s*(else|[^:]+?)\s*:\s*(.*)$/);
            if (mr && !li.t.startsWith('->')) {
              rama = { condicion: mr[1] === 'else' ? null : mr[1].trim(), lineas: [] };
              if (mr[2]) rama.lineas.push({ t: mr[2], linea: li.linea });
              ramas.push(rama);
            } else if (rama) {
              rama.lineas.push(li);
            }
          }
          if (!ramas.length) c.aviso(l.linea, 'No entendimos este bloque { }: lo mostramos como texto.');
          items.push({ k: 'cond', ramas: ramas.map((r) => ({ condicion: r.condicion, items: leerItems(r.lineas) })), linea: l.linea });
          i = j - 1;
          continue;
        }

        if ((m = t.match(/^~\s*(.*)$/))) {
          items.push({ k: 'codigo', valor: m[1], linea: l.linea });
        } else if ((m = t.match(/^((?:[*+]\s*)+)(.*)$/))) {
          const marcas = m[1].replace(/\s/g, '');
          let resto = m[2].trim();
          let etiqueta = null;
          const me = resto.match(/^\(\s*([\w]+)\s*\)\s*(.*)$/);
          if (me) {
            etiqueta = me[1];
            resto = me[2];
          }
          const condiciones = [];
          let mc;
          while ((mc = resto.match(/^\{([^{}]*)\}\s*(.*)$/))) {
            condiciones.push(mc[1].trim());
            resto = mc[2];
          }
          const { texto: sinTags, extras } = separarEtiquetas(resto);
          const { texto: sinDesvio, desvio } = separarDesvio(sinTags);
          const mb = sinDesvio.match(/^(.*?)\[(.*?)\](.*)$/);
          const antes = mb ? mb[1] : sinDesvio;
          const dentro = mb ? mb[2] : '';
          const despues = mb ? mb[3] : '';
          items.push({
            k: 'opcion',
            nivel: marcas.length,
            fija: marcas[0] === '+',
            etiqueta,
            condicion: condiciones.length ? condiciones.join(' y ') : null,
            boton: limpiar(antes + dentro) || '(sigue)',
            salida: limpiar(antes + despues),
            desvio,
            extras,
            linea: l.linea,
          });
        } else if ((m = t.match(/^((?:-(?!>)\s*)+)(.*)$/))) {
          let resto = m[2].trim();
          let etiqueta = null;
          const me = resto.match(/^\(\s*([\w]+)\s*\)\s*(.*)$/);
          if (me) {
            etiqueta = me[1];
            resto = me[2];
          }
          const { texto: sinTags, extras } = separarEtiquetas(resto);
          const { texto: t2, desvio } = separarDesvio(sinTags);
          items.push({ k: 'reunion', nivel: m[1].replace(/\s/g, '').length, etiqueta, texto: limpiar(t2), desvio, extras, linea: l.linea });
        } else if (/^<-/.test(t)) {
          c.aviso(l.linea, 'Los hilos (<-) no se dibujan.');
        } else if (/^->/.test(t)) {
          const { desvio, tunel } = separarDesvio(t);
          if (tunel) c.aviso(l.linea, 'Los túneles (->->) se muestran como saltos simples.');
          items.push({ k: 'desvio', destino: desvio, linea: l.linea });
        } else {
          const { texto: sinTags, extras } = separarEtiquetas(t);
          const { texto: t2, desvio } = separarDesvio(sinTags);
          items.push({ k: 'texto', texto: limpiar(t2), desvio, extras, linea: l.linea });
        }
      }
      return items;
    }

    // 3) Armamos el "tejido": cada grupo de opciones con su cuerpo y su reunión
    function tejer(items, desde, nivel) {
      const sec = [];
      let i = desde;
      while (i < items.length) {
        const it = items[i];
        if (it.k === 'opcion') {
          if (it.nivel <= nivel) break;
          const n = it.nivel;
          const grupo = { k: 'grupo', opciones: [], reunion: null, linea: it.linea };
          while (i < items.length && items[i].k === 'opcion' && items[i].nivel === n) {
            const op = items[i];
            const r = tejer(items, i + 1, n);
            op.cuerpo = r.sec;
            i = r.i;
            grupo.opciones.push(op);
          }
          if (i < items.length && items[i].k === 'reunion' && items[i].nivel <= n && items[i].nivel > nivel) {
            grupo.reunion = items[i];
            i++;
          }
          sec.push(grupo);
        } else if (it.k === 'reunion' && it.nivel <= nivel) {
          break;
        } else {
          if (it.k === 'cond') for (const r of it.ramas) r.sec = tejer(r.items, 0, 0).sec;
          sec.push(it);
          i++;
        }
      }
      return { sec, i };
    }

    const entradas = new Map(); // 'nudo', 'nudo.puntada', 'nudo.etiqueta' -> aristas

    const salto = (destino, ctx, linea) => {
      if (destino === 'END' || destino === 'DONE') return [];
      return [{ salto: destino, ctx: ctx.nudo, linea }];
    };

    function nodoTexto(texto, extras, linea, siguientes) {
      const sp = separarPersonaje(texto);
      const p = c.personaje(sp.personaje);
      return c.nodo({ tipo: 'dialogo', personaje: p.nombre, color: p.color, texto: sp.texto, extras, linea, siguientes });
    }

    // 4) Convertimos de atrás para adelante
    function compilar(sec, siguiente, ctx) {
      // Los "~ código" se pegan al nodo que viene después
      const items = [];
      let pendientes = [];
      for (const it of sec) {
        if (it.k === 'codigo') {
          pendientes.push({ tipo: 'codigo', valor: it.valor });
          continue;
        }
        items.push(Object.assign({}, it, { previos: pendientes }));
        pendientes = [];
      }
      if (pendientes.length) items.push({ k: 'accion', previos: pendientes, linea: sec[sec.length - 1].linea });

      let sig = siguiente;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        let r;
        let usados = false;
        if (it.k === 'texto') {
          const sigs = it.desvio ? salto(it.desvio, ctx, it.linea) : sig;
          if (it.texto) {
            r = [{ a: nodoTexto(it.texto, it.previos.concat(it.extras), it.linea, sigs).id }];
            usados = true;
          } else {
            r = sigs;
          }
        } else if (it.k === 'accion') {
          r = [{ a: c.nodo({ tipo: 'accion', extras: it.previos, linea: it.linea, siguientes: sig }).id }];
          usados = true;
        } else if (it.k === 'desvio') {
          r = it.destino ? salto(it.destino, ctx, it.linea) : [];
        } else if (it.k === 'reunion') {
          r = reunion(it, sig, ctx);
        } else if (it.k === 'cond') {
          r = [];
          for (const rama of it.ramas) r.push(...conCondicion(compilar(rama.sec, sig, ctx), rama.condicion === null ? 'si no' : rama.condicion));
          if (!it.ramas.length || it.ramas[it.ramas.length - 1].condicion !== null) r.push(...conCondicion(sig, 'si no'));
        } else if (it.k === 'grupo') {
          const despues = it.reunion ? reunion(it.reunion, sig, ctx) : sig;
          r = it.opciones.map((op) => {
            const cuerpo = op.desvio ? salto(op.desvio, ctx, op.linea) : compilar(op.cuerpo || [], despues, ctx);
            const continua = op.salida ? [{ a: nodoTexto(op.salida, [], op.linea, cuerpo).id }] : cuerpo;
            const extras = op.extras.slice();
            if (op.fija) extras.push({ tipo: 'fija', valor: 'se puede elegir más de una vez' });
            const n = c.nodo({ tipo: 'opcion', texto: op.boton, condicion: op.condicion, extras, linea: op.linea, siguientes: continua, color: '#c03ad6' });
            if (op.etiqueta) entradas.set(ctx.nudo + '.' + op.etiqueta, [{ a: n.id }]);
            return { a: n.id };
          });
        }
        if (it.previos.length && !usados) r = [{ a: c.nodo({ tipo: 'accion', extras: it.previos, linea: it.linea, siguientes: r }).id }];
        sig = r;
      }
      return sig;
    }

    function reunion(it, sig, ctx) {
      const sigs = it.desvio ? salto(it.desvio, ctx, it.linea) : sig;
      const r = it.texto ? [{ a: nodoTexto(it.texto, it.extras, it.linea, sigs).id }] : sigs;
      if (it.etiqueta) entradas.set(ctx.nudo + '.' + it.etiqueta, r);
      return r;
    }

    // 5) Contenido de arriba, nudos y puntadas
    const entradaArriba = compilar(tejer(leerItems(arriba), 0, 0).sec, [], { nudo: '' });
    for (const nudo of nudos) {
      const ctx = { nudo: nudo.nombre };
      for (const p of nudo.puntadas) entradas.set(nudo.nombre + '.' + p.nombre, compilar(tejer(leerItems(p.lineas), 0, 0).sec, [], ctx));
      const propias = compilar(tejer(leerItems(nudo.lineas), 0, 0).sec, [], ctx);
      entradas.set(nudo.nombre, nudo.lineas.length || !nudo.puntadas.length ? propias : [{ salto: nudo.nombre + '.' + nudo.puntadas[0].nombre }]);
    }

    let primeras = entradaArriba;
    if (!arriba.length && nudos.length) {
      c.aviso(null, 'No hay texto antes del primer nudo: arrancamos por "' + nudos[0].nombre + '".');
      primeras = [{ salto: nudos[0].nombre }];
    }
    const inicio = c.nodo({ tipo: 'inicio', texto: 'Inicio', linea: lineas.length ? lineas[0].linea : null, siguientes: primeras });

    c.resolverSaltos((a) => {
      const candidatos = [];
      if (a.ctx) candidatos.push(a.ctx + '.' + a.salto);
      candidatos.push(a.salto);
      for (const k of candidatos) if (entradas.has(k)) return entradas.get(k);
      return null;
    });
    const grafo = c.terminar(inicio.id);
    grafo.etiquetas = nudos.map((n) => ({ nombre: n.nombre, linea: n.linea }));
    return grafo;
  }

  /** ¿Este texto parece Ink? */
  function pareceInk(texto) {
    return /^\s*={2,}\s*\w+/m.test(texto) || /^\s*[*+]\s+.*\[/m.test(texto) || /->\s*(END|DONE)\b/.test(texto) || /^\s*VAR\s+\w+\s*=/m.test(texto);
  }

  const LectorInk = { leer, pareceInk };
  raiz.LectorInk = LectorInk;
  if (typeof module !== 'undefined' && module.exports) module.exports = LectorInk;
})(typeof window !== 'undefined' ? window : globalThis);
