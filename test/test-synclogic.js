/*
Accept remote:
(REMOTE RESOLUTION LOOP)
No local remote -> All ok
Remote is newer than local remote -> All ok (There is a previous remote)
Remote is older than local remote -> Throw error
(LOCAL RESOLUTION LOOP)
If there's a local value the same as the remote, remove local

If the previous remote time is the local's parent
If previous remote value is not the same as current remote value, discard previous remote, update local pointers (unless current remote value is same as local value).
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
        'modified' : modified ? new Date(modified) : new Date(),
        'value' : value
    };
    return result;
};

var set_local_state = function(states) {
    states.forEach(function(data) {
        commitIndexedDBMockData([data.element_id,data.page_id,data.modified,data.source],data);
    });
};


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
        resetIndexedDBMock();
        sinon.config.useFakeTimers = true;
    }
});

/*
Tests
*****

Local state:
[]

Remote state:
{new}

New state:
[new]

*/

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

/*
Local state:
[old]

Remote state:
{new}

New state:
[new]

*/

QUnit.test( "Test accepting a newer remote value than existing" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        set_local_state([sync_block(false,'1/1/1980','{"foo":"bar"}')]);
        mockSyncEngine_downloadRemoteContentNewData = [sync_block(false,null,'{}')];
        onenote.watchElement('page','element').then(function() {
            return onenote.sync();
        }).then(function() {
            assert.ok(mockIndexedDBItems.filter(function(item) { return item.value.source; }).length == 1,"Stored remote data");
            assert.ok(mockIndexedDBItems.filter(function(item) { return item.value.value == '{}'; }).length == 1,"Stored remote data");
            OneNoteSync.terminate();
            done();
        }).catch(function(err) {
            console.log("Failed sync ",err);
            done();
        });
    });
});


/*
Local state:
[old]

Remote state:
{older}

New state:
[old] (Throw error)
*/

QUnit.test( "Test accepting an older remote value than existing" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        set_local_state([sync_block(false,'1/1/1980','{"foo":"bar"}')]);
        mockSyncEngine_downloadRemoteContentNewData = [sync_block(false,'1/1/1979','{}')];
        onenote.watchElement('page','element').then(function() {
            return onenote.sync();
        }).then(function() {
            assert.ok(mockIndexedDBItems.filter(function(item) { return item.value.source; }).length == 1,"Stored remote data");
            assert.ok(mockIndexedDBItems.filter(function(item) { return item.value.value == '{"foo":"bar"}'; }).length == 1,"Stored remote data");
            OneNoteSync.terminate();
            done();
        }).catch(function(err) {
            console.log("Failed sync ",err);
            OneNoteSync.terminate();
            done();
        });
    });
});

/*
Local state:
[old,local-val-noparent]

Remote state:
{new-val}

New state:
[new-val]
*/

QUnit.test( "Test remote overwriting local with same value" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        var new_block = sync_block(true,'1/1/1980','{"new":true}');
        new_block.new = true;
        set_local_state([sync_block(false,'1/1/1979','{"foo":"bar"}'),new_block]);
        mockSyncEngine_downloadRemoteContentNewData = [sync_block(false,'2/1/1980','{"new":true}')];
        onenote.watchElement('page','element').then(function() {
            return onenote.sync();
        }).then(function() {
            assert.equal(mockIndexedDBItems.filter(function(item) { return item.value.source; }).length , 1,"Stored remote data");
            assert.equal(mockIndexedDBItems.filter(function(item) { return item.value.value == '{"new":true}' && item.value.source == 'remote'; }).length, 1,"Stored remote data");
            OneNoteSync.terminate();
            done();
        }).catch(function(err) {
            console.log("Failed sync ",err);
            OneNoteSync.terminate();
            done();
        });
    });
});


/*
If previous remote value is not the same as current remote value, discard previous remote, update local pointers (unless current remote value is same as local value).

Local state:
[old,local-val1]

Remote state:
{new-val2}

New state:
[local-val1 (parent new-val2),new-val2]
*/

