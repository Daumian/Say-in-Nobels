/*
 * ubicar.js — Decide dónde va cada nodo y por dónde pasa cada flecha.
 *
 * Usa el método "por capas" (Sugiyama), el mismo que usan las herramientas de diagramas:
 *   1) Cada nodo va a un PISO según en qué paso de la historia está.
 *      Las flechas que vuelven para atrás se dan vuelta un momento para no formar ciclos.
 *   2) Las flechas largas (que saltan varios pisos) pasan por "puntos de paso" invisibles,
 *      así se les reserva lugar y no atraviesan cajas.
 *   3) Se reordena cada piso para que se crucen la menor cantidad de flechas.
 *   4) Se acomoda cada piso por separado, centrando cada nodo respecto de sus vecinos:
 *      la nube se ensancha donde hay muchas ramas y se vuelve a angostar después.
 *
 * Funciona igual en horizontal (la historia va a la derecha) y vertical (la historia baja).
 */
(function (raiz) {
  'use strict';

  /**
   * Coloca valores en una fila respetando distancias mínimas, quedando lo más cerca
   * posible de las posiciones deseadas (regresión isotónica, algoritmo PAV).
   */
  function colocarEnFila(deseadas, separaciones) {
    const n = deseadas.length;
    const corrimiento = new Array(n);
    let acum = 0;
    for (let i = 0; i < n; i++) {
      acum += i ? separaciones[i] : 0;
      corrimiento[i] = acum;
    }
    const bloques = []; // { suma, cantidad, desde }
    for (let i = 0; i < n; i++) {
      bloques.push({ suma: deseadas[i] - corrimiento[i], cantidad: 1, desde: i });
      while (bloques.length > 1) {
        const b = bloques[bloques.length - 1];
        const a = bloques[bloques.length - 2];
        if (a.suma / a.cantidad <= b.suma / b.cantidad) break;
        a.suma += b.suma;
        a.cantidad += b.cantidad;
        bloques.pop();
      }
    }
    const salida = new Array(n);
    for (const b of bloques) {
      const valor = b.suma / b.cantidad;
      for (let i = b.desde; i < b.desde + b.cantidad; i++) salida[i] = valor + corrimiento[i];
    }
    return salida;
  }

  /** Cuenta cruces de flechas entre dos pisos (pares [posArriba, posAbajo]). */
  function contarCruces(pares) {
    if (pares.length > 400) return 0;
    let cruces = 0;
    for (let i = 0; i < pares.length; i++)
      for (let j = i + 1; j < pares.length; j++)
        if ((pares[i][0] - pares[j][0]) * (pares[i][1] - pares[j][1]) < 0) cruces++;
    return cruces;
  }

  function ubicar(grafo, medidas) {
    const { ancho, altoDe, sepX, sepY, vertical } = medidas;
    const porId = new Map(grafo.nodos.map((n) => [n.id, n]));
    const ids = grafo.nodos.map((n) => n.id);

    // Tamaños: "cruz" = a lo ancho del piso; "grosor" = a lo largo de la historia
    const tam = new Map(grafo.nodos.map((n) => [n.id, { w: ancho, h: altoDe(n) }]));
    const cruz = (id) => (tam.has(id) ? (vertical ? tam.get(id).w : tam.get(id).h) : 0);
    const grosor = (id) => (tam.has(id) ? (vertical ? tam.get(id).h : tam.get(id).w) : 0);
    const espacioCruz = vertical ? sepX * 0.5 : sepY;
    const espacioPisos = vertical ? sepY * 2.4 : sepX;

    // Flechas únicas (sin repetir el mismo par de nodos)
    const aristas = [];
    const vistas = new Set();
    for (const n of grafo.nodos)
      for (const s of n.siguientes) {
        const k = n.id + '>' + s.a;
        if (vistas.has(k) || !porId.has(s.a)) continue;
        vistas.add(k);
        aristas.push({ de: n.id, a: s.a });
      }
    const ady = new Map(ids.map((id) => [id, []]));
    for (const e of aristas) if (e.de !== e.a) ady.get(e.de).push(e.a);

    // 1a) Recorrido en profundidad: orden de descubrimiento + flechas que vuelven atrás
    const raices = [grafo.inicio, ...grafo.nodos.filter((n) => !n.anteriores.length).map((n) => n.id), ...ids].filter((id) => porId.has(id));
    const estado = new Map();
    const atras = new Set();
    const descubierto = new Map();
    for (const r of raices) {
      if (estado.has(r)) continue;
      const pila = [{ id: r, i: 0 }];
      estado.set(r, 1);
      descubierto.set(r, descubierto.size);
      while (pila.length) {
        const tope = pila[pila.length - 1];
        const vec = ady.get(tope.id);
        if (tope.i < vec.length) {
          const v = vec[tope.i++];
          if (!estado.has(v)) {
            estado.set(v, 1);
            descubierto.set(v, descubierto.size);
            pila.push({ id: v, i: 0 });
          } else if (estado.get(v) === 1) {
            atras.add(tope.id + '>' + v);
          }
        } else {
          estado.set(tope.id, 2);
          pila.pop();
        }
      }
    }

    // Flechas "hacia adelante" (las de vuelta se dan vuelta)
    const adelante = aristas
      .filter((e) => e.de !== e.a)
      .map((e) => (atras.has(e.de + '>' + e.a) ? { arriba: e.a, abajo: e.de, original: e, invertida: true } : { arriba: e.de, abajo: e.a, original: e, invertida: false }));
    const hijos = new Map(ids.map((id) => [id, []]));
    const padres = new Map(ids.map((id) => [id, []]));
    for (const f of adelante) {
      hijos.get(f.arriba).push(f.abajo);
      padres.get(f.abajo).push(f.arriba);
    }

    // 1b) Pisos: el camino más largo desde arriba (orden topológico)
    const piso = new Map(ids.map((id) => [id, 0]));
    const faltan = new Map(ids.map((id) => [id, padres.get(id).length]));
    const cola = ids.filter((id) => !faltan.get(id)).sort((a, b) => descubierto.get(a) - descubierto.get(b));
    const topo = [];
    while (cola.length) {
      const u = cola.shift();
      topo.push(u);
      for (const v of hijos.get(u)) {
        piso.set(v, Math.max(piso.get(v), piso.get(u) + 1));
        faltan.set(v, faltan.get(v) - 1);
        if (!faltan.get(v)) cola.push(v);
      }
    }
    // Los nodos sin nadie arriba (salvo el inicio) bajan para quedar pegados a su primer hijo
    for (let k = topo.length - 1; k >= 0; k--) {
      const u = topo[k];
      if (padres.get(u).length || u === grafo.inicio || !hijos.get(u).length) continue;
      piso.set(u, Math.min(...hijos.get(u).map((v) => piso.get(v))) - 1);
    }

    // 2) Puntos de paso para las flechas largas
    const pisos = [];
    const ponerEnPiso = (id, p) => {
      while (pisos.length <= p) pisos.push([]);
      pisos[p].push(id);
    };
    for (const id of ids) ponerEnPiso(id, piso.get(id));
    const arriba = new Map(ids.map((id) => [id, []])); // vecinos en el piso de arriba
    const abajo = new Map(ids.map((id) => [id, []])); //  vecinos en el piso de abajo
    const orden = new Map(); // para el orden inicial
    for (const id of ids) orden.set(id, descubierto.get(id));
    let pasos = 0;
    for (const f of adelante) {
      const p1 = piso.get(f.arriba);
      const p2 = piso.get(f.abajo);
      const cadena = [f.arriba];
      for (let p = p1 + 1; p < p2; p++) {
        const id = '·' + pasos++;
        arriba.set(id, []);
        abajo.set(id, []);
        orden.set(id, descubierto.get(f.arriba) + (p - p1) * 0.001);
        piso.set(id, p);
        ponerEnPiso(id, p);
        cadena.push(id);
      }
      cadena.push(f.abajo);
      for (let i = 0; i + 1 < cadena.length; i++) {
        abajo.get(cadena[i]).push(cadena[i + 1]);
        arriba.get(cadena[i + 1]).push(cadena[i]);
      }
      f.cadena = cadena;
    }

    // 3) Orden dentro de cada piso: promedio de la posición de los vecinos, varias pasadas
    for (const fila of pisos) fila.sort((a, b) => orden.get(a) - orden.get(b));
    const indice = new Map();
    const indexar = () => pisos.forEach((fila) => fila.forEach((id, i) => indice.set(id, i)));
    indexar();
    const cruces = () => {
      let total = 0;
      for (let p = 0; p + 1 < pisos.length; p++) {
        const pares = [];
        for (const id of pisos[p]) for (const v of abajo.get(id)) pares.push([indice.get(id), indice.get(v)]);
        total += contarCruces(pares);
      }
      return total;
    };
    let mejor = pisos.map((f) => f.slice());
    let menos = cruces();
    for (let vuelta = 0; vuelta < 8 && menos > 0; vuelta++) {
      const bajando = vuelta % 2 === 0;
      const recorrido = bajando ? pisos.map((_, i) => i).slice(1) : pisos.map((_, i) => i).reverse().slice(1);
      for (const p of recorrido) {
        const vecinos = bajando ? arriba : abajo;
        const peso = new Map();
        pisos[p].forEach((id, i) => {
          const vs = vecinos.get(id);
          peso.set(id, vs.length ? vs.reduce((s, v) => s + indice.get(v), 0) / vs.length : i);
        });
        pisos[p].sort((a, b) => peso.get(a) - peso.get(b) || indice.get(a) - indice.get(b));
        pisos[p].forEach((id, i) => indice.set(id, i));
      }
      const c = cruces();
      if (c < menos) {
        menos = c;
        mejor = pisos.map((f) => f.slice());
      }
    }
    pisos.splice(0, pisos.length, ...mejor);
    indexar();

    // 4) Posición a lo ancho: cada piso se acomoda solo, centrado respecto de sus vecinos
    const posCruz = new Map();
    const separacion = (a, b) => {
      const esPaso = (id) => !tam.has(id);
      const espacio = esPaso(a) || esPaso(b) ? espacioCruz * 0.5 : espacioCruz;
      return (Math.max(cruz(a), esPaso(a) ? 8 : 0) + Math.max(cruz(b), esPaso(b) ? 8 : 0)) / 2 + espacio;
    };
    for (const fila of pisos) {
      let x = 0;
      fila.forEach((id, i) => {
        if (i) x += separacion(fila[i - 1], id);
        posCruz.set(id, x);
      });
    }
    const acomodar = (p, vecinosDe) => {
      const fila = pisos[p];
      if (!fila.length) return;
      const deseadas = fila.map((id) => {
        const vs = vecinosDe(id);
        return vs.length ? vs.reduce((s, v) => s + posCruz.get(v), 0) / vs.length : posCruz.get(id);
      });
      const seps = fila.map((id, i) => (i ? separacion(fila[i - 1], id) : 0));
      colocarEnFila(deseadas, seps).forEach((x, i) => posCruz.set(fila[i], x));
    };
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      for (let p = 1; p < pisos.length; p++) acomodar(p, (id) => arriba.get(id));
      for (let p = pisos.length - 2; p >= 0; p--) acomodar(p, (id) => abajo.get(id));
    }
    for (let p = 0; p < pisos.length; p++) acomodar(p, (id) => arriba.get(id).concat(abajo.get(id)));

    // Empezamos en 0
    let minimo = Infinity;
    let maximo = -Infinity;
    for (const [id, x] of posCruz) {
      minimo = Math.min(minimo, x - cruz(id) / 2);
      maximo = Math.max(maximo, x + cruz(id) / 2);
    }
    if (!isFinite(minimo)) minimo = maximo = 0;

    // Posición a lo largo: cada piso tan grueso como su nodo más grande
    const inicioPiso = [];
    const grosorPiso = [];
    let largo = 0;
    for (const fila of pisos) {
      const g = Math.max(0, ...fila.map(grosor));
      inicioPiso.push(largo);
      grosorPiso.push(g);
      largo += g + espacioPisos;
    }
    largo = Math.max(0, largo - espacioPisos);

    const pos = new Map();
    const punto = (c, l) => (vertical ? { x: c, y: l } : { x: l, y: c });
    for (const id of ids) {
      const p = piso.get(id);
      const c = posCruz.get(id) - minimo;
      const { w, h } = tam.get(id);
      const esquina = punto(c - cruz(id) / 2, inicioPiso[p]);
      pos.set(id, { x: esquina.x, y: esquina.y, w, h });
    }

    // Recorrido de cada flecha: sale de una caja, pasa por sus puntos de paso y llega a la otra
    const salida = (id) => {
      const b = pos.get(id);
      return vertical ? { x: b.x + b.w / 2, y: b.y + b.h } : { x: b.x + b.w, y: b.y + Math.min(b.h / 2, 36) };
    };
    const entrada = (id) => {
      const b = pos.get(id);
      return vertical ? { x: b.x + b.w / 2, y: b.y } : { x: b.x, y: b.y + Math.min(b.h / 2, 36) };
    };
    const centroPaso = (id) => punto(posCruz.get(id) - minimo, inicioPiso[piso.get(id)] + grosorPiso[piso.get(id)] / 2);
    const rutas = new Map();
    for (const f of adelante) {
      const medio = f.cadena.slice(1, -1).map(centroPaso);
      let puntos = [salida(f.arriba), ...medio, entrada(f.abajo)];
      if (f.invertida) puntos = puntos.reverse();
      rutas.set(f.original.de + '>' + f.original.a, { puntos, vuelve: f.invertida });
    }
    for (const e of aristas) {
      if (e.de !== e.a) continue;
      const b = pos.get(e.de);
      const x = b.x + b.w;
      const y = b.y + b.h / 2;
      rutas.set(e.de + '>' + e.a, { puntos: [{ x, y: y - 10 }, { x: x + 30, y: y - 24 }, { x: x + 30, y: y + 24 }, { x, y: y + 10 }], vuelve: true });
    }

    const tamCruz = maximo - minimo;
    return {
      pos,
      rutas,
      ancho: vertical ? tamCruz : largo,
      alto: vertical ? largo : tamCruz,
    };
  }

  const Ubicar = { ubicar, colocarEnFila };
  raiz.Ubicar = Ubicar;
  if (typeof module !== 'undefined' && module.exports) module.exports = Ubicar;
})(typeof window !== 'undefined' ? window : globalThis);
