/*
 * ubicar.js — Decide dónde va cada nodo en la nube.
 *
 * - Columna (x): cuántos pasos hay desde el inicio (el camino más largo,
 *   sin contar los saltos que vuelven para atrás).
 * - Fila (y): cada final abre una fila nueva, y cada nodo se alinea con su
 *   primer hijo, así los caminos directos quedan en línea recta (como en el dibujo).
 */
(function (raiz) {
  'use strict';

  function ubicar(grafo, medidas) {
    const { ancho, altoDe, sepX, sepY } = medidas;
    const ids = grafo.nodos.map((n) => n.id);
    const ady = new Map(grafo.nodos.map((n) => [n.id, Array.from(new Set(n.siguientes.map((s) => s.a)))]));

    // Raíces: el inicio, después los nodos sin nadie antes, después lo que falte
    const raices = [grafo.inicio, ...grafo.nodos.filter((n) => !n.anteriores.length && n.id !== grafo.inicio).map((n) => n.id), ...ids];

    // 1) Recorrido en profundidad: árbol + aristas que vuelven atrás
    const estado = new Map(); // 1 = en la pila, 2 = terminado
    const hijos = new Map(ids.map((id) => [id, []]));
    const atras = new Set();
    const postorden = [];
    const raicesUsadas = [];
    for (const r of raices) {
      if (estado.has(r)) continue;
      raicesUsadas.push(r);
      const pila = [{ id: r, i: 0 }];
      estado.set(r, 1);
      while (pila.length) {
        const tope = pila[pila.length - 1];
        const vecinos = ady.get(tope.id);
        if (tope.i < vecinos.length) {
          const v = vecinos[tope.i++];
          if (!estado.has(v)) {
            hijos.get(tope.id).push(v);
            estado.set(v, 1);
            pila.push({ id: v, i: 0 });
          } else if (estado.get(v) === 1) {
            atras.add(tope.id + '>' + v);
          }
        } else {
          estado.set(tope.id, 2);
          postorden.push(tope.id);
          pila.pop();
        }
      }
    }

    // 2) Columnas: camino más largo en el grafo sin las aristas de vuelta
    const columna = new Map(ids.map((id) => [id, 0]));
    for (let k = postorden.length - 1; k >= 0; k--) {
      const u = postorden[k];
      for (const v of ady.get(u)) {
        if (atras.has(u + '>' + v)) continue;
        columna.set(v, Math.max(columna.get(v), columna.get(u) + 1));
      }
    }

    // 3) Filas: cada hoja del árbol abre una fila; el padre va en la fila de su primer hijo
    const fila = new Map();
    let filas = 0;
    for (const r of raicesUsadas) {
      const pila = [{ id: r, i: 0 }];
      while (pila.length) {
        const tope = pila[pila.length - 1];
        const hs = hijos.get(tope.id);
        if (tope.i < hs.length) {
          pila.push({ id: hs[tope.i++], i: 0 });
        } else {
          fila.set(tope.id, hs.length ? fila.get(hs[0]) : filas++);
          pila.pop();
        }
      }
    }

    // 4) Alto de cada fila = el nodo más alto de esa fila
    const altoFila = new Array(filas).fill(0);
    for (const n of grafo.nodos) altoFila[fila.get(n.id)] = Math.max(altoFila[fila.get(n.id)], altoDe(n));
    const yFila = [];
    let y = 0;
    for (let f = 0; f < filas; f++) {
      yFila.push(y);
      y += altoFila[f] + sepY;
    }

    const pos = new Map();
    let maxX = 0;
    for (const n of grafo.nodos) {
      const x = columna.get(n.id) * (ancho + sepX);
      const p = { x, y: yFila[fila.get(n.id)], w: ancho, h: altoDe(n) };
      pos.set(n.id, p);
      maxX = Math.max(maxX, x + ancho);
    }
    return { pos, atras, ancho: maxX, alto: Math.max(0, y - sepY) };
  }

  const Ubicar = { ubicar };
  raiz.Ubicar = Ubicar;
  if (typeof module !== 'undefined' && module.exports) module.exports = Ubicar;
})(typeof window !== 'undefined' ? window : globalThis);
