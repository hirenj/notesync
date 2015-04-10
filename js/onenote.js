var worker_function = function(self) {

	const list_notebooks_url = "https://www.onenote.com/api/v1.0/notebooks?orderby=lastModifiedTime&select=id,name&expand=sections";
    const list_notebook_pages_url = "https://www.onenote.com/api/v1.0/notebooks?orderby=lastModifiedTime&select=id,name&expand=sections";
    const list_updated_pages_url = "https://www.onenote.com/api/v1.0/pages?select=id&filter=lastModifiedTime gt 2014-09-18T13:19:47.043Z";
    const get_page_content_url = "https://www.onenote.com/api/beta/pages/<ID>/content?includeIDs=true";

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
			// But actually store the values in localstorage
			// so that they can survive browser shutdown
			// or something, and eventually synchronise back
			// up. Maybe giving a message if the server version
			// of the data is out of sync with the local version.
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

	var extracted = {};

	//var doc_watcher_timeout = setTimeout(synchronise_documents,5*60*1000);

	var synchronise_documents = function() {

        if (Object.keys(element_paths).length < 1) {
            return;
        }

        // Set a lock on the sync function so we know
        // that we're in the middle of a sync run

        do_api_call(list_updated_pages_url,token,false).then(function(data) {
            var current_keys = Object.keys(element_paths);
            var new_pages = data.value.filter(function(page) { return current_keys.indexOf(page.id) >= 0; });
            return new_pages.map(function(page) { return page.id; });
        }).then(function(page_ids) {

            // We should really serialise this process here to avoid hammering the servers

            var promises = page_ids.map(function(id) { return do_api_call(get_page_content_url,token,true, { "ID" : id }); });
            return Promise.all(promises);
        }).then(function(contents) {
            contents.forEach(function(content) {
                // Loop through here, extracting the correct ID and data structure for
                // everything that we want to sync with.
                console.log(content);

                // Store all this data in local storage along with the date that the
                // page was last modified

                // Work out the sync precedence of this according to the
                // * Data stored on localStorage
                // * Changes pending sync
                // * Whatever is on the server

                // Need to handle deleted pages on the server too
            });
        });

		// Check changed

        // Notify user of any conflicts
        // Probably pause the syncing while we sort out any conflicts

        // Post changes that need to be synced in one block of operations

//		postMessage({ 'method' : 'elementChanged' });
	};

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

if ("Worker" in window) {
	window.OneNoteSync = (function() {
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

		var worker_method = function(method,args) {
			return new Promise(function(resolve,reject) {
				var message_block = { 'method' : method,
									  'arguments' : args,
									  'message_id' : (new Date()).getTime()
									};

				var receive_func = function(e) {
					if (e.data) {
						if (e.data.message_id == message_block.message_id) {
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