QUnit.test( "Test updating parent on a local value with new remote" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        var local = sync_block(true,'1/1/1980','{}');
        local.parent = new Date('1/1/1979');
        set_local_state([sync_block(false,'1/1/1979','{"foo":"bar"}'),local]);
        mockSyncEngine_downloadRemoteContentNewData = [sync_block(false,'2/1/1980','{"baz":true}')];
        onenote.watchElement('page','element').then(function() {
            return onenote.sync();
        }).then(function() {
            states = mockIndexedDBItems.filter(function(item) { return item.value.source; }).map(function(item) { return item.value; });
            assert.equal(states.length, 2,"Correct number of states in db");
            assert.equal(states[0].value,"{}");
            assert.equal(states[0].parent, states[1].modified);
            assert.equal(states[0].source,"local");
            assert.equal(states[1].source,"remote");
            assert.equal(states[1].value,'{"baz":true}');
            OneNoteSync.terminate();
            done();
        }).catch(function(err) {
            console.log("Failed sync ",err);
            OneNoteSync.terminate();
            done();
        });
    });
});

/*
Local state:
[old,local-val-parent-old]

Remote state:
{new-val}

New state:
[new-val]
*/

QUnit.test( "Test updating parent on a local value with remote matching existing value" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        var local = sync_block(true,'1/1/1980','{}');
        local.parent = new Date('1/1/1979');
        set_local_state([sync_block(false,'1/1/1979','{"foo":"bar"}'),local]);
        mockSyncEngine_downloadRemoteContentNewData = [sync_block(false,'2/1/1980','{}')];
        onenote.watchElement('page','element').then(function() {
            return onenote.sync();
        }).then(function() {
            states = mockIndexedDBItems.filter(function(item) { return item.value.source; }).map(function(item) { return item.value; });
            assert.equal(states.length, 1,"Correct number of states in db");
            assert.equal(states[0].value,"{}");
            assert.equal(states[0].source,"remote");
            OneNoteSync.terminate();
            done();
        }).catch(function(err) {
            console.log("Failed sync ",err);
            OneNoteSync.terminate();
            done();
        });
    });
});


/*
Local state:
[old-val,local-parent-old]

Remote state:
{new-val}

New state:
[local-parent-new-val,new-val]
*/

QUnit.test( "Test updating parent on a local value with a remote that has only date updated" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        var local = sync_block(true,'1/1/1980','{}');
        local.parent = new Date('1/1/1979');
        set_local_state([sync_block(false,'1/1/1979','{"foo":"bar"}'),local]);
        mockSyncEngine_downloadRemoteContentNewData = [sync_block(false,'2/1/1980','{"foo":"bar"}')];
        onenote.watchElement('page','element').then(function() {
            return onenote.sync();
        }).then(function() {
            states = mockIndexedDBItems.filter(function(item) { return item.value.source; }).map(function(item) { return item.value; });
            assert.equal(states.length, 2,"Correct number of states in db");
            assert.equal(states[0].value,"{}");
            assert.equal(states[0].parent, states[1].modified);
            assert.equal(states[0].source,"local");
            assert.equal(states[1].source,"remote");
            assert.equal(states[1].value,'{"foo":"bar"}');
            OneNoteSync.terminate();
            done();
        }).catch(function(err) {
            console.log("Failed sync ",err);
            OneNoteSync.terminate();
            done();
        });
    });
});

/*
Local state:
[old,local-orphan]

Remote state:
{new}

New state:
[new]
*/

