# =============================================================
#  EJEMPLO REN'PY — "El misterio de Michi"
#  Un diálogo entre 3 personajes: Mica, Bruno y Doña Elsa.
#  Para probarlo: creá un proyecto nuevo en Ren'Py y reemplazá
#  el archivo game/script.rpy por este.
# =============================================================


# --- PERSONAJES ---------------------------------------------
# Cada personaje tiene un nombre visible y un color para su nombre.
define m = Character("Mica", color="#e87ea1")
define b = Character("Bruno", color="#6fa8dc")
define e = Character("Doña Elsa", color="#c9a227")


# --- VARIABLES ----------------------------------------------
# "default" crea variables que se guardan con la partida.
default pistas = 0
default vio_cocina = False
default hablo_con_elsa = False
default elsa_confia = False


# --- INICIO DEL JUEGO ---------------------------------------
label start:

    # "scene" pone un fondo (si la imagen no existe, Ren'Py muestra
    # un cartel con el nombre, así que igual se puede probar).
    scene bg panaderia with fade

    # Música: descomentá la línea cuando tengas el archivo en game/audio/
    # play music "audio/manana_tranquila.ogg" fadein 2.0

    # Una línea sin nombre es el narrador.
    "Son las ocho de la mañana. La panadería de Doña Elsa huele a medialunas recién horneadas."

    show elsa preocupada at center
    e "¡Chicos, menos mal que llegaron! Michi desapareció anoche."

    show mica sorprendida at left
    m "¿Michi? ¿El gato naranja que duerme arriba del horno?"

    show bruno serio at right
    b "Tranqui, Doña Elsa. Seguro anda dando vueltas por el barrio."

    e "No, no... Michi nunca se va. Y encima me falta una bolsa de harina."

    m "Mmm... un gato y una bolsa de harina que desaparecen juntos. Esto huele a misterio."
    b "Huele a medialunas, Mica."
    m "...También."

    jump investigar


# --- MENÚ DE INVESTIGACIÓN ----------------------------------
label investigar:

    # Las opciones con "if" solo aparecen si se cumple la condición.
    menu:
        "¿Qué hacemos?"

        "Revisar la cocina" if not vio_cocina:
            jump cocina

        "Preguntarle a Doña Elsa qué pasó anoche" if not hablo_con_elsa:
            jump preguntar

        "Ir al patio de atrás" if pistas >= 1:
            jump patio


# --- RAMA 1: LA COCINA --------------------------------------
label cocina:
    $ vio_cocina = True

    scene bg cocina with dissolve
    show mica at left
    show bruno at right

    "En el piso, entre las bolsas, hay unas huellitas blancas... de harina."

    b "Huellas. Chiquitas. Y van derecho hacia la puerta del fondo."

    $ pistas += 1
    # Con [corchetes] mostramos el valor de una variable en el texto.
    m "¡Pista número [pistas]! La anoto en mi libreta."

    show bruno sonriendo at right
    b "¿Desde cuándo tenés libreta?"
    m "Desde que somos detectives. O sea, desde hace cinco minutos."

    jump investigar


# --- RAMA 2: HABLAR CON DOÑA ELSA ---------------------------
label preguntar:
    $ hablo_con_elsa = True

    scene bg panaderia with dissolve
    show elsa pensativa at center
    show mica at left
    show bruno at right

    e "Anoche cerré a las diez, como siempre. Bueno... casi como siempre."
    m "¿Casi?"
    e "Dejé abierta la ventana del depósito. Hacía un calor bárbaro."

    $ pistas += 1
    $ elsa_confia = True

    b "Ahí está. Por esa ventana salió Michi."
    e "Ay, ¡qué cabeza la mía!"
    m "No se preocupe, Doña Elsa. Pista número [pistas]: anotada."

    jump investigar


# --- FINAL --------------------------------------------------
label patio:

    scene bg patio with fade
    show mica feliz at left
    show elsa sorprendida at center
    show bruno at right

    "Detrás de unos cajones de madera se escucha un ronroneo suave."
    "Ahí está Michi, blanca de harina... y rodeada de cuatro gatitos recién nacidos."

    e "¡Michi! Entonces... ¡era Michi... na!"
    m "Misterio de la harina: resuelto. La usó de colchón."
    b "Entramos buscando un gato y salimos con cinco."

    # Un "if" cambia el diálogo según lo que hizo el jugador.
    if elsa_confia:
        e "Gracias por escucharme, chicos. Mañana medialunas gratis para los dos."
        m "¡Trato hecho!"
    else:
        e "Gracias, chicos. Vengan mañana, que les guardo algo rico."

    b "Pistas encontradas: [pistas]. Y un final feliz. Buen día de trabajo."

    # stop music fadeout 2.0

    "FIN"

    return
