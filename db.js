/* Base de datos local (IndexedDB). Los datos quedan en el teléfono. */
(function () {
  'use strict';
  var NOMBRE = 'mi-ruta';
  var VERSION = 2;
  var abierta = null;

  function abrir() {
    if (abierta) return abierta;
    abierta = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('Este navegador no tiene IndexedDB.')); return; }
      var req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = function (e) {
        var db = req.result;
        if (e.oldVersion < 1) {
          var s = db.createObjectStore('clientes', { keyPath: 'id', autoIncrement: true });
          s.createIndex('municipio', 'municipio');
          s.createIndex('vereda', 'vereda');
          s.createIndex('sector', 'sector');
        }
        if (e.oldVersion < 2) {   /* Etapa 5: lista de visitas (Mi ruta) */
          var v = db.createObjectStore('visitas', { keyPath: 'id', autoIncrement: true });
          v.createIndex('clienteId', 'clienteId', { unique: true });
        }
      };
      req.onsuccess = function () {
        var db = req.result;
        db.onversionchange = function () { db.close(); abierta = null; };
        resolve(db);
      };
      req.onerror = function () { reject(req.error || new Error('No se pudo abrir la base de datos.')); };
      req.onblocked = function () { reject(new Error('La base de datos está bloqueada por otra pestaña.')); };
    });
    abierta.catch(function () { abierta = null; });
    return abierta;
  }

  /* Ejecuta una operación y espera a que la transacción TERMINE (así el guardado es seguro). */
  function transaccion(store, modo, fn) {
    return abrir().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, modo);
        var resultado;
        var req = fn(tx.objectStore(store));
        if (req) req.onsuccess = function () { resultado = req.result; };
        tx.oncomplete = function () { resolve(resultado); };
        tx.onerror = function () { reject(tx.error || new Error('Error al guardar.')); };
        tx.onabort = function () { reject(tx.error || new Error('Operación cancelada.')); };
      });
    });
  }

  /* Transacción sobre varios stores. trabajo(tx, fijarResultado) usa solo peticiones IndexedDB. */
  function enTransaccion(stores, modo, trabajo) {
    return abrir().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(stores, modo), resultado;
        tx.oncomplete = function () { resolve(resultado); };
        tx.onerror = function () { reject(tx.error || new Error('Error al guardar.')); };
        tx.onabort = function () { reject(tx.error || new Error('Operación cancelada.')); };
        trabajo(tx, function (v) { resultado = v; });
      });
    });
  }

  window.DB = {
    abrir: abrir,
    listarClientes: function () { return transaccion('clientes', 'readonly', function (s) { return s.getAll(); }); },
    obtenerCliente: function (id) { return transaccion('clientes', 'readonly', function (s) { return s.get(Number(id)); }); },
    guardarCliente: function (c) {
      var ahora = new Date().toISOString();
      if (!c.creado) c.creado = ahora;
      c.modificado = ahora;
      return transaccion('clientes', 'readwrite', function (s) { return s.put(c); });
    },
    /* Al eliminar un cliente también se quita de la ruta. */
    eliminarCliente: function (id) {
      id = Number(id);
      return enTransaccion(['clientes', 'visitas'], 'readwrite', function (tx) {
        tx.objectStore('clientes').delete(id);
        var sv = tx.objectStore('visitas');
        var rq = sv.getAll();
        rq.onsuccess = function () {
          rq.result.forEach(function (e) { if (e.clienteId === id) sv.delete(e.id); });
        };
      });
    },

    /* ---------- Mi ruta ---------- */
    listarRuta: function () {
      return transaccion('visitas', 'readonly', function (s) { return s.getAll(); }).then(function (l) {
        return l.sort(function (a, b) { return a.orden - b.orden; });
      });
    },
    entradaDeCliente: function (clienteId) {
      return transaccion('visitas', 'readonly', function (s) { return s.index('clienteId').get(Number(clienteId)); });
    },
    agregarARuta: function (ids) {
      return enTransaccion(['visitas'], 'readwrite', function (tx, fijar) {
        var s = tx.objectStore('visitas'), rq = s.getAll();
        rq.onsuccess = function () {
          var ya = {}, max = 0, agregados = 0, yaEstaban = 0;
          rq.result.forEach(function (e) { ya[e.clienteId] = true; if (e.orden > max) max = e.orden; });
          ids.forEach(function (x) {
            var id = Number(x);
            if (ya[id]) { yaEstaban++; return; }
            ya[id] = true;
            s.add({ clienteId: id, estado: 'pendiente', fecha: null, orden: ++max });
            agregados++;
          });
          fijar({ agregados: agregados, yaEstaban: yaEstaban });
        };
      });
    },
    /* estado: 'pendiente' | 'visitado' | 'no_atendido'. Actualiza también la "última visita" del cliente. */
    marcarVisita: function (id, estado, fechaIso) {
      return enTransaccion(['visitas', 'clientes'], 'readwrite', function (tx, fijar) {
        var sv = tx.objectStore('visitas'), sc = tx.objectStore('clientes');
        var rq = sv.get(Number(id));
        rq.onsuccess = function () {
          var e = rq.result;
          if (!e) { tx.abort(); return; }
          var anterior = e.fecha;
          e.estado = estado;
          e.fecha = estado === 'pendiente' ? null : (fechaIso || new Date().toISOString());
          sv.put(e);
          var rc = sc.get(e.clienteId);
          rc.onsuccess = function () {
            var c = rc.result;
            if (c) {
              if (estado === 'pendiente') { if (c.ultimaVisita && c.ultimaVisita.fecha === anterior) c.ultimaVisita = null; }
              else c.ultimaVisita = { fecha: e.fecha, estado: estado };
              sc.put(c);
            }
            fijar(e);
          };
        };
      });
    },
    cambiarFechaVisita: function (id, fechaIso) {
      return enTransaccion(['visitas', 'clientes'], 'readwrite', function (tx, fijar) {
        var sv = tx.objectStore('visitas'), sc = tx.objectStore('clientes');
        var rq = sv.get(Number(id));
        rq.onsuccess = function () {
          var e = rq.result;
          if (!e || e.estado === 'pendiente') { tx.abort(); return; }
          var anterior = e.fecha; e.fecha = fechaIso; sv.put(e);
          var rc = sc.get(e.clienteId);
          rc.onsuccess = function () {
            var c = rc.result;
            if (c && c.ultimaVisita && c.ultimaVisita.fecha === anterior) { c.ultimaVisita.fecha = fechaIso; sc.put(c); }
            fijar(e);
          };
        };
      });
    },
    moverEnRuta: function (id, direccion) {
      return enTransaccion(['visitas'], 'readwrite', function (tx) {
        var s = tx.objectStore('visitas'), rq = s.getAll();
        rq.onsuccess = function () {
          var l = rq.result.sort(function (a, b) { return a.orden - b.orden; });
          var i = -1; l.forEach(function (e, k) { if (e.id === Number(id)) i = k; });
          var j = i + direccion;
          if (i < 0 || j < 0 || j >= l.length) return;
          var t = l[i].orden; l[i].orden = l[j].orden; l[j].orden = t;
          s.put(l[i]); s.put(l[j]);
        };
      });
    },
    quitarDeRuta: function (id) { return transaccion('visitas', 'readwrite', function (s) { return s.delete(Number(id)); }); },
    quitarAtendidasDeRuta: function () {
      return enTransaccion(['visitas'], 'readwrite', function (tx) {
        var s = tx.objectStore('visitas'), rq = s.getAll();
        rq.onsuccess = function () { rq.result.forEach(function (e) { if (e.estado !== 'pendiente') s.delete(e.id); }); };
      });
    },
    vaciarRuta: function () { return transaccion('visitas', 'readwrite', function (s) { return s.clear(); }); },
    valoresDistintos: function (campo) {
      return this.listarClientes().then(function (lista) {
        var vistos = {};
        lista.forEach(function (c) { if (c[campo]) vistos[c[campo]] = true; });
        return Object.keys(vistos).sort(function (a, b) { return a.localeCompare(b, 'es'); });
      });
    }
  };
})();
