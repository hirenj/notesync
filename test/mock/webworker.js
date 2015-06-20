var dataURLToBlob = function(dataURL,callback) {
	var xhr = new XMLHttpRequest();
	xhr.open('GET',dataURL, true);
	xhr.responseType = 'arraybuffer';
	xhr.onload = function(e) {
		if (this.status == 200) {
			var result = '';
			var data = new Uint8Array(this.response);
			try {
				result = String.fromCharCode.apply(null, data);
			} catch(e) {
				var dataArray = [];
				for (var j = 0, jj = data.length; j < jj; ++j) {
					dataArray.push(data[j]);
				}
				result = String.fromCharCode.apply(null, dataArray);
			}
			callback(result);
		}
	};
	xhr.send();
};

MockWorker = function(script) {
	var parent = this;
	this.listeners = [];
	this.terminates = [];
	this.context = { 'listeners' : [] };
	this.context.close = function() {};
	this.context.indexedDB = MockWorker.indexedDB;
	this.context.XMLHttpRequest = MockWorker.XMLHttpRequest;
	this.context.addEventListener = function(type,callback) {
		parent.context.listeners.push(callback);
	};
	this.context.postMessage = function(message) {
		(parent.listeners || []).forEach(function(cb) {
			cb.call(parent,{ 'data' : message });
		});
	};
	this.context.importScripts = function(url) {
		dataURLToBlob(url,function(arraybuff) {
			var context_fn = new Function("self",arraybuff.toString());
			context_fn(parent.context);
		});
	};

	dataURLToBlob(script,function(arraybuff) {
		var context_fn = new Function("self",arraybuff.toString());
		context_fn(parent.context);
	});
};

MockWorker.XMLHttpRequest = XMLHttpRequest;
MockWorker.indexedDB = this.indexedDB;


MockWorker.prototype.addEventListener = function(type,callback) {
	if (type == "message") {
		this.listeners.push(callback);
	}
	if (type == "terminate") {
		this.terminates.push(callback);
	}
};

MockWorker.prototype.removeEventListener = function(type,callback) {
	if ( this.listeners.indexOf(callback) >= 0 ) {
		this.listeners.splice(this.listeners.indexOf(callback),1);
	}
};

MockWorker.prototype.dispatchEvent = function(evt) {
	if (evt.type == "terminate") {
		this.terminates.forEach(function(cb) {
			cb.call(this);
		});
	}
};


MockWorker.prototype.postMessage = function(message) {
	var self = this;
	var ctx = this.context;

	if ( ctx.listeners.length < 1 ) {
		setTimeout(function() {
			self.postMessage(message);
		},100);
		return;
	}
	ctx.listeners.forEach(function(cb) {
		cb.call(ctx,{'data':message});
	});
};