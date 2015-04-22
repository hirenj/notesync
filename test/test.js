QUnit.module("Database checks",{ 
    beforeEach: function() {
        window.Worker = MockWorker;
        window.Worker.indexedDB = mockIndexedDB;
        resetIndexedDBMock();
        mockIndexedDBTestFlags.upgradeNeeded = true;
    },
    afterEach: function() {
        window.Worker.indexedDB = window.indexedDB;
    }
});
QUnit.test( "Test sync class defined", function( assert ) {
    assert.ok(typeof OneNoteSync !== 'undefined', "Passed!" );
});
QUnit.test( "Test indexeddb is mocked", function( assert ) {
    assert.ok(typeof window.indexedDB === 'object','Passed!');
});
QUnit.test( "Test kick off of worker", null,function( assert ) {
    var done = assert.async();
    console.log("Setting up spy");
    var spy = this.spy(mockIndexedDBDatabase, "createObjectStore");
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        assert.ok(onenote !== null, 'Passed!');
        console.log("Created store ",mockIndexedDB_createStoreSuccess);
        assert.ok(mockIndexedDB_createStoreSuccess, 'Object store creation');
        console.log(spy === mockIndexedDBDatabase.createObjectStore);
        console.log(spy.callCount);
        done();
    }).catch(function(err) {
        assert.ok(false,err);
        done();
    });
},true);

QUnit.module("Regular database check");

QUnit.test( "Test indexeddb is mocked", function( assert ) {
    assert.ok(typeof window.indexedDB === 'object','Passed!');
});


/*
        resetIndexedDBMock();
        commitIndexedDBMockData(key1, savedItem1);
        commitIndexedDBMockData(key2, savedItem2);

*/