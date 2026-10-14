/* Pantalla "Guardar ubicación": mide el GPS y lo asigna a un cliente nuevo o existente. */
(function () {
  'use strict';
  var esc = Clientes.esc, normalizar = Clientes.normalizar;
  var ultima = null;      /* última lectura (se descarta a los 2 minutos) */
  var medicion = null;

  function parar() { if (medicion) { medicion.cancelar(); medicion = null; } window.removeEventListener('hashchange', parar); }

  function inicio(ctx, mensajeError) {
    ctx.contenedor.innerHTML =
      '<p class="explica">Párate junto a la tienda y toca el botón. Se guarda el punto donde estás ahora.</p>' +
      '<button class="boton grande" type="button" id="medir">Obtener mi ubicación</button>' +
      '<p id="estado" class="gps-estado" role="status">' + (mensajeError ? esc(mensajeError) : '') + '</p>' +
      '<button class="boton secundario" type="button" id="usar" hidden>Usar la lectura actual</button>' +
      '<button class="boton secundario" type="button" id="cancelar" hidden>Cancelar</button>';
    var estado = document.getElementById('estado');
    var bMedir = document.getElementById('medir'), bUsar = document.getElementById('usar'), bCancelar = document.getElementById('cancelar');
    if (mensajeError) estado.classList.add('con-error');
    bMedir.addEventListener('click', function () {
      estado.classList.remove('con-error');
      estado.textContent = 'Buscando señal GPS…';
      bMedir.hidden = true; bUsar.hidden = false; bCancelar.hidden = false;
      medicion = Gps.medir(function (l) { estado.textContent = 'Midiendo… precisión actual ±' + l.precision + ' m'; });
      window.addEventListener('hashchange', parar);
      var m = medicion;
      m.promesa.then(function (l) {
        if (medicion !== m) return;
        medicion = null; ultima = l; resultado(ctx);
      }).catch(function (e) {
        if (medicion !== m) return;
        medicion = null;
        if (e.cancelado) inicio(ctx); else inicio(ctx, e.message);
      });
    });
    bUsar.addEventListener('click', function () { if (medicion) medicion.usarAhora(); });
    bCancelar.addEventListener('click', function () { if (medicion) medicion.cancelar(); });
  }

  function resultado(ctx) {
    var baja = ultima.precision > 50;
    ctx.contenedor.innerHTML =
      '<div class="panel">' +
        '<div class="fila"><span class="fila-etiqueta">Coordenadas</span><span class="fila-valor" id="coords">' + esc(Gps.coordenadas(ultima)) + '</span></div>' +
        '<div class="fila"><span class="fila-etiqueta">Precisión</span><span class="fila-valor">±' + ultima.precision + ' m (' + Gps.calidad(ultima.precision) + ')</span></div>' +
        '<div class="fila"><span class="fila-etiqueta">Medida</span><span class="fila-valor">' + esc(Gps.fechaCorta(ultima.fecha)) + '</span></div>' +
      '</div>' +
      (baja ? '<div class="aviso"><strong>Precisión baja</strong>Sal a cielo abierto, espera unos segundos y vuelve a medir.</div>' : '') +
      '<button class="boton grande" type="button" id="nuevo">Guardar en un cliente nuevo</button>' +
      '<button class="boton" type="button" id="existente">Asignar a un cliente existente</button>' +
      '<button class="boton secundario" type="button" id="remedir">Volver a medir</button>' +
      '<div id="lista-clientes"></div>';
    document.getElementById('remedir').addEventListener('click', function () { ultima = null; inicio(ctx); });
    document.getElementById('nuevo').addEventListener('click', function () {
      Clientes.nuevoConGps(ultima); ultima = null; location.hash = '#/clientes/nuevo';
    });
    document.getElementById('existente').addEventListener('click', function () { elegirCliente(ctx); });
  }

  function elegirCliente(ctx) {
    var cont = document.getElementById('lista-clientes');
    cont.innerHTML = '<p class="cargando">Cargando…</p>';
    DB.listarClientes().then(function (todos) {
      if (!todos.length) { cont.innerHTML = '<div class="vacio"><h2>No hay clientes</h2>Guarda la ubicación en un cliente nuevo.</div>'; return; }
      todos.sort(function (a, b) { return a.tienda.localeCompare(b.tienda, 'es'); });
      cont.innerHTML = '<p class="conteo">¿A qué cliente pertenece?</p>' +
        '<input id="buscar-c" class="campo buscador" type="search" placeholder="Buscar cliente…" autocomplete="off" autocapitalize="off">' +
        '<div id="opciones"></div>';
      var caja = document.getElementById('buscar-c'), ops = document.getElementById('opciones');
      function pintar() {
        var q = normalizar(caja.value).trim();
        var vis = todos.filter(function (c) {
          var pajar = normalizar([c.tienda, c.vereda, c.sector, c.municipio].join(' '));
          return !q || q.split(/\s+/).every(function (p) { return pajar.indexOf(p) !== -1; });
        });
        ops.innerHTML = vis.length ? vis.map(function (c) {
          return '<button type="button" class="tarjeta boton-tarjeta" data-id="' + c.id + '"><strong>' + esc(c.tienda) + '</strong>' +
            '<span>' + esc([c.sector, c.vereda, c.municipio].filter(Boolean).join(' · ') || 'Sin ubicación') +
            (Gps.tiene(c) ? ' · ya tiene GPS' : '') + '</span></button>';
        }).join('') : '<div class="vacio">Sin resultados</div>';
      }
      caja.addEventListener('input', pintar); pintar();
      ops.addEventListener('click', function (ev) {
        var b = ev.target.closest('.boton-tarjeta'); if (!b) return;
        var cliente = todos.filter(function (c) { return String(c.id) === b.dataset.id; })[0];
        if (Gps.tiene(cliente) && !confirm('"' + cliente.tienda + '" ya tiene ubicación (' + Gps.coordenadas(cliente) + '). ¿Reemplazarla?')) return;
        cliente.lat = ultima.lat; cliente.lng = ultima.lng; cliente.precision = ultima.precision; cliente.fechaGps = ultima.fecha;
        DB.guardarCliente(cliente).then(function () {
          ultima = null; Clientes.setOrigen('#/clientes'); location.hash = '#/clientes/' + cliente.id;
        }).catch(function (e) { cont.insertAdjacentHTML('afterbegin', '<div class="error" role="alert"><strong>No se guardó</strong>' + esc(e.message) + '</div>'); });
      });
    }).catch(function (e) { cont.innerHTML = '<div class="error" role="alert">' + esc(e.message) + '</div>'; });
  }

  window.Ubicacion = {
    render: function (ctx) {
      ctx.cabecera('Guardar ubicación', '#/');
      parar();
      if (ultima && Date.now() - Date.parse(ultima.fecha) > 120000) ultima = null;
      if (ultima) resultado(ctx); else inicio(ctx);
    }
  };
})();
