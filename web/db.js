/*
 * The ScratchJr database, running in the browser.
 *
 * The Electron build kept a SQLite file in ~/Documents/ScratchJR and reached it
 * over synchronous IPC. ScratchJr's own code depends on that synchronicity --
 * `iOS.query()` uses the return value immediately -- so the browser port keeps
 * the same shape: sql.js holds the whole database in memory (it is small), every
 * read and write is synchronous, and the bytes are mirrored out to IndexedDB
 * after each mutation.
 *
 * Schema is byte-identical to the desktop build, including the PROJECTFILES
 * table that stores media inline instead of as loose files on disk.
 */

import initSqlJs from 'sql.js';

const IDB_NAME = 'scratchjr';
const IDB_VERSION = 1;
const IDB_STORE = 'store';
const DB_KEY = 'scratchjr.sqlite';

let SQL = null;
let db = null;

// Set while an export/write is in flight, so overlapping saves collapse into
// one trailing write instead of queueing up a copy of the database per edit.
let saving = false;
let dirty = false;

function openIdb () {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_NAME, IDB_VERSION);
        request.onupgradeneeded = () => {
            const idb = request.result;
            if (!idb.objectStoreNames.contains(IDB_STORE)) {
                idb.createObjectStore(IDB_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function idbGet (key) {
    return openIdb().then((idb) => new Promise((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, 'readonly');
        const request = tx.objectStore(IDB_STORE).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }));
}

function idbPut (key, value) {
    return openIdb().then((idb) => new Promise((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    }));
}

/**
 * Ask the browser to keep our storage even when disk is tight. Installed PWAs
 * are granted this without a prompt on Chrome and Edge; Safari grants it to
 * home-screen apps. Without it a child's projects could be evicted under
 * storage pressure, which is the one failure mode there is no recovering from.
 */
async function requestPersistence () {
    if (!navigator.storage || !navigator.storage.persist) {
        return false;
    }
    try {
        if (await navigator.storage.persisted()) {
            return true;
        }
        return await navigator.storage.persist();
    } catch (e) {
        console.log('Could not request persistent storage', e); // eslint-disable-line no-console
        return false;
    }
}

function initTables () {
    db.exec('CREATE TABLE IF NOT EXISTS PROJECTS (ID INTEGER PRIMARY KEY AUTOINCREMENT, CTIME DATETIME DEFAULT CURRENT_TIMESTAMP, MTIME DATETIME, ALTMD5 TEXT, POS INTEGER, NAME TEXT, JSON TEXT, THUMBNAIL TEXT, OWNER TEXT, GALLERY TEXT, DELETED TEXT, VERSION TEXT)\n');
    db.exec('CREATE TABLE IF NOT EXISTS USERSHAPES (ID INTEGER PRIMARY KEY AUTOINCREMENT, CTIME DATETIME DEFAULT CURRENT_TIMESTAMP, MD5 TEXT, ALTMD5 TEXT, WIDTH TEXT, HEIGHT TEXT, EXT TEXT, NAME TEXT, OWNER TEXT, SCALE TEXT, VERSION TEXT)\n');
    db.exec('CREATE TABLE IF NOT EXISTS USERBKGS (ID INTEGER PRIMARY KEY AUTOINCREMENT, CTIME DATETIME DEFAULT CURRENT_TIMESTAMP, MD5 TEXT, ALTMD5 TEXT, WIDTH TEXT, HEIGHT TEXT, EXT TEXT, OWNER TEXT,  VERSION TEXT)\n');
    db.exec('CREATE TABLE IF NOT EXISTS PROJECTFILES (MD5 TEXT PRIMARY KEY, CONTENTS TEXT)\n');
}

function runMigrations () {
    try {
        db.exec('ALTER TABLE PROJECTS ADD COLUMN ISGIFT INTEGER DEFAULT 0');
    } catch (e) {
        // Already migrated -- the desktop build swallowed this the same way.
    }
}

/**
 * Persist the in-memory database to IndexedDB. Called after every mutation.
 * ScratchJr navigates between real pages (index -> home -> editor), so a write
 * must be started immediately rather than debounced, or a navigation can land
 * between the edit and the save.
 */
export function save () {
    if (saving) {
        dirty = true;
        return;
    }
    saving = true;
    const bytes = db.export();
    idbPut(DB_KEY, bytes)
        .catch((e) => console.log('Could not save database', e)) // eslint-disable-line no-console
        .then(() => {
            saving = false;
            if (dirty) {
                dirty = false;
                save();
            }
        });
}

export async function open () {
    SQL = await initSqlJs({
        locateFile: (file) => new URL(file, document.baseURI).href
    });

    await requestPersistence();

    let stored = null;
    try {
        stored = await idbGet(DB_KEY);
    } catch (e) {
        console.log('Could not read database', e); // eslint-disable-line no-console
    }

    if (stored) {
        db = new SQL.Database(new Uint8Array(stored));
        runMigrations();
    } else {
        db = new SQL.Database();
        initTables();
        runMigrations();
        save();
    }

    // A page being torn down mid-write still gets a final attempt.
    window.addEventListener('pagehide', () => {
        if (dirty && !saving) {
            save();
        }
    });

    return db;
}

/**
 * Run a statement. Returns the last inserted row id, or -1 on failure --
 * the contract ScratchJr's iOS.stmt() was written against.
 */
export function stmt (jsonStrOrObj) {
    let statement = null;
    try {
        const json = (typeof jsonStrOrObj === 'string') ? JSON.parse(jsonStrOrObj) : jsonStrOrObj || {};
        statement = db.prepare(json.stmt, json.values);
        while (statement.step()) {
            statement.get();
        }
        statement.free();
        statement = null;

        const result = db.exec('select last_insert_rowid();');
        save();
        return result[0].values[0][0];
    } catch (e) {
        if (statement) {
            try {
                statement.free();
            } catch (freeError) {
                // nothing useful to do
            }
        }
        console.log('stmt failed', jsonStrOrObj, e); // eslint-disable-line no-console
        return -1;
    }
}

/** Run a query. Returns an array of row objects, or [] on failure. */
export function query (jsonStrOrObj) {
    let statement = null;
    try {
        const json = (typeof jsonStrOrObj === 'string') ? JSON.parse(jsonStrOrObj) : jsonStrOrObj || {};
        statement = db.prepare(json.stmt, json.values);

        const rows = [];
        while (statement.step()) {
            rows.push(statement.getAsObject());
        }
        statement.free();
        statement = null;

        // Anything that is not a SELECT changed the database.
        if (!/^\s*select/i.test(json.stmt || '')) {
            save();
        }
        return rows;
    } catch (e) {
        if (statement) {
            try {
                statement.free();
            } catch (freeError) {
                // nothing useful to do
            }
        }
        console.log('query failed', jsonStrOrObj, e); // eslint-disable-line no-console
        return [];
    }
}

// ---- PROJECTFILES: media stored inside the database ----------------------

export function readProjectFile (fileMD5) {
    const rows = query({
        stmt: 'select CONTENTS from PROJECTFILES where MD5 = ?',
        values: [fileMD5]
    });
    return rows.length > 0 ? rows[0].CONTENTS : null;
}

export function saveToProjectFiles (fileMD5, contents) {
    // Media names are content-addressed, so a repeat write is the same bytes.
    const result = stmt({
        stmt: 'insert or replace into projectfiles (md5, contents) values (?,?)',
        values: [fileMD5, contents]
    });
    return result >= 0;
}

export function removeProjectFile (fileMD5) {
    query({
        stmt: 'delete from PROJECTFILES where MD5 = ?',
        values: [fileMD5]
    });
}

/** Drop media of a given type that no project, shape or background refers to. */
export function cleanProjectFiles (fileType) {
    // Recordings are saved as webm in this build, not wav.
    const ext = (fileType === 'wav') ? 'webm' : fileType;

    const files = query({
        stmt: 'select MD5 from PROJECTFILES where MD5 like ?',
        values: ['%.' + ext]
    });

    for (let i = 0; i < files.length; i++) {
        const name = files[i].MD5;
        if (!name) {
            continue;
        }

        const inProjects = query({
            stmt: 'select ID from PROJECTS where json like ?',
            values: ['%' + name + '%']
        });
        if (inProjects.length > 0) {
            continue;
        }

        const inShapes = query({
            stmt: 'select MD5 from USERSHAPES where MD5 = ?',
            values: [name]
        });
        if (inShapes.length > 0) {
            continue;
        }

        const inBackgrounds = query({
            stmt: 'select MD5 from USERBKGS where MD5 = ?',
            values: [name]
        });
        if (inBackgrounds.length > 0) {
            continue;
        }

        removeProjectFile(name);
    }
    save();
}
