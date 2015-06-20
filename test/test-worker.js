sinon.config.useFakeTimers = false;
if ( ! window.Promise ) {
    window.Promise = require('promise-polyfill');
}

var test_method = function() {
    if (window.indexedDB) {
        return QUnit.test.apply(QUnit,arguments);
    } else {
        return QUnit.skip.apply(QUnit,arguments);
    }
};

QUnit.module("Testing web worker startup and shutdown", {
    beforeEach: function() {
        window.originalWorker = window.Worker;
        window.Worker = MockWorker;
    },
    afterEach: function() {
        window.Worker = window.originalWorker;
    }
});

test_method( "Test init of worker and database using real DB" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        assert.ok(onenote !== null, 'Have onenote object');
        OneNoteSync.terminate().then(function() {
            var req = indexedDB.deleteDatabase('onenote');
            req.onsuccess = function() {
                done();
            };
            req.onerror = function() {
                done();
            };
        });
    }).catch(function(err) {
        assert.ok(false,err);
        assert.ok(false,"Error establishing web worker (mocked) or database (mocked)");
        var req = indexedDB.deleteDatabase('onenote');
        req.onsuccess = function() {
            done();
        };
        req.onerror = function() {
            done();
        };
    });
});


test_method( "Test shutdown of worker" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        assert.ok(onenote !== null, 'Have onenote object');
        OneNoteSync.terminate().then(function() {
            onenote.sync().catch(function(e) {
                assert.ok(e.message == 'Common worker has been terminated',"Error thrown for promise");
            });

            var req = indexedDB.deleteDatabase('onenote');
            req.onsuccess = function() {
                done();
            };
            req.onerror = function() {
                done();
            };

        });
    }).catch(function(err) {
        assert.ok(false,err);
        assert.ok(false,"Error establishing web worker (mocked) or database (mocked)");
        var req = indexedDB.deleteDatabase('onenote');
        req.onsuccess = function() {
            done();
        };
        req.onerror = function() {
            done();
        };
    });
});