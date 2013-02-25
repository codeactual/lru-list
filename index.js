/**
 * Storage agnostic LRU list.
 *   Uses doubly-linked list.
 *   Supports async get, set, etc.
 *
 * Based on https://github.com/rsms/js-lru
 *   Licensed under MIT.
 *   Copyright (c) 2010 Rasmus Andersson <http://hunch.se/>
 */
module.exports = {
  LRUList: LRUList,
  LRUEntry: LRUEntry
};

var emptyFn = function() {};

/**
 * @param {object} config
 *   {number} [limit=100]
 *   {function} set
 *     (key, value, done)
 *   {function} get
 *     (key, done)
 *   {function} del
 *     (key, done)
 */
function LRUList(config) {
  config = config || {};
  this.size = 0;
  this.tail = undefined;
  this.head = undefined;
  this.limit = config.limit || 100;
  this.store = {
    set: config.set || emptyFn,
    get: config.get || emptyFn,
    del: config.del || emptyFn
  };
  this.keymap = {};
}

function LRUEntry(key) {
  this.key = key;
  this.older = undefined;
  this.newer = undefined;
};

/**
 * @param {string} key
 * @param {mixed} value
 * @param {function} done
 *   {object} Error instance or null.
 */
LRUList.prototype.put = function(key, value, done) {
  var self = this;
  function storeIODone(err) {
    if (err) { done(err); return; }

    var entry = new LRUEntry(key);
    self.keymap = entry;
    if (self.tail) {
      self.tail.newer = entry;
      entry.older = self.tail;
    } else {
      self.head = entry;
    }
    self.tail = entry;
    if (self.size === self.limit) {
      self.shift();
    } else {
      self.size++;
      done(null);
    }
  }
  this.store.set(key, value, storeIODone);
};

/**
 * @param {function} done
 *   {object} Error instance or null.
 *   {mixed} Shifted LruEntry or undefined.
 */
LRUList.prototype.shift = function(done) {
  var entry = this.head;
  if (!entry) {
    done(null);
    return;
  }

  if (this.head.newer) {
    this.head = this.head.newer;
    this.head.older = undefined;
  } else {
    this.head = undefined;
  }
  entry.newer = entry.older = undefined;

  var self = this;
  function storeIODone(err) {
    if (err) { done(err); return; }

    delete self.keymap[entry.key]
    done(null, entry)
  }
  this.store.del(entry.key, storeIODone);
};

/**
 * @param {string} key
 * @param {function} done
 *   {object} Error instance or null.
 *   {mixed} Value or undefined.
 */
LRUList.prototype.get = function(key, done) {
  function storeIODone(err, value) {
    if (err) { done(err); return; }

    var entry = this.keymap[key];
    if (entry === undefined) {
      done(null);
      return;
    }
    if (entry === this.tail) {
      done(null, value);
      return;
    }

    if (entry.newer) {
      if (entry === this.head) {
        this.head = entry.newer;
      }
      entry.newer.older = entry.older;
    }
    if (entry.older) {
      entry.older.newer = entry.newer;
    }

    entry.newer = undefined;
    entry.older = this.tail;

    if (this.tail) {
      this.tail.newer = entry;
    }
    this.tail = entry;

    done(null, value);
  }
  this.store.get(key, storeIODone);
};

LRUList.prototype.toArray = function() {
  var s = [], entry = this.head;
  while (entry) {
    s.push(entry.key);
    entry = entry.newer;
  }
  return s;
}
