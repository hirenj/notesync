QUnit.module("Database checks",{ 
    beforeEach: function() {
        if ( ! window.orig_db ) {
            window.orig_db = window.indexedDB;
        }
        window.indexedDB = mockIndexedDB;
    },
    afterEach: function() {
        window.indexedDB = window.orig_db;
    }
});
QUnit.test( "Test sync class defined", function( assert ) {
    assert.ok(typeof OneNoteSync !== 'undefined', "Passed!" );
});
QUnit.test( "Test indexeddb is mocked", function( assert ) {
    assert.ok(typeof window.indexedDB === 'object','Passed!');
});
QUnit.test( "Test kick off of worker", function( assert ) {
    assert.ok(new OneNoteSync() !== null, 'Passed!');
});

QUnit.module("Regular database check");

QUnit.test( "Test indexeddb is mocked", function( assert ) {
    assert.ok(typeof window.indexedDB === 'object','Passed!');
});


/*
        resetIndexedDBMock();
        commitIndexedDBMockData(key1, savedItem1);
        commitIndexedDBMockData(key2, savedItem2);

*/