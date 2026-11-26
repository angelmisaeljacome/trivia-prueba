let estadoActual = null;
let esperandoRespuesta = false;   // true solo mientras el micrófono debe estar activo
let recognition = null;
let sesionVoz = 0;                // ID de la instancia de reconocimiento vigente
let hablaId = 0;                  // ID de la locución vigente
let transicionEnemigoTimer = null;
let intervaloPregunta = null;     // actualiza el contador de 10s en pantalla
let tiempoRestantePregunta = 10;
const utterancesVivos = [];       // evita que el navegador los elimine antes de terminar

const DURACION_PREGUNTA_SEG = 10;
const DURACION_ENEMIGO_ELIMINADO_MS = 4000;

window.addEventListener('DOMContentLoaded', () => {
    cargarEstadoInicial();
});

// MODELOS.GLB (rutas relativas para GitHub Pages)

function rutaModeloJugador(estadoJugador) {
    const mapa = {
        espera: 'static/caballeroEspera.glb',
        correcto: 'static/caballeroCorrecto.glb',
        incorrecto: 'static/caballeroIncorrecto.glb',
        perder: 'static/caballeroPerder.glb',
        victoria: 'static/caballeroVictoria.glb',
    };
    return mapa[estadoJugador] || 'static/caballeroEspera.glb';
}

function rutaModeloEnemigo(enemigo, resultado) {
    if (!enemigo) return 'static/zombieEspera.glb';
    if (enemigo.derrotado) return 'static/EnemigoEliminado.glb';

    const sufijo = resultado === 'correcto' ? 'Correcto'
                 : resultado === 'incorrecto' ? 'Incorrecto'
                 : 'Espera';
    return `static/${enemigo.clave_modelo}${sufijo}.glb`;
}

function aplicarModelos(data) {
    const avatar = document.getElementById('objeto-avatar');
    const enemigoObj = document.getElementById('objeto-enemigo-1');

    if (avatar) {
        avatar.setAttribute('visible', 'true');
        avatar.setAttribute('gltf-model', rutaModeloJugador(data.modelo_jugador_estado));
    }

    if (enemigoObj && data.enemigo) {
        enemigoObj.setAttribute('visible', 'true');
        enemigoObj.setAttribute('gltf-model', rutaModeloEnemigo(data.enemigo, data.resultado));
    }
}

function actualizarVidas(data) {
    const txtAvatar = document.getElementById('texto-vida-avatar');
    if (txtAvatar) {
        txtAvatar.setAttribute('value', `Caballero: ${data.vida_avatar}%`);
    }

    const txtEnemigo = document.getElementById('texto-vida-e1');
    if (txtEnemigo && data.enemigo) {
        const etiquetaJefe = data.enemigo.es_jefe ? ' [JEFE]' : '';
        if (data.enemigo.derrotado || data.enemigo.vida <= 0) {
            txtEnemigo.setAttribute('value', `${data.enemigo.nombre}: Eliminado`);
        } else {
            txtEnemigo.setAttribute(
                'value',
                `${data.enemigo.nombre}${etiquetaJefe}: ${data.enemigo.vida}% (${data.enemigo.aciertos}/${data.enemigo.meta_aciertos})`
            );
        }
    }
}

// TEMPORIZADOR DE PREGUNTA

function actualizarTextoTiempo() {
    const elTiempo = document.getElementById('tiempo-pregunta');
    if (!elTiempo) return;
    elTiempo.style.display = 'block';
    elTiempo.innerText = `Tiempo: ${tiempoRestantePregunta}s`;
}

function ocultarTiempoPregunta() {
    const elTiempo = document.getElementById('tiempo-pregunta');
    if (elTiempo) {
        elTiempo.style.display = 'none';
    }
}

function detenerTemporizadorPregunta() {
    if (intervaloPregunta) {
        clearInterval(intervaloPregunta);
        intervaloPregunta = null;
    }
}

function iniciarTemporizadorPregunta() {
    detenerTemporizadorPregunta();
    tiempoRestantePregunta = DURACION_PREGUNTA_SEG;
    actualizarTextoTiempo();

    intervaloPregunta = setInterval(() => {
        if (!esperandoRespuesta || (estadoActual && estadoActual.juego_terminado)) {
            detenerTemporizadorPregunta();
            return;
        }

        tiempoRestantePregunta--;
        actualizarTextoTiempo();

        if (tiempoRestantePregunta <= 0) {
            detenerTemporizadorPregunta();
            detenerEscucha();
            // Tiempo agotado: se envía vacío para activar el flujo normal de pérdida de vida
            enviarRespuesta("");
        }
    }, 1000);
}

// INICIO Y REINICIO

function cargarEstadoInicial() {
    limpiarTemporizadores();
    const data = Juego.getEstado();
    estadoActual = data;
    actualizarVidas(data);
    leerPreguntaYEscuchar(data);
}

function reiniciarJuego() {
    limpiarTemporizadores();
    detenerEscucha();
    detenerHabla();

    Juego.reiniciar();
    document.getElementById('btn-reiniciar').style.display = 'none';
    cargarEstadoInicial();
}

function limpiarTemporizadores() {
    if (transicionEnemigoTimer) {
        clearTimeout(transicionEnemigoTimer);
        transicionEnemigoTimer = null;
    }
    detenerTemporizadorPregunta();
    ocultarTiempoPregunta();
}

// VOZ (HABLAR)

