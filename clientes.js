/* Pantallas de clientes: lista, formulario y ficha. */
(function () {
  'use strict';

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function normalizar(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  var gpsPendiente = null;      /* lectura GPS que viene de la pantalla Guardar ubicacion */
  var origen = '#/clientes';   /* a dónde vuelve "Volver" desde la ficha */
  function tarjeta(c) {
    return '<a class="tarjeta" href="#/clientes/' + c.id + '"><strong>' + esc(c.tienda) + '</strong>' +
      '<span>' + esc(ubicacionTexto(c) || 'Sin ubicación') + '</span></a>';
  }
  function ubicacionTexto(c) {
    return [c.sector, c.vereda, c.municipio].filter(Boolean).join(' · ');
  }
  function error(msg) {
    return '<div class="error" role="alert"><strong>No se pudo completar</strong>' + esc(msg) + '</div>';
  }

  /* ---------- Lista ---------- */
  function lista(ctx) {
    ctx.cabecera('Clientes', '#/');
    origen = '#/clientes';
    ctx.contenedor.innerHTML = '<p class="cargando">Cargando…</p>';
    return DB.listarClientes().then(function (todos) {
      todos.sort(function (a, b) { return a.tienda.localeCompare(b.tienda, 'es'); });
      ctx.contenedor.innerHTML =
        '<a class="boton grande" href="#/clientes/nuevo">+ Nuevo cliente</a>' +
        (todos.length
          ? '<input id="buscar" class="campo buscador" type="search" placeholder="Buscar tienda, vereda, teléfono…" ' +
            'autocomplete="off" autocapitalize="off" enterkeyhint="search" aria-label="Buscar clientes">'
          : '') +
        '<p id="conteo" class="conteo"></p><div id="resultados"></div>';
      var caja = document.getElementById('buscar');
      var res = document.getElementById('resultados');
      var conteo = document.getElementById('conteo');

      function pintar() {
        var q = normalizar(caja ? caja.value : '').trim();
        var visibles = todos.filter(function (c) {
          if (!q) return true;
          var pajar = normalizar([c.tienda, c.contacto, c.telefono, c.correo, c.municipio, c.vereda, c.sector, c.referencias, c.observaciones].join(' '));
          return q.split(/\s+/).every(function (p) { return pajar.indexOf(p) !== -1; });
        });
        if (!todos.length) {
          conteo.textContent = '';
          res.innerHTML = '<div class="vacio"><h2>Aún no tienes clientes</h2>Toca "Nuevo cliente" para guardar el primero.</div>';
          return;
        }
        conteo.textContent = visibles.length + (visibles.length === 1 ? ' cliente' : ' clientes') + (q ? ' encontrados' : '');
        res.innerHTML = visibles.length ? visibles.map(tarjeta).join('') : '<div class="vacio"><h2>Sin resultados</h2>Prueba con otra palabra.</div>';
      }
      if (caja) caja.addEventListener('input', pintar);
      pintar();
    }).catch(function (e) { ctx.contenedor.innerHTML = error(e.message); });
  }

  /* ---------- Formulario (nuevo / editar) ---------- */
  function opciones(id, valores) {
    return '<datalist id="' + id + '">' + valores.map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist>';
  }
  function campoTexto(id, etiqueta, valor, extra) {
    extra = extra || {};
    return '<label class="etiqueta" for="' + id + '">' + etiqueta + '</label>' +
      '<input class="campo" id="' + id + '" name="' + id + '" type="' + (extra.tipo || 'text') + '" value="' + esc(valor) + '"' +
      (extra.lista ? ' list="' + extra.lista + '"' : '') +
      (extra.modo ? ' inputmode="' + extra.modo + '"' : '') +
      ' autocomplete="off">';
  }

  function bloqueGps() {
    return '<div class="gps" id="bloque-gps">' +
      '<span class="etiqueta" style="margin-top:0">Ubicación GPS</span>' +
      '<p id="gps-estado" class="gps-estado" role="status"></p>' +
      '<button class="boton" type="button" id="gps-obtener">Usar mi ubicación actual</button>' +
      '<button class="boton secundario" type="button" id="gps-detener" hidden>Usar la lectura actual</button>' +
      '<button class="boton secundario" type="button" id="gps-quitar" hidden>Quitar ubicación</button>' +
      '</div>';
  }

  function formulario(ctx, id, prefill) {
    var editando = id != null;
    var atras = editando ? '#/clientes/' + id : (prefill ? origen : '#/clientes');
    ctx.cabecera(editando ? 'Editar cliente' : 'Nuevo cliente', atras);
    ctx.contenedor.innerHTML = '<p class="cargando">Cargando…</p>';
    var carga = Promise.all([
      editando ? DB.obtenerCliente(id) : Promise.resolve(prefill || { municipio: 'Pitalito' }),
      DB.valoresDistintos('municipio'), DB.valoresDistintos('vereda'), DB.valoresDistintos('sector')
    ]);
    return carga.then(function (r) {
      var c = r[0];
      if (!c) { ctx.contenedor.innerHTML = error('Ese cliente ya no existe.'); return; }
      /* Lectura GPS traída desde Guardar ubicación (solo para clientes nuevos) */
      if (!editando && gpsPendiente) {
        c.lat = gpsPendiente.lat; c.lng = gpsPendiente.lng; c.precision = gpsPendiente.precision; c.fechaGps = gpsPendiente.fecha;
        gpsPendiente = null;
      }
      ctx.contenedor.innerHTML =
        '<form id="form" novalidate>' +
        campoTexto('tienda', 'Nombre de la tienda *', c.tienda) +
        campoTexto('municipio', 'Municipio', c.municipio, { lista: 'l-mun' }) +
        campoTexto('vereda', 'Vereda', c.vereda, { lista: 'l-ver' }) +
        campoTexto('sector', 'Sector', c.sector, { lista: 'l-sec' }) +
        campoTexto('contacto', 'Nombre del contacto (opcional)', c.contacto) +
        campoTexto('telefono', 'Teléfono (opcional)', c.telefono, { tipo: 'tel', modo: 'tel' }) +
        campoTexto('correo', 'Correo electrónico (opcional)', c.correo, { tipo: 'email', modo: 'email' }) +
        '<label class="etiqueta" for="referencias">Dirección o referencias para llegar</label>' +
        '<textarea class="campo" id="referencias" rows="3">' + esc(c.referencias) + '</textarea>' +
        '<label class="etiqueta" for="observaciones">Observaciones</label>' +
        '<textarea class="campo" id="observaciones" rows="3">' + esc(c.observaciones) + '</textarea>' +
        bloqueGps() +
        '<p id="msg-error" class="error" role="alert" hidden></p>' +
        '<button class="boton grande" type="submit" id="guardar">Guardar cliente</button>' +
        '<a class="boton secundario" href="' + atras + '">Cancelar</a>' +
        '</form>' + opciones('l-mun', r[1]) + opciones('l-ver', r[2]) + opciones('l-sec', r[3]);

      var form = document.getElementById('form');
      var msg = document.getElementById('msg-error');

      /* --- Bloque GPS del formulario --- */
      var medicion = null;
      var gEstado = document.getElementById('gps-estado');
      var bObtener = document.getElementById('gps-obtener');
      var bDetener = document.getElementById('gps-detener');
      var bQuitar = document.getElementById('gps-quitar');
      function pintarGps() {
        if (Gps.tiene(c)) {
          gEstado.textContent = Gps.coordenadas(c) + ' · precisión ±' + c.precision + ' m (' + Gps.calidad(c.precision) + ')';
          bObtener.textContent = 'Actualizar ubicación'; bQuitar.hidden = false;
        } else {
          gEstado.textContent = 'Sin ubicación guardada.';
          bObtener.textContent = 'Usar mi ubicación actual'; bQuitar.hidden = true;
        }
      }
      pintarGps();
      bObtener.addEventListener('click', function () {
        if (Gps.tiene(c) && !confirm('Este cliente ya tiene ubicación. ¿Reemplazarla por tu ubicación actual?')) return;
        bObtener.disabled = true; bDetener.hidden = false; bQuitar.hidden = true;
        gEstado.textContent = 'Buscando señal GPS…';
        medicion = Gps.medir(function (l) { gEstado.textContent = 'Midiendo… precisión actual ±' + l.precision + ' m'; });
        medicion.promesa.then(function (l) {
          c.lat = l.lat; c.lng = l.lng; c.precision = l.precision; c.fechaGps = l.fecha;
          pintarGps();
          if (l.precision > 50) gEstado.textContent += '. Precisión baja: sal a cielo abierto y actualiza.';
        }).catch(function (e) {
          if (e.cancelado) pintarGps(); else gEstado.textContent = e.message;
        }).then(function () {
          medicion = null; bObtener.disabled = false; bDetener.hidden = true;
          if (Gps.tiene(c)) bQuitar.hidden = false;
        });
      });
      bDetener.addEventListener('click', function () { if (medicion) medicion.usarAhora(); });
      bQuitar.addEventListener('click', function () {
        c.lat = c.lng = c.precision = c.fechaGps = null; pintarGps();
      });
      window.addEventListener('hashchange', function parar() {
        if (medicion) medicion.cancelar();
        window.removeEventListener('hashchange', parar);
      });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        msg.hidden = true;
        var v = function (k) { return document.getElementById(k).value.trim(); };
        if (!v('tienda')) {
          msg.textContent = 'Escribe el nombre de la tienda.'; msg.hidden = false;
          document.getElementById('tienda').focus();
          return;
        }
        if (v('correo') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('correo'))) {
          msg.textContent = 'El correo no parece válido. Ejemplo: nombre@correo.com (o déjalo vacío).'; msg.hidden = false;
          document.getElementById('correo').focus();
          return;
        }
        c.tienda = v('tienda'); c.municipio = v('municipio'); c.vereda = v('vereda'); c.sector = v('sector');
        c.contacto = v('contacto'); c.telefono = v('telefono'); c.correo = v('correo');
        c.referencias = v('referencias'); c.observaciones = v('observaciones');
        var boton = document.getElementById('guardar');
        boton.disabled = true;
        DB.guardarCliente(c).then(function (nuevoId) {
          location.hash = '#/clientes/' + (c.id || nuevoId);
        }).catch(function (e) {
          boton.disabled = false;
          msg.textContent = 'No se guardó: ' + e.message; msg.hidden = false;
        });
      });
    }).catch(function (e) { ctx.contenedor.innerHTML = error(e.message); });
  }

  /* ---------- Ficha ---------- */
  function fila(etiqueta, valor) {
    return '<div class="fila"><span class="fila-etiqueta">' + etiqueta + '</span>' +
      '<span class="fila-valor">' + (valor ? esc(valor) : '<em>—</em>') + '</span></div>';
  }
  function ficha(ctx, id) {
    ctx.cabecera('Cliente', origen);
    ctx.contenedor.innerHTML = '<p class="cargando">Cargando…</p>';
    return Promise.all([DB.obtenerCliente(id), DB.entradaDeCliente(id)]).then(function (r) {
      var c = r[0], entrada = r[1];
      if (!c) { ctx.contenedor.innerHTML = error('Ese cliente ya no existe.'); return; }
      var estados = { pendiente: 'Pendiente', visitado: 'Visitado', no_atendido: 'No atendido' };
      var ruta = entrada
        ? '<a class="boton secundario" href="#/ruta">En mi ruta (' + estados[entrada.estado] + ') · ver ruta</a>'
        : '<button class="boton" type="button" id="a-ruta">+ Agregar a mi ruta</button>';
      var mapas = Gps.tiene(c)
        ? '<a class="boton grande" href="' + Gps.enlaceApple(c) + '" target="_blank" rel="noopener">Cómo llegar (Apple Maps)</a>' +
          '<a class="boton secundario" href="' + Gps.enlaceGoogle(c) + '" target="_blank" rel="noopener">Cómo llegar (Google Maps)</a>' +
          '<a class="boton secundario" href="' + Gps.enlaceWaze(c) + '" target="_blank" rel="noopener">Cómo llegar (Waze)</a>' +
          '<button class="boton secundario" type="button" id="copiar">Copiar coordenadas</button>' +
          '<p class="nota">Los mapas necesitan internet para mostrarse.</p>'
        : '<p class="nota">Este cliente no tiene ubicación GPS. Edítalo para guardarla.</p>';
      var tel = c.telefono ? '<a class="boton secundario" href="tel:' + esc(c.telefono.replace(/[^\d+]/g, '')) + '">Llamar ' + esc(c.telefono) + '</a>' : '';
      var mail = c.correo ? '<a class="boton secundario" href="mailto:' + esc(c.correo) + '">Escribir a ' + esc(c.correo) + '</a>' : '';
      ctx.contenedor.innerHTML =
        '<h2 class="nombre-tienda">' + esc(c.tienda) + '</h2>' +
        '<div class="panel">' +
        fila('Municipio', c.municipio) + fila('Vereda', c.vereda) + fila('Sector', c.sector) +
        fila('Contacto', c.contacto) + fila('Teléfono', c.telefono) + fila('Correo', c.correo) +
        fila('Cómo llegar', c.referencias) + fila('Observaciones', c.observaciones) +
        fila('Última visita', c.ultimaVisita ? estados[c.ultimaVisita.estado] + ' · ' + Gps.fechaCorta(c.ultimaVisita.fecha) : null) +
        fila('Coordenadas GPS', Gps.tiene(c) ? Gps.coordenadas(c) + '\nPrecisión ±' + c.precision + ' m · ' + Gps.fechaCorta(c.fechaGps) : null) +
        '</div>' + ruta + mapas + tel + mail +
        '<a class="boton grande" href="#/clientes/' + c.id + '/editar">Editar</a>' +
        '<button class="boton peligro" type="button" id="eliminar">Eliminar cliente</button>';
      var bRuta = document.getElementById('a-ruta');
      if (bRuta) bRuta.addEventListener('click', function () {
        bRuta.disabled = true;
        DB.agregarARuta([c.id]).then(function () { return ficha(ctx, id); })
          .catch(function (e) { bRuta.disabled = false; ctx.contenedor.insertAdjacentHTML('afterbegin', error(e.message)); });
      });
      var bCopiar = document.getElementById('copiar');
      if (bCopiar) bCopiar.addEventListener('click', function () {
        var texto = Gps.coordenadas(c);
        var ok = function () { bCopiar.textContent = 'Copiado: ' + texto; };
        var falla = function () { bCopiar.textContent = 'No se pudo copiar: ' + texto; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(ok, falla); else falla();
      });
      document.getElementById('eliminar').addEventListener('click', function () {
        if (!confirm('¿Eliminar "' + c.tienda + '"? Esta acción no se puede deshacer.')) return;
        DB.eliminarCliente(c.id).then(function () { location.hash = '#/clientes'; })
          .catch(function (e) { ctx.contenedor.insertAdjacentHTML('afterbegin', error(e.message)); });
      });
    }).catch(function (e) { ctx.contenedor.innerHTML = error(e.message); });
  }

  window.Clientes = {
    esc: esc, normalizar: normalizar, tarjeta: tarjeta,
    setOrigen: function (h) { origen = h; },
    nuevoConGps: function (lectura) { gpsPendiente = lectura; },
    render: function (partes, ctx) {
      if (partes.length === 1) return lista(ctx);
      if (partes[1] === 'nuevo') {
        /* #/clientes/nuevo/<municipio>/<vereda>/<sector>   (~ = vacío) */
        var pre = null;
        if (partes.length > 2) {
          var d = function (t) { return !t || t === '~' ? '' : decodeURIComponent(t); };
          pre = { municipio: d(partes[2]), vereda: d(partes[3]), sector: d(partes[4]) };
        }
        return formulario(ctx, null, pre);
      }
      if (partes[2] === 'editar') return formulario(ctx, partes[1]);
      return ficha(ctx, partes[1]);
    }
  };
})();
