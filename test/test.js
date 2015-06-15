
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
        spy.restore();
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

QUnit.module("Testing obtaining locks", {
    beforeEach: function() {
        window.originalWorker = window.Worker;
        window.Worker = MockWorker;
        mockSyncEngine.mockEngine(window.OneNoteSync);
        sinon.config.useFakeTimers = false;
    },
    afterEach: function() {
        window.Worker = window.originalWorker;
        mockSyncEngine.unmockEngine(window.OneNoteSync);
        mockSyncEngine.reset();
        sinon.config.useFakeTimers = true;
    }
});

QUnit.test( "Test simple sync" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        var spy = sinon.spy(mockSyncEngine, "downloadRemoteContent");
        onenote.watchElement('foo','bar').then(onenote.sync.bind(onenote)).then(function() {
            assert.ok(spy.called, 'MockSyncEngine properly installed');
            spy.restore();
            OneNoteSync.terminate();
            var req = indexedDB.deleteDatabase('onenote');
            req.onsuccess = function() {
                done();
            };
            req.onerror = function() {
                done();
            };
        }).catch(console.error.bind(console));
    });
});

QUnit.test( "Test two parallel syncs" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        var spy = sinon.spy(mockSyncEngine, "downloadRemoteContent");
        mockSyncEngine_downloadRemoteContentWaitTime = 3000;
        onenote.watchElement('foo','bar').then(function() {
            onenote.sync();
            return new Promise(function(resolve) {
                setTimeout(function() {
                    resolve(onenote.sync());
                },1000);
            });
        }).then(function() {
            // assert.not ok?
            OneNoteSync.terminate();
            var req = indexedDB.deleteDatabase('onenote');
            req.onsuccess = function() {
                done();
            };
            req.onerror = function() {
                done();
            };
        }).catch(function(err) {
            assert.ok(err == 'Sync in progress','Rejecting second sync call');
            assert.ok(spy.calledOnce, 'downloadRemoteContent only called once');
            OneNoteSync.terminate();
            var req = indexedDB.deleteDatabase('onenote');
            req.onsuccess = function() {
                done();
            };
            req.onerror = function() {
                done();
            };
        }).then(function() {
            spy.restore();
        });
    });
});

/*
Accept remote:
(REMOTE RESOLUTION LOOP)
No local remote -> All ok
Remote is newer than local remote -> All ok (There is a previous remote)
Remote is older than local remote -> Throw error
(LOCAL RESOLUTION LOOP)
If there's a local value the same as the remote, remove local

If the previous remote time is the local's parent
If previous remote value is not the same as current remote value, discard remote (unless current remote value is same as local value).
If previous remote value is the same as current remote, update parent on local
If the parent value of the local is not the previous remote - remove local
Finally insert remote

Accept local:
Remove other locals
If there's no remotes with the same value, insert local with parent of the oldest remote.

Setting local state:

commitIndexedDBMockData('a', { 'page_id' : 'foo', 'element_id' : 'bar', 'source' : 'remote', 'value' : JSON.stringify({'foobar' : 'foo-existing'}) });

Reading local state:
mockIndexedDBItems

*/

var sync_block = function sync_block(local,modified,value) {
    var result = {
        'page_id' : 'page',
        'element_id' : 'element',
        'source' : local ? 'local' : 'remote',
        'modified' : modified ? modified : new Date(),
        'value' : value
    };
    return result;
};

var set_local_state = function(states) {
    states.forEach(function(data) {
        commitIndexedDBMockData([data.element_id,data.page_id,data.modified,data.source],data);
    });
};

/*
Tests
*****

Local state:
[]

Remote state:
{any}

New state:
{any}

*/

QUnit.module("Testing syncing logic", {
    beforeEach: function() {
        window.originalWorker = window.Worker;
        window.Worker = MockWorker;
        window.Worker.indexedDB = mockIndexedDB;
        resetIndexedDBMock();
        mockSyncEngine.mockEngine(window.OneNoteSync);
        sinon.config.useFakeTimers = false;
    },
    afterEach: function() {
        window.Worker = window.originalWorker;
        window.Worker.indexedDB = window.indexedDB;
        mockSyncEngine.unmockEngine(window.OneNoteSync);
        mockSyncEngine.reset();
        sinon.config.useFakeTimers = true;
    }
});

QUnit.test( "Test accepting a remote value on empty db" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        mockSyncEngine_downloadRemoteContentNewData = [sync_block(false,null,'{}')];
        onenote.watchElement('page','element').then(function() {
            return onenote.sync();
        }).then(function() {
            assert.ok(mockIndexedDBItems.filter(function(item) { return item.value.source; }).length == 1,"Stored remote data");
            OneNoteSync.terminate();
            done();
        }).catch(function(err) {
            console.log("Failed sync ",err);
            done();
        });
    });
});


// Tests to write

// Combinations of results from synchronisation. Need to mock the API requests here?
// Need to test the syncTime parts - make the server respond like there's no new values etc


// Mock     engine.downloadRemoteContent = function(element_paths,last_sync) {
    // Should return Promise of json blocks to with stringified values to insert into sync engine

// Mock     engine.sendData = function(data) {
    // Should return promise that will fire whenever data is eventually sent.