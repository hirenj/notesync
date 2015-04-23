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

QUnit.test( "Test init of worker and database",function( assert ) {
    var done = assert.async();
    var spy = sinon.spy(mockIndexedDBDatabase, "createObjectStore");
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        assert.ok(onenote !== null, 'Have onenote object');
        assert.ok(JSON.stringify(spy.args) === '[["synclocks"],["syncelements"]]' ,"Created two object stores");
        onenote.terminate();
        done();
    }).catch(function(err) {
        assert.ok(false,err);
        assert.ok(false,"Error establishing web worker (mocked) or database (mocked)");
        done();
    });
});

QUnit.module("Testing web worker startup and shutdown", {
    beforeEach: function() {
        window.originalWorker = window.Worker;
        window.Worker = MockWorker;
        indexedDB.deleteDatabase('onenote');
    },
    afterEach: function() {
        window.Worker = window.originalWorker;
        indexedDB.deleteDatabase('onenote');
    }
});

QUnit.test( "Test init of worker and database" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        assert.ok(onenote !== null, 'Have onenote object');
        onenote.terminate();
        done();
    }).catch(function(err) {
        assert.ok(false,err);
        assert.ok(false,"Error establishing web worker (mocked) or database (mocked)");
        done();
    });
});


QUnit.test( "Test shutdown of worker" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        assert.ok(onenote !== null, 'Have onenote object');
        onenote.terminate();
        done();
    }).catch(function(err) {
        assert.ok(false,err);
        assert.ok(false,"Error establishing web worker (mocked) or database (mocked)");
        done();
    });
});


/*
        resetIndexedDBMock();
        commitIndexedDBMockData(key1, savedItem1);
        commitIndexedDBMockData(key2, savedItem2);

*/