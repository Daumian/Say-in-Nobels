// Copia los archivos de ../ejemplos dentro de js/ejemplos.js, para que la
// página los pueda cargar sin servidor (abriendo index.html directo).
// Uso:  node herramientas/generar-ejemplos.js
const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '..', '..', 'ejemplos');
const ejemplos = [
  { id: 'renpy', nombre: "Michi (Ren'Py)", formato: 'renpy', archivo: 'renpy/script.rpy' },
  { id: 'ink', nombre: 'Michi (Ink)', formato: 'ink', archivo: 'ink/michi.ink' },
].map((e) => ({ id: e.id, nombre: e.nombre, formato: e.formato, texto: fs.readFileSync(path.join(base, e.archivo), 'utf8') }));
const salida = '// Generado por herramientas/generar-ejemplos.js — no editar a mano.\nwindow.EJEMPLOS = ' + JSON.stringify(ejemplos, null, 2) + ';\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'ejemplos.js'), salida);
console.log('js/ejemplos.js actualizado con', ejemplos.length, 'ejemplos');
