// Inicializacion de variables
let estadoActual = null;
let esperandoRespuesta = false;   // true solo mientras el micrófono debe estar activo
let recognition = null;
let sesionVoz = 0;                // ID de la instancia de reconocimiento vigente
let hablaId = 0;                  // ID de la locución vigente
let transicionEnemigoTimer = null;
let intervaloPregunta = null;     // actualiza el contador de 10s en pantalla
let tiempoRestantePregunta = 10;
let audioActual = null; // Representa al objeto que reproduce los audios cuando se gana o se pierde el juego
const utterancesVivos = [];       // evita que el navegador los elimine antes de terminar

// Dom elementos
const hudPreguntas = document.getElementById('trivia-hud');

const panelInicio = document.getElementById('pantalla-inicio');
const btnIniciar = document.getElementById('btn-iniciar');

// Etiquetas de vida
const etiquetasVida = document.getElementsByClassName('etiqueta-vida');

// Barras de vida del jugador, cada una muestra un estado de la vida
const barraVidaLlenaJugador = document.getElementById('barra-jugador-completa');
const barraVida2_3Jugador = document.getElementById('barra-jugador-2-3');
const barraVida1_3Jugador = document.getElementById('barra-jugador-1-3');
const barraVida0_3Jugador = document.getElementById('barra-jugador-0-3');

// Barras de vida del enemigo, cada una muestra un estado de la vida
const barraVidaLlenaEnemigo = document.getElementById('barra-enemigo-completa');
const barraVida2_3Enemigo = document.getElementById('barra-enemigo-2-3');
const barraVida1_3Enemigo = document.getElementById('barra-enemigo-1-3');
const barraVida0_3Enemigo = document.getElementById('barra-enemigo-0-3');

const panelFinal = document.getElementById('pantalla-final');
const tituloFinal = document.getElementById('mensaje-final');

const DURACION_PREGUNTA_SEG = 10;
const DURACION_ENEMIGO_ELIMINADO_MS = 4000;

// Bandera para iniciar el juego
let juegoEnProgreso = false;

// Mantiene el micrófono abierto toda la partida y muestra su nivel en el HUD (sirve de diagnóstico)
// Solo se activa si abres la página con ?mic al final de la URL (ej. index.html?mic)
const DIAGNOSTICO_MIC = new URLSearchParams(window.location.search).has('mic');
let streamMic = null;
async function abrirMicrofono() {
    if (streamMic) return;
    try {
        const fila = document.getElementById('fila-nivel-mic');
        if (fila) fila.style.display = 'block';
        streamMic = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctx.resume();
        const analizador = ctx.createAnalyser();
        analizador.fftSize = 512;
        ctx.createMediaStreamSource(streamMic).connect(analizador);
        const datos = new Uint8Array(analizador.fftSize);
        const el = document.getElementById('nivel-mic');
        setInterval(() => {
            analizador.getByteTimeDomainData(datos);
            let max = 0;
            for (const v of datos) max = Math.max(max, Math.abs(v - 128));
            const barras = Math.min(10, Math.round(max / 6));
            if (el) el.innerText = '🎚️ Mic ' + '█'.repeat(barras) + '░'.repeat(10 - barras);
        }, 150);
    } catch (e) {
        console.warn("No se pudo abrir el micrófono:", e);
    }
}

btnIniciar.addEventListener('click', async () => {
    if (DIAGNOSTICO_MIC) await abrirMicrofono();
    // Se cargan los elementos en pantalla y se oculta la ventana de inicio
    cargarEstadoInicial();
    panelInicio.style.display = "none";
    hudPreguntas.style.display = "block";
    Array.from(etiquetasVida).forEach(element => {
        element.style.display = "block";
    });
});

// MODELOS.GLB (rutas relativas para GitHub Pages: SIN "/" inicial)

// Funcion que regresa un modelo para el jugador dependiendo de el estado actual
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

// Regresa un nuevo modelo para el enemigo dependiendo un estado
function rutaModeloEnemigo(enemigo, resultado) {
    // Si no se puede acceder al modelo solicitado entonces se regresa otro de un zombie
    if (!enemigo) return 'static/zombieEspera.glb';
    // Si el enemigo esta derrotado se regresa su modelo de enemigo derrotado
    if (enemigo.derrotado) return 'static/EnemigoEliminado.glb';
    // Se regresa un modelo dinamicamente dependiendo del resultado
    const sufijo = resultado === 'correcto' ? 'Correcto'
                 : resultado === 'incorrecto' ? 'Incorrecto'
                 : 'Espera';
    return `static/${enemigo.clave_modelo}${sufijo}.glb`;
}

