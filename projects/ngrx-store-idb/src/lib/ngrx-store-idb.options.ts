import { InjectionToken } from '@angular/core';
import { Action } from '@ngrx/store';
import { UseStore } from 'idb-keyval';

/**
 * Injection token for injection options
 */
export const OPTIONS = new InjectionToken<NgrxStoreIdbOptions>('NgrxStoreIdb options');

/**
 * Injection token for injecting IDB store
 */
export const IDB_STORE = new InjectionToken<UseStore>('IDB Store');

/**
 * Name of the key in IndexedDB database store under which the state will be saved
 */
export const SAVED_STATE_KEY = 'State';

export interface KeyConfiguration {
  [key: string]: string[] | number[] | KeyConfiguration[];
}

export type Keys = (KeyConfiguration | string)[];

/**
 * Configuration options for NgrxStoreIdb
 */
export interface NgrxStoreIdbOptions {
  /**
   * IndexDB configuration
   */
  idb: {
    /**
     * Database name
     */
    dbName: string;
    /**
     * Store name
     */
    storeName: string;
  };
  /**
   * If true then store will be restored from IndexedDB on application startup
   */
  rehydrate: boolean;
  /**
   * Save state into IndexedDB only if the state to be saved changed since last save.
   */
  saveOnChange: boolean;
  /**
   * Defines what slices of store should be stored/rehydrated.
   * Can not be defined if marshaller & unmarshaller are defined.
   * Default is null.
   */
  keys: Keys;
  /**
   * If defined then synchronisation of store -> IDB will be done only when the function returns true.
   * You can use it e.g. to do syncing only on certain action.
   */
  syncCondition: ((state: any, action: Action) => boolean) | null;
  /**
   * Method used to merge data loaded from IDB with Store state during rehydratation.
   * When null then default will be full deep merge. Must be used together with marshaller.
   * Can not be used together with keys.
   */
  unmarshaller: (state: any, rehydratedState: any) => any;
  /**
   * Method used to marshall store state into object to be written into IDB.
   * Must be used together with unmarshaller.
   * Can not be used together with keys.
   */
  marshaller: (state: any) => any;
  /**
   * Print debug info if true
   */
  debugInfo: boolean;
  /**
   * Configuration of concurrency options
   */
  concurrency: {
    /**
     * If false then library won't sync state to IndexedDB if it detects that another instance of
     * Window/Tab is already syncing.
     * Default is false.
     */
    allowed: boolean;
    /**
     * Time in ms how often library updates timestamp.
     * This shouldn't be less than 1000ms.
     * Default is 5000ms.
     */
    refreshRate?: number;
    /**
     * Name of key that holds the timestamp data.
     * Default is 'ConcurrencyTimestamp'.
     */
    trackKey?: string;
    /**
     * If true then library will immediately attempt to acquire the lock and start updating the timestamp.
     * Default is true.
     */
    acquireLockOnStartup: boolean;
    /**
     * If the library detects that another instance of application already exists
     * (e.g. running in different tab/window) and this is set to true then application
     * won't start up.
     * Default is false.
     */
    failInitialisationIfNoLock: boolean;
  }
}

