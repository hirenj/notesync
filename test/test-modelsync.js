sinon.config.useFakeTimers = false;
window.Promise = require('promise-polyfill');

QUnit.module("Sync data model with stored data",{
    beforeEach: function() {
        window.originalWorker = window.Worker;
        window.Worker = MockWorker;
        window.Worker.indexedDB = mockIndexedDB;
        resetIndexedDBMock();
    },
    afterEach: function() {
        window.Worker.indexedDB = window.indexedDB;
        window.Worker = window.originalWorker;
        resetIndexedDBMock();
    }
});

QUnit.test( "Test watching of database", function(assert) {
    var done = assert.async();
    console.log("Test watching of database");
    var onenote = new OneNoteSync();
    console.log("Test watching of database");
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
