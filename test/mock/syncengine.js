var mockSyncEngine_downloadRemoteContentWaitTime = 0;
var mockSyncEngine_downloadRemoteContentFail = false;
var mockSyncEngine_downloadRemoteContentNewData = [];

var mockEngine = function mockEngine(env) {
	if ('mockSyncEngine' in window) {
		env.mockSyncEngine = window.mockSyncEngine;
		return;
	}

	var mockSyncEngine = function() {

	};

	mockSyncEngine.registerMethods = function() {

	};

	mockSyncEngine.downloadRemoteContent = function(paths,time) {
		return new Promise(function(resolve,reject) {
			if (mockSyncEngine_downloadRemoteContentFail) {
				setTimeout(function() {
					throw new Error('mockSyncEngine forced failue');
				},mockSyncEngine_downloadRemoteContentWaitTime);
			} else {
				setTimeout(function() {
					resolve(mockSyncEngine_downloadRemoteContentNewData);
				},mockSyncEngine_downloadRemoteContentWaitTime);
			}
		});
	};

	mockSyncEngine.sendData = function() {
		return Promise.resolve(true);
	};


	mockSyncEngine.registerMethods();

	env.mockSyncEngine = mockSyncEngine;
};

mockEngine(this);

this.mockSyncEngine.Engine = function() {
    return mockEngine.toString()+"\n mockEngine(self); console.log('Installing mock engine'); self.syncEngine = self.mockSyncEngine;";
};

this.mockSyncEngine.mockEngine = function(engine) {
	engine.oldEngine = engine.Engine;
	engine.Engine  = this.Engine;
};

this.mockSyncEngine.unmockEngine = function(engine) {
	engine.Engine = engine.oldEngine;
};

this.mockSyncEngine.reset = function() {
	mockSyncEngine_downloadRemoteContentWaitTime = 0;
	mockSyncEngine_downloadRemoteContentFail = false;
	mockSyncEngine_downloadRemoteContentNewData = [];
};