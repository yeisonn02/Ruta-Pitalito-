/* Copias de seguridad: crear un archivo con todos los datos, revisarlo y restaurarlo. */
(function () {
  'use strict';
  var APP = 'mi-ruta-pitalito';
  var FORMATO = 1;
  var MAX_BYTES = 20 * 1024 * 1024;
  var CAMPOS_TEXTO = ['municipio', 'vereda', 'sector', 'contacto', 'telefono', 'referencias', 'observaciones'];
  var ESTADOS = { pendiente: 1, visitado: 1, no_atendido: 1 };
  var esc = Clientes.esc;

  /* ---------------- Validación estricta del archivo ---------------- */
  function fechaValida(s) { return typeof s === 'string' && !isNaN(Date.parse(s)); }
  function entero(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n > 0; }
  function falla(msg) { throw new Error(msg); }

  function validar(texto) {
    if (typeof texto !== 'string' || !texto.trim()) return { ok: false, error: 'El archivo está vacío.' };
    if (texto.length > MAX_BYTES) return { ok: false, error: 'El archivo es demasiado grande para ser un respaldo de Mi Ruta.' };
    var o;
    try { o = JSON.parse(texto); }
    catch (e) { return { ok: false, error: 'No se pudo leer el archivo: no es un respaldo válido o quedó incompleto.' }; }
    try {
      if (!o || typeof o !== 'object' || Array.isArray(o) || o.app !== APP) falla('Este archivo no es un respaldo de Mi Ruta.');
      if (typeof o.formato !== 'number' || o.formato < 1) falla('El archivo no indica su formato.');
      if (o.formato > FORMATO) falla('Este respaldo lo creó una versión más nueva de la app. Actualiza la app e inténtalo de nuevo.');
      if (!fechaValida(o.exportado)) falla('El respaldo no tiene una fecha válida.');
      if (!Array.isArray(o.clientes) || !Array.isArray(o.visitas)) falla('Al respaldo le faltan datos (clientes o visitas).');
      if (o.resumen && (o.resumen.clientes !== o.clientes.length || o.resumen.visitas !== o.visitas.length)) {
        falla('El respaldo está incompleto: la cantidad de registros no coincide con la esperada.');
      }
      var ids = {}, clientes = [], visitas = [];
      o.clientes.forEach(function (c, i) {
        var n = i + 1;
        if (!c || typeof c !== 'object') falla('Cliente #' + n + ': dato inválido.');
        if (!entero(c.id)) falla('Cliente #' + n + ': identificador inválido.');
        if (ids[c.id]) falla('Cliente #' + n + ': identificador repetido.');
        if (typeof c.tienda !== 'string' || !c.tienda.trim()) falla('Cliente #' + n + ': falta el nombre de la tienda.');
        if (c.tienda.length > 300) falla('Cliente #' + n + ': el nombre de la tienda es demasiado largo.');
        ids[c.id] = true;
        var l = { id: c.id, tienda: c.tienda.trim() };
        CAMPOS_TEXTO.forEach(function (k) {
          var v = c[k]; if (v == null) v = '';
          if (typeof v !== 'string' || v.length > 5000) falla('Cliente #' + n + ': el campo "' + k + '" no es válido.');
          l[k] = v;
        });
        var tieneLat = c.lat != null, tieneLng = c.lng != null;
        if (tieneLat !== tieneLng) falla('Cliente #' + n + ': coordenadas incompletas.');
        if (tieneLat) {
          if (typeof c.lat !== 'number' || typeof c.lng !== 'number' || !isFinite(c.lat) || !isFinite(c.lng) ||
              c.lat < -90 || c.lat > 90 || c.lng < -180 || c.lng > 180) falla('Cliente #' + n + ': coordenadas fuera de rango.');
          if (c.precision != null && (typeof c.precision !== 'number' || !isFinite(c.precision) || c.precision < 0)) falla('Cliente #' + n + ': precisión inválida.');
          if (c.fechaGps != null && !fechaValida(c.fechaGps)) falla('Cliente #' + n + ': fecha de GPS inválida.');
          l.lat = c.lat; l.lng = c.lng; l.precision = c.precision == null ? null : c.precision; l.fechaGps = c.fechaGps == null ? null : c.fechaGps;
        } else { l.lat = null; l.lng = null; l.precision = null; l.fechaGps = null; }
        if (c.creado != null && fechaValida(c.creado)) l.creado = c.creado;
        if (c.modificado != null && fechaValida(c.modificado)) l.modificado = c.modificado;
        if (c.ultimaVisita == null) l.ultimaVisita = null;
        else {
          var u = c.ultimaVisita;
          if (typeof u !== 'object' || !fechaValida(u.fecha) || !ESTADOS[u.estado] || u.estado === 'pendiente') falla('Cliente #' + n + ': última visita inválida.');
          l.ultimaVisita = { fecha: u.fecha, estado: u.estado };
        }
        clientes.push(l);
      });
      var usados = {}, idsV = {};
      o.visitas.forEach(function (v, i) {
        var n = i + 1;
        if (!v || typeof v !== 'object') falla('Visita #' + n + ': dato inválido.');
        if (!entero(v.id) || idsV[v.id]) falla('Visita #' + n + ': identificador inválido o repetido.');
        if (!ids[v.clienteId]) falla('Visita #' + n + ': apunta a un cliente que no está en el respaldo.');
        if (usados[v.clienteId]) falla('Visita #' + n + ': el cliente aparece dos veces en la ruta.');
        if (!ESTADOS[v.estado]) falla('Visita #' + n + ': estado inválido.');
        if (v.estado === 'pendiente' ? v.fecha != null : !fechaValida(v.fecha)) falla('Visita #' + n + ': fecha inconsistente con su estado.');
        if (typeof v.orden !== 'number' || !isFinite(v.orden)) falla('Visita #' + n + ': orden inválido.');
        idsV[v.id] = true; usados[v.clienteId] = true;
        visitas.push({ id: v.id, clienteId: v.clienteId, estado: v.estado, fecha: v.fecha == null ? null : v.fecha, orden: v.orden });
      });
      return { ok: true, datos: { clientes: clientes, visitas: visitas, exportado: o.exportado, version_app: typeof o.version_app === 'string' ? o.version_app : '' } };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  function armar(todo) {
    var cs = todo.clientes.slice().sort(function (a, b) { return a.id - b.id; });
    var vs = todo.visitas.slice().sort(function (a, b) { return a.orden - b.orden; });
    return JSON.stringify({
      app: APP, formato: FORMATO, exportado: new Date().toISOString(), version_app: window.VERSION_APP || '',
      resumen: { clientes: cs.length, visitas: vs.length }, clientes: cs, visitas: vs
    }, null, 1);
  }

  /* ---------------- Estado del respaldo (también lo usa Inicio) ---------------- */
  function diasDesde(iso) { return Math.floor((Date.now() - Date.parse(iso)) / 86400000); }
  function hace(iso) { var d = diasDesde(iso); return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : 'hace ' + d + ' días'; }

  function estado() {
    return Promise.all([DB.listarClientes(), DB.listarRuta(), DB.obtenerMeta('ultimoRespaldo'), DB.obtenerMeta('ultimoCambio')]).then(function (r) {
      var nC = r[0].length, nV = r[1].length, ult = r[2], cambio = r[3];
      var base = { clientes: nC, visitas: nV, ultimo: ult };
      var hayCambios = !!(ult && cambio && Date.parse(cambio) > Date.parse(ult));
      function res(nivel, titulo, texto) { base.nivel = nivel; base.titulo = titulo; base.texto = texto; base.hayCambios = hayCambios; return base; }
      if (!nC && !nV && !ult) return res('sinDatos', 'Respaldo', 'Cuando guardes clientes, exporta copias de seguridad con frecuencia. Los datos viven solo en este teléfono.');
      if (!ult) return res('nunca', '⚠ Aún no tienes copia de seguridad', 'Si el iPhone borra los datos de la app, perderías ' + (nC === 1 ? 'tu cliente guardado' : 'tus ' + nC + ' clientes guardados') + '. Toca aquí para exportar una copia.');
      if (hayCambios && diasDesde(ult) >= 2) return res('pendiente', '⚠ Tienes cambios sin respaldar', 'Tu última copia fue ' + hace(ult) + ' y has hecho cambios desde entonces. Toca aquí para exportar una copia nueva.');
      return res('alDia', 'Copia de seguridad', 'Última copia: ' + hace(ult) + (hayCambios ? ' (hay cambios nuevos desde entonces).' : ' · al día.'));
    });
  }
  function bloqueEstado(e, tag, href) {
    var clase = (e.nivel === 'alDia' || e.nivel === 'sinDatos') && !e.hayCambios ? 'aviso ok' : (e.nivel === 'sinDatos' ? 'aviso' : 'aviso');
    if (e.nivel === 'alDia') clase = 'aviso ok';
    return '<' + tag + (href ? ' href="' + href + '"' : '') + ' class="' + clase + ' estado-resp" data-nivel="' + e.nivel + '"><strong>' + esc(e.titulo) + '</strong>' + esc(e.texto) + '</' + tag + '>';
  }

  /* ---------------- Pantalla ---------------- */
  function nombreArchivo() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return 'respaldo-mi-ruta-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
  }
  function kb(texto) { return Math.max(1, Math.round(new Blob([texto]).size / 1024)) + ' KB'; }
  function plural(n, s, p) { return n + ' ' + (n === 1 ? s : p); }
  function errorHtml(msg, titulo) { return '<div class="error" role="alert"><strong>' + esc(titulo || 'No se pudo completar') + '</strong>' + esc(msg) + '</div>'; }

  function pantalla(ctx) {
    ctx.cabecera('Respaldo', '#/');
    ctx.contenedor.innerHTML = '<p class="cargando">Cargando…</p>';
    return estado().then(function (e) {
      ctx.contenedor.innerHTML =
        '<div id="caja-estado">' + bloqueEstado(e, 'div') + '</div>' +
        '<h2 class="seccion">1. Guardar una copia</h2>' +
        '<p class="explica">Crea un archivo con todos tus clientes, ubicaciones y visitas. Guárdalo en <strong>Archivos</strong> (iCloud Drive) o envíatelo por WhatsApp o correo, para tenerlo <strong>fuera del teléfono</strong>.</p>' +
        '<button class="boton grande" type="button" id="crear">Crear copia de seguridad</button>' +
        '<div id="listo"></div>' +
        '<h2 class="seccion">2. Restaurar una copia</h2>' +
        '<p class="explica">Reemplaza todo lo que hay ahora en la app por lo que contiene el archivo. Sirve si cambias de teléfono o se pierden los datos. También sirve para <strong>comprobar</strong> que tu copia sirve: elígela, mira el resumen y toca Cancelar.</p>' +
        '<label class="boton" for="archivo" id="elegir">Elegir archivo de respaldo</label>' +
        '<input id="archivo" class="oculto" type="file" accept=".json,application/json,text/plain">' +
        '<details class="como-llegar"><summary>O pegar el texto del respaldo</summary>' +
          '<textarea id="pegado" class="campo" rows="5" placeholder="Pega aquí el texto copiado del respaldo" aria-label="Texto del respaldo"></textarea>' +
          '<button class="boton secundario" type="button" id="revisar-texto">Revisar texto</button></details>' +
        '<div id="revision"></div>' +
        '<p class="nota">iOS puede borrar los datos de una web si pasa mucho tiempo sin usarla, o si borras la app. Por eso la copia fuera del teléfono es la única protección real. Haz una copia después de cargar clientes nuevos y cada vez que termines una jornada de visitas.</p>';
      enlazar(ctx);
    }).catch(function (e) { ctx.contenedor.innerHTML = errorHtml(e.message); });
  }

  function refrescarEstado() {
    return estado().then(function (e) { var c = document.getElementById('caja-estado'); if (c) c.innerHTML = bloqueEstado(e, 'div'); });
  }

  function enlazar(ctx) {
    var listo = document.getElementById('listo'), revision = document.getElementById('revision');

    /* ----- Crear copia ----- */
    document.getElementById('crear').addEventListener('click', function () {
      var boton = this; boton.disabled = true; listo.innerHTML = '<p class="cargando">Preparando…</p>';
      DB.exportarTodo().then(function (todo) {
        var texto = armar(todo), v = validar(texto);
        if (!v.ok) throw new Error('La copia no pasó la verificación (' + v.error + '). No la uses.');
        var nombre = nombreArchivo(), instante = v.datos.exportado;
        var archivo = (typeof File === 'function') ? new File([texto], nombre, { type: 'application/json' }) : null;
        listo.innerHTML =
          '<div class="panel"><div class="fila"><span class="fila-etiqueta">Copia lista y verificada</span>' +
          '<span class="fila-valor">' + plural(v.datos.clientes.length, 'cliente', 'clientes') + ' · ' + plural(v.datos.visitas.length, 'visita en la ruta', 'visitas en la ruta') + ' · ' + kb(texto) + '</span></div></div>' +
          '<p class="nota" style="margin-top:6px">Archivo: ' + esc(nombre) + '</p>' +
          '<button class="boton grande" type="button" id="compartir">Guardar o compartir archivo</button>' +
          '<button class="boton secundario" type="button" id="descargar">Descargar archivo</button>' +
          '<button class="boton secundario" type="button" id="copiar-texto">Copiar como texto</button>' +
          '<p id="msg-resp" class="gps-estado" role="status"></p>';
        var msg = document.getElementById('msg-resp');
        function registrar(aviso) {
          return DB.guardarMeta('ultimoRespaldo', instante).then(function () { msg.textContent = aviso; return refrescarEstado(); });
        }
        document.getElementById('compartir').addEventListener('click', function () {
          if (archivo && navigator.share && navigator.canShare && navigator.canShare({ files: [archivo] })) {
            navigator.share({ files: [archivo], title: 'Copia de seguridad de Mi Ruta' }).then(function () {
              return registrar('Listo. Comprueba que el archivo quedó guardado donde elegiste.');
            }).catch(function (err) {
              msg.classList.remove('con-error');
              if (err && err.name === 'AbortError') msg.textContent = 'No se guardó: cerraste el menú. La copia no cuenta hasta que la guardes.';
              else { msg.classList.add('con-error'); msg.textContent = 'No se pudo abrir el menú de compartir. Prueba "Descargar archivo" o "Copiar como texto".'; }
            });
          } else { msg.classList.add('con-error'); msg.textContent = 'Este navegador no permite compartir archivos. Usa "Descargar archivo" o "Copiar como texto".'; }
        });
        document.getElementById('descargar').addEventListener('click', function () {
          try {
            var url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
            var a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
            registrar('Se inició la descarga. Busca el archivo en Archivos > Descargas y comprueba que exista.');
          } catch (err) { msg.classList.add('con-error'); msg.textContent = 'No se pudo descargar: ' + err.message; }
        });
        document.getElementById('copiar-texto').addEventListener('click', function () {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(texto).then(function () {
              return registrar('Texto copiado. Pégalo en Notas, WhatsApp o un correo para guardarlo fuera de la app.');
            }).catch(function () { msg.classList.add('con-error'); msg.textContent = 'No se pudo copiar el texto.'; });
          } else { msg.classList.add('con-error'); msg.textContent = 'Este navegador no permite copiar automáticamente.'; }
        });
      }).catch(function (e) { listo.innerHTML = errorHtml(e.message); })
        .then(function () { boton.disabled = false; });
    });

    /* ----- Restaurar ----- */
    function revisar(texto) {
      var v = validar(texto);
      if (!v.ok) { revision.innerHTML = errorHtml(v.error, 'Este archivo no se puede usar'); return; }
      Promise.all([DB.listarClientes(), DB.listarRuta()]).then(function (r) {
        var d = v.datos, a = r[0].length, b = r[1].length;
        revision.innerHTML =
          '<div class="panel" style="margin-top:14px">' +
          '<div class="fila"><span class="fila-etiqueta">Respaldo del</span><span class="fila-valor">' + esc(Gps.fechaCorta(d.exportado)) + '</span></div>' +
          '<div class="fila"><span class="fila-etiqueta">Contiene</span><span class="fila-valor" id="cont-resp">' + plural(d.clientes.length, 'cliente', 'clientes') + ' · ' + plural(d.visitas.length, 'visita en la ruta', 'visitas en la ruta') + '</span></div>' +
          '<div class="fila"><span class="fila-etiqueta">Ahora en la app</span><span class="fila-valor">' + plural(a, 'cliente', 'clientes') + ' · ' + plural(b, 'visita en la ruta', 'visitas en la ruta') + '</span></div></div>' +
          (a || b ? '<div class="aviso" style="margin-top:12px"><strong>Se reemplazará todo lo actual</strong>Si lo que tienes ahora no está respaldado, cancela y crea una copia primero.</div>' : '') +
          '<button class="boton peligro" type="button" id="restaurar">Restaurar este respaldo</button>' +
          '<button class="boton secundario" type="button" id="cancelar-rest">Cancelar</button><div id="res-rest"></div>';
        document.getElementById('cancelar-rest').addEventListener('click', function () { revision.innerHTML = ''; });
        document.getElementById('restaurar').addEventListener('click', function () {
          if (!confirm('¿Restaurar? Se reemplazarán tus ' + a + ' clientes actuales por los ' + d.clientes.length + ' del respaldo. Esto no se puede deshacer.')) return;
          var boton = this; boton.disabled = true;
          DB.restaurarTodo(d.clientes, d.visitas, d.exportado).then(function () {
            revision.innerHTML = '<div class="aviso ok" role="status" style="margin-top:14px"><strong>Respaldo restaurado</strong>' + plural(d.clientes.length, 'cliente', 'clientes') + ' y ' + plural(d.visitas.length, 'visita', 'visitas') + ' recuperados. <a href="#/clientes">Ver clientes</a></div>';
            return refrescarEstado();
          }).catch(function (e) {
            boton.disabled = false;
            document.getElementById('res-rest').innerHTML = errorHtml('No se restauró nada: tus datos actuales siguen intactos. (' + e.message + ')');
          });
        });
      }).catch(function (e) { revision.innerHTML = errorHtml(e.message); });
    }

    document.getElementById('archivo').addEventListener('change', function () {
      var f = this.files && this.files[0], campo = this;
      if (!f) return;
      if (f.size > MAX_BYTES) { revision.innerHTML = errorHtml('El archivo es demasiado grande para ser un respaldo de Mi Ruta.', 'Este archivo no se puede usar'); campo.value = ''; return; }
      var lector = new FileReader();
      lector.onload = function () { revisar(String(lector.result)); campo.value = ''; };
      lector.onerror = function () { revision.innerHTML = errorHtml('No se pudo leer el archivo.'); campo.value = ''; };
      lector.readAsText(f);
    });
    document.getElementById('revisar-texto').addEventListener('click', function () { revisar(document.getElementById('pegado').value); });
  }

  window.Respaldo = {
    render: pantalla, estado: estado, bloqueEstado: bloqueEstado,
    validar: validar, armar: armar     /* expuestos para pruebas */
  };
})();