// Funcion que muestra los modelos del jugador y del enemigo
function aplicarModelos(data) {
    const avatar = document.getElementById('objeto-avatar');
    const enemigoObj = document.getElementById('objeto-enemigo-1');

    // Se accede al modelo del avatar y se muestra en pantalla.
    if (avatar) {
        avatar.setAttribute('visible', 'true');
        // Solo se vuelve a cargar el modelo si cambió (evita re-descargar y re-procesar el mismo .glb)
        const ruta = rutaModeloJugador(data.modelo_jugador_estado);
        if (avatar.dataset.modelo !== ruta) {
            avatar.dataset.modelo = ruta;
            avatar.setAttribute('gltf-model', ruta);
        }
    }

    // Si existe el modelo del enemigo se muestra en pantalla
    if (enemigoObj && data.enemigo) {
        enemigoObj.setAttribute('visible', 'true');
        const ruta = rutaModeloEnemigo(data.enemigo, data.resultado);
        if (enemigoObj.dataset.modelo !== ruta) {
            enemigoObj.dataset.modelo = ruta;
            enemigoObj.setAttribute('gltf-model', ruta);
        }
    }
}

// Actualiza el indicador de vida del avatar y del enemigo en Realidad virtual
function actualizarVidas(data) {
    // Se muestra el indicador de vida correcto para el jugador
    cambiarEstadoVidaJugador(data.vida_avatar);
    console.log("La vida del jugador es: " + data.vida_avatar);
    const txtAvatar = document.getElementById('texto-vida-avatar');
    if (txtAvatar) {
        txtAvatar.setAttribute('value', `Caballero: ${data.vida_avatar}%`);
    }
    // Se muestra el indicador de vida correcto para el enemigo
    cambiarEstadoVidaEnemigo(data.enemigo.vida);
    console.log("La vida del enemigo es: " + data.enemigo.vida);

    // Se accede al indicador de vida del enemigo y se actualiza
    const txtEnemigo = document.getElementById('texto-vida-e1');
    if (txtEnemigo && data.enemigo) {
        // Se detecta si el enemigo es un jefe
        const etiquetaJefe = data.enemigo.es_jefe ? ' [JEFE]' : '';
        // Si la vida del enemigo se agoto entonces el indicador pasa a ser "Eliminado"
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

// Funcion que actualiza el indicador de tiempo para cada pregunta
function actualizarTextoTiempo() {
    const elTiempo = document.getElementById('tiempo-pregunta');
    if (!elTiempo) return;
    elTiempo.style.display = 'block';
    elTiempo.innerText = `Tiempo: ${tiempoRestantePregunta}s`;
}

// Oculta el indicador de tiempo
function ocultarTiempoPregunta() {
    const elTiempo = document.getElementById('tiempo-pregunta');
    if (elTiempo) {
        elTiempo.style.display = 'none';
    }
}

// Funcion que detiene el temporizador de la pregunta
function detenerTemporizadorPregunta() {
    if (intervaloPregunta) {
        clearInterval(intervaloPregunta);
        intervaloPregunta = null;
    }
}

// Funcion que habilita el temporizador y la logica para que transcurra el tiempo
function iniciarTemporizadorPregunta() {
    detenerTemporizadorPregunta();
    tiempoRestantePregunta = DURACION_PREGUNTA_SEG;
    actualizarTextoTiempo();

    intervaloPregunta = setInterval(() => {
        // Si el juego terminó o ya no se espera respuesta, se detiene el temporizador
        if (!esperandoRespuesta || (estadoActual && estadoActual.juego_terminado)) {
            detenerTemporizadorPregunta();
            return;
        }

        tiempoRestantePregunta--;
        actualizarTextoTiempo();

        // Si el tiempo llega a cero se detiene el temporizador y se deshabilita el microfono
        if (tiempoRestantePregunta <= 0) {
            detenerTemporizadorPregunta();
            detenerEscucha();
            // Tiempo agotado: se envía vacío para activar el flujo normal de pérdida de vida
            enviarRespuesta("");
        }
    }, 1000);
}

// INICIO Y REINICIO

// Obtiene el estado inicial del juego (ahora directo desde juego.js)
function cargarEstadoInicial() {
    // Desactiva el panel con el mensaje final
    panelFinal.style.display = "none";
    limpiarTemporizadores();

    const data = Juego.getEstado();
    estadoActual = data;
    actualizarVidas(data);
    leerPreguntaYEscuchar(data);
}

// Funcion que reinicia el juego
function reiniciarJuego() {
    limpiarTemporizadores();
    detenerEscucha();
    detenerHabla();
    // Se detienen los audios que se estan reproduciendo
    detenerAudio();

    Juego.reiniciar();
    document.getElementById('btn-reiniciar').style.display = 'none';
    cargarEstadoInicial();
}

// Se limpia el temporizador
function limpiarTemporizadores() {
    if (transicionEnemigoTimer) {
        clearTimeout(transicionEnemigoTimer);
        transicionEnemigoTimer = null;
    }
    detenerTemporizadorPregunta();
    ocultarTiempoPregunta();
}

// VOZ (HABLAR)

// Se cancela el habla de la computadora
function detenerHabla() {
    hablaId++;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// La computadora reproduce el sonido
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

    // Se termina de reproducir el audio.
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

// Se detiene el microfono en escucha
function detenerEscucha() {
    sesionVoz++;
    // La bandera en false representa que el microfono no debe estar activado
    esperandoRespuesta = false;
    liberarReconocimiento();
}

// Suelta la instancia anterior de reconocimiento sin que sus eventos interfieran con la nueva
function liberarReconocimiento() {
    if (!recognition) return;
    const viejo = recognition;
    recognition = null;
    viejo.onstart = viejo.onresult = viejo.onerror = viejo.onend = null;
    try { viejo.abort(); } catch (e) {}
}

// Se habilita el microfono para escucha, se actualiza el HUD y se procesa lo que diga el usuario
function iniciarEscucha() {
    if (!esperandoRespuesta) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Tu navegador no soporta reconocimiento de voz. Usa Google Chrome actualizado.");
        return;
    }

    liberarReconocimiento();
    sesionVoz++;
    const miSesion = sesionVoz;
    const esVigente = () => miSesion === sesionVoz && esperandoRespuesta;

    // Se crea la entidad para el reconocimiento de voz y se configura
    const rec = new SpeechRecognition();
    rec.lang = 'es-ES';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    // Tiempo de espera antes de reintentar (se alarga si hay errores)
    let reintentoMs = 400;

    rec.onstart = function () {
        if (!esVigente()) return;
        document.getElementById('estado-texto').innerText = "🎤 Te escucho... Habla ahora";
    };

    // Se procesa lo que el usuario dijo, se detiene la escucha y se evalúa la respuesta
    rec.onresult = function (event) {
        if (!esVigente()) return;
        const texto = event.results[0][0].transcript.toLowerCase();
        console.log("Usuario dijo:", texto);
        detenerEscucha();
        detenerTemporizadorPregunta();
        ocultarTiempoPregunta();
        enviarRespuesta(texto);
    };

    // Se imprimen errores en consola y se avisa al usuario cuando es relevante
    rec.onerror = function (event) {
        if (!esVigente()) return;
        console.warn("Aviso de reconocimiento:", event.error);
        const msg = document.getElementById('estado-texto');
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            msg.innerText = "⚠️ Permite el uso del micrófono";
            reintentoMs = 3000;
        } else if (event.error === 'audio-capture') {
            msg.innerText = "⚠️ No se detecta ningún micrófono";
            reintentoMs = 3000;
        } else if (event.error === 'network') {
            msg.innerText = "⚠️ Sin conexión con el servicio de voz, reintentando...";
            reintentoMs = 1500;
        }
        // 'no-speech' y 'aborted' son normales: onend reinicia la escucha
    };

    // Si el reconocimiento termina sin resultado (silencio o error), se vuelve a iniciar
    rec.onend = function () {
        if (!esVigente()) return;
        recognition = null;
        setTimeout(() => {
            if (esVigente()) iniciarEscucha();
        }, reintentoMs);
    };

    recognition = rec;

    // Arranque diferido: Chrome necesita un momento tras cerrar la sesion anterior
    // (y tras terminar la voz sintetizada) antes de poder abrir el microfono de nuevo
    setTimeout(() => {
        if (!esVigente() || recognition !== rec) return;
        try {
            rec.start();
        } catch (e) {
            console.warn("No se pudo iniciar el reconocimiento:", e);
            setTimeout(() => {
                if (esVigente()) iniciarEscucha();
            }, 1000);
        }
    }, 500);
}

// FLUJO DEL JUEGO

// Actualiza la informacion de la pregunta actual, aplica los modelos e inicia la voz y el temporizador
function leerPreguntaYEscuchar(data) {
    detenerEscucha();
    detenerTemporizadorPregunta();
    ocultarTiempoPregunta();
    // Se actualiza la informacion de la pregunta
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

    // Se pronuncia la siguiente pregunta y se inicia la escucha y el temporizador
    hablar(`Siguiente pregunta: ${data.pregunta_texto}`, () => {
        if (!estadoActual || !estadoActual.juego_terminado) {
            esperandoRespuesta = true;
            iniciarEscucha();
            iniciarTemporizadorPregunta();
        }
    });
}

// Evalúa la respuesta con la lógica local (antes era un fetch a /api/responder)
function enviarRespuesta(texto) {
    detenerTemporizadorPregunta();
    ocultarTiempoPregunta();
    document.getElementById('estado-texto').innerText = "Procesando...";

    manejarResultado(Juego.responder(texto));
}

// Actualiza el HUD, la vida, los modelos y decide el siguiente paso del flujo
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
        if (data.victoria) {
            panelFinal.style.display = "flex";
            tituloFinal.innerText = "!!!GANASTE!!!";
            reproducirAudio("static/audio/ganar.mp3", () => {
                console.log("Ganaste");
            });
        } else {
            panelFinal.style.display = "flex";
            tituloFinal.innerText = "PERDISTE";
            reproducirAudio("static/audio/perder.mp3", () => {
                console.log("Perdiste");
            });
        }

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

function cambiarEstadoVidaJugador(cantidadVida) {
    const numVida = Number(cantidadVida);
    const contenedoresPasados = document.getElementsByClassName('barra-vida--jugador');
    Array.from(contenedoresPasados).forEach(element => {
        element.style.display = "none";
    });

    if (numVida >= 100) {
        barraVidaLlenaJugador.style.display = "block";
    } else if (numVida >= 67 && numVida < 100) {
        barraVida2_3Jugador.style.display = "block";
    } else if (numVida >= 33 && numVida < 67) {
        barraVida1_3Jugador.style.display = "block";
    } else if (numVida < 33) {
        barraVida0_3Jugador.style.display = "block";
    }
}

function cambiarEstadoVidaEnemigo(cantidadVida) {
    const numVida = Number(cantidadVida);
    const contenedoresPasados = document.getElementsByClassName('barra-vida--enemigo');
    Array.from(contenedoresPasados).forEach(element => {
        element.style.display = "none";
    });

    if (numVida >= 100) {
        barraVidaLlenaEnemigo.style.display = "block";
    } else if (numVida >= 67 && numVida < 100) {
        barraVida2_3Enemigo.style.display = "block";
    } else if (numVida >= 33 && numVida < 67) {
        barraVida1_3Enemigo.style.display = "block";
    } else if (numVida < 33) {
        barraVida0_3Enemigo.style.display = "block";
    }
}

// Funcion que reproduce un audio mediante una url (Reservado para cuando se gana o se pierde el juego),
// recibe la url y una funcion que se ejecuta cuando termina de reproducirse el audio
async function reproducirAudio(urlAudio, callbackFin) {
    // Bandera para gestionar el fin del audio
    let reproduccionFinalizada = false;

    // Funcion interna que marca el audio como terminado y ejecuta el callback una sola vez
    const finalizar = () => {
        if (!reproduccionFinalizada) {
            reproduccionFinalizada = true;
            if (callbackFin) callbackFin();
        }
    };

    try {
        if (!urlAudio) {
            throw new Error("La URL de audio no es válida.");
        }

        // Se crea una nueva entidad Audio y se almacena en la variable global
        const audio = new Audio(urlAudio);
        audioActual = audio;

        audio.addEventListener("ended", () => {
            if (audioActual === audio) {
                audioActual = null;
            }
            finalizar();
        });

        audio.addEventListener("error", () => {
            if (audioActual === audio) {
                audioActual = null;
            }
            finalizar();
        });

        // await permite que try / catch capture si play() es rechazado (el navegador puede rechazarlo)
        await audio.play();
    } catch (error) {
        console.error("Error al intentar reproducir el audio:", error);
        audioActual = null;
        finalizar();
    }
}

// Funcion que detiene el audio reproducido al ganar o perder el juego
function detenerAudio() {
    if (audioActual) {
        audioActual.pause();
        audioActual.currentTime = 0;
        audioActual.removeAttribute("src");
        audioActual.load();
        audioActual = null;
    }
}