function detenerHabla() {
    hablaId++;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function hablar(texto, callbackFin) {
    if (!('speechSynthesis' in window)) {
        if (callbackFin) callbackFin();
        return;
    }

    const synth = window.speechSynthesis;
    synth.cancel();
    const miId = ++hablaId;

    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-ES';
    u.rate = 1.0;
    utterancesVivos.push(u);

    let terminado = false;
    let watchdog = null;

    const terminar = () => {
        if (terminado) return;
        terminado = true;
        clearTimeout(watchdog);
        const idx = utterancesVivos.indexOf(u);
        if (idx > -1) utterancesVivos.splice(idx, 1);

        if (miId !== hablaId) return;
        setTimeout(() => {
            if (miId === hablaId && callbackFin) callbackFin();
        }, 300);
    };

    u.onend = terminar;
    u.onerror = terminar;

    watchdog = setTimeout(terminar, Math.max(6000, texto.length * 220));

    setTimeout(() => {
        if (miId === hablaId) synth.speak(u);
    }, 100);
}

// VOZ (ESCUCHAR)

function detenerEscucha() {
    sesionVoz++;
    esperandoRespuesta = false;
    if (recognition) {
        try { recognition.abort(); } catch (e) {}
        recognition = null;
    }
}

function iniciarEscucha() {
    if (!esperandoRespuesta) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Tu navegador no soporta reconocimiento de voz. Usa Google Chrome actualizado.");
        return;
    }

    sesionVoz++;
    if (recognition) {
        try { recognition.abort(); } catch (e) {}
    }
    const miSesion = sesionVoz;
    const esVigente = () => miSesion === sesionVoz && esperandoRespuesta;

    const rec = new SpeechRecognition();
    rec.lang = 'es-ES';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = function () {
        if (!esVigente()) return;
        document.getElementById('estado-texto').innerText = "🎤 Te escucho... Habla ahora";
    };

    rec.onresult = function (event) {
        if (!esVigente()) return;
        const texto = event.results[0][0].transcript.toLowerCase();
        console.log("Usuario dijo:", texto);
        detenerEscucha();
        detenerTemporizadorPregunta();
        ocultarTiempoPregunta();
        enviarRespuesta(texto);
    };

    rec.onerror = function (event) {
        if (!esVigente()) return;
        console.warn("Aviso de reconocimiento:", event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            document.getElementById('estado-texto').innerText = "⚠️ Permite el uso del micrófono";
        }
    };

    rec.onend = function () {
        if (!esVigente()) return;
        setTimeout(() => {
            if (esVigente()) iniciarEscucha();
        }, 300);
    };

    recognition = rec;

    try {
        rec.start();
    } catch (e) {
        setTimeout(() => {
            if (esVigente()) iniciarEscucha();
        }, 1000);
    }
}

// FLUJO DEL JUEGO

function leerPreguntaYEscuchar(data) {
    detenerEscucha();
    detenerTemporizadorPregunta();
    ocultarTiempoPregunta();

    document.getElementById('pregunta-titulo').innerText = `Pregunta #${data.numero_pregunta}`;
    document.getElementById('pregunta-texto').innerText = data.pregunta_texto;
    document.getElementById('estado-texto').innerText = data.mensaje || "Leyendo pregunta...";

    // Al leer la nueva pregunta, volvemos a estado de espera visual si el juego sigue
    const dataEspera = {
        ...data,
        resultado: null,
        modelo_jugador_estado: data.juego_terminado ? data.modelo_jugador_estado : 'espera'
    };
    aplicarModelos(dataEspera);

    hablar(`Siguiente pregunta: ${data.pregunta_texto}`, () => {
        if (!estadoActual || !estadoActual.juego_terminado) {
            esperandoRespuesta = true;
            iniciarEscucha();
            iniciarTemporizadorPregunta();
        }
    });
}

// Antes hacía fetch('/api/responder'); ahora llama directo a la lógica local
function enviarRespuesta(texto) {
    detenerTemporizadorPregunta();
    ocultarTiempoPregunta();
    document.getElementById('estado-texto').innerText = "Procesando...";

    manejarResultado(Juego.responder(texto));
}

function manejarResultado(data) {
    estadoActual = data;
    actualizarVidas(data);
    aplicarModelos(data);
    document.getElementById('estado-texto').innerText = data.mensaje;

    // Fin del juego: victoria (caballeroVictoria) o derrota (caballeroPerder)
    if (data.juego_terminado) {
        detenerEscucha();
        detenerTemporizadorPregunta();
        ocultarTiempoPregunta();
        document.getElementById('btn-reiniciar').style.display = 'block';
        hablar(data.mensaje);
        return;
    }

    // Enemigo eliminado: muestra EnemigoEliminado.glb y caballeroCorrecto por 4s antes de pasar pregunta
    if (data.evento === 'enemigo_eliminado') {
        detenerEscucha();
        detenerTemporizadorPregunta();
        ocultarTiempoPregunta();

        hablar(data.mensaje, () => {
            transicionEnemigoTimer = setTimeout(() => {
                const nuevoEstado = Juego.siguienteEnemigo();
                estadoActual = nuevoEstado;
                actualizarVidas(nuevoEstado);
                leerPreguntaYEscuchar(nuevoEstado);
            }, DURACION_ENEMIGO_ELIMINADO_MS);
        });
        return;
    }

    // Turno normal (acierto o fallo sin eliminar ni terminar partida)
    const feedback = data.resultado === 'correcto'
        ? "¡Correcto! El ataque acierta"
        : `Incorrecto. Llevas ${data.fallos_jugador} de ${data.max_fallos_jugador} fallos.`;

    hablar(feedback, () => leerPreguntaYEscuchar(data));
}