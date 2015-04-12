var worker_function = function(self) {

    const list_notebooks_url = "https://www.onenote.com/api/v1.0/notebooks?orderby=lastModifiedTime&select=id,name&expand=sections";
    const list_notebook_pages_url = "https://www.onenote.com/api/v1.0/notebooks?orderby=lastModifiedTime&select=id,name&expand=sections";
    const list_updated_pages_url = "https://www.onenote.com/api/v1.0/pages?select=id,title,lastModifiedTime&filter=lastModifiedTime gt 2015-01-01T13:19:47.043Z";
    const get_page_content_url = "https://www.onenote.com/api/beta/pages/<ID>/content?includeIDs=true";

    var local_db = new Promise(function(resolve,reject){
        var request = indexedDB.open("onenote",2);
        var db = null;
        request.onerror = function(event){
            reject();
        };
        request.onupgradeneeded = function(event) {
            db = event.target.result;
            db.deleteObjectStore('syncelements');
            var objectStore = db.createObjectStore("syncelements");
            // Allow us to search by last modified (so we can get the latest data quickly)
            objectStore.createIndex("by_modified",["element_id","page_id","modified"],{unique:false});
            objectStore.createIndex("by_elements",["element_id","page_id"], {unique: false});
            objectStore.transaction.oncomplete = function (){
                console.log("Done version change");
                resolve(db);
            };
        };

        request.onsuccess = function(event) {
            resolve(event.target.result);
        };
    });

    var db_cursor = function(idx,range,callback) {
        return new Promise(function(resolve,reject) {
            // We wish to loop through the data from
            // the newest entries added to the oldest entries
            var key_cursor = idx.openCursor(range,"prev");
            key_cursor.onsuccess = function() {
                var cursor = key_cursor.result;
                if (cursor) {
                    try {
                        var retval = callback(cursor);
                    } catch (e) {
                        reject(e);
                    }
                    if (retval) {
                        cursor.continue();
                    } else {
                        resolve();
                    }
                } else {
                    resolve();
                }
            };
            key_cursor.onerror = function() {
                reject();
            };
        });
    };

    var loop_cursor = function(db,data,callback) {
        var store = db instanceof IDBObjectStore ? db : db.transaction('syncelements', "readwrite").objectStore('syncelements');
        var elements_idx = store.index('by_elements');
        var range = IDBKeyRange.only([data.element_id,data.page_id]);
        return db_cursor(elements_idx,range,callback).then(function() { return store; });
    };

    var end_transaction = function(store) {
        return new Promise(function(resolve,reject) {
            store.transaction.oncomplete = resolve;
            store.transaction.onerror = function(ev) {
                reject(store.transaction.error);
            };
        });
    };

    var methods = {
        'add_document' : function(document_id) {
            if ( ! element_paths[document_id]) {
                element_paths[document_id] = [];
                extracted[document_id] = {};
            }
            console.log(document_id);
            return document_id;
        },
        'watch_element' : function(document_id,element_id) {
            add_document(document_id);

            if (element_paths[document_id].indexOf(element_id) < 0) {
                element_paths[document_id].push(element_id);
                extracted[document_id][element_id] = null;
            }

            return document_id;
        },
        'get_values' : function(document_id,element_id) {
            // Return the elements for the
            // given container identifier
            // and the document identifier?
            return extracted[document_id][element_id];
        },
        'set_values' : function(document_id,element_id,values) {
            // Set the values back into the element that
            // we pulled data out of.
            return resolve_lastest_data({ 'page_id' : document_id,
                                          'element_id' : element_id,
                                          'source' : 'local',
                                          'modified' : new Date() ,
                                          'value' : values
                                      }).then(function() {
                                        extracted[document_id][element_id] = values;
                                      });
        },
        'set_oauth_token' : function(token) {
            this.token = token;
            // Make sure we can fire events to obtain new
            // oauth tokens when the current one expires
            return "All ok";
        },
        'list_notebooks' : function() {
            return do_api_call(list_notebooks_url,this.token).then(function(json) {
                return json.value;
            });
        },
        'sync' : function() {
            synchronise_documents();
            return "OK";
        }
    };

    // What we use to extract out the elements
    var element_paths = {}; //{ 'document_id' : [ '#element_identifier' ] };

    var extracted = { 1 : { 2 : null } };

    var database_watcher = function() {
        var ids_to_watch = [];
        Object.keys(extracted).forEach(function(page_id) {
            ids_to_watch = ids_to_watch.concat(Object.keys(extracted[page_id]).map(function(el_id) {  return [page_id,el_id]; }));
        });

        Promise.all( ids_to_watch.map( function(ids) { return get_latest_data(ids[0],ids[1]); } ) ).then(
        function(vals) {
            vals.forEach(function(val) {
                if (extracted[val.page_id][val.element_id] != val.value) {
                    console.log("Changed value for ",val.page_id,val.element_id,"from",extracted[val.page_id][val.element_id],val.value);
                    extracted[val.page_id][val.element_id] = val.value;
                    postMessage({"event" : "change", "element_id" : val.element_id, "page_id" : val.page_id, "value" : val.value });
                }
            });
        });
    };

    setInterval(database_watcher,1000);

    //var doc_watcher_timeout = setTimeout(synchronise_documents,5*60*1000);

    var synchronise_documents = function() {

        if (Object.keys(element_paths).length < 1) {
            return;
        }

        // Set a lock on the sync function so we know
        // that we're in the middle of a sync run

        do_api_call(list_updated_pages_url,token,false).then(function(data) {
            var current_keys = Object.keys(element_paths);
            console.log(data);
            var new_pages = data.value.filter(function(page) { return current_keys.indexOf(page.id) >= 0; });
            return new_pages;
        }).then(function(page_ids) {

            // We should really serialise this process here to avoid hammering the servers

            var promises = page_ids.map(function(page) {
                    return do_api_call(get_page_content_url,token,true, { "ID" : page.id }).then(
                        function(content) {
                            content.id = page.id;
                            content.modified = page.lastModifiedTime;
                            content.title = page.title;
                            return content;
                        });
                });
            return Promise.all(promises);
        }).then(function(contents) {
            contents.forEach(function(content) {
                // Loop through here, extracting the correct ID and data structure for
                // everything that we want to sync with.
                console.log(content);

                // Store all this data in local storage along with the date that the
                // page was last modified

                // Need to handle deleted pages on the server too
            });
        });

        // Check changed

        // Post changes that need to be synced in one block of operations
        // After doing/verifying the upload on a local, add a remote entry in with a guessed modified time

        // Make sure we fire off a db check immediately after the sync process? (database_watcher method)
    };

    // Synchronisation logic:
    // If the source is LOCAL
    //  Mark older LOCAL entries as "old" / REMOVE
    //  Add the data entry in, and mark the "parent" as the last remote data

    // If the source is REMOTE
    //  If data is null - then we want to kill the sync for any LOCALS that might want to sync
    //  If this entry already exists - do nothing
    //  If this entry already exists as the most new REMOTE entry (but with an older timestamp),
    //      add new entry with new timestamp. Update all LOCAL entries to use the new
    //      timestamp entry. Delete the old REMOTE entry
    //  If there are LOCAL entries that refer to existing REMOTE
    //      THROW error - pause sync until this is resolved?
    //  If the most new entry is REMOTE, remove the old one, and insert this new one.
    //  If this matches any LOCAL, delete the LOCAL.


    var store_remote_data = function(db,data) {
        var previous_remote = null;
        var previous_remote_value = null;

        return loop_cursor(db,data,function(cursor) {

            // We would like to get the most recently inserted
            // remote data. This most recently inserted remote
            // data block will be the one that all the local
            // changes will be based upon. We can safely remove
            // that remote, because we'd like to update the "parent"
            // of all the other locals so that it matches this
            // new remote (conflicts considered of course)

            if (cursor.value.source === 'remote') {

                // If for some reason, we get an out of order update,
                // that is the remote value we get back is somehow
                // older than a remote value we already have, then
                // simply stop adding this remote value in.

                if (cursor.value.modified.getTime() > data.modified.getTime()) {
                    throw new Error("Out of order remote value (have newer remote value)");
                }

                previous_remote = cursor.value.modified;
                previous_remote_value = cursor.value.value;
                console.log("Deleting REMOTE ",cursor.primaryKey);
                cursor.source.objectStore.delete(cursor.primaryKey);
                return false;
            }
            return true;
        }).then(function(store) {

            // The logic for the conflict resolution is done here
            // by checking the values of all the local changes

            return loop_cursor(store,data,function(cursor) {
                if (cursor.value.source !== 'local') {
                    return true;
                }
                if (cursor.value.parent.getTime() === previous_remote.getTime() ) {
                    if ( previous_remote_value !== data.value ) {
                        if (data.value === cursor.value.value) {
                            // We got a remote value matching this local value
                            // we can get rid of the local value
                            store.delete(cursor.primaryKey);
                            return true;
                        }
                        console.log("We need to resolve a sync issue here");

                        // Simultaneous change on local and remote, decide which to keep
                        // Need to break the promise chain somehow (set attribute on data?)
                        // telling it not to insert the remote value

                    } else {
                        // Values are the same, simply update the "parent" value
                        console.log("Updating local",cursor.value, " parent time to be ",data.modified);
                        cursor.value.parent = data.modified;
                        store.put(cursor.value,cursor.primaryKey);
                    }
                } else if (cursor.value.parent.getTime() !== data.modified.getTime() ) {

                    // If we have old local values that don't match up with any remote values
                    // we can possibly get rid of them, since they're out of sync by at least
                    // one revision

                    console.log("Local value with a parent that's old.. remove?",cursor.value);
                    store.delete(cursor.primaryKey);
                }
                return true;
            });
        }).then(function(store) {
            // Conflicts are resolved, so we can insert this new remote

            console.log("Inserting REMOTE ",data);

            store.put(data,[data.element_id,data.page_id,data.modified,data.source]);
            return store;
        }).then(end_transaction);
    };

    var store_local_data = function(db,data) {
        return loop_cursor(db,data,function(cursor) {
            if (cursor.value.source === 'local') {
                cursor.source.objectStore.delete(cursor.primaryKey);
            }
            if (cursor.value.source === 'remote' && ! data.parent) {
                data.parent = cursor.value.modified;
                if (cursor.value.value === data.value) {
                    data.synced = true;
                }
            }
            return true;
        }).then(function(store) {
            if ( ! data.synced ) {
                store.put(data,[data.element_id,data.page_id,data.modified,data.source]);
            }
            return store;
        }).then(end_transaction);
    };

    var resolve_lastest_data = function(data) {
        return local_db.then(function(db) {
            if (data.source === "local") {
                return store_local_data(db,data);
            }
            if (data.source === "remote") {
                return store_remote_data(db,data);
            }
        });
    };

    var get_latest_data = function(page_id,element_id) {
        var wanted_data = null;
        return local_db.then(function(db) {
            return loop_cursor(db,{"page_id" : parseInt(page_id), "element_id" : parseInt(element_id) },function(cursor) {
                if (cursor.value.source === 'local') {
                    wanted_data = cursor.value;
                    return false;
                } else if ( ! wanted_data ) {
                    wanted_data = cursor.value;
                }
                return true;
            });
        }).then(function() {
            return wanted_data;
        });
    };

    resolve_lastest_data({ 'page_id' : 1, 'element_id' : 2, 'source' : 'remote', 'modified' : new Date() , 'value' : 'Foo' }).then(function() {
        console.log("Inserted remote into DB");
    });

    setTimeout(function() {
        resolve_lastest_data({ 'page_id' : 1, 'element_id' : 2, 'source' : 'remote', 'modified' : new Date(1999, 12, 12, 23, 59), 'value' : 'Bar' }).then(function() {
            console.log("Failed test: Inserted BAD remote into DB");
        },function() {
            console.log("Correctly did not insert bad remote into DB");
        });
    },1000);

    setTimeout(function() {
        resolve_lastest_data({ 'page_id' : 1, 'element_id' : 2, 'source' : 'remote', 'modified' : new Date(), 'value' : 'Bar' }).then(function() {
            console.log("Inserted remote 2 into DB");
        });
    },5000);
    setTimeout(function() {
        resolve_lastest_data({ 'page_id' : 1, 'element_id' : 2, 'source' : 'local', 'modified' : new Date(), 'value' : 'Barr' }).then(function() {
            console.log("Inserted local 1 into DB");
        });
    },10000);

    setTimeout(function() {
        resolve_lastest_data({ 'page_id' : 1, 'element_id' : 2, 'source' : 'remote', 'modified' : new Date(), 'value' : 'Barro' }).then(function() {
            console.log("Inserted remote 3 into DB");
        });
    },15000);


    setTimeout(function() {
        resolve_lastest_data({ 'page_id' : 1, 'element_id' : 2, 'source' : 'local', 'modified' : new Date(), 'value' : 'Baz' }).then(function() {
            console.log("Inserted local 2 into DB");
        });
    },16000);

    var do_api_call = function(url,token,xml,params) {
        if (params) {
            Object.keys(params).forEach(function(par) {
                // CSRF risk point here
                if (params[par].match(/^[A-Za-z\.\-\:0-9\!]+$/)) {
                    url = url.replace("<"+par+">",params[par]);
                }
            });
        }
        return new Promise(function(resolve,reject) {
            var xhr = new XMLHttpRequest();
            xhr.addEventListener("load", function(ev) {
                resolve(xml ? tXml(ev.srcElement.responseText) : JSON.parse(ev.srcElement.responseText));
            }, false);
            xhr.addEventListener("error", reject, false);
            xhr.addEventListener("abort", reject, false);
            xhr.open('GET',url);
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr.send();
        });
    };

    self.addEventListener('message', function(e) {
        if (e.data) {
            if (e.data.import_script) {
                importScripts(e.data.import_script);
                return;
            }
            Promise.resolve(methods[e.data.method].apply(null,e.data.arguments)).then(function(val) {
                postMessage( { 'method' : e.data.method, 'message_id' : e.data.message_id, 'value' : val }  );
            });
        }
    }, false);

};
if ("Worker" in window && window.location.hash === '') {
    window.OneNoteSync = (function() {
        console.log("Defining worker");
        var common_worker = new Worker(window.URL.createObjectURL(new Blob(['('+worker_function.toString()+'(self))'], {'type' : 'text/javascript'})));
        common_worker.postMessage();
        common_worker.postMessage({ 'import_script' : window.URL.createObjectURL(new Blob([tXml.toString()], {'type' : 'text/javascript'})) });
        WL.init({
            client_id: '000000004C14DD4A',
            redirect_uri: 'http://hirenj-jsonenotetest.localtest.me:8000/test_onenote.html',
            scope: "office.onenote_update",
            response_type: "token"
        }).then(function() {
            console.log("Inited OneNote library");
        },function(err) {
            console.log(err);
        });

        common_worker.addEventListener('message',function(e) {
            if (e.data) {
                if (e.data.event) {
                    console.log("Received event",e.data);
                }
            }
        });


        var worker_method = function(method,args) {
            return new Promise(function(resolve,reject) {
                var message_block = { 'method' : method,
                                      'arguments' : args,
                                      'message_id' : (new Date()).getTime()
                                    };

                var receive_func = function(e) {
                    if (e.data) {
                        if (e.data.message_id === message_block.message_id) {
                            resolve(e.data.value);
                        }
                        // We should handle the error cases in here too.
                    }
                };

                common_worker.addEventListener('message',receive_func);

                common_worker.postMessage(message_block);

                setTimeout(function() {
                    common_worker.removeEventListener('message',receive_func);
                    reject({"error" : "Timeout"});
                },10000);
            });
        }

        var OneNoteSync = function() {
            WL.login().then(function(response) {
                worker_method('set_oauth_token', [ response.session.access_token ] ).then(function(ok) {
                    console.log(ok);
                });
            },function(err) {
                console.log(err);
            });
        };

        OneNoteSync.prototype.listNotebooks = function() {
            return worker_method('list_notebooks');
        };

        OneNoteSync.prototype.addDocument = function(doc) {
            return worker_method('add_document', [ doc ]);
        };

        OneNoteSync.prototype.sync = function() {
            return worker_method('sync');
        };
        return OneNoteSync;
    })();
}