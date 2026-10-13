// Synthetic local decisions only. Drafts and facts stay in tab memory.
const values = new Map<string, string>();
let database: IDBDatabase | null = null;
let opening: Promise<void> | null = null;
const fallback = () => window.localStorage;
function degrade() {
  database?.close();
  database = null;
  try {
    for (const [key, value] of values) fallback().setItem(key, value);
  } catch {
    window.dispatchEvent(new Event('threadline-storage-failed'));
  }
}
export const workspaceStorage = {
  ready(): Promise<void> {
    if (opening) return opening;
    opening = new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        resolve();
      };
      const timeout = window.setTimeout(() => {
        degrade();
        finish();
      }, 3000);
      if (!window.indexedDB) {
        finish();
        return;
      }
      try {
        const request = window.indexedDB.open('threadline-workspace', 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('state'))
            request.result.createObjectStore('state');
        };
        request.onerror = finish;
        request.onblocked = finish;
        request.onsuccess = () => {
          if (finished) {
            request.result.close();
            return;
          }
          database = request.result;
          database.onversionchange = degrade;
          const transaction = database.transaction('state', 'readonly');
          const cursor = transaction.objectStore('state').openCursor();
          cursor.onsuccess = () => {
            if (finished) return;
            const row = cursor.result;
            if (row) {
              values.set(String(row.key), String(row.value));
              row.continue();
            }
          };
          transaction.oncomplete = () => {
            if (finished) return;
            try {
              for (const key of Object.keys(fallback()))
                if (key.startsWith('threadline.') && !values.has(key))
                  workspaceStorage.setItem(key, fallback().getItem(key)!);
            } catch {
              /* IndexedDB still provides persistence. */
            }
            finish();
          };
          transaction.onerror = () => {
            degrade();
            finish();
          };
        };
      } catch {
        finish();
      }
    });
    return opening;
  },
  getItem(key: string): string | null {
    if (values.has(key)) return values.get(key)!;
    if (database) return values.get(key) ?? null;
    try {
      return fallback().getItem(key);
    } catch {
      return values.get(key) ?? null;
    }
  },
  setItem(key: string, value: string) {
    values.set(key, value);
    if (!database) {
      try {
        fallback().setItem(key, value);
      } catch (error) {
        window.dispatchEvent(new Event('threadline-storage-failed'));
        throw error;
      }
      return;
    }
    try {
      const transaction = database.transaction('state', 'readwrite');
      transaction.objectStore('state').put(value, key);
      transaction.onerror = degrade;
      transaction.onabort = degrade;
    } catch {
      degrade();
    }
  },
  removeItem(key: string) {
    values.delete(key);
    try {
      fallback().removeItem(key);
    } catch {
      /* Continue with IndexedDB. */
    }
    if (database) {
      try {
        const transaction = database.transaction('state', 'readwrite');
        transaction.objectStore('state').delete(key);
        transaction.onerror = degrade;
        transaction.onabort = degrade;
      } catch {
        degrade();
      }
    }
  },
  keys(): string[] {
    if (database) return [...values.keys()];
    try {
      return [...new Set([...values.keys(), ...Object.keys(fallback())])];
    } catch {
      return [...values.keys()];
    }
  },
};
