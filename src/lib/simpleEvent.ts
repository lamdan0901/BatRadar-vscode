export interface DisposableLike {
  dispose(): void;
}

type Listener<T> = (event: T) => unknown;

export class SimpleEventEmitter<T> {
  private listeners = new Set<Listener<T>>();

  readonly event = (listener: Listener<T>, disposables?: DisposableLike[]): DisposableLike => {
    this.listeners.add(listener);

    const disposable: DisposableLike = {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };

    disposables?.push(disposable);
    return disposable;
  };

  fire(event: T): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}
