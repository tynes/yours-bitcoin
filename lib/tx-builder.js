/**
 * Transaction Builder (experimental)
 * ==================================
 *
 * Transaction Builder. This is a, yet unfinished, convenience class for
 * building pubKeyHash and p2sh transactions, and also for verifying arbitrary
 * transactions (and their inputs). You can (or will be able to) pay to
 * pubKeyHash to p2sh and can spend pubKeyHash or p2sh-pubKeyHash or
 * p2sh-multisig.
 */
'use strict'
let dependencies = {
  Address: require('./address'),
  Constants: require('./constants').Default.TxBuilder,
  Bn: require('./bn'),
  PubKey: require('./pub-key'),
  Script: require('./script'),
  Sig: require('./sig'),
  Struct: require('./struct'),
  Tx: require('./tx'),
  TxIn: require('./tx-in'),
  TxOut: require('./tx-out'),
  TxOutmap: require('./tx-out-map'),
  VarInt: require('./var-int'),
  asink: require('asink')
}

let inject = function (deps) {
  let Address = deps.Address
  let Constants = deps.Constants
  let Bn = deps.Bn
  let PubKey = deps.PubKey
  let Script = deps.Script
  let Sig = deps.Sig
  let Struct = deps.Struct
  let Tx = deps.Tx
  let TxIn = deps.TxIn
  let TxOut = deps.TxOut
  let TxOutmap = deps.TxOutmap
  let VarInt = deps.VarInt
  let asink = deps.asink

  let TxBuilder = function TxBuilder (tx, txins, txouts, utxoutmap, changeScript, feePerKbNum, nLockTime, version) {
    if (!(this instanceof TxBuilder)) {
      return new TxBuilder(tx, txins, txouts, utxoutmap, changeScript, feePerKbNum, nLockTime, version)
    }
    this.initialize()
    this.fromObject({tx, txins, txouts, utxoutmap, changeScript, feePerKbNum, nLockTime, version})
  }

  TxBuilder.prototype = Object.create(Struct.prototype)
  TxBuilder.prototype.constructor = TxBuilder

  TxBuilder.prototype.initialize = function () {
    this.tx = new Tx()
    this.txins = []
    this.txouts = []
    this.utxoutmap = TxOutmap()
    this.feePerKbNum = Constants.feePerKbNum
    this.nLockTime = 0
    this.version = 1
    return this
  }

  TxBuilder.prototype.toJson = function () {
    let json = {}
    json.tx = this.tx.toHex()
    json.txins = this.txins.map((txin) => txin.toHex())
    json.txouts = this.txouts.map((txout) => txout.toHex())
    json.utxoutmap = this.utxoutmap.toJson()
    json.changeScript = this.changeScript.toHex()
    json.feePerKbNum = this.feePerKbNum
    return json
  }

  TxBuilder.prototype.fromJson = function (json) {
    this.tx = new Tx().fromHex(json.tx)
    this.txins = json.txins.map((txin) => new TxIn().fromHex(txin))
    this.txouts = json.txouts.map((txout) => new TxOut().fromHex(txout))
    this.utxoutmap = TxOutmap().fromJson(json.utxoutmap)
    this.changeScript = new Script().fromHex(json.changeScript)
    this.feePerKbNum = json.feePerKbNum
    return this
  }

  TxBuilder.prototype.setFeePerKbNum = function (feePerKbNum) {
    this.feePerKbNum = feePerKbNum
    return this
  }

  TxBuilder.prototype.setChangeAddress = function (changeAddress) {
    this.changeScript = changeAddress.toScript()
    return this
  }

  TxBuilder.prototype.setChangeScript = function (changeScript) {
    this.changeScript = changeScript
    return this
  }

  /**
   * nLockTime is an unsigned integer.
   */
  TxBuilder.prototype.setNLocktime = function (nLockTime) {
    this.nLockTime = nLockTime
    return this
  }

  TxBuilder.prototype.setVersion = function (version) {
    this.version = version
    return this
  }

  /**
   * Import a transaction partially signed by someone else. The only thing you
   * can do after this is sign one or more inputs. Usually used for multisig
   * transactions. utxoutmap is optional. It is not necessary so long as you
   * pass in the txout when you sign.
   */
  TxBuilder.prototype.importPartiallySignedTx = function (tx, utxoutmap) {
    this.tx = tx
    if (utxoutmap) {
      this.utxoutmap = utxoutmap
    }
    return this
  }

  /**
   * Pay "from" a script - in other words, add an input to the transaction.
   */
  TxBuilder.prototype.fromScript = function (txHashBuf, txOutNum, txout, script, nSequence) {
    if (!(Buffer.isBuffer(txHashBuf)) || !(typeof txOutNum === 'number') || !(txout instanceof TxOut) || !(script instanceof Script)) {
      throw new Error('invalid one of: txHashBuf, txOutNum, txout, script')
    }
    this.txins.push(new TxIn().fromObject({txHashBuf, txOutNum, nSequence}).setScript(script))
    this.utxoutmap.add(txHashBuf, txOutNum, txout)
    return this
  }

  /**
   * Pay "from" a pubKeyHash output - in other words, add an input to the
   * transaction.
   */
  TxBuilder.prototype.fromPubKeyHash = function (txHashBuf, txOutNum, txout, pubKey, nSequence) {
    if (!(Buffer.isBuffer(txHashBuf)) || !(typeof txOutNum === 'number') || !(txout instanceof TxOut) || !(pubKey instanceof PubKey)) {
      throw new Error('invalid one of: txHashBuf, txOutNum, txout, pubKey')
    }
    this.txins.push(new TxIn().fromObject({nSequence}).fromPubKeyHashTxOut(txHashBuf, txOutNum, txout, pubKey))
    this.utxoutmap.add(txHashBuf, txOutNum, txout)
    return this
  }

  /**
   * Pay "from" a scripthash (p2sh) output - in other words, add an input to
   * the transaction.
   */
  TxBuilder.prototype.fromScripthashMultisig = function (txHashBuf, txOutNum, txout, redeemScript, nSequence) {
    if (!(Buffer.isBuffer(txHashBuf)) || !(typeof txOutNum === 'number') || !(txout instanceof TxOut) || !(redeemScript instanceof Script)) {
      throw new Error('invalid one of: txHashBuf, txOutNum, txout, redeemScript')
    }
    this.txins.push(new TxIn().fromObject({nSequence}).fromScripthashMultisigTxOut(txHashBuf, txOutNum, txout, redeemScript))
    this.utxoutmap.add(txHashBuf, txOutNum, txout)
    return this
  }

  /**
   * An address to send funds to, along with the amount. The amount should be
   * denominated in satoshis, not bitcoins.
   */
  TxBuilder.prototype.toAddress = function (valuebn, addr) {
    if (!(addr instanceof Address) || !(valuebn instanceof Bn)) {
      throw new Error('addr must be an Address, and valuebn must be a Bn')
    }
    let script
    if (addr.type() === 'scripthash') {
      script = new Script().fromScripthash(addr.hashBuf)
    } else if (addr.type() === 'pubKeyHash') {
      script = new Script().fromPubKeyHash(addr.hashBuf)
    } else {
      throw new Error('invalid address type')
    }
    this.toScript(valuebn, script)
    return this
  }

  /**
   * A script to send funds to, along with the amount. The amount should be
   * denominated in satoshis, not bitcoins.
   */
  TxBuilder.prototype.toScript = function (valuebn, script) {
    if (!(script instanceof Script) || !(valuebn instanceof Bn)) {
      throw new Error('script must be a Script, and valuebn must be a Bn')
    }
    let txout = new TxOut(valuebn, script)
    this.txouts.push(txout)
    return this
  }

  TxBuilder.prototype.buildOutputs = function () {
    let outamount = new Bn(0)
    this.txouts.forEach((txout) => {
      outamount = outamount.add(txout.valuebn)
      this.tx.addTxOut(txout)
    })
    return outamount
  }

  TxBuilder.prototype.buildInputs = function (outamount, extraInputsNum) {
    if (!extraInputsNum) {
      extraInputsNum = 0
    }
    let inamount = new Bn(0)
    for (let txin of this.txins) {
      let txout = this.utxoutmap.get(txin.txHashBuf, txin.txOutNum)
      inamount = inamount.add(txout.valuebn)
      this.tx.addTxIn(txin)
      if (inamount.geq(outamount)) {
        if (extraInputsNum <= 0) {
          break
        }
        extraInputsNum--
      }
    }
    if (inamount.lt(outamount)) {
      throw new Error('not enough funds for output')
    }
    return inamount
  }

  // For now this method only supports pubKeyHash inputs. It assumes we have
  // not yet added signatures to our inputs.
  // TODO: Support it when the signatures are already on the inputs.
  // TODO: Support p2sh inputs.
  TxBuilder.prototype.estimateSize = function () {
    // largest possible sig size
    let sigsize = 1 + 1 + 1 + 1 + 32 + 1 + 1 + 32 + 1
    let size = this.tx.toBuffer().length
    size = size + sigsize * this.tx.txins.length
    size = size + 1 // assume txinsvi increases by 1 byte
    return size
  }

  TxBuilder.prototype.estimateFee = function () {
    // TODO: Support calculating fees from p2sh multisig.
    let fee = Math.ceil(this.estimateSize() / 1000) * this.feePerKbNum
    return new Bn(fee)
  }

  /**
   * Builds the transaction and adds the appropriate fee.
   */
  TxBuilder.prototype.build = function () {
    let changeAmount, shouldfeebn
    for (let extraInputsNum = 0; extraInputsNum < this.txins.length; extraInputsNum++) {
      this.tx = new Tx()
      let outamount = this.buildOutputs()
      let changeScript = this.changeScript
      let changeTxOut = new TxOut(new Bn(0), changeScript)
      this.tx.addTxOut(changeTxOut)

      let inamount = this.buildInputs(outamount, extraInputsNum)

      // TODO: What if change amount is less than dust?
      // Set change amount from inamount - outamount
      changeAmount = inamount.sub(outamount)
      this.tx.txouts[this.tx.txouts.length - 1].valuebn = changeAmount

      shouldfeebn = this.estimateFee()
      if (changeAmount.geq(shouldfeebn) && changeAmount.sub(shouldfeebn).gt(Constants.dustnum)) {
        break
      }
    }
    if (changeAmount.geq(shouldfeebn)) {
      // Subtract fee from change
      // TODO: What if change is less than dust? What if change is 0?
      changeAmount = changeAmount.sub(shouldfeebn)
      this.tx.txouts[this.tx.txouts.length - 1].valuebn = changeAmount

      if (changeAmount.lt(Constants.dustnum)) {
        throw new Error('unable to create change amount greater than dust')
      }

      this.tx.nLockTime = this.nLockTime
      this.tx.version = this.version
      return this
    } else {
      throw new Error('unable to gather enough inputs for outputs and fee')
    }
  }

  /**
   * Check if all signatures are present in a p2sh multisig input script.
   */
  TxBuilder.allSigsPresent = function (m, script) {
    // The first element is a Famous Multisig Bug OP_0, and last element is the
    // redeemScript. The rest are signatures.
    let present = 0
    for (let i = 1; i < script.chunks.length - 1; i++) {
      if (script.chunks[i].buf) {
        present++
      }
    }
    return present === m
  }

  /**
   * Remove blank signatures in a p2sh multisig input script.
   */
  TxBuilder.removeBlankSigs = function (script) {
    // The first element is a Famous Multisig Bug OP_0, and last element is the
    // redeemScript. The rest are signatures.
    script = new Script(script.chunks.slice()) // copy the script
    for (let i = 1; i < script.chunks.length - 1; i++) {
      if (!script.chunks[i].buf) {
        script.chunks.splice(i, 1) // remove ith element
      }
    }
    return script
  }

  /**
   * Given the signature for a transaction, fill it in the appropriate place
   * for an input that spends a pubKeyHash output.
   */
  TxBuilder.prototype.fillPubKeyHashSig = function (i, keyPair, sig) {
    let txin = this.tx.txins[i]
    txin.script.chunks[0] = new Script().writeBuffer(sig.toTxFormat()).chunks[0]
    txin.scriptVi = new VarInt(txin.script.toBuffer().length)
    return this
  }

  TxBuilder.prototype.fillScripthashMultisigSig = function (i, keyPair, sig, redeemScript) {
    let txin = this.tx.txins[i]
    let script = txin.script

    // three normal opCodes, and the rest are pubKeys
    let pubKeychunks = redeemScript.chunks.slice(1, redeemScript.chunks.length - 2)

    let pubKeybufs = pubKeychunks.map((chunk) => chunk.buf)
    let pubKeybuf = keyPair.pubKey.toBuffer()

    // find which pubKey in the redeemScript is the one we are trying to sign
    let thisPubKeyIndex
    for (thisPubKeyIndex = 0; thisPubKeyIndex < pubKeybufs.length; thisPubKeyIndex++) {
      if (Buffer.compare(pubKeybuf, pubKeybufs[thisPubKeyIndex]) === 0) {
        break
      }
      if (thisPubKeyIndex >= pubKeybufs.length - 1) {
        throw new Error('cannot sign; pubKey not found in input ' + i)
      }
    }

    script.chunks[thisPubKeyIndex + 1] = new Script().writeBuffer(sig.toTxFormat()).chunks[0]
    let m = redeemScript.chunks[0].opCodeNum - 0x50
    if (TxBuilder.allSigsPresent(m, script)) {
      txin.script = TxBuilder.removeBlankSigs(script)
    }
    txin.scriptVi = new VarInt(txin.script.toBuffer().length)
    return this
  }

  /**
   * Sign an input, but do not fill the signature into the transaction. Return
   * the signature.
   */
  TxBuilder.prototype.getSig = function (keyPair, nhashtype, nin, subScript) {
    nhashtype = nhashtype === undefined ? Sig.SIGHASH_ALL : nhashtype
    return this.tx.sign(keyPair, nhashtype, nin, subScript)
  }

  /**
   * Asynchronously sign an input in a worker, but do not fill the signature
   * into the transaction. Return the signature.
   */
  TxBuilder.prototype.asyncGetSig = function (keyPair, nhashtype, nin, subScript) {
    nhashtype = nhashtype === undefined ? Sig.SIGHASH_ALL : nhashtype
    return this.tx.asyncSign(keyPair, nhashtype, nin, subScript)
  }

  /**
   * Sign ith input with keyPair and insert the signature into the transaction.
   * This method only works for some standard transaction types. For
   * non-standard transaction types, use getSig.
   */
  TxBuilder.prototype.sign = function (i, keyPair, txout) {
    let txin = this.tx.txins[i]
    let script = txin.script
    if (script.isPubKeyHashIn()) {
      let txHashBuf = txin.txHashBuf
      let txOutNum = txin.txOutNum
      if (!txout) {
        txout = this.utxoutmap.get(txHashBuf, txOutNum)
      }
      let outscript = txout.script
      let subScript = outscript // true for standard script types
      let sig = this.getSig(keyPair, Sig.SIGHASH_ALL, i, subScript)
      this.fillPubKeyHashSig(i, keyPair, sig, subScript)
    } else if (script.isScripthashIn()) {
      let redeemScript = new Script().fromBuffer(script.chunks[script.chunks.length - 1].buf)
      let subScript = redeemScript
      if (!redeemScript.isMultisigOut()) {
        throw new Error('cannot sign non-multisig scripthash script type for input ' + i)
      }
      let sig = this.tx.sign(keyPair, Sig.SIGHASH_ALL, i, subScript)
      this.fillScripthashMultisigSig(i, keyPair, sig, redeemScript)
    } else {
      throw new Error('cannot sign unknown script type for input ' + i)
    }
    return this
  }

  /**
   * Asynchronously sign ith input with keyPair in a worker and insert the
   * signature into the transaction.  This method only works for some standard
   * transaction types. For non-standard transaction types, use asyncGetSig.
   */
  TxBuilder.prototype.asyncSign = function (i, keyPair, txout) {
    return asink(function * () {
      let txin = this.tx.txins[i]
      let script = txin.script
      if (script.isPubKeyHashIn()) {
        let txHashBuf = txin.txHashBuf
        let txOutNum = txin.txOutNum
        if (!txout) {
          txout = this.utxoutmap.get(txHashBuf, txOutNum)
        }
        let outscript = txout.script
        let subScript = outscript // true for standard script types
        let sig = yield this.asyncGetSig(keyPair, Sig.SIGHASH_ALL, i, subScript)
        this.fillPubKeyHashSig(i, keyPair, sig, subScript)
      } else if (script.isScripthashIn()) {
        let redeemScript = new Script().fromBuffer(script.chunks[script.chunks.length - 1].buf)
        let subScript = redeemScript
        if (!redeemScript.isMultisigOut()) {
          throw new Error('cannot sign non-multisig scripthash script type for input ' + i)
        }
        let sig = yield this.tx.asyncSign(keyPair, Sig.SIGHASH_ALL, i, subScript)
        this.fillScripthashMultisigSig(i, keyPair, sig, redeemScript)
      } else {
        throw new Error('cannot sign unknown script type for input ' + i)
      }
      return this
    }, this)
  }

  return TxBuilder
}

inject = require('injecter')(inject, dependencies)
let TxBuilder = inject()
module.exports = TxBuilder