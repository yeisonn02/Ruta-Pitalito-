/* GPS: medir la ubicación actual y armar enlaces de navegación. */
(function () {
  'use strict';

  function mensajeError(codigo) {
    if (codigo === 1) return 'No hay permiso de ubicación. En el iPhone: Ajustes → Privacidad y seguridad → Servicios de localización → Safari (o Sitios web de Safari) → "Al usar la app". Luego vuelve a intentar.';
    if (codigo === 2) return 'No se pudo determinar la ubicación. Sal a un sitio abierto y vuelve a intentar.';
    if (codigo === 3) return 'Se agotó el tiempo sin recibir señal GPS. Sal a un sitio abierto y vuelve a intentar.';
    return 'No se pudo obtener la ubicación.';
  }

  /* Mide con GPS hasta lograr la precisión objetivo (m) o hasta el límite de tiempo.
     Devuelve { promesa, usarAhora(), cancelar() }.  alActualizar(mejorLectura) se llama en cada mejora. */
  function medir(alActualizar, opciones) {
    opciones = opciones || {};
    var objetivo = opciones.objetivo || 20;
    var limiteMs = opciones.limiteMs || 25000;
    var mejor = null, terminado = false, idWatch = null, temporizador = null, ultimoError = 0;
    var resolver, rechazar;

    function limpiar() {
      terminado = true;
      if (idWatch !== null) navigator.geolocation.clearWatch(idWatch);
      clearTimeout(temporizador);
    }
    function usarAhora() {
      if (terminado) return;
      limpiar();
      if (mejor) resolver(mejor);
      else rechazar(Object.assign(new Error(mensajeError(ultimoError || 3)), { codigo: ultimoError || 3 }));
    }
    function cancelar() {
      if (terminado) return;
      limpiar();
      rechazar(Object.assign(new Error('Cancelado'), { cancelado: true }));
    }

    var promesa = new Promise(function (res, rej) {
      resolver = res; rechazar = rej;
      if (!navigator.geolocation) { terminado = true; rej(new Error('Este dispositivo no permite obtener la ubicación.')); return; }
      idWatch = navigator.geolocation.watchPosition(function (pos) {
        if (terminado) return;
        var r = {
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          precision: Math.round(pos.coords.accuracy), fecha: new Date().toISOString()
        };
        if (!isFinite(r.lat) || !isFinite(r.lng)) return;
        if (!mejor || r.precision <= mejor.precision) mejor = r;
        if (alActualizar) alActualizar(mejor);
        if (mejor.precision <= objetivo) usarAhora();
      }, function (err) {
        if (terminado) return;
        ultimoError = err.code;
        if (err.code === 1) { limpiar(); rej(Object.assign(new Error(mensajeError(1)), { codigo: 1 })); }
        /* códigos 2 y 3: seguimos esperando hasta el límite de tiempo */
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
      temporizador = setTimeout(usarAhora, limiteMs);
    });
    return { promesa: promesa, usarAhora: usarAhora, cancelar: cancelar };
  }

  function calidad(precision) {
    if (precision <= 20) return 'Buena';
    if (precision <= 50) return 'Aceptable';
    return 'Baja';
  }
  function coordenadas(c) { return Number(c.lat).toFixed(6) + ', ' + Number(c.lng).toFixed(6); }
  function tiene(c) { return c && isFinite(c.lat) && isFinite(c.lng) && c.lat !== null && c.lng !== null && c.lat !== '' && c.lng !== ''; }
  function fechaCorta(iso) {
    try { return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return ''; }
  }
  /* Los mapas se abren en la app de mapas del teléfono y NECESITAN internet. */
  function enlaceApple(c) { return 'https://maps.apple.com/?daddr=' + Number(c.lat).toFixed(6) + ',' + Number(c.lng).toFixed(6) + '&dirflg=d'; }
  function enlaceGoogle(c) { return 'https://www.google.com/maps/dir/?api=1&destination=' + Number(c.lat).toFixed(6) + ',' + Number(c.lng).toFixed(6); }

  window.Gps = {
    medir: medir, calidad: calidad, coordenadas: coordenadas, tiene: tiene,
    fechaCorta: fechaCorta, enlaceApple: enlaceApple, enlaceGoogle: enlaceGoogle
  };
})();
