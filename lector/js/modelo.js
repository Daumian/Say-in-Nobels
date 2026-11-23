/*
 * modelo.js — El "molde" de los datos que comparten los lectores.
 *
 * Un grafo de diálogo es una lista de NODOS. Cada nodo es:
 *
 *   {
 *     id:         'n12',
 *     tipo:       'inicio' | 'dialogo' | 'opcion' | 'accion' | 'bloque' | 'falta',
 *     personaje:  'Mica' | null   (null = narrador),
 *     color:      '#e87ea1'       (color del personaje),
 *     texto:      'Lo que se dice',
 *     extras:     [{ tipo: 'escena', valor: 'bg patio' }, ...],
 *     condicion:  'pistas >= 1' | null   (para que una opción aparezca),
 *     linea:      14              (línea del archivo original),
 *     siguientes: [{ a: 'n13', condicion: 'elsa_confia' | null }, ...],
 *   }
 *
 * - Un nodo con UN siguiente es un camino directo.
 * - Un nodo con VARIOS siguientes de tipo 'opcion' es una elección.
 * - Un nodo con varios siguientes con condición es un "if".
 * - Un nodo sin siguientes es un final.
 */
(function (raiz) {
  'use strict';

  const PALETA = ['#e87ea1', '#6fa8dc', '#e0b43a', '#79c27a', '#b48ce0', '#f0965a', '#5cc6c0', '#d9748c'];
  const COLOR_NARRADOR = '#9aa3ad';

  function colorPorNombre(nombre) {
    let h = 0;
    for (const ch of String(nombre)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return PALETA[h % PALETA.length];
  }

  function unirCondiciones(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return a + ' y ' + b;
  }

  function conCondicion(aristas, cond) {
    if (!cond) return aristas;
    return aristas.map((a) => Object.assign({}, a, { condicion: unirCondiciones(cond, a.condicion) }));
  }

  function sinRepetidas(aristas) {
    const vistas = new Set();
    return aristas.filter((a) => {
      const clave = (a.a || '') + '|' + (a.salto || '') + '|' + (a.condicion || '');
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    });
  }

  /** Ayuda a los lectores a crear nodos, personajes y avisos. */
  class Constructor {
    constructor(formato) {
      this.formato = formato;
      this.nodos = new Map();
      this.contador = 0;
      this.avisos = [];
      this.personajes = new Map(); // clave -> { nombre, color }
    }

    nodo(datos) {
      const id = 'n' + ++this.contador;
      const n = Object.assign(
        { tipo: 'dialogo', personaje: null, color: COLOR_NARRADOR, texto: '', extras: [], condicion: null, linea: null, siguientes: [] },
        datos,
        { id }
      );
      this.nodos.set(id, n);
      return n;
    }

    aviso(linea, mensaje) {
      this.avisos.push({ linea, mensaje });
    }

    definirPersonaje(clave, nombre, color) {
      this.personajes.set(clave, { nombre: nombre == null ? null : nombre, color: color || (nombre ? colorPorNombre(nombre) : COLOR_NARRADOR) });
    }

    /** Devuelve { nombre, color } para la clave de un personaje (o un nombre suelto). */
    personaje(clave) {
      if (clave == null) return { nombre: null, color: COLOR_NARRADOR };
      if (this.personajes.has(clave)) return this.personajes.get(clave);
      const p = { nombre: clave, color: colorPorNombre(clave) };
      this.personajes.set(clave, p);
      return p;
    }

    /**
     * Reemplaza las aristas "de salto" ({ salto: 'nombre' }) por las aristas
     * reales a las que apunta ese nombre. `buscar(arista)` devuelve:
     *   - un array de aristas si el destino existe ([] = fin),
     *   - null si no existe.
     */
    resolverSaltos(buscar) {
      const faltantes = new Map();
      const resolver = (aristas, profundidad) => {
        const salida = [];
        for (const a of aristas) {
          if (!a.salto) {
            salida.push(a);
            continue;
          }
          if (profundidad > 60) {
            this.aviso(a.linea || null, 'Hay un bucle de saltos sin diálogo cerca de "' + a.salto + '".');
            continue;
          }
          const destino = buscar(a);
          if (destino === null) {
            if (!faltantes.has(a.salto)) {
              const n = this.nodo({ tipo: 'falta', texto: 'Salto a "' + a.salto + '", que no existe', linea: a.linea || null });
              faltantes.set(a.salto, n.id);
              this.aviso(a.linea || null, 'Salto a "' + a.salto + '", que no existe.');
            }
            salida.push({ a: faltantes.get(a.salto), condicion: a.condicion || null });
            continue;
          }
          salida.push(...resolver(conCondicion(destino, a.condicion), profundidad + 1));
        }
        return sinRepetidas(salida);
      };
      for (const n of Array.from(this.nodos.values())) n.siguientes = resolver(n.siguientes, 0);
    }

    /** Arma el grafo final, con los nodos alcanzables desde el inicio primero. */
    terminar(idInicio) {
      const nodos = Array.from(this.nodos.values());
      for (const n of nodos) n.siguientes = n.siguientes.filter((s) => s.a && this.nodos.has(s.a));
      return completar({
        formato: this.formato,
        inicio: idInicio,
        nodos,
        avisos: this.avisos,
        personajes: Array.from(this.personajes.values()).filter((p) => p.nombre),
      });
    }
  }

  /** Agrega el índice por id y la lista de nodos anteriores de cada nodo. */
  function completar(grafo) {
    grafo.porId = new Map(grafo.nodos.map((n) => [n.id, n]));
    for (const n of grafo.nodos) n.anteriores = [];
    for (const n of grafo.nodos) {
      for (const s of n.siguientes) {
        const d = grafo.porId.get(s.a);
        if (d && !d.anteriores.includes(n.id)) d.anteriores.push(n.id);
      }
    }
    return grafo;
  }

  /**
   * Junta los diálogos seguidos (sin elecciones ni condiciones en el medio)
   * en un solo nodo 'bloque'. Devuelve un grafo nuevo.
   */
  function agrupar(grafo) {
    const porId = grafo.porId;
    const sigueDirecto = (n) =>
      n.siguientes.length === 1 && !n.siguientes[0].condicion && porId.get(n.siguientes[0].a);
    const puedeSeguir = (n) => {
      if (n.tipo !== 'dialogo' || n.anteriores.length !== 1) return false;
      const p = porId.get(n.anteriores[0]);
      return p.tipo === 'dialogo' && sigueDirecto(p) && p.siguientes[0].a === n.id && p.id !== n.id;
    };

    const usados = new Set();
    const nuevos = [];
    for (const n of grafo.nodos) {
      if (usados.has(n.id) || (n.tipo === 'dialogo' && puedeSeguir(n))) continue;
      usados.add(n.id);
      if (n.tipo !== 'dialogo') {
        nuevos.push(Object.assign({}, n));
        continue;
      }
      const lineas = [n];
      let actual = n;
      for (;;) {
        const sig = sigueDirecto(actual);
        if (!sig || usados.has(sig.id) || !puedeSeguir(sig)) break;
        lineas.push(sig);
        usados.add(sig.id);
        actual = sig;
      }
      if (lineas.length === 1) {
        nuevos.push(Object.assign({}, n));
      } else {
        nuevos.push(
          Object.assign({}, n, {
            tipo: 'bloque',
            lineas,
            texto: lineas.map((l) => (l.personaje ? l.personaje + ': ' : '') + l.texto).join('\n'),
            extras: lineas.flatMap((l) => l.extras),
            siguientes: actual.siguientes,
          })
        );
      }
    }
    // Nodos que quedaron en un bucle sin cabeza (raro): se copian tal cual.
    for (const n of grafo.nodos) if (!usados.has(n.id)) nuevos.push(Object.assign({}, n));

    return completar(Object.assign({}, grafo, { nodos: nuevos, agrupado: true }));
  }

  const Modelo = { Constructor, completar, agrupar, unirCondiciones, conCondicion, sinRepetidas, colorPorNombre, COLOR_NARRADOR };
  raiz.Modelo = Modelo;
  if (typeof module !== 'undefined' && module.exports) module.exports = Modelo;
})(typeof window !== 'undefined' ? window : globalThis);
