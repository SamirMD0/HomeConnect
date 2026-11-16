// Routes enqueue work; the startup-owned scheduler supplies the callback.
let notify: () => void = () => {};
export const onWorkerRequest = (handler: () => void) => { notify = handler; };
export const requestWorkerCycle = () => { setImmediate(() => notify()); };
