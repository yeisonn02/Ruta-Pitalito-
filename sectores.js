/* Sectores: municipio -> vereda -> sector -> clientes. */
(function () {
  'use strict';
  var esc = Clientes.esc, normalizar = Clientes.normalizar;

  /* Agrupa sin importar mayúsculas, tildes ni espacios dobles. */
  function clave(v) { return normalizar(v).trim().replace(/\s+/g, ' '); }
  function tok(k) { return k === '' ? '~' : encodeURIComponent(k).replace(/~/g, '%7E').replace(/\*/g, '%2A'); }
  function des(t) { return t === '~' ? '' : decodeURIComponent(t); }
  function ptok(v) { return v === '' ? '~' : encodeURIComponent(v).replace(/~/g, '%7E'); }
  function val(g) { return !g || g.key === '' ? '' : g.label; }
  function etiquetaSin(campo) { return 'Sin ' + campo; }

  function agrupar(lista, campo) {
    var mapa = {};
    lista.forEach(function (c) {
      var k = clave(c[campo]);
      if (!mapa[k]) mapa[k] = { key: k, label: k === '' ? etiquetaSin(campo) : String(c[campo]).trim().replace(/\s+/g, ' '), n: 0 };
      mapa[k].n++;
    });
    return Object.keys(mapa).map(function (k) { return mapa[k]; }).sort(function (a, b) {
      if (a.key === '') return 1; if (b.key === '') return -1;   /* "Sin ..." al final */
      return a.label.localeCompare(b.label, 'es');
    });
  }
  function filtrar(lista, campo, k) { return lista.filter(function (c) { return clave(c[campo]) === k; }); }
  function plural(n) { return n + (n === 1 ? ' cliente' : ' clientes'); }
  function fila(href, titulo, n) {
    return '<a class="tarjeta" href="' + href + '"><strong>' + esc(titulo) + '</strong><span>' + plural(n) + '</span></a>';
  }
  function migas(partes) { return '<p class="migas">' + partes.map(esc).join(' › ') + '</p>'; }
  function vacio(ctx, atras) {
    ctx.contenedor.innerHTML = '<div class="vacio"><h2>No hay clientes aquí</h2>Puede que los hayas movido o eliminado.</div>' +
      '<a class="boton secundario" href="' + atras + '">Volver</a>';
  }

  function render(partes, ctx) {
    ctx.contenedor.innerHTML = '<p class="cargando">Cargando…</p>';
    return DB.listarClientes().then(function (todos) {
      var m = partes[1] != null ? des(partes[1]) : null;
      var v = partes[2] != null ? des(partes[2]) : null;
      var todosS = partes[3] === '*';                       /* "*" sin codificar = ver todos */
      var s = (partes[3] != null && !todosS) ? des(partes[3]) : null;   /* "%2A" = un sector llamado * */

      /* Nivel 0: municipios */
      if (m === null) {
        ctx.cabecera('Sectores', '#/');
        if (!todos.length) {
          ctx.contenedor.innerHTML = '<div class="vacio"><h2>Aún no hay clientes</h2>Cuando guardes clientes con municipio, vereda y sector, aquí los verás agrupados.</div>' +
            '<a class="boton grande" href="#/clientes/nuevo">+ Nuevo cliente</a>';
          return;
        }
        ctx.contenedor.innerHTML = '<p class="conteo">Elige un municipio</p>' +
          agrupar(todos, 'municipio').map(function (g) { return fila('#/sectores/' + tok(g.key), g.label, g.n); }).join('');
        return;
      }

      var enM = filtrar(todos, 'municipio', m);
      var gm = agrupar(enM, 'municipio')[0];
      if (!enM.length) { ctx.cabecera('Sectores', '#/sectores'); return vacio(ctx, '#/sectores'); }

      /* Nivel 1: veredas */
      if (v === null) {
        ctx.cabecera(gm.label, '#/sectores');
        ctx.contenedor.innerHTML = '<p class="conteo">Elige una vereda</p>' +
          agrupar(enM, 'vereda').map(function (g) { return fila('#/sectores/' + tok(m) + '/' + tok(g.key), g.label, g.n); }).join('');
        return;
      }

      var enV = filtrar(enM, 'vereda', v);
      var gv = agrupar(enV, 'vereda')[0];
      if (!enV.length) { ctx.cabecera(gm.label, '#/sectores/' + tok(m)); return vacio(ctx, '#/sectores/' + tok(m)); }

      /* Nivel 2: sectores de la vereda */
      if (s === null && !todosS) {
        ctx.cabecera(gv.label, '#/sectores/' + tok(m));
        ctx.contenedor.innerHTML = migas([gm.label]) +
          '<a class="boton grande" href="#/sectores/' + tok(m) + '/' + tok(v) + '/*">Ver todos los clientes (' + enV.length + ')</a>' +
          '<p class="conteo">O elige un sector</p>' +
          agrupar(enV, 'sector').map(function (g) { return fila('#/sectores/' + tok(m) + '/' + tok(v) + '/' + tok(g.key), g.label, g.n); }).join('');
        return;
      }

      /* Nivel 3: clientes */
      var enS = todosS ? enV : filtrar(enV, 'sector', s);
      var titulo = todosS ? 'Todos' : (agrupar(enS, 'sector')[0] || { label: 'Sector' }).label;
      ctx.cabecera(titulo, '#/sectores/' + tok(m) + '/' + tok(v));
      if (!enS.length) return vacio(ctx, '#/sectores/' + tok(m) + '/' + tok(v));
      Clientes.setOrigen(location.hash);
      enS.sort(function (a, b) { return a.tienda.localeCompare(b.tienda, 'es'); });
      var gs = todosS ? null : agrupar(enS, 'sector')[0];
      var nuevoAqui = '#/clientes/nuevo/' + ptok(val(gm)) + '/' + ptok(val(gv)) + '/' + ptok(val(gs));
      ctx.contenedor.innerHTML = migas([gm.label, gv.label].concat(todosS ? [] : [titulo])) +
        '<a class="boton grande" href="' + nuevoAqui + '">+ Nuevo cliente aquí</a>' +
        '<button class="boton" type="button" id="a-ruta-sector">Agregar estos ' + enS.length + ' a mi ruta</button><div id="msg-ruta"></div>' +
        '<p class="conteo">' + plural(enS.length) + '</p>' + enS.map(Clientes.tarjeta).join('');
      document.getElementById('a-ruta-sector').addEventListener('click', function () {
        var b = this; b.disabled = true;
        DB.agregarARuta(enS.map(function (c) { return c.id; })).then(function (r) {
          document.getElementById('msg-ruta').innerHTML = '<p class="aviso" role="status" style="margin-top:12px"><strong>Listo</strong>' +
            r.agregados + (r.agregados === 1 ? ' cliente agregado' : ' clientes agregados') + (r.yaEstaban ? ' (' + r.yaEstaban + ' ya estaban en la ruta)' : '') +
            '. <a href="#/ruta">Ver mi ruta</a></p>';
          b.disabled = false;
        }).catch(function (e) { b.disabled = false; document.getElementById('msg-ruta').innerHTML = '<div class="error" role="alert">' + esc(e.message) + '</div>'; });
      });
    }).catch(function (e) {
      ctx.contenedor.innerHTML = '<div class="error" role="alert"><strong>No se pudo completar</strong>' + esc(e.message) + '</div>';
    });
  }

  window.Sectores = { render: render };
})();
