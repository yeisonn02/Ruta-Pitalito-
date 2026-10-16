/* Mi Ruta - Etapa 6: clientes + sectores + GPS + ruta + respaldo. */
(function () {
  'use strict';

  var VERSION_APP = 'etapa-6';
  window.VERSION_APP = VERSION_APP;
  var estadoAlmacenamiento = 'sin comprobar';

  var contenedor = document.getElementById('pantalla');
  var ctx = {
    contenedor: contenedor,
    cabecera: function (titulo, atras) {
      document.getElementById('titulo').textContent = titulo;
      var b = document.getElementById('btn-atras');
      b.hidden = !atras;
      b.dataset.destino = atras || '';
      document.title = titulo === 'Mi Ruta' ? 'Mi Ruta' : titulo + ' · Mi Ruta';
    }
  };

  function inicio() {
    ctx.cabecera('Mi Ruta', null);
    contenedor.innerHTML =
      '<div id="estado-resp-inicio"></div>' +
      '<nav class="menu" aria-label="Menú principal">' +
        '<a class="boton-menu" href="#/sectores">Sectores<small>Municipio, vereda, sector</small></a>' +
        '<a class="boton-menu" href="#/clientes">Clientes<small>Buscar y editar</small></a>' +
        '<a class="boton-menu" href="#/ruta">Mi ruta<small id="sub-ruta">Visitas pendientes</small></a>' +
        '<a class="boton-menu principal" href="#/ubicacion">Guardar ubicación<small>GPS actual</small></a>' +
        '<a class="boton-menu ancho" href="#/respaldo">Respaldo<small>Exportar y restaurar copias de seguridad</small></a>' +
      '</nav>' +
      '<p class="version">Versión: ' + VERSION_APP + '<br>Almacenamiento protegido: ' + estadoAlmacenamiento + '</p>';
    Respaldo.estado().then(function (e) {
      var caja = document.getElementById('estado-resp-inicio');
      if (caja) caja.innerHTML = Respaldo.bloqueEstado(e, 'a', '#/respaldo');
    }).catch(function () {});
    DB.listarRuta().then(function (l) {
      var n = l.filter(function (e) { return e.estado === 'pendiente'; }).length;
      var el = document.getElementById('sub-ruta');
      if (el && n) el.textContent = n + (n === 1 ? ' visita pendiente' : ' visitas pendientes');
    }).catch(function () {});
  }

  function dibujar() {
    var partes = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    var raiz = partes[0] || '';
    if (raiz === 'clientes') Clientes.render(partes, ctx);
    else if (raiz === 'sectores') Sectores.render(partes, ctx);
    else if (raiz === 'ubicacion') Ubicacion.render(ctx);
    else if (raiz === 'ruta') Ruta.render(partes, ctx);
    else if (raiz === 'respaldo') Respaldo.render(ctx);
    else inicio();
    window.scrollTo(0, 0);
  }

  document.getElementById('btn-atras').addEventListener('click', function () {
    location.hash = this.dataset.destino || '#/';
  });
  window.addEventListener('hashchange', dibujar);

  /* Pide al navegador que NO borre los datos por falta de uso (iOS puede negarlo). */
  function protegerAlmacenamiento() {
    if (!(navigator.storage && navigator.storage.persist)) { estadoAlmacenamiento = 'no disponible'; return Promise.resolve(); }
    return navigator.storage.persisted().then(function (ya) {
      if (ya) return true;
      return navigator.storage.persist();
    }).then(function (ok) { estadoAlmacenamiento = ok ? 'sí' : 'no confirmado (haz respaldos)'; })
      .catch(function () { estadoAlmacenamiento = 'no disponible'; });
  }

  DB.abrir().catch(function (e) {
    contenedor.innerHTML = '<div class="error" role="alert"><strong>No se pudo abrir la base de datos</strong>' + e.message + '</div>';
  });
  protegerAlmacenamiento().then(function () { if (!location.hash || location.hash === '#/') dibujar(); });
  dibujar();

  /* Aviso de conexión */
  var aviso = document.getElementById('estado-red');
  function actualizarRed() {
    if (navigator.onLine) { aviso.hidden = true; }
    else { aviso.textContent = 'Sin internet. Tus datos guardados siguen disponibles.'; aviso.hidden = false; }
  }
  window.addEventListener('online', actualizarRed);
  window.addEventListener('offline', actualizarRed);
  actualizarRed();

  /* Service worker (modo sin conexión de la app, NO de los mapas) */
  function avisoActualizacion() {
    if (document.querySelector('.actualizar')) return;
    var d = document.createElement('div');
    d.className = 'actualizar';
    d.innerHTML = '<span>Hay una versión nueva.</span><button type="button">Actualizar ahora</button>';
    d.querySelector('button').addEventListener('click', function () { location.reload(); });
    document.body.appendChild(d);
  }
  if ('serviceWorker' in navigator) {
    var teniaControlador = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (teniaControlador) avisoActualizacion();   /* no avisar en la primera instalación */
    });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) {
        console.error('No se pudo registrar el service worker:', e);
      });
    });
  }
})();
