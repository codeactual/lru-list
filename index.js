/**
 * Storage agnostic LRU list.
 *   Uses doubly-linked list and key map.
 *   Supports async get, set, etc.
 *
 * Based on https://github.com/rsms/js-lru
 *   Licensed under MIT.
 *   Copyright (c) 2010 Rasmus Andersson <http://hunch.se/>
 *   Illustration of the original design:
 *
 *    entry             entry             entry             entry
 *    ______            ______            ______            ______
 *   | head |.newer => |      |.newer => |      |.newer => | tail |
 *   |  A   |          |  B   |          |  C   |          |  D   |
 *   |______| <= older.|______| <= older.|______| <= older.|______|
 *
 *    removed  <--  <--  <--  <--  <--  <--  <--  <--  <--  added
 */
module.exports = {
  LRUList: LRUList,
  LRUEntry: LRUEntry
};

var emptyFn = function() {};

/**
 * @param {object} config
 *   {number} [limit=100]
 *   {function} set(key, val, done)
 *     done(err)
 *   {function} get(key, done)
 *     done(err, val)
 *   {function} del(key, done)
 *     done(err)
 *
 * done() callbacks:
 *   'err' should be an Error instance.
 *   List structures will not be modified on truthy 'err'.
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
}

/**
 * Append key to the list's tail. Trigger storage of the value.
 *
 * - Duplicate keys are allowed by original design.
 *   May produce "orphaned" entries to which the key map no longer points. Then they
 *   can no longer be read/removed, and can only be pushed out by lack of use.
 *
 * @param {string} key
 * @param {mixed} val
 * @param {function} done
 *   {object} Error instance or null.
 */
LRUList.prototype.put = function(key, val, done) {
  done = done || function() {};
  var self = this;

  function storeIODone(err) {
    if (err) { done(err); return; }

    var entry = new LRUEntry(key);
    self.keymap[key] = entry;
    if (self.tail) {
      self.tail.newer = entry;
      entry.older = self.tail;
    } else {
      self.head = entry;
    }
    self.tail = entry;
    if (self.size === self.limit) {
      self.shift(done);
    } else {
      self.size++;
      done(null);
    }
  }
  this.store.set(key, val, storeIODone);
};

/**
 * Remove the key at the list's head (the LRU). Trigger removal of the value.
 *
 * @param {function} done
 *   {object} Error instance or null.
 *   {mixed} Shifted LRUEntry or undefined.
 */
LRUList.prototype.shift = function(done) {
  done = done || function() {};
  var self = this;

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

  function storeIODone(err) {
    if (err) { done(err); return; }

    delete self.keymap[entry.key];
    done(null, entry);
  }
  this.store.del(entry.key, storeIODone);
};

/**
 * Promote the key to the tail (MFU). Read the value from storage.
 *
 * @param {string} key
 * @param {function} done
 *   {object} Error instance or null.
 *   {mixed} Value or undefined.
 */
LRUList.prototype.get = function(key, done) {
  done = done || function() {};

  var self = this;

  function storeIODone(err, val) {
    if (err) { done(err); return; }

    var entry = self.keymap[key];
    if (entry === undefined) {
      done(null);
      return;
    }
    if (entry === self.tail) {
      done(null, val);
      return;
    }

    if (entry.newer) {
      if (entry === self.head) {
        self.head = entry.newer;
      }
      entry.newer.older = entry.older;
    }
    if (entry.older) {
      entry.older.newer = entry.newer;
    }

    entry.newer = undefined;
    entry.older = self.tail;

    if (self.tail) {
      self.tail.newer = entry;
    }
    self.tail = entry;

    done(null, val);
  }
  this.store.get(key, storeIODone);
};

/**
 * Remove the key from the list and key map. Trigger removal of the value.
 *
 * @param {string} key
 * @param {function} done
 *   {object} Error instance or null.
 */
LRUList.prototype.remove = function(key, done) {
  done = done || function() {};
  var self = this;

  function storeIODone(err) {
    if (err) { done(err); return; }

    var entry = self.keymap[key];
    if (!entry) { done(null); return; }

    delete self.keymap[entry.key];

    if (entry.newer && entry.older) {
      entry.older.newer = entry.newer;
      entry.newer.older = entry.older;
    } else if (entry.newer) {
      entry.newer.older = undefined;
      self.head = entry.newer;
    } else if (entry.older) {
      entry.older.newer = undefined;
      self.tail = entry.older;
    } else {
      self.head = self.tail = undefined;
    }

    self.size--;

    done(null);
  }
  this.store.del(key, storeIODone);
}

/**
 * Produce a head-to-tail key list.
 */
LRUList.prototype.toArray = function() {
  var arr = [];
  var entry = this.head;
  while (entry) {
    arr.push(entry.key);
    entry = entry.newer;
  }
  return arr;
};
