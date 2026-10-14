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
          var pajar = normalizar([c.tienda, c.contacto, c.telefono, c.municipio, c.vereda, c.sector, c.referencias, c.observaciones].join(' '));
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

  function formulario(ctx, id) {
    var editando = id != null;
    ctx.cabecera(editando ? 'Editar cliente' : 'Nuevo cliente', editando ? '#/clientes/' + id : '#/clientes');
    ctx.contenedor.innerHTML = '<p class="cargando">Cargando…</p>';
    var carga = Promise.all([
      editando ? DB.obtenerCliente(id) : Promise.resolve({ municipio: 'Pitalito' }),
      DB.valoresDistintos('municipio'), DB.valoresDistintos('vereda'), DB.valoresDistintos('sector')
    ]);
    return carga.then(function (r) {
      var c = r[0];
      if (!c) { ctx.contenedor.innerHTML = error('Ese cliente ya no existe.'); return; }
      ctx.contenedor.innerHTML =
        '<form id="form" novalidate>' +
        campoTexto('tienda', 'Nombre de la tienda *', c.tienda) +
        campoTexto('municipio', 'Municipio', c.municipio, { lista: 'l-mun' }) +
        campoTexto('vereda', 'Vereda', c.vereda, { lista: 'l-ver' }) +
        campoTexto('sector', 'Sector', c.sector, { lista: 'l-sec' }) +
        campoTexto('contacto', 'Nombre del contacto (opcional)', c.contacto) +
        campoTexto('telefono', 'Teléfono (opcional)', c.telefono, { tipo: 'tel', modo: 'tel' }) +
        '<label class="etiqueta" for="referencias">Dirección o referencias para llegar</label>' +
        '<textarea class="campo" id="referencias" rows="3">' + esc(c.referencias) + '</textarea>' +
        '<label class="etiqueta" for="observaciones">Observaciones</label>' +
        '<textarea class="campo" id="observaciones" rows="3">' + esc(c.observaciones) + '</textarea>' +
        '<p id="msg-error" class="error" role="alert" hidden></p>' +
        '<button class="boton grande" type="submit" id="guardar">Guardar cliente</button>' +
        '<a class="boton secundario" href="' + (editando ? '#/clientes/' + id : '#/clientes') + '">Cancelar</a>' +
        '</form>' + opciones('l-mun', r[1]) + opciones('l-ver', r[2]) + opciones('l-sec', r[3]);

      var form = document.getElementById('form');
      var msg = document.getElementById('msg-error');
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        msg.hidden = true;
        var v = function (k) { return document.getElementById(k).value.trim(); };
        if (!v('tienda')) {
          msg.textContent = 'Escribe el nombre de la tienda.'; msg.hidden = false;
          document.getElementById('tienda').focus();
          return;
        }
        c.tienda = v('tienda'); c.municipio = v('municipio'); c.vereda = v('vereda'); c.sector = v('sector');
        c.contacto = v('contacto'); c.telefono = v('telefono');
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
    return DB.obtenerCliente(id).then(function (c) {
      if (!c) { ctx.contenedor.innerHTML = error('Ese cliente ya no existe.'); return; }
      var tel = c.telefono ? '<a class="boton secundario" href="tel:' + esc(c.telefono.replace(/[^\d+]/g, '')) + '">Llamar ' + esc(c.telefono) + '</a>' : '';
      ctx.contenedor.innerHTML =
        '<h2 class="nombre-tienda">' + esc(c.tienda) + '</h2>' +
        '<div class="panel">' +
        fila('Municipio', c.municipio) + fila('Vereda', c.vereda) + fila('Sector', c.sector) +
        fila('Contacto', c.contacto) + fila('Teléfono', c.telefono) +
        fila('Cómo llegar', c.referencias) + fila('Observaciones', c.observaciones) +
        fila('Coordenadas GPS', null) +
        '</div>' + tel +
        '<a class="boton grande" href="#/clientes/' + c.id + '/editar">Editar</a>' +
        '<button class="boton peligro" type="button" id="eliminar">Eliminar cliente</button>';
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
    render: function (partes, ctx) {
      if (partes.length === 1) return lista(ctx);
      if (partes[1] === 'nuevo') return formulario(ctx, null);
      if (partes[2] === 'editar') return formulario(ctx, partes[1]);
      return ficha(ctx, partes[1]);
    }
  };
})();
