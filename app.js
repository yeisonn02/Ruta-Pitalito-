/* Mi Ruta - Etapa 1: esqueleto de navegación + PWA.
   Aún no hay base de datos: las pantallas son marcadores de posición. */
(function () {
  'use strict';

  var VERSION_APP = 'etapa-1';

  var pantallas = {
    '': {
      titulo: 'Mi Ruta',
      atras: false,
      html: function () {
        return '' +
          '<div class="aviso"><strong>Respaldo</strong>' +
          'Cuando guardes clientes, exporta una copia de seguridad con frecuencia. ' +
          'Los datos viven solo en este teléfono.</div>' +
          '<nav class="menu" aria-label="Menú principal">' +
            '<a class="boton-menu" href="#/sectores">Sectores<small>Municipio, vereda, sector</small></a>' +
            '<a class="boton-menu" href="#/clientes">Clientes<small>Buscar y editar</small></a>' +
            '<a class="boton-menu" href="#/ruta">Mi ruta<small>Visitas pendientes</small></a>' +
            '<a class="boton-menu principal" href="#/ubicacion">Guardar ubicación<small>GPS actual</small></a>' +
          '</nav>' +
          '<p class="version" style="color:#4A5A50;font-size:14px;margin-top:20px">Versión: ' + VERSION_APP + '</p>';
      }
    },
    'sectores':  { titulo: 'Sectores',          atras: true, etapa: 3, texto: 'Aquí verás tus clientes agrupados por municipio, vereda y sector.' },
    'clientes':  { titulo: 'Clientes',          atras: true, etapa: 2, texto: 'Aquí podrás crear, buscar, editar y eliminar clientes.' },
    'ruta':      { titulo: 'Mi ruta',           atras: true, etapa: 5, texto: 'Aquí armarás tu lista de visitas y marcarás cada una.' },
    'ubicacion': { titulo: 'Guardar ubicación', atras: true, etapa: 4, texto: 'Aquí guardarás tu ubicación GPS actual.' }
  };

  function pantallaPendiente(p) {
    return '<div class="vacio"><h2>Todavía no disponible</h2>' +
      p.texto + '<br>Se construye en la Etapa ' + p.etapa + '.</div>';
  }

  function dibujar() {
    var clave = (location.hash || '').replace(/^#\/?/, '');
    var p = pantallas[clave] || pantallas[''];
    document.getElementById('titulo').textContent = p.titulo;
    document.getElementById('btn-atras').hidden = !p.atras;
    document.getElementById('pantalla').innerHTML = p.html ? p.html() : pantallaPendiente(p);
    document.title = p.titulo === 'Mi Ruta' ? 'Mi Ruta' : p.titulo + ' · Mi Ruta';
    window.scrollTo(0, 0);
  }

  document.getElementById('btn-atras').addEventListener('click', function () {
    location.hash = '#/';
  });
  window.addEventListener('hashchange', dibujar);
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
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) {
        console.error('No se pudo registrar el service worker:', e);
      });
    });
  }
})();
