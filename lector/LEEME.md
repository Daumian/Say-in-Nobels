# 🕸️ Nube de diálogos

Lee un guion de **Ren'Py** o de **Ink** y lo dibuja como una nube de nodos: cada nodo dice
**qué se dice**, **quién lo dice** y **qué más pasa** (escena, música, variables, caras...).
Las flechas muestran si el camino sigue derecho o si hay **elecciones**.

## Cómo usarlo

Abrí `index.html` en el navegador (doble clic, no hace falta servidor) y:

- Pegá un guion en el panel **Texto**, abrí un `.rpy` / `.ink` con **📂 Abrir**, o elegí un **📚 Ejemplo**.
- **Arrastrá** para moverte, usá la **rueda** o pellizcá para hacer zoom.
- **Hacé clic en un nodo** para ver todo su detalle y saltar a la línea del texto.
- **Agrupar diálogos seguidos** junta las líneas sin elecciones en un solo bloque.

## Qué significa cada cosa

| En la nube | Significa |
| --- | --- |
| Caja azul con cuadrado de color | Una línea de diálogo (el color es el del personaje) |
| Caja violeta con **?** | Una opción que elige el jugador |
| Caja punteada **⚙** | Acciones sueltas (código, música...) sin diálogo |
| Línea de puntitos con rótulo | Camino con condición (`if`) |
| Línea cortada por arriba | Salto que vuelve para atrás (por ejemplo, al menú) |
| 🏁 | Ahí termina ese camino |

## Archivos

- `js/modelo.js` — el "molde" de los nodos.
- `js/lector-renpy.js` y `js/lector-ink.js` — convierten el texto en nodos.
- `js/ubicar.js` — decide dónde va cada nodo.
- `js/nube.js` — dibuja la nube, el zoom y la selección.
- `js/app.js` — une todo con la página.
- `js/ejemplos.js` — se genera con `node herramientas/generar-ejemplos.js`.
- `pruebas/probar.js` — pruebas de los lectores: `node pruebas/probar.js`.
