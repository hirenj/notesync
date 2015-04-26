QUnit.module("Database checks",{ 
    beforeEach: function() {
        window.originalWorker = window.Worker;
        window.Worker = MockWorker;
        window.Worker.indexedDB = mockIndexedDB;
        resetIndexedDBMock();
        mockIndexedDBTestFlags.upgradeNeeded = true;
    },
    afterEach: function() {
        window.Worker.indexedDB = window.indexedDB;
        window.Worker = window.originalWorker;
    }
});

QUnit.test( "Test sync class defined", function( assert ) {
    assert.ok(typeof OneNoteSync !== 'undefined', "Passed!" );
});

QUnit.test( "Test init of worker and database using mock",function( assert ) {
    var done = assert.async();
    var spy = sinon.spy(mockIndexedDBDatabase, "createObjectStore");
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        assert.ok(onenote !== null, 'Have onenote object');
        assert.ok(JSON.stringify(spy.args) === '[["synclocks"],["syncelements"]]' ,"Created two object stores");
        OneNoteSync.terminate();
        done();
    }).catch(function(err) {
        assert.ok(false,err);
        assert.ok(false,"Error establishing web worker (mocked) or database (mocked)");
        done();
    });
});
*/
QUnit.module("Testing web worker startup and shutdown", {
    beforeEach: function() {
        window.originalWorker = window.Worker;
        window.Worker = MockWorker;
    },
    afterEach: function() {
        window.Worker = window.originalWorker;
    }
});

QUnit.test( "Test init of worker and database using real DB" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        assert.ok(onenote !== null, 'Have onenote object');
        OneNoteSync.terminate();
        var req = indexedDB.deleteDatabase('onenote');
        req.onsuccess = function() {
            done();
        };
        req.onerror = function() {
            done();
        };
        req.onblocked = function(ev) {
            console.log("Blocked",ev);
        };
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
        req.onblocked = function(ev) {
            console.log("Blocked",ev);
        };
    });
});


QUnit.test( "Test shutdown of worker" , function( assert ) {
    var done = assert.async();
    console.log("Creating new onenotesync object");
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        assert.ok(onenote !== null, 'Have onenote object');
        OneNoteSync.terminate();
        var req = indexedDB.deleteDatabase('onenote');
        req.onsuccess = function() {
            done();
        };
        req.onerror = function() {
            done();
        };
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


/*
        resetIndexedDBMock();
        commitIndexedDBMockData(key1, savedItem1);
        commitIndexedDBMockData(key2, savedItem2);

*/