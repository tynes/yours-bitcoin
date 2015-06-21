/**
 * Network Connection
 * ==================
 */
"use strict";
let dependencies = {
  Msg: require('./msg'),
  net: require('net'),
  Struct: require('./struct'),
  Work: require('./work')
};

function inject(deps) {
  let Msg = deps.Msg;
  let net = deps.net;
  let Struct = deps.Struct;
  let Work = deps.Work;

  function Connection(opts, bufstream, msgassembler, promises) {
    if (!(this instanceof Connection))
      return new Connection(opts, bufstream, msgassembler, promises);
    this.initialize();
    this.fromObject({
      opts: opts,
      bufstream: bufstream,
      msgassembler: msgassembler,
      promises
    });
  }

  Connection.prototype.fromObject = Struct.prototype.fromObject;

  Connection.prototype.initialize = function() {
    this.promises = [];
    return this;
  };

  Connection.prototype.connect = function() {
    this.bufstream = net.connect(this.opts);
    return this;
  };

  Connection.prototype.disconnect = function() {
    this.bufstream.disconnect();
    return this;
  };

  Connection.prototype.close = function() {
    this.bufstream.close();
    return this;
  };

  Connection.prototype.monitor = function() {
    this.bufstream.on('connect', this.onConnect.bind(this));
    this.bufstream.on('error', this.onError.bind(this));
    this.bufstream.on('data', this.onData.bind(this));
    this.bufstream.on('end', this.onEnd.bind(this));
    return this;
  };

  Connection.prototype.onConnect = function() {};

  Connection.prototype.onError = function(error) {
    this.destroy();
    return Promise.reject(error);
  };

  Connection.prototype.onData = function(buf) {
    if (!this.msgassembler) {
      this.msg = Msg();
      this.msgassembler = this.msg.fromBuffers({strict: true});
      this.msgassembler.next();
    }
    let next;
    try {
      next = this.msgassembler.next(buf);
    } catch (error) {
      delete this.msgassembler;
      return this.onError(error);
    }
    if (next.done) {
      let promise = this.onMsg(this.msg);
      delete this.msgassembler;
      let remainderbuf = next.value;
      if (remainderbuf.length > 0) {
        this.onData(remainderbuf);
      }
      return promise;
    }
    return Promise.resolve();
  };

  Connection.prototype.onEnd = function() {};

  Connection.prototype.onMsg = function(msg) {
    return Work(msg, 'isValid').buffer()
    .then(function(result) {
      this.promises.forEach(function(promise) {
        if (result)
          promise.resolve(msg);
        else
          promise.reject(new Error('invalid message'));
      }.bind(this));
      this.promises = [];
    }.bind(this))
    .catch(function(error) {
      this.promises.forEach(function(promise) {
        promise.reject(error.message);
      }.bind(this));
      this.promises = [];
    }.bind(this));
  };

  /**
   * Returns an iterator of promises to received messages.
   */
  Connection.prototype.msgs = function*() {
    while (true) {
      yield new Promise(function(resolve, reject) {
        this.promises.push({resolve: resolve, reject: reject});
      }.bind(this));
    }
  };

  Connection.prototype.send = function*(msg) {
  };

  return Connection;
}

inject = require('./injector')(inject, dependencies);
let Connection = inject();
module.exports = Connection;