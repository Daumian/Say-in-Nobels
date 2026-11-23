// =============================================================
//  EJEMPLO INK — "El misterio de Michi"
//  Un diálogo entre 3 personajes: Mica, Bruno y Doña Elsa.
//  Para probarlo: abrilo con Inky (el editor gratis de inkle)
//  y se juega en el panel de la derecha.
// =============================================================
//
//  Ink no tiene "personajes" incorporados como Ren'Py.
//  La costumbre es escribir "NOMBRE: texto" y que el juego
//  (Unity, Godot, web...) separe el nombre del diálogo.
//  Las #etiquetas sirven para pasarle datos extra al juego,
//  como la cara que pone cada personaje o un sonido.


// --- VARIABLES ----------------------------------------------
VAR pistas = 0
VAR elsa_confia = false


// --- INICIO -------------------------------------------------
-> panaderia


=== panaderia ===
Son las ocho de la mañana. La panadería de Doña Elsa huele a medialunas recién horneadas. #fondo:panaderia #musica:manana_tranquila

DOÑA ELSA: ¡Chicos, menos mal que llegaron! Michi desapareció anoche. #cara:preocupada
MICA: ¿Michi? ¿El gato naranja que duerme arriba del horno? #cara:sorprendida
BRUNO: Tranqui, Doña Elsa. Seguro anda dando vueltas por el barrio.
DOÑA ELSA: No, no... Michi nunca se va. Y encima me falta una bolsa de harina.
MICA: Mmm... un gato y una bolsa de harina que desaparecen juntos. Esto huele a misterio.
BRUNO: Huele a medialunas, Mica.
MICA: ...También.
-> investigar


// --- MENÚ DE INVESTIGACIÓN ----------------------------------
//  *  = opción que se puede elegir UNA sola vez (después desaparece)
//  +  = opción que queda siempre disponible
//  {condición} = la opción solo aparece si se cumple
//  [texto entre corchetes] = se muestra como botón pero no se repite en la historia
=== investigar ===
¿Qué hacemos?
*   [Revisar la cocina]
    -> cocina
*   [Preguntarle a Doña Elsa qué pasó anoche]
    -> preguntar
+   {pistas >= 1} [Ir al patio de atrás]
    -> patio


// --- RAMA 1: LA COCINA --------------------------------------
=== cocina ===
En el piso, entre las bolsas, hay unas huellitas blancas... de harina. #fondo:cocina
BRUNO: Huellas. Chiquitas. Y van derecho hacia la puerta del fondo.
~ pistas = pistas + 1
// Con {llaves} mostramos el valor de una variable.
MICA: ¡Pista número {pistas}! La anoto en mi libreta.
BRUNO: ¿Desde cuándo tenés libreta? #cara:sonriendo
MICA: Desde que somos detectives. O sea, desde hace cinco minutos.
-> investigar


// --- RAMA 2: HABLAR CON DOÑA ELSA ---------------------------
=== preguntar ===
DOÑA ELSA: Anoche cerré a las diez, como siempre. Bueno... casi como siempre. #cara:pensativa
MICA: ¿Casi?
DOÑA ELSA: Dejé abierta la ventana del depósito. Hacía un calor bárbaro.
~ pistas = pistas + 1
~ elsa_confia = true
BRUNO: Ahí está. Por esa ventana salió Michi.
DOÑA ELSA: Ay, ¡qué cabeza la mía!
MICA: No se preocupe, Doña Elsa. Pista número {pistas}: anotada.
-> investigar


// --- FINAL --------------------------------------------------
=== patio ===
Detrás de unos cajones de madera se escucha un ronroneo suave. #fondo:patio #sonido:ronroneo
Ahí está Michi, blanca de harina... y rodeada de cuatro gatitos recién nacidos.

DOÑA ELSA: ¡Michi! Entonces... ¡era Michi... na! #cara:sorprendida
MICA: Misterio de la harina: resuelto. La usó de colchón. #cara:feliz
BRUNO: Entramos buscando un gato y salimos con cinco.

// Texto condicional: {condición: si es verdad | si es falso}
{elsa_confia:
    DOÑA ELSA: Gracias por escucharme, chicos. Mañana medialunas gratis para los dos.
    MICA: ¡Trato hecho!
- else:
    DOÑA ELSA: Gracias, chicos. Vengan mañana, que les guardo algo rico.
}

BRUNO: {pistas} {pistas == 1:pista|pistas} y un final feliz. Buen día de trabajo.

FIN
-> END
