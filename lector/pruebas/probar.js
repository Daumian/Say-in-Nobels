// Pruebas rápidas de los lectores.  Uso:  node pruebas/probar.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Modelo = require('../js/modelo.js');
const LectorRenpy = require('../js/lector-renpy.js');
const LectorInk = require('../js/lector-ink.js');
const { ubicar } = require('../js/ubicar.js');

let pasaron = 0;
function prueba(nombre, fn) {
  try {
    fn();
    pasaron++;
    console.log('✅', nombre);
  } catch (e) {
    console.log('❌', nombre, '\n  ', e.message);
    process.exitCode = 1;
  }
}

const leerArchivo = (r) => fs.readFileSync(path.join(__dirname, '..', '..', 'ejemplos', r), 'utf8');
const textos = (g) => g.nodos.map((n) => n.texto);
const porTexto = (g, t) => g.nodos.find((n) => n.texto.startsWith(t));
const siguientesDe = (g, n) => n.siguientes.map((s) => g.porId.get(s.a));

function sinSuperposiciones(g, vertical) {
  const { pos } = ubicar(g, { ancho: 260, altoDe: (n) => (n.tipo === 'opcion' ? 54 : 80), sepX: 70, sepY: 20, vertical });
  const cajas = Array.from(pos.values());
  for (let i = 0; i < cajas.length; i++)
    for (let j = i + 1; j < cajas.length; j++) {
      const a = cajas[i];
      const b = cajas[j];
      const choca = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert(!choca, 'hay nodos encimados');
    }
}

for (const [nombre, g] of [
  ["Ren'Py", LectorRenpy.leer(leerArchivo('renpy/script.rpy'))],
  ['Ink', LectorInk.leer(leerArchivo('ink/michi.ink'))],
]) {
  prueba(nombre + ': lee el ejemplo de Michi sin avisos', () => {
    assert.deepStrictEqual(g.avisos, []);
    assert.strictEqual(g.nodos.filter((n) => n.tipo === 'dialogo').length, 30);
    assert.strictEqual(g.nodos.filter((n) => n.tipo === 'opcion').length, 3);
  });
  prueba(nombre + ': la pregunta tiene 3 elecciones, una con condición', () => {
    const q = porTexto(g, '¿Qué hacemos?');
    const ops = siguientesDe(g, q);
    assert.strictEqual(ops.length, 3);
    assert(ops.every((o) => o.tipo === 'opcion'));
    assert.strictEqual(ops[2].condicion, 'pistas >= 1');
  });
  prueba(nombre + ': el final cambia según elsa_confia', () => {
    const n = porTexto(g, 'Entramos buscando');
    assert.deepStrictEqual(n.siguientes.map((s) => s.condicion), ['elsa_confia', 'si no']);
  });
  prueba(nombre + ': las ramas vuelven al menú', () => {
    const q = porTexto(g, '¿Qué hacemos?');
    assert(q.anteriores.length >= 3);
  });
  prueba(nombre + ': nada encimado (con y sin agrupar)', () => {
    for (const vertical of [false, true]) {
      sinSuperposiciones(g, vertical);
      sinSuperposiciones(Modelo.agrupar(g), vertical);
      for (const c of g.capitulos) sinSuperposiciones(Modelo.vistaCapitulo(g, c), vertical);
    }
  });
  prueba(nombre + ': cada capítulo muestra solo lo suyo y flechas a los otros', () => {
    assert.strictEqual(g.capitulos.length, 5);
    for (const c of g.capitulos) {
      const v = Modelo.vistaCapitulo(g, c);
      for (const n of v.nodos) assert(n.capitulo === c, 'nodo de otro capítulo');
      for (const n of v.nodos) for (const s of n.siguientes) assert(v.porId.has(s.a), 'flecha suelta');
    }
  });
}

prueba('Ink: opciones anidadas y reunión', () => {
  const g = LectorInk.leer(`
Hola.
* [A] Elegiste A.
  * * [A1] Sub A1.
  * * [A2] Sub A2.
  - - Fin de A.
* [B] Elegiste B.
- Todos se juntan acá.
-> END`);
  assert.deepStrictEqual(g.avisos, []);
  const juntan = porTexto(g, 'Todos se juntan');
  const finA = porTexto(g, 'Fin de A');
  assert(finA.siguientes.some((s) => s.a === juntan.id), 'Fin de A sigue en la reunión');
  assert(porTexto(g, 'Elegiste B').siguientes.some((s) => s.a === juntan.id), 'B sigue en la reunión');
  assert.strictEqual(siguientesDe(g, porTexto(g, 'Elegiste A')).length, 2);
});

prueba('Ink: etiquetas dentro de una puntada', () => {
  const g = LectorInk.leer(`
-> nudo
=== nudo ===
= puntada
* [Uno] -> fin_bueno
* [Dos] -> nudo.puntada.fin_malo
- (fin_bueno) Bien.
-> END
- (fin_malo) Mal.
-> END`);
  assert.deepStrictEqual(g.avisos.filter((a) => a.mensaje.includes('no existe')), []);
});

prueba("Ren'Py: salto a un label que no existe avisa", () => {
  const g = LectorRenpy.leer('label start:\n    "Hola"\n    jump nada\n');
  assert(g.avisos.some((a) => a.mensaje.includes('nada')));
  assert(g.nodos.some((n) => n.tipo === 'falta'));
});

prueba("Ren'Py: menú sin pregunta, if/elif/else y extend", () => {
  const g = LectorRenpy.leer(`
define a = Character("Ana")
label start:
    a feliz "Hola"
    extend " y chau"
    menu:
        "Uno":
            if x > 1:
                a "Grande"
            elif x == 1:
                a "Uno"
            else:
                a "Chico"
        "Dos":
            pass
    "Final"
    return
`);
  assert.deepStrictEqual(g.avisos, []);
  const chau = porTexto(g, 'y chau');
  assert.strictEqual(chau.personaje, 'Ana');
  assert.strictEqual(siguientesDe(g, chau).length, 2);
  const uno = g.nodos.find((n) => n.tipo === 'opcion' && n.texto === 'Uno');
  assert.deepStrictEqual(uno.siguientes.map((s) => s.condicion), ['x > 1', 'x == 1', 'si no']);
  assert.strictEqual(porTexto(g, 'Hola').extras[0].valor, 'feliz');
});

console.log('\n' + pasaron + ' pruebas pasaron');
