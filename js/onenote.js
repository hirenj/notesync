
var worker_function = function(self) {

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
		},
	};

	// What we use to extract out the elements
	var element_paths = { 'document_id' : [ '#element_identifier' ] };

	var extracted = {};

	var doc_watcher_timeout = setTimeout(synchronise_documents,5*60*1000);

	var synchronise_documents = function() {
		// Download document
		// Extract element
		// Check changed
		postMessage({ 'method' : 'elementChanged' });
	}

	self.addEventListener('message', function(e) {
		if (e.data) {
			postMessage( { 'method' : e.data.method, 'id' : e.data.id , 'message_id' : e.data.message_id, 'value' : methods[e.data.method].apply(null,e.data.arguments) }  );
		}
	}, false);

	WL.init({
	    client_id: APP_CLIENT_ID,
	    redirect_uri: REDIRECT_URL,
	    scope: "wl.signin", 
	    response_type: "token"
	});

};

if ("Worker" in window) {
	window.OneNoteSync = (function() {
		var common_worker = new Worker(window.URL.createObjectURL(new Blob(['('+worker_function.toString()+'(self))'], {'type' : 'text/javascript'})));
		common_worker.postMessage();

		var OneNoteSync = function() {
		};

		OneNoteSync.prototype.addDocument = function(doc) {
			common_worker.postMessage({'method' : 'add_document', 'id' : '', 'message_id' : '', 'arguments' : [ doc ]});
		};
		return OneNoteSync;
	})();
}