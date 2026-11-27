// Lógica del juego (reemplaza a app.py). Todo corre en el navegador.

const preguntasOriginales = [
    { pregunta: "En una CLI, el paradigma de interfaz de línea de comandos, un shell y un emulador de terminal son exactamente lo mismo", respuestas: ["falso"] },
    { pregunta: "Los servidores Linux suelen utilizar únicamente interfaz de línea de comandos porque consume menos espacio en disco, memoria RAM que las interfaces gráficas", respuestas: ["verdadero"] },
    { pregunta: "Las interfaces gráficas de usuario se programan de forma estrictamente lineal y no requieren programación basada en eventos", respuestas: ["falso"] },
    { pregunta: "El diseño de una NUI busca hacer que la interfaz sea natural para todos los usuarios indistintamente, sin importar el contexto", respuestas: ["falso"] },
    { pregunta: "A diferencia del teclado o el mouse, las NUI suelen ser multicanal, inexactas y de gran ancho de banda", respuestas: ["verdadero"] },
    { pregunta: "En el aprendizaje progresivo de una NUI, se debe obligar a los usuarios expertos a recorrer el mismo camino paso a paso que a los principiantes", respuestas: ["falso"] },
    { pregunta: "Las interfaces adaptativas son configuradas manualmente por el usuario, mientras que las adaptables se ajustan automáticamente mediante algoritmos o reglas", respuestas: ["falso"] },
    { pregunta: "Dentro de los 7 Principios del Diseño Universal, el principio de tolerancia al error busca minimizar los riesgos y consecuencias adversas de acciones involuntarias o accidentales", respuestas: ["verdadero"] },
    { pregunta: "Las VUI funcionan exclusivamente mediante el reconocimiento automático del habla, sin necesitar procesamiento del lenguaje natural", respuestas: ["falso"] },
    { pregunta: "Los sistemas de respuesta de voz interactiva en atención al cliente son un ejemplo de aplicación de las VUI", respuestas: ["verdadero"] },
    { pregunta: "El modelo de seguimiento de manos de MediaPipe detecta 21 puntos de referencia en cada mano", respuestas: ["verdadero"] },
    { pregunta: "La interacción gestual directa ocurre en el aire sin necesidad de una superficie física, como girar un dedo en el espacio", respuestas: ["falso"] },
    { pregunta: "La consola Virtual Boy de Nintendo proyectaba un efecto 3D a todo color y tuvo un gran éxito comercial en Europa y Australia", respuestas: ["falso"] },
    { pregunta: "El término Realidad Aumentada fue acuñado en 1992 por Thomas P. Caudell en el contexto del ensamblaje de aeronaves como el Boeing 747", respuestas: ["verdadero"] },
    { pregunta: "La RA basada en marcadores/reconocimiento se originó en las etiquetas y códigos de barras, evolucionando hacia los códigos QR para proyectar objetos virtuales", respuestas: ["verdadero"] },
    { pregunta: "la Realidad Virtual Mixta permite percibir simultáneamente elementos reales y virtuales e incluso que objetos físicos sirvan de interacción", respuestas: ["verdadero"] },
    { pregunta: "La biometría permite autenticar a una persona basándose en quién es, en lugar de lo que posee o lo que recuerda", respuestas: ["verdadero"] },
    { pregunta: "El reconocimiento de voz, la dinámica de tecleo y la firma manuscrita se clasifican como características biométricas fisiológicas", respuestas: ["falso"] },
    { pregunta: "Una desventaja de la biometría es que un rasgo biométrico no puede cambiarse fácilmente si se ve comprometido.", respuestas: ["verdadero"] },
    { pregunta: "En el diseño de una VUI, es recomendable saturar al usuario con la mayor cantidad de información posible para que conozca todas las funciones desde el inicio", respuestas: ["falso"] },
    { pregunta: "Los pasos básicos del proceso de realidad aumentada indicados en la presentación son: detección y seguimiento, procesamiento y reconocimiento, y renderizado y visualización", respuestas: ["verdadero"] },
];

// Modelos: static/<clave>Espera.glb, <clave>Correcto.glb, <clave>Incorrecto.glb
// OJO: GitHub Pages distingue mayúsculas. Deben coincidir EXACTO con tus archivos.
const ENEMIGOS_NORMALES = [
    { nombre: "Zombie",     clave_modelo: "zombie",     meta_aciertos: 3 },
    { nombre: "Reptiliano", clave_modelo: "reptiliano", meta_aciertos: 3 },
    { nombre: "Guardian",   clave_modelo: "guardia",    meta_aciertos: 3 },
];

const JEFE_FINAL = {
    nombre: "Ahriman, Señor Supremo del Caos",
    clave_modelo: "dragon",
    meta_aciertos: 5,
    es_jefe: true,
};

