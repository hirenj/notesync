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
        resetIndexedDBMock();
        sinon.config.useFakeTimers = true;
    }
});

QUnit.test( "Test accepting a remote value on empty db" , function( assert ) {
    var done = assert.async();
    console.log("Firing off ");
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

