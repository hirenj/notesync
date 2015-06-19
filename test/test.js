if (!Function.prototype.bind) {
  Function.prototype.bind = function(oThis) {
    if (typeof this !== 'function') {
      // closest thing possible to the ECMAScript 5
      // internal IsCallable function
      throw new TypeError('Function.prototype.bind - what is trying to be bound is not callable');
    }

    var aArgs   = Array.prototype.slice.call(arguments, 1),
        fToBind = this,
        fNOP    = function() {},
        fBound  = function() {
          return fToBind.apply(this instanceof fNOP
                 ? this
                 : oThis,
                 aArgs.concat(Array.prototype.slice.call(arguments)));
        };

    fNOP.prototype = this.prototype;
    fBound.prototype = new fNOP();

    return fBound;
  };
}

window.Promise = require('promise-polyfill');
sinon.config.useFakeTimers = false;

QUnit.module("Test browser features exist", {
});

QUnit.test( "Test Promise works" , function( assert ) {
  var done = assert.async();
  Promise.resolve(true).then(function() {
    assert.ok(true, 'Can resolve promises');
    done();
  });
});

QUnit.test("Test blob making works",function(assert) {
  assert.ok( window.URL.createObjectURL !== null, "Can create object URL");
});