import { promoteRecentProject } from "./project-list";

export interface ProjectStore {
  setCurrentProjectId(projectId: string): Promise<void>;
  getCurrentProjectId(): Promise<string | null>;
  getRecentProjectIds(): Promise<string[]>;
}

export interface IndexedDbProjectStoreOptions {
  databaseName?: string;
  indexedDB?: IDBFactory;
}

const DEFAULT_DATABASE_NAME = "layo-projects";
const DATABASE_VERSION = 1;
const SETTINGS_STORE = "settings";
const CURRENT_PROJECT_KEY = "currentProjectId";
const RECENT_PROJECTS_KEY = "recentProjectIds";

export function createIndexedDbProjectStore(options: IndexedDbProjectStoreOptions = {}): ProjectStore {
  const idb = options.indexedDB ?? globalThis.indexedDB;
  if (!idb) {
    throw new Error("IndexedDB를 사용할 수 없습니다");
  }
  const databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
  const open = () => openDatabase(idb, databaseName);

  return {
    async setCurrentProjectId(projectId) {
      const recentProjectIds = projectId ? promoteRecentProject(projectId, await readRecentProjectIds()) : [];
      const database = await open();
      try {
        const transaction = database.transaction(SETTINGS_STORE, "readwrite");
        const store = transaction.objectStore(SETTINGS_STORE);
        store.put(projectId, CURRENT_PROJECT_KEY);
        if (projectId) {
          store.put(recentProjectIds, RECENT_PROJECTS_KEY);
        }
        await transactionDone(transaction);
      } finally {
        database.close();
      }
    },
    async getCurrentProjectId() {
      const database = await open();
      try {
        const value = await request<string | undefined>(
          database.transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).get(CURRENT_PROJECT_KEY)
        );
        return value ?? null;
      } finally {
        database.close();
      }
    },
    async getRecentProjectIds() {
      return readRecentProjectIds();
    }
  };

  async function readRecentProjectIds() {
    const database = await open();
    try {
      const value = await request<unknown>(
        database.transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).get(RECENT_PROJECTS_KEY)
      );
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    } finally {
      database.close();
    }
  }
}

function openDatabase(idb: IDBFactory, databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const openRequest = idb.open(databaseName, DATABASE_VERSION);
    openRequest.onupgradeneeded = () => {
      const database = openRequest.result;
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE);
      }
    };
    openRequest.onerror = () => reject(openRequest.error);
    openRequest.onsuccess = () => resolve(openRequest.result);
  });
}

function request<T>(input: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    input.onerror = () => reject(input.error);
    input.onsuccess = () => resolve(input.result);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}
