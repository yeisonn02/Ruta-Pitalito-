/* Mi ruta: lista de clientes por visitar, con estado y fecha de visita. */
(function () {
  'use strict';
  var esc = Clientes.esc, normalizar = Clientes.normalizar;
  var filtro = 'todas';               /* todas | pendiente | visitado | no_atendido */
  var seleccion = {};                 /* clientes marcados en la pantalla "Agregar" */

  var ETIQUETA = { pendiente: '○ Pendiente', visitado: '✓ Visitado', no_atendido: '✕ No atendido' };
  var NOMBRE_FILTRO = { todas: 'Todas', pendiente: 'Pendientes', visitado: 'Visitadas', no_atendido: 'No atendidas' };

  function ubic(c) { return [c.sector, c.vereda, c.municipio].filter(Boolean).join(' · ') || 'Sin ubicación'; }
  function aLocal(iso) {              /* ISO -> "AAAA-MM-DDTHH:MM" para el campo de fecha */
    var d = new Date(iso), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function errorHtml(msg) { return '<div class="error" role="alert"><strong>No se pudo completar</strong>' + esc(msg) + '</div>'; }

  /* ---------------- Lista de la ruta ---------------- */
  function lista(ctx) {
    ctx.cabecera('Mi ruta', '#/');
    ctx.contenedor.innerHTML = '<p class="cargando">Cargando…</p>';
    return Promise.all([DB.listarRuta(), DB.listarClientes()]).then(function (r) {
      var ruta = r[0], clientes = {};
      r[1].forEach(function (c) { clientes[c.id] = c; });
      ruta = ruta.filter(function (e) { return clientes[e.clienteId]; });
      var n = { todas: ruta.length, pendiente: 0, visitado: 0, no_atendido: 0 };
      ruta.forEach(function (e) { n[e.estado]++; });

      var html = '<a class="boton grande" href="#/ruta/agregar">+ Agregar clientes a la ruta</a>';
      if (!ruta.length) {
        ctx.contenedor.innerHTML = html + '<div class="vacio" style="margin-top:14px"><h2>Tu ruta está vacía</h2>Agrega los clientes que vas a visitar. También puedes agregar un sector completo desde Sectores.</div>';
        return;
      }
      html += '<p class="resumen" id="resumen">' + n.pendiente + ' pendientes · ' + n.visitado + ' visitados · ' + n.no_atendido + ' no atendidos</p>';
      html += '<div class="segmentos" role="group" aria-label="Filtrar">' + Object.keys(NOMBRE_FILTRO).map(function (k) {
        return '<button type="button" class="segmento' + (filtro === k ? ' activo' : '') + '" data-filtro="' + k + '" aria-pressed="' + (filtro === k) + '">' + NOMBRE_FILTRO[k] + ' (' + n[k] + ')</button>';
      }).join('') + '</div>';

      var visibles = ruta.filter(function (e) { return filtro === 'todas' || e.estado === filtro; });
      html += '<div id="visitas">';
      if (!visibles.length) html += '<div class="vacio">No hay clientes en este filtro.</div>';
      ruta.forEach(function (e, i) {
        if (filtro !== 'todas' && e.estado !== filtro) return;
        var c = clientes[e.clienteId];
        var mapas = Gps.tiene(c)
          ? '<details class="como-llegar"><summary>Cómo llegar</summary>' +
            '<a class="boton secundario" href="' + Gps.enlaceApple(c) + '" target="_blank" rel="noopener">Apple Maps</a>' +
            '<a class="boton secundario" href="' + Gps.enlaceGoogle(c) + '" target="_blank" rel="noopener">Google Maps</a>' +
            '<a class="boton secundario" href="' + Gps.enlaceWaze(c) + '" target="_blank" rel="noopener">Waze</a></details>'
          : '<p class="nota" style="margin:8px 0 0">Sin GPS guardado.</p>';
        var acciones = e.estado === 'pendiente'
          ? '<div class="par"><button type="button" class="boton grande" data-accion="visitado">Visitado</button>' +
            '<button type="button" class="boton" data-accion="no_atendido">No atendido</button></div>'
          : '<div class="par"><button type="button" class="boton secundario" data-accion="pendiente">Volver a pendiente</button>' +
            '<button type="button" class="boton secundario" data-accion="fecha">Cambiar fecha</button></div>' +
            '<div class="editar-fecha" hidden><input type="datetime-local" class="campo" value="' + (e.fecha ? aLocal(e.fecha) : '') + '" aria-label="Fecha de la visita">' +
            '<button type="button" class="boton" data-accion="guardar-fecha">Guardar fecha</button><p class="error" role="alert" hidden></p></div>';
        var mover = filtro === 'todas'
          ? '<button type="button" class="mini" data-accion="subir" aria-label="Subir en la lista"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
            '<button type="button" class="mini" data-accion="bajar" aria-label="Bajar en la lista"' + (i === ruta.length - 1 ? ' disabled' : '') + '>▼</button>'
          : '';
        html += '<article class="visita estado-' + e.estado + '" data-id="' + e.id + '">' +
          '<div class="visita-cab"><span class="orden">' + (i + 1) + '</span>' +
          '<a class="visita-nombre" href="#/clientes/' + c.id + '"><strong>' + esc(c.tienda) + '</strong><span>' + esc(ubic(c)) + '</span></a></div>' +
          '<p class="estado-linea"><span class="chip chip-' + e.estado + '">' + ETIQUETA[e.estado] + '</span>' +
          (e.fecha ? ' <span class="fecha">' + esc(Gps.fechaCorta(e.fecha)) + '</span>' : '') + '</p>' +
          acciones + mapas +
          '<div class="fila-mini">' + mover + '<button type="button" class="mini quitar" data-accion="quitar">Quitar de la ruta</button></div>' +
          '</article>';
      });
      html += '</div>';
      html += '<button type="button" class="boton secundario" id="quitar-atendidas"' + (n.visitado + n.no_atendido ? '' : ' disabled') + '>Quitar las ya atendidas de la ruta</button>' +
              '<button type="button" class="boton peligro" id="vaciar" style="margin-top:12px">Vaciar toda la ruta</button>' +
              '<p class="nota">Quitar clientes de la ruta no los borra, y la fecha de su última visita queda guardada en su ficha.</p>';
      ctx.contenedor.innerHTML = html;
      enlazar(ctx, ruta, clientes);
    }).catch(function (e) { ctx.contenedor.innerHTML = errorHtml(e.message); });
  }

  function enlazar(ctx, ruta, clientes) {
    var contenedor = ctx.contenedor;
    function recargar() { return lista(ctx); }
    function falla(e) { contenedor.insertAdjacentHTML('afterbegin', errorHtml(e.message)); }

    contenedor.querySelectorAll('.segmento').forEach(function (b) {
      b.addEventListener('click', function () { filtro = b.dataset.filtro; recargar(); });
    });
    var visitas = document.getElementById('visitas');
    visitas.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-accion]'); if (!b) return;
      var card = b.closest('.visita'), id = Number(card.dataset.id), accion = b.dataset.accion;
      var entrada = ruta.filter(function (e) { return e.id === id; })[0];
      var nombre = clientes[entrada.clienteId].tienda;
      if (accion === 'visitado' || accion === 'no_atendido' || accion === 'pendiente') {
        if (accion === 'pendiente' && !confirm('¿Volver "' + nombre + '" a pendiente? Se borra su fecha de visita.')) return;
        DB.marcarVisita(id, accion).then(recargar).catch(falla);
      } else if (accion === 'fecha') {
        card.querySelector('.editar-fecha').hidden = false; b.disabled = true;
      } else if (accion === 'guardar-fecha') {
        var campo = card.querySelector('input'), msg = card.querySelector('.editar-fecha .error');
        var d = new Date(campo.value);
        msg.hidden = true;
        if (!campo.value || isNaN(d.getTime())) { msg.textContent = 'Elige una fecha y hora válidas.'; msg.hidden = false; return; }
        if (d.getTime() > Date.now() + 5 * 60000) { msg.textContent = 'La fecha no puede estar en el futuro.'; msg.hidden = false; return; }
        DB.cambiarFechaVisita(id, d.toISOString()).then(recargar).catch(falla);
      } else if (accion === 'subir' || accion === 'bajar') {
        DB.moverEnRuta(id, accion === 'subir' ? -1 : 1).then(recargar).catch(falla);
      } else if (accion === 'quitar') {
        if (!confirm('¿Quitar "' + nombre + '" de la ruta?')) return;
        DB.quitarDeRuta(id).then(recargar).catch(falla);
      }
    });
    document.getElementById('quitar-atendidas').addEventListener('click', function () {
      if (!confirm('¿Quitar de la ruta todos los clientes visitados o no atendidos? Los pendientes se quedan.')) return;
      DB.quitarAtendidasDeRuta().then(recargar).catch(falla);
    });
    document.getElementById('vaciar').addEventListener('click', function () {
      if (!confirm('¿Vaciar toda la ruta? Los clientes no se borran.')) return;
      DB.vaciarRuta().then(recargar).catch(falla);
    });
  }

  /* ---------------- Agregar clientes a la ruta ---------------- */
  function agregar(ctx) {
    ctx.cabecera('Agregar a mi ruta', '#/ruta');
    ctx.contenedor.innerHTML = '<p class="cargando">Cargando…</p>';
    seleccion = {};
    return Promise.all([DB.listarRuta(), DB.listarClientes()]).then(function (r) {
      var enRuta = {};
      r[0].forEach(function (e) { enRuta[e.clienteId] = true; });
      var disp = r[1].filter(function (c) { return !enRuta[c.id]; })
        .sort(function (a, b) { return a.tienda.localeCompare(b.tienda, 'es'); });
      if (!r[1].length) { ctx.contenedor.innerHTML = '<div class="vacio"><h2>Aún no tienes clientes</h2>Primero crea clientes.</div><a class="boton grande" href="#/clientes/nuevo">+ Nuevo cliente</a>'; return; }
      if (!disp.length) { ctx.contenedor.innerHTML = '<div class="vacio"><h2>Todos tus clientes ya están en la ruta</h2></div><a class="boton grande" href="#/ruta">Ver mi ruta</a>'; return; }

      ctx.contenedor.innerHTML =
        '<input id="buscar-r" class="campo buscador" type="search" placeholder="Buscar por tienda, vereda, sector…" autocomplete="off" autocapitalize="off" aria-label="Buscar clientes">' +
        '<button type="button" class="boton secundario" id="todos-vistos">Marcar todos los que se ven</button>' +
        '<p id="conteo-r" class="conteo"></p><div id="opciones-r"></div>' +
        '<div class="barra-accion"><button type="button" class="boton grande" id="confirmar-agregar" disabled>Agregar a la ruta (0)</button></div>';
      var caja = document.getElementById('buscar-r'), ops = document.getElementById('opciones-r');
      var bConf = document.getElementById('confirmar-agregar'), bTodos = document.getElementById('todos-vistos'), cuenta = document.getElementById('conteo-r');
      var visibles = [];

      function total() { return Object.keys(seleccion).length; }
      function refrescarBoton() {
        bConf.textContent = 'Agregar a la ruta (' + total() + ')'; bConf.disabled = total() === 0;
        var todos = visibles.length && visibles.every(function (c) { return seleccion[c.id]; });
        bTodos.textContent = todos ? 'Desmarcar todos los que se ven' : 'Marcar todos los que se ven';
      }
      function pintar() {
        var q = normalizar(caja.value).trim();
        visibles = disp.filter(function (c) {
          var pajar = normalizar([c.tienda, c.municipio, c.vereda, c.sector, c.contacto, c.referencias].join(' '));
          return !q || q.split(/\s+/).every(function (p) { return pajar.indexOf(p) !== -1; });
        });
        cuenta.textContent = visibles.length + (visibles.length === 1 ? ' cliente disponible' : ' clientes disponibles');
        ops.innerHTML = visibles.length ? visibles.map(function (c) {
          return '<label class="opcion"><input type="checkbox" value="' + c.id + '"' + (seleccion[c.id] ? ' checked' : '') + '>' +
            '<span><strong>' + esc(c.tienda) + '</strong><small>' + esc(ubic(c)) + '</small></span></label>';
        }).join('') : '<div class="vacio">Sin resultados</div>';
        refrescarBoton();
      }
      caja.addEventListener('input', pintar);
      ops.addEventListener('change', function (ev) {
        var cb = ev.target; if (cb.type !== 'checkbox') return;
        if (cb.checked) seleccion[cb.value] = true; else delete seleccion[cb.value];
        refrescarBoton();
      });
      bTodos.addEventListener('click', function () {
        var todos = visibles.length && visibles.every(function (c) { return seleccion[c.id]; });
        visibles.forEach(function (c) { if (todos) delete seleccion[c.id]; else seleccion[c.id] = true; });
        pintar();
      });
      bConf.addEventListener('click', function () {
        bConf.disabled = true;
        DB.agregarARuta(Object.keys(seleccion)).then(function () { location.hash = '#/ruta'; })
          .catch(function (e) { bConf.disabled = false; ctx.contenedor.insertAdjacentHTML('afterbegin', errorHtml(e.message)); });
      });
      pintar();
    }).catch(function (e) { ctx.contenedor.innerHTML = errorHtml(e.message); });
  }

  window.Ruta = {
    render: function (partes, ctx) {
      if (partes[1] === 'agregar') return agregar(ctx);
      return lista(ctx);
    }
  };
})();
