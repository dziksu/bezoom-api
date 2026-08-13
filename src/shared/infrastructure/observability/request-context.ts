import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextValue {
  requestId: string;
}

const requestContext = new AsyncLocalStorage<RequestContextValue>();

export const RequestContext = {
  run<T>(value: RequestContextValue, callback: () => T): T {
    return requestContext.run(value, callback);
  },

  getRequestId(): string | undefined {
    return requestContext.getStore()?.requestId;
  }
};
