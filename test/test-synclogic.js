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


/*
Local state:
[old,local-val-noparent]

Remote state:
{new-val}

New state:
[new-val]
*/



/*
If previous remote value is not the same as current remote value, discard previous remote, update local pointers (unless current remote value is same as local value).

Local state:
[old,local-val1]

Remote state:
{new-val2}

New state:
[local-val1 (parent new-val2),new-val2]
*/

/*
Local state:
[old,local-val-parent-old]

Remote state:
{new-val}

New state:
[new-val]
*/

/*
Local state:
[old-val,local-parent-old]

Remote state:
{new-val}

New state:
[local-parent-new-val,new-val]
*/

/*
Local state:
[old,local-orphan]

Remote state:
{new}

New state:
[new]
*/


/*
LOCAL RESOLUTION

Local state:
[remote,local-old]

New local:
{new}

New state:
[remote,new-parent-remote]
*/

/*
Local state:
[remote-val]

New local:
{new-val}

New state:
[remote-val]
*/

/*
Local state:
[]

New local:
{new}

New state:
[new] - Undefined behaviour here?
*/


