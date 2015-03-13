if ("Worker" in window) {
	(function() {

		var common_worker = new Worker('');
		common_worker.postMessage();

		var OneNoteSync = function() {
		};

		OneNoteSync.prototype.containerid;

	})();
}


var worker_function = function(self) {
	self.addEventListener('message', function(e) {
		if (e.data.cmd === 'set')
	}, false);
};