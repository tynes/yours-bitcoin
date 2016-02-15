/**
 * WorkersCmd
 * ==========
 *
 * A command sent to a worker. The idea is that you send the worker an object,
 * and a method to perform on that object, and the arguments to that method. It
 * will send back a result, which is a WorkersResult object.
 */
'use strict'
let dependencies = {
  BW: require('./bw'),
  Struct: require('./struct')
}

let inject = function (deps) {
  let BW = deps.BW
  let Struct = deps.Struct

  function WorkersCmd (objbuf, classname, methodname, args, id) {
    if (!(this instanceof WorkersCmd)) {
      return new WorkersCmd(objbuf, classname, methodname, args, id)
    }
    this.fromObject({objbuf, classname, methodname, args, id})
  }

  WorkersCmd.prototype = Object.create(Struct.prototype)
  WorkersCmd.prototype.constructor = WorkersCmd

  WorkersCmd.prototype.toBW = function (bw) {
    if (!bw) {
      bw = new BW()
    }
    let classnamebuf = new Buffer(this.classname)
    bw.writeVarintNum(classnamebuf.length)
    bw.write(classnamebuf)
    let methodnamebuf = new Buffer(this.methodname)
    bw.writeVarintNum(methodnamebuf.length)
    bw.write(methodnamebuf)
    bw.writeVarintNum(this.objbuf.length)
    bw.write(this.objbuf)
    let argsbuf = new Buffer(JSON.stringify(this.args))
    bw.writeVarintNum(argsbuf.length)
    bw.write(argsbuf)
    bw.writeVarintNum(this.id)
    return bw
  }

  WorkersCmd.prototype.fromBR = function (br) {
    let classnamelen = br.readVarintNum()
    this.classname = br.read(classnamelen).toString()
    let methodnamelen = br.readVarintNum()
    this.methodname = br.read(methodnamelen).toString()
    let objbuflen = br.readVarintNum()
    this.objbuf = br.read(objbuflen)
    let argsbuflen = br.readVarintNum()
    let argsbuf = br.read(argsbuflen)
    this.args = JSON.parse(argsbuf.toString())
    this.id = br.readVarintNum()
    return this
  }

  WorkersCmd.prototype.fromMethod = function (obj, methodname, args, id) {
    this.objbuf = obj.toFastBuffer()
    this.classname = obj.constructor.name
    this.methodname = methodname
    this.args = args
    this.id = id
    return this
  }

  return WorkersCmd
}

inject = require('./injector')(inject, dependencies)
let WorkersCmd = inject()
module.exports = WorkersCmd