import { LitElement } from 'lit-element';


export class LitStateElement extends LitElement {

    _observers = [];

    update(changedProperties) {
        stateRecorder.start();
        super.update(changedProperties);
        this._initStateObservers();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._clearStateObservers();
    }

    _initStateObservers() {

        this._clearStateObservers();

        if (!this.isConnected) {
            return;
        }

        const stateVars = stateRecorder.finish();

        if (stateVars) {
            this._addStateObservers(stateVars);
        }

    }

    _addStateObservers(stateVars) {
        for (let [state, keys] of stateVars) {
            const observer = this._stateChangeCallback;
            this._observers.push([state, observer]);
            state.addObserver(observer, keys);
        }
    }

    _stateChangeCallback = () => {
        this.requestUpdate();
    }

    _clearStateObservers() {

        if (!this._observers.length) {
            return;
        }

        for (let [state, observer] of this._observers) {
            state.removeObserver(observer);
        }

        this._observers = [];

    }

    el(querySelector) {
        return this.shadowRoot.querySelector(querySelector);
    }

    els(querySelector) {
        return this.shadowRoot.querySelectorAll(querySelector);
    }

}


export class LitState {

    _stateVars = [];
    _asyncStateVars = [];
    _observers = [];

    constructor() {

        return new Proxy(this, {

            set: (obj, key, value) => {

                if (this._isStateVar(key)) {
                    if (obj[key] !== value) {
                        obj[key] = value;
                        this._notifyObservers(key);
                    }
                } else if (value instanceof StateVar) {
                    this._stateVars.push(key);
                    obj[key] = value.initialValue;
                } else if (this._isAsyncStateVar(key)) {
                    null;
                } else if (value instanceof AsyncStateVar) {
                    this._asyncStateVars.push(key);
                    value.logStateVar = () => {
                        stateRecorder.logStateVar(obj, key);
                    };
                    value.onChange = () => {
                        this._notifyObservers(key);
                    };
                    obj[key] = value;
                } else {
                    obj[key] = value;
                }

                return true;

            },

            get: (obj, key) => {

                if (obj._isStateVar(key)) {
                    stateRecorder.logStateVar(obj, key);
                } else if (obj._isAsyncStateVar(key) && !obj[key].initiated) {
                    stateRecorder.logStateVar(obj, key);
                    obj[key].initiate();
                }

                return obj[key];

            }

        });

    }

    addObserver(observer, keys) {
        this._observers.push({observer, keys});
    }

    removeObserver(observer) {
        this._observers = this._observers.filter(observerObj => observerObj.observer !== observer);
    }

    _isStateVar(key) {
        return this._stateVars.includes(key);
    }

    _isAsyncStateVar(key) {
        return this._asyncStateVars.includes(key);
    }

    _notifyObservers(key) {

        if (!this._observers.length) {
            return;
        }

        this._observers.forEach(observerObj => {
            if (!observerObj.keys || observerObj.keys.includes(key)) {
                observerObj.observer(key);
            }
        });

    }

}


class StateVar {
    constructor(initialValue) {
        this.initialValue = initialValue;
    }
}


export function stateVar(defaultValue) {
    return new StateVar(defaultValue);
}


class AsyncStateVar {

    promise = null;
    defaultValue = null;
    initiated = false;
    pending = true;
    fulfilled = false;
    result = null;
    rejected = false;
    error = null;
    logStateVar = null;
    onChange = null;

    constructor(promise, defaultValue) {
        this.promise = promise;
        this.defaultValue = defaultValue;
    }

    initiate() {
        this.reset();
        this.settle();
    }

    reset() {
        this.initiated = true;
        this.pending = true;
        this.fulfilled = false;
        this.result = null;
        this.rejected = false;
        this.error = null;
    }

    settle() {
        this.promise().then(result => {
            this.fulfilled = true;
            this.result = result;
        }).catch(error => {
            this.rejected = true;
            this.error = error;
        }).finally(() => {
            this.pending = false;
            this.onChange();
        });
    }

    isPending() {
        this.logStateVar();
        return this.pending;
    }

    isRejected() {
        this.logStateVar();
        return this.rejected;
    }

    getError() {
        this.logStateVar();
        return this.error;
    }

    isFulfilled() {
        this.logStateVar();
        return this.fulfilled;
    }

    getValue() {

        this.logStateVar();

        if (this.isFulfilled()) {
            return this.result;
        } else {
            return this.defaultValue;
        }

    }

    reload(reset = true) {

        this.logStateVar();

        if (reset) {
            this.reset();
            this.onChange();
        }

        this.settle();

    }

}


export function asyncStateVar(promise, defaultValue) {
    return new AsyncStateVar(promise, defaultValue);
}


class StateRecorder {

    _log = null;

    start() {
        this._log = new Map();
    }

    logStateVar(stateObj, key) {

        if (this._log === null) {
            return;
        }

        const keys = this._log.get(stateObj) || [];

        if (!keys.includes(key)) {
            keys.push(key);
        }

        this._log.set(stateObj, keys);

    }

    finish() {
        const stateVars = this._log;
        this._log = null;
        return stateVars;
    }

}

export const stateRecorder = new StateRecorder();