const Juego = (() => {
    let estado = {};
    let logica = {};   // lógica interna, no se expone al resto de la app

    // Para reutilizar la estructura en todos los enemigos
    function crearEnemigo(plantilla) {
        return {
            nombre: plantilla.nombre,
            clave_modelo: plantilla.clave_modelo,
            es_jefe: plantilla.es_jefe || false,
            aciertos: 0,
            meta_aciertos: plantilla.meta_aciertos,
            vida: 100,
            derrotado: false,
        };
    }

    // Elige una pregunta aleatoria de las pendientes; al agotarse, se rellena sin repetir la actual
    function elegirPregunta() {
        if (logica.pendientes.length === 0) {
            logica.pendientes = preguntasOriginales.filter(p => p !== logica.actual);
            if (logica.pendientes.length === 0) logica.pendientes = [...preguntasOriginales];
        }
        const i = Math.floor(Math.random() * logica.pendientes.length);
        const pregunta = logica.pendientes.splice(i, 1)[0];
        logica.actual = pregunta;
        return pregunta;
    }

    function reiniciar() {
        logica = { pendientes: [], actual: null, indice_normal: 0, normales_derrotados: 0 };
        const primera = elegirPregunta();

        estado = {
            numero_pregunta: 1,
            pregunta_texto: primera.pregunta,
            resultado: null,                  // null | "correcto" | "incorrecto"
            evento: null,                     // null | "enemigo_eliminado" | "victoria" | "derrota"
            mensaje: "Escucha la pregunta...",
            vida_avatar: 100,
            fallos_jugador: 0,
            max_fallos_jugador: 3,
            modelo_jugador_estado: "espera",  // "espera" | "correcto" | "incorrecto" | "perder" | "victoria"
            enemigo: crearEnemigo(ENEMIGOS_NORMALES[0]),
            juego_terminado: false,
            victoria: false,
        };
    }

    // Se entrega una copia para que script.js no modifique el estado interno por accidente
    const copia = () => structuredClone(estado);

    function responder(texto) {
        if (estado.juego_terminado) return copia();

        const textoUsuario = String(texto || "").toLowerCase().trim();
        const acerto = logica.actual.respuestas.some(r => textoUsuario.includes(r));
        const enemigo = estado.enemigo;
        estado.evento = null;

        // RESPUESTA CORRECTA
        if (acerto) {
            estado.resultado = "correcto";
            estado.modelo_jugador_estado = "correcto";
            enemigo.aciertos += 1;
            enemigo.vida = Math.round(Math.max(0, 100 - enemigo.aciertos * (100 / enemigo.meta_aciertos)));
            estado.mensaje = "¡Correcto!";

            if (enemigo.aciertos >= enemigo.meta_aciertos) {
                enemigo.vida = 0;
                enemigo.derrotado = true;

                // Al derrotar al enemigo: restaurar vida del jugador y resetear fallos
                estado.fallos_jugador = 0;
                estado.vida_avatar = 100;

                if (enemigo.es_jefe) {
                    estado.juego_terminado = true;
                    estado.victoria = true;
                    estado.evento = "victoria";
                    estado.modelo_jugador_estado = "victoria";
                    estado.mensaje = "VICTORIA";
                    return copia();
                }

                logica.normales_derrotados += 1;
                estado.evento = "enemigo_eliminado";
                estado.mensaje = `¡${enemigo.nombre} eliminado!`;
            }
        }
        // RESPUESTA INCORRECTA
        else {
            estado.resultado = "incorrecto";
            estado.fallos_jugador += 1;
            estado.vida_avatar = Math.max(0, Math.round(100 - estado.fallos_jugador * (100 / 3)));

            if (estado.fallos_jugador >= estado.max_fallos_jugador) {
                estado.vida_avatar = 0;
                estado.modelo_jugador_estado = "perder";
                estado.evento = "derrota";
                estado.juego_terminado = true;
                estado.victoria = false;
                estado.mensaje = "HAS MUERTO";
                return copia();
            }

            estado.modelo_jugador_estado = "incorrecto";
            estado.mensaje = `Incorrecto (${textoUsuario}). Fallos: ${estado.fallos_jugador}/3`;
        }

        // Preparar siguiente pregunta
        const siguiente = elegirPregunta();
        estado.numero_pregunta += 1;
        estado.pregunta_texto = siguiente.pregunta;
        return copia();
    }

    // Avanza tras mostrar EnemigoEliminado unos segundos
    function siguienteEnemigo() {
        if (estado.juego_terminado) return copia();

        // Cada 3 enemigos normales derrotados toca el jefe final
        if (logica.normales_derrotados > 0 && logica.normales_derrotados % 3 === 0) {
            estado.enemigo = crearEnemigo(JEFE_FINAL);
        } else {
            logica.indice_normal = (logica.indice_normal + 1) % ENEMIGOS_NORMALES.length;
            estado.enemigo = crearEnemigo(ENEMIGOS_NORMALES[logica.indice_normal]);
        }

        estado.evento = null;
        estado.resultado = null;
        estado.modelo_jugador_estado = "espera";
        estado.mensaje = `¡Aparece ${estado.enemigo.nombre}!`;
        return copia();
    }

    reiniciar();
    return { getEstado: copia, responder, siguienteEnemigo, reiniciar };
})();