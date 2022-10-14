import { Inject, Injectable } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import { get, set, update, UseStore } from 'idb-keyval';
import { EMPTY, from, Observable, of, ReplaySubject, Subscription, timer } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { IDB_STORE, NgrxStoreIdbOptions, OPTIONS, SAVED_STATE_KEY } from './ngrx-store-idb.options';
import { rehydrateAction, rehydrateErrorAction } from './ngrx-store-idb.actions';

interface ConcurrencyTimestamp {
  uniqueKey: string;
  timestamp: number;
}

export interface NgrxStoreIdbSyncEvent {
  action: Action;
  success: boolean;
}

/**
 * This service emits events each time NgrxStoreIdb metareducer successfuly
 * syncs data to IndexedDB. The data emited from onSync$ observable is
 * the action that triggered the synchronisation event.
 */
@Injectable({
  providedIn: 'root',
})
export class NgrxStoreIdbService {

  private readonly uniqueKey: string;

  private broadcastSubject = new ReplaySubject<Action>(1);

  private onSync$ = this.broadcastSubject.asObservable();

  private lockAcquiredSubject = new ReplaySubject<boolean>(1);

  private onLockAcquired$ = this.lockAcquiredSubject.asObservable();

  private iAmMasterOfStore = false;

  private timerSubscription: Subscription;

  constructor(
    @Inject(OPTIONS) private opts: NgrxStoreIdbOptions,
    @Inject(IDB_STORE) private idbStore: UseStore,
  ) {
    this.uniqueKey = this.uuidv4();

    if (opts.concurrency.acquireLockOnStartup) {
      this.acquireLock(null).subscribe(acquired => {
        if (this.opts.debugInfo) {
          if (acquired) {
            console.debug('NgrxStoreIdb: Succesfully acquired lock on startup');
          } else {
            console.debug('NgrxStoreIdb: Could not acquired lock on startup');
          }
        }
      });
    } else {
      this.lockAcquiredSubject.next(false);
    }
  }

  public acquireLock<T>(storeToRehydrate: Store<T>): Observable<boolean> {
    if (this.iAmMasterOfStore) return of(true);

    return from(update<ConcurrencyTimestamp>(this.opts.concurrency.trackKey, data => {
      if (!data || data.timestamp < (Date.now() - this.opts.concurrency.refreshRate * 1.1)) {
        return {
          uniqueKey: this.uniqueKey,
          timestamp: Date.now(),
        };
      } else {
        return data;
      }
    }, this.idbStore)).pipe(
      switchMap(() =>
        from(get<ConcurrencyTimestamp>(this.opts.concurrency.trackKey, this.idbStore)).pipe(
          // Have a look if there is already some other instance running
          map(inData => !inData || inData.uniqueKey === this.uniqueKey),
          switchMap(lockAcquired => {
            if (lockAcquired) {
              this.iAmMasterOfStore = true;
              this.lockAcquiredSubject.next(true);

              // If manual lock managenent is disabled, lock status will not change anymore
              if (this.opts.concurrency.acquireLockOnStartup) {
                this.lockAcquiredSubject.complete();
              }

              // No instance or it was not updated for a long time.
              // Start a timer and keep updating the timestamp
              this.timerSubscription = timer(0, this.opts.concurrency.refreshRate).pipe(
                map(() => <ConcurrencyTimestamp> {
                  uniqueKey: this.uniqueKey,
                  timestamp: Date.now(),
                }),
                switchMap(outData => {
                  if (this.iAmMasterOfStore) {
                    return from(set(this.opts.concurrency.trackKey, outData, this.idbStore)).pipe(map(() => outData));
                  } else {
                    return EMPTY;
                  }
                })
              ).subscribe(outData => {
                if (this.opts.debugInfo) {
                  console.debug(`NgrxStoreIdb: Updating concurrency timestamp '${this.opts.concurrency.trackKey}'`, outData);
                }
              });

              if (storeToRehydrate) {
                return from(get(SAVED_STATE_KEY, this.idbStore)).pipe(
                  tap(value => {
                    storeToRehydrate.dispatch(rehydrateAction({ rehydratedState: value }));
                    if (this.opts.debugInfo) {
                      console.debug('NgrxStoreIdb: Loaded state from IndexedDB:', value);
                    }
                  }),
                  map(() => true),
                  catchError(err => {
                    console.error('NgrxStoreIdb: Error reading state from IndexedDB', err);
                    storeToRehydrate.dispatch(rehydrateErrorAction());
                    return of(false);
                  }),
                );
              } else {
                return of(true);
              }
            } else {
              // Otherwise do nothing - some other instance is syncing/master of the IDB store
              this.iAmMasterOfStore = false;
              this.lockAcquiredSubject.next(false);

              // If manual lock managenent is disabled, lock status will not change anymore
              if (this.opts.concurrency.acquireLockOnStartup) {
                this.lockAcquiredSubject.complete();
              }

              return of(false);
            }
          }),
        ))
    );
  }

  public releaseLock(): Observable<void> {
    if (!this.iAmMasterOfStore) return EMPTY;

    this.timerSubscription.unsubscribe();
    this.timerSubscription = null;

    this.iAmMasterOfStore = false;
    this.lockAcquiredSubject.next(false);

    return from(update<ConcurrencyTimestamp>(this.opts.concurrency.trackKey, data => {
      if (!data || data.uniqueKey === this.uniqueKey) {
        return null;
      } else {
        return data;
      }
    }, this.idbStore));
  }

  public onLockAcquired(): Observable<boolean> {
    return this.onLockAcquired$;
  }

  public canConcurrentlySync(): boolean {
    return this.opts.concurrency.allowed || this.iAmMasterOfStore;
  }

  private uuidv4(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  broadcastSyncEvent(action: Action, success: boolean): void {
    this.broadcastSubject.next(action);
  }

  public onSync(): Observable<Action> {
    return this.onSync$;
  }
}
