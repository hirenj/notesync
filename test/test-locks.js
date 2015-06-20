sinon.config.useFakeTimers = false;
if ( ! window.Promise ) {
    window.Promise = require('promise-polyfill');
}

QUnit.module("Testing obtaining locks", {
    beforeEach: function() {
        window.originalWorker = window.Worker;
        window.Worker = MockWorker;
        mockSyncEngine.mockEngine(window.OneNoteSync);
    },
    afterEach: function() {
        window.Worker = window.originalWorker;
        mockSyncEngine.unmockEngine(window.OneNoteSync);
        mockSyncEngine.reset();
    }
});

var test_method = function() {
    if (window.indexedDB) {
        return QUnit.test.apply(QUnit,arguments);
    } else {
        return QUnit.skip.apply(QUnit,arguments);
    }
};


test_method( "Test simple sync" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        var spy = sinon.spy(mockSyncEngine, "downloadRemoteContent");
        onenote.watchElement('foo','bar').then(onenote.sync.bind(onenote)).then(function() {
            assert.ok(spy.called, 'MockSyncEngine properly installed');
            spy.restore();
            OneNoteSync.terminate().then(function() {
                var req = window.indexedDB.deleteDatabase('onenote');
                req.onsuccess = function() {
                    done();
                };
                req.onerror = function() {
                    done();
                };
            });
        }).catch(console.error.bind(console));
    });
});

test_method( "Test two parallel syncs" , function( assert ) {
    var done = assert.async();
    var onenote = new OneNoteSync();
    onenote.ready.then(function() {
        var spy = sinon.spy(mockSyncEngine, "downloadRemoteContent");
        mockSyncEngine_downloadRemoteContentWaitTime = 3000;
        onenote.watchElement('foo','bar').then(function() {
            var first_lock = onenote.sync();
            var second_lock = new Promise(function(resolve) {
                setTimeout(function() {
                    resolve(onenote.sync());
                },1000);
            });
            return first_lock.then(function() {
                return second_lock;
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
