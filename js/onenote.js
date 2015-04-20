var worker_function = function(self) {
    "use strict";

    var local_db = new Promise(function(resolve,reject){
        var request = indexedDB.open("onenote",3);
        var db = null;
        request.onerror = function(event){
            reject();
        };
        request.onupgradeneeded = function(event) {
            db = event.target.result;
            if (db.objectStoreNames.contains('syncelements')) {
                db.deleteObjectStore('syncelements');
            }
            if (db.objectStoreNames.contains('synclocks')) {
                db.deleteObjectStore('synclocks');
            }

            db.createObjectStore('synclocks');

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
        var range = data ? IDBKeyRange.only([data.element_id,data.page_id]) : null;
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
            return document_id;
        },
        'watch_element' : function(document_id,element_id) {
            methods['add_document'](document_id);

            if (element_paths[document_id].indexOf(element_id) < 0) {
                element_paths[document_id].push(element_id);
                extracted[document_id][element_id] = null;
            }

            return document_id;
        },
        'create_table' : function(document_id,table) {
            var element_id = 'table-'+(new Date()).getTime();
            methods['watch_element'](document_id,element_id);
            methods['set_values'](document_id,element_id,table).then(synchronise_documents);
            return element_id;
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
            return resolve_latest_data({ 'page_id' : document_id,
                                          'element_id' : element_id,
                                          'source' : 'local',
                                          'modified' : new Date() ,
                                          'new' : extracted[document_id][element_id] ? false : true,
                                          'value' : JSON.stringify(values)
                                      }).then(function() {
                                        extracted[document_id][element_id] = JSON.stringify(values);
                                      });
        },
        'set_oauth_token' : function(token) {
            self.token = token;
            // Make sure we can fire events to obtain new
            // oauth tokens when the current one expires
            return "All ok";
        },
        'sync' : function() {
            return lock_and_synchronise();
        }
    };

    // What we use to extract out the elements
    var element_paths = {}; //{ 'document_id' : [ '#element_identifier' ] };

    var extracted = {};

    var database_watcher = function() {
        var ids_to_watch = [];
        Object.keys(extracted).forEach(function(page_id) {
            ids_to_watch = ids_to_watch.concat(Object.keys(extracted[page_id]).map(function(el_id) {  return [page_id,el_id]; }));
        });
        // get_latest_data returns the database entries with stringified values
        Promise.all( ids_to_watch.map( function(ids) { return get_latest_data(ids[0],ids[1]); } ) ).then(
        function(vals) {
            vals.forEach(function(val) {
                if ( ! val ) {
                    return;
                }
                if (extracted[val.page_id][val.element_id] != val.value) {
                    console.log("Changed value for ",val.page_id,val.element_id,"from",extracted[val.page_id][val.element_id], JSON.parse(val.value) );
                    extracted[val.page_id][val.element_id] = val.value;
                    postMessage({"event" : "change", "element_id" : val.element_id, "page_id" : val.page_id, "value" : JSON.parse(val.value) });
                }
            });
        });
    };

    setInterval(database_watcher,1000);

    var read_synced_ids = function() {
        return local_db.then(function(db) {
            loop_cursor(db,null,function(cursor) {
                methods['watch_element'](cursor.value.page_id,cursor.value.element_id);
            });
        });
    };


    var doc_watcher_timeout = setInterval(lock_and_synchronise,5*60*1000);

    // Supply a constructor for notebook engine

    self.syncEngine = null;

    var lock_and_synchronise = function() {
        return obtain_lock().then(function() {
            return synchronise_documents().catch(function(error) {
                // FIXME - do something with the error here
                return Promise.resolve(true);
            });
        }).then(release_lock);
    };

    var synchronise_documents = function() {
        if (Object.keys(element_paths).length < 1) {
            return Promise.resolve(true);
        }

        // Set a lock on the sync function so we know
        // that we're in the middle of a sync run
        return  get_sync_time().then(function(time) {
            return self.syncEngine.downloadRemoteContent(element_paths,time).then(function(contents) {
                write_sync_time(time);
                return contents;
            });
        }).then(function(contents) {
            return Promise.all(contents.map(function(content) {
                return resolve_latest_data(content);
            }));
        }).then(function() {
            var ids_to_check = [];
            Object.keys(element_paths).forEach(function(page_id) {
                ids_to_check = ids_to_check.concat(element_paths[page_id].map(function(el_id) {  return [page_id,el_id]; }));
            });
            var local_entries = Promise.all(ids_to_check.map( function(ids) { return get_latest_data(ids[0],ids[1],true); } ));
            return local_entries.then(function(datas) {
                return Promise.all(datas.map(function(data) {
                    if ( ! data ) {
                        return true;
                    }
                    // data.value should be a string
                    var send_block = { 'page_id' : data.page_id, 'element_id' : data.element_id, 'value' : data.value, 'modified' : new Date(), 'new' : data.new, 'source' : 'remote' };
                    return self.syncEngine.sendData(send_block).then(function(patched_data) {
                        return resolve_latest_data(send_block);
                    });
                }));
            });
        });
    };

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
                if ( ! cursor.value.parent ) {
                    if (cursor.value.new && cursor.value.value === data.value ) {
                        store.delete(cursor.primaryKey);
                    }
                    return true;
                }
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

                        console.log("Resolving conflict, trusting LOCAL data");

                        // By setting the parent to be the modified marker
                        // for this remote data, we accept the latest server state
                        // while also keeping the local changes

                        cursor.value.parent = data.modified;
                        store.put(cursor.value,cursor.primaryKey);

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
        console.log("Storing local data",data);
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

    var resolve_latest_data = function(data) {
        return local_db.then(function(db) {
            if (data.source === "local") {
                return store_local_data(db,data);
            }
            if (data.source === "remote") {
                return store_remote_data(db,data);
            }
        });
    };

    var get_latest_data = function(page_id,element_id,only_local) {
        var wanted_data = null;
        return local_db.then(function(db) {
            return loop_cursor(db,{"page_id" : page_id, "element_id" : element_id },function(cursor) {
                if (cursor.value.source === 'local') {
                    wanted_data = cursor.value;
                    return false;
                } else if ( ! wanted_data && ! only_local ) {
                    wanted_data = cursor.value;
                }
                return true;
            });
        }).then(function() {
            return wanted_data;
        });
    };

    var store_get = function(store,key) {
        var req = store.get(key);
        return new Promise(function(resolve,reject){
            req.onsuccess = function(event) {
                resolve(req.result);
            };
            req.onerror = function(event) {
                reject();
            };
        });
    };

    var store_put = function(store,key,value) {
        var req = value ? store.put(value,key) : store.delete(key);
        return new Promise(function(resolve,reject){
            req.onsuccess = function(event) {
                resolve(req.result);
            };
            req.onerror = function(event) {
                reject();
            };
        });
    };


    var obtain_lock = function() {
        return local_db.then(function(db) {
            var store = db.transaction(["synclocks"], "readwrite").objectStore('synclocks');
            return store_get( store, "lock").then(function(lock) {
                var lock_timedout = lock ? new Date() >= (new Date(lock.time.getTime() + 30*60000)) : true;
                if ( ! lock_timedout ) {
                    console.log("Already syncing - not doing anything");
                    return Promise.reject(false);
                }
                return store_put( store ,'lock',{'time' : new Date(), 'lock' : 'lock' }).then(function(locked) {
                    console.log("Obtained LOCK for sync");
                });
            });
        });
    };

    var release_lock = function() {
        return local_db.then(function(db) {
            var store = db.transaction(["synclocks"], "readwrite").objectStore('synclocks');
            return store_get( store, "lock").then(function(lock) {
                if (lock) {
                    console.log("Releasing LOCK for sync");
                    return store_put( store ,'lock');
                }
            });
        });
    };

    var get_sync_time = function() {
        return local_db.then(function(db) {
            var store = db.transaction(["synclocks"], "readwrite").objectStore('synclocks');
            return store_get( store, "synctime" ).then(function(synctime) {
                return synctime ? synctime : { 'time' : new Date(0,0,0) };
            });
        });
    };

    var write_sync_time = function(time) {
        return local_db.then(function(db) {
            var store = db.transaction(["synclocks"], "readwrite").objectStore('synclocks');
            return store_put( store, "synctime", {'time' : time.time, 'synctime' : 'synctime' } );
        });
    };


    var do_api_call = function(url,token,xml,params) {
        var method = 'GET';
        if (params) {
            Object.keys(params).forEach(function(par) {
                // CSRF risk point here
                if (params[par].match(/^[A-Za-z\.\-\:0-9\!]+$/)) {
                    url = url.replace("<"+par+">",params[par]);
                }
            });
            if (params.method) {
                method = params.method;
            }
        }
        return new Promise(function(resolve,reject) {
            var xhr = new XMLHttpRequest();
            xhr.addEventListener("load", function(ev) {
                resolve(xml ? tXml(ev.srcElement.responseText) : JSON.parse(ev.srcElement.responseText || "{}") );
            }, false);
            xhr.addEventListener("error", reject, false);
            xhr.addEventListener("abort", reject, false);
            xhr.open(method,url);
            if (params && params.content_type) {
                xhr.setRequestHeader('Content-Type',params.content_type);
            }
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            if (params && params.data) {
                xhr.send(params.data);
            } else {
                xhr.send();
            }
        });
    };

    self.do_api_call = do_api_call;
    self.methods = methods;

    read_synced_ids().then(function() {
        lock_and_synchronise();
    });

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

var onenoteEngine = function onenoteEngine(env) {

    const list_notebooks_url = "https://www.onenote.com/api/v1.0/notebooks?orderby=lastModifiedTime&select=id,name&expand=sections";
    const list_notebook_pages_url = "https://www.onenote.com/api/v1.0/notebooks?orderby=lastModifiedTime&select=id,name&expand=sections";
    const list_updated_pages_url = "https://www.onenote.com/api/v1.0/pages?select=id,title,lastModifiedTime,createdTime&orderby=lastModifiedTime desc&filter=lastModifiedTime gt <TIME>";
    const get_page_content_url = "https://www.onenote.com/api/beta/pages/<ID>/content?includeIDs=true";
    const patch_page_url = "https://www.onenote.com/api/beta/pages/<ID>/content";

    var engine = function() {
    };

    engine.registerMethods = function() {
        env.methods['list_notebooks'] = function() {

            if ( ! env.token ) {
                throw new Error("No AUTH token");
            }

            return env.do_api_call(list_notebooks_url,env.token).then(function(json) {
                return json.value;
            });
        };
    };

    var get_updated_pages = function(element_paths,last_sync) {
        if ( ! env.token ) {
            throw new Error("No AUTH token");
        }
        return env.do_api_call(list_updated_pages_url,env.token,false, {"TIME" : last_sync.toISOString() }).then(function(data) {
            var current_keys = Object.keys(element_paths);
            data.value.forEach(function(page) { page.wanted = current_keys.indexOf(page.id) >= 0; });
            return data.value;
        });
    };

    var patch_page = function(page_id,change_block) {
        return env.do_api_call(patch_page_url,env.token,false, {
            'ID' : page_id,
            'method' : 'PATCH',
            'content_type' : 'application/json',
            'data' : JSON.stringify(change_block)
        });
    };

    var get_page_contents = function(page_ids) {

        if ( ! env.token ) {
            throw new Error("No AUTH token");
        }

        // We should really serialise this process here to avoid hammering the servers
        var promises = page_ids.map(function(page) {
                return env.do_api_call(get_page_content_url,env.token,true, { "ID" : page.id }).then(
                    function(content) {
                        content.id = page.id;
                        content.modified = new Date(page.lastModifiedTime);
                        content.title = page.title;
                        return content;
                    });
            });

        return Promise.all(promises);

    };

    var children_search = function(root,element_id) {
        if (root.attributes && root.attributes['data-id'] && root.attributes['data-id'] === element_id) {
            return root;
        }
        var kids = [].concat(root.children || []);
        var target = null;
        while (target === null && kids.length > 0) {
            target = children_search(kids.shift(),element_id);
        }
        return target;
    };

    var convert_header = function(header_row) {
        return header_row.children.map(function(td) { return td.children[0].children[0]; });
    };

    var extract_tag = function(span,data,field) {
        (span.attributes['data-tag'] || '').split(',').forEach(function(attr) {
            if (attr === 'to-do') {
                data[field+':checked'] = false;
                return;
            }
            if (attr === 'to-do:completed') {
                data[field+':checked'] = true;
                return;
            }
            data[field+':'+attr] = true;
        });
        return span.children[0];
    }

    var convert_row = function(fields,row) {
        var vals = row.children.map(function(td) { return td.children[0]; }).reverse();
        var data = {};
        var curr_idx = row.children.length - 1;
        [].concat(fields).reverse().forEach(function(field) {
            var val = vals.shift();
            if (typeof val === 'object') {
                data[field] = extract_tag(val,data,field);
            } else {
                data[field] = val;
            }
            var color = (row.children[curr_idx].attributes['style'] || "").match(/background-color:([^;]+)/) || [];
            if (color[1]) {
                data[field+':color'] = color[1];
            }

            curr_idx -= 1;
        });
        return data;
    };


    var convert_table = function(table) {
        var rows = table.children;
        var header = rows.shift();
        var fields = convert_header(header);
        return rows.map(function(row) { return convert_row(fields,row) });
    };

    var extract_content = function(content, element_id) {
        var target = children_search(content.children[1],element_id);
        if (target) {
            var converted = convert_table(target);
            console.log("Converted ",converted);
            return converted;
        }
    };

    var extract_contents = function(element_paths,contents) {

        // Extract content and store in localhost

        var values = [];
        contents.forEach(function(content) {
            values = values.concat(element_paths[content.id].map(function(element_id) {
                var value = JSON.stringify(extract_content( content[0], element_id ));
                return { 'page_id': content.id, 'element_id': element_id, 'modified' : content.modified, 'source' : 'remote', 'value' : value };
            }));
        });
        return values;

    };

    var collect_keys = function(rows) {
        var keys = {};
        rows.forEach(function(row) {
            Object.keys(row).forEach(function(key) {
                if ( key.indexOf(':') < 0) {
                    keys[key] = true;
                }
            });
        });
        return Object.keys(keys).sort();
    };

    var write_cell = function(data) {
        var style = "";
        var tags = [];
        if (data.color) {
            style = ' style="background-color:'+data.color+'"';
        }
        if ("checked" in data) {
            if (data.checked) {
                tags.push('to-do:completed');
            } else {
                tags.push('to-do');
            }
        }
        tags = tags.concat( Object.keys(data).filter(function(tag) { return ! (tag.indexOf('to-do') > 0 || tag == 'value' || tag == 'color' || tag == 'checked');  }) );
        var span_start = "", span_end = "";
        if (tags.length > 0) {
            span_start = '<span data-tag="'+tags.join(',')+'">';
            span_end = '</span>';
        }
        return "<td"+style+">"+span_start+data.value+span_end+"</td>";
    };

    var write_row = function(row,column_names) {
        var row_keys = Object.keys(row);
        return column_names.map(function(col) {
            var data = {};
            row_keys.filter(function(key) {  return key.indexOf(col+":") >= 0; }).forEach(function(key) {
                data[ key.replace(col+":","") ] = row[key];
            });
            data.value = row[col];
            return write_cell(data);
        }).join('');
    };

    var write_content = function(id,rows) {
        var column_names = [];
        if (rows.length > 0) {
            column_names = collect_keys(rows);
        }
        var header = '<tr>'+column_names.map(function(col) { return '<td><b>'+col+'</b></td>' }).join('')+'</tr>';
        var row_data = rows.map( function(row) {
            return '<tr>'+write_row(row,column_names)+'</tr>';
        }).join('');
        return '<table border="2" data-id="'+id+'">'+header+row_data+'</table>';
    };


    engine.downloadRemoteContent = function(element_paths,last_sync) {
        var updated_pages = null;
        if  (! env.token ) {
            throw new Error("No AUTH token");
        }
        if ( last_sync.time.getTime() === (new Date(0,0,0)).getTime() ) {
            updated_pages = Promise.resolve( Object.keys(element_paths).map(function(page_id) {
                return { 'id' : page_id, 'wanted' : true, 'lastModifiedTime' : (new Date(new Date() - 24*60*60*1000 )) };
            }));
        } else {
            updated_pages = get_updated_pages(element_paths,last_sync.time);
        }
        return updated_pages.then(function(page_ids) {
            var max_date;
            if (page_ids.length > 0) {
                max_date = new Date(page_ids[0].lastModifiedTime);
            }
            if (max_date) {
                last_sync.time = max_date;
            }

            return page_ids.filter(function(page) { return page.wanted; });
        }).then(get_page_contents).then(function(contents) {
            return(extract_contents(element_paths,contents));
        });
    };

    engine.sendData = function(data) {
        // data.value should be a string, because it's the
        // database format object

        console.log("Sending data",data);
        var send_block = [ {
            'target':'body',
            'action':'append',
            'position':'before',
            'content': write_content(data.element_id,JSON.parse(data.value))
        }];

        if (! data.new) {
            send_block[0].target = '#'+data.element_id;
            send_block[0].action = 'replace';
        }
        return patch_page(data.page_id,send_block).then(function() {

            // data.value here should be a string

            data.source = 'remote';
            data.modified = new Date();
            return data;
        });
    };

    engine.registerMethods();

    self.OneNoteSyncEngine = engine;
};

if ("Worker" in window && window.location.hash === '') {
    window.OneNoteSync = (function() {
        console.log("Defining worker");
        var common_worker = new Worker(window.URL.createObjectURL(new Blob(['('+worker_function.toString()+'(self))'], {'type' : 'text/javascript'})));
        common_worker.postMessage();
        common_worker.postMessage({ 'import_script' : window.URL.createObjectURL(new Blob([tXml.toString()], {'type' : 'text/javascript'})) });
        common_worker.postMessage({ 'import_script' : window.URL.createObjectURL(new Blob([onenoteEngine.toString()+"\nonenoteEngine(this); syncEngine = OneNoteSyncEngine;"], {'type' : 'text/javascript'})) });
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

        OneNoteSync.prototype.watchElement = function(doc,element) {
            return worker_method('watch_element', [ doc, element ]);
        };

        OneNoteSync.prototype.appendTable = function(doc,table) {
            if ( ! table ) {
                table = [];
            }
            return worker_method('create_table', [doc, table]);
        };

        OneNoteSync.prototype.sync = function() {
            return worker_method('sync');
        };
        return OneNoteSync;
    })();
}