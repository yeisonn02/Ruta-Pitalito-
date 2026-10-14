/* Base de datos local (IndexedDB). Los datos quedan en el teléfono. */
(function () {
  'use strict';
  var NOMBRE = 'mi-ruta';
  var VERSION = 1;
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
        /* Etapas futuras: aquí se agregan stores nuevos con "if (e.oldVersion < 2)" */
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
    eliminarCliente: function (id) { return transaccion('clientes', 'readwrite', function (s) { return s.delete(Number(id)); }); },
    valoresDistintos: function (campo) {
      return this.listarClientes().then(function (lista) {
        var vistos = {};
        lista.forEach(function (c) { if (c[campo]) vistos[c[campo]] = true; });
        return Object.keys(vistos).sort(function (a, b) { return a.localeCompare(b, 'es'); });
      });
    }
  };
})();
