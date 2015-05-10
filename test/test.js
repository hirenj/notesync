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

QUnit.module("Sync data model with stored data",{
    beforeEach: function() {
        window.originalWorker = window.Worker;
        window.Worker = MockWorker;
        window.Worker.indexedDB = mockIndexedDB;
        resetIndexedDBMock();
        sinon.config.useFakeTimers = false;
    },
    afterEach: function() {
        window.Worker.indexedDB = window.indexedDB;
        window.Worker = window.originalWorker;
        sinon.config.useFakeTimers = true;
    }
});

QUnit.test( "Test watching of database", function(assert) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    commitIndexedDBMockData('a', { 'page_id' : 'foo', 'element_id' : 'bar', 'source' : 'remote', 'value' : JSON.stringify({'foobar' : 'fooz'}) });

    onenote.ready.then(function() {
        onenote.notifyChanges('foo','bar',function(val) {
            assert.ok(val.foobar == "fooz","Got a value from the database");
            OneNoteSync.terminate();
            done();
        });
    });
});

QUnit.test( "Test watching of database, changing value", function(assert) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    setTimeout(function() {
        commitIndexedDBMockData('a', { 'page_id' : 'foo', 'element_id' : 'bar', 'source' : 'remote', 'value' : JSON.stringify({'foobar' : 'fooz2'}) });
    },2000);

    onenote.ready.then(function() {
        onenote.notifyChanges('foo','bar',function(val) {
            assert.ok(val.foobar == "fooz2","Got a value from the database");
            OneNoteSync.terminate();
            done();
        });
    });
});

QUnit.test( "Test watching of database, changing value sequentially", function(assert) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    setTimeout(function() {
        commitIndexedDBMockData('a', { 'page_id' : 'foo', 'element_id' : 'bar', 'source' : 'remote', 'value' : JSON.stringify({'foobar' : 'fooz'}) });
    },2000);

    setTimeout(function() {
        commitIndexedDBMockData('a', { 'page_id' : 'foo', 'element_id' : 'bar', 'source' : 'remote', 'value' : JSON.stringify({'foobar' : 'fooz2', 'new' : 'thing'}) });
    },4000);

    onenote.ready.then(function() {
        var change_count = 0;
        var values = [];
        onenote.notifyChanges('foo','bar',function(val) {
            change_count += 1;
            values.push(val.foobar);
            if (change_count == 2) {
                assert.deepEqual(values, ['fooz','fooz2'],"Got a value from the database");
                OneNoteSync.terminate();
                done();
            }
        });
    });
});


QUnit.test( "Test watching of database with watched documents in db already", function(assert) {
    var done = assert.async();
    commitIndexedDBMockData('a', { 'page_id' : 'foo', 'element_id' : 'bar', 'source' : 'remote', 'value' : JSON.stringify({'foobar' : 'foo-existing'}) });
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        setTimeout(function() {
            onenote.getValues('foo','bar').then(function(val) {
                assert.ok(val.foobar == "foo-existing","Got a value from the database");
                OneNoteSync.terminate();
                done();
            });
        },3000);
    });
});



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


QUnit.test( "Test shutdown of worker" , function( assert ) {
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