QUnit.test( "Test adding remote value when there is a local value without a valid parent" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        var local = sync_block(true,'1/1/1980','{}');
        local.parent = new Date('1/1/1978');
        set_local_state([sync_block(false,'1/1/1979','{"foo":"bar"}'),local]);
        mockSyncEngine_downloadRemoteContentNewData = [sync_block(false,'2/1/1980','{}')];
        onenote.watchElement('page','element').then(function() {
            return onenote.sync();
        }).then(function() {
            states = mockIndexedDBItems.filter(function(item) { return item.value.source; }).map(function(item) { return item.value; });
            assert.equal(states.length, 1,"Correct number of states in db");
            assert.equal(states[0].source,"remote");
            assert.equal(states[0].value,'{}');
            OneNoteSync.terminate();
            done();
        }).catch(function(err) {
            console.log("Failed sync ",err);
            OneNoteSync.terminate();
            done();
        });
    });
});

/*
LOCAL RESOLUTION

Local state:
[remote,local-old]

New local:
{new}

New state:
[remote,new-parent-remote]
*/


QUnit.test( "Test updating parent on a local value with a remote that has only date updated" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        var local = sync_block(true,'1/1/1980','{}');
        local.parent = new Date('1/1/1979');
        set_local_state([sync_block(false,'1/1/1979','{"foo":"bar"}'),local]);
        var new_local = sync_block(true,'2/1/1980','{"new":"data"}');
        new_local.parent = new Date('1/1/1979');
        mockSyncEngine_downloadRemoteContentNewData = [new_local];
        onenote.watchElement('page','element').then(function() {
            return onenote.sync();
        }).then(function() {
            states = mockIndexedDBItems.filter(function(item) { return item.value.source; }).map(function(item) { return item.value; });
            assert.equal(states.length, 3,"Correct number of states in db");
            assert.equal(states[0].value,'{"foo":"bar"}');
            assert.equal(states[0].modified.getTime(), states[1].parent.getTime());
            assert.equal(states[0].source,"remote");
            assert.equal(states[1].source,"local");
            assert.equal(states[1].value,'{"new":"data"}');
            assert.equal(states[2].source,"remote");
            assert.equal(states[2].value,'{"new":"data"}');

            OneNoteSync.terminate();
            done();
        }).catch(function(err) {
            console.log("Failed sync ",err);
            OneNoteSync.terminate();
            done();
        });
    });
});

/*
Local state:
[remote-val]

New local:
{new-val}

New state:
[remote-val]
*/

QUnit.test( "Test adding a local value with the same value as remote" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        set_local_state([sync_block(false,'1/1/1979','{"foo":"bar"}')]);
        var new_local = sync_block(true,'2/1/1980','{"foo":"bar"}');
        mockSyncEngine_downloadRemoteContentNewData = [new_local];
        onenote.watchElement('page','element').then(function() {
            return onenote.sync();
        }).then(function() {
            states = mockIndexedDBItems.filter(function(item) { return item.value.source; }).map(function(item) { return item.value; });
            assert.equal(states.length, 1,"Correct number of states in db");
            assert.equal(states[0].value,'{"foo":"bar"}');
            assert.equal(states[0].source,"remote");
            OneNoteSync.terminate();
            done();
        }).catch(function(err) {
            console.log("Failed sync ",err);
            OneNoteSync.terminate();
            done();
        });
    });
});

/*
Local state:
[]

New local:
{new}

New state:
[new] - Undefined behaviour here?
*/

QUnit.test( "Test adding a local value in an empty db" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        set_local_state([]);
        var new_local = sync_block(true,'2/1/1980','{"foo":"bar"}');
        mockSyncEngine_downloadRemoteContentNewData = [new_local];
        onenote.watchElement('page','element').then(function() {
            return onenote.sync();
        }).then(function() {
            states = mockIndexedDBItems.filter(function(item) { return item.value.source; }).map(function(item) { return item.value; });
            assert.equal(states.length, 2,"Correct number of states in db");
            assert.equal(states[0].value,'{"foo":"bar"}');
            assert.equal(states[0].source,"local");
            assert.equal(states[1].value,'{"foo":"bar"}');
            assert.equal(states[1].source,"remote");
            OneNoteSync.terminate();
            done();
        }).catch(function(err) {
            console.log("Failed sync ",err);
            OneNoteSync.terminate();
            done();
        });
    });
});
