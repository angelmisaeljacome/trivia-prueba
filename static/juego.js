const preguntasOriginales = [
    { pregunta: "Decir verdadero",   respuestas: ["verdadero"] },
    { pregunta: "Decir falso",       respuestas: ["falso"] },
    { pregunta: "Decir verdadero 2", respuestas: ["verdadero"] },
    { pregunta: "Decir falso 2",     respuestas: ["falso"] },
];

// OJO: GitHub Pages distingue mayúsculas y los nombres deben coincidir con tus .glb
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
    let logica = {};

    function crearEnemigo(p) {
        return {
            nombre: p.nombre,
            clave_modelo: p.clave_modelo,
            es_jefe: p.es_jefe || false,
            aciertos: 0,
            meta_aciertos: p.meta_aciertos,
            vida: 100,
            derrotado: false,
        };
    }

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
            resultado: null,
            evento: null,
            mensaje: "Escucha la pregunta...",
            vida_avatar: 100,
            fallos_jugador: 0,
            max_fallos_jugador: 3,
            modelo_jugador_estado: "espera",
            enemigo: crearEnemigo(ENEMIGOS_NORMALES[0]),
            juego_terminado: false,
            victoria: false,
        };
    }

    const copia = () => structuredClone(estado);

    function responder(texto) {
        if (estado.juego_terminado) return copia();

        const textoUsuario = String(texto || "").toLowerCase().trim();
        const acerto = logica.actual.respuestas.some(r => textoUsuario.includes(r));
        const enemigo = estado.enemigo;
        estado.evento = null;

        if (acerto) {
            estado.resultado = "correcto";
            estado.modelo_jugador_estado = "correcto";
            enemigo.aciertos += 1;
            enemigo.vida = Math.round(Math.max(0, 100 - enemigo.aciertos * (100 / enemigo.meta_aciertos)));
            estado.mensaje = "¡Correcto!";

            if (enemigo.aciertos >= enemigo.meta_aciertos) {
                enemigo.vida = 0;
                enemigo.derrotado = true;
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
        } else {
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

        const siguiente = elegirPregunta();
        estado.numero_pregunta += 1;
        estado.pregunta_texto = siguiente.pregunta;
        return copia();
    }

    function siguienteEnemigo() {
        if (estado.juego_terminado) return copia();

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