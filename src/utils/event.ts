import {Helpers} from './helpers';

export class Event {

    protected listeners: any = {};

    on(name: string, data: any, handler?: Function) {
        if (typeof data === 'function' && handler === undefined) {
            handler = data;
            data = undefined;
        }

        if (!Helpers.isArray(this.listeners[name])) {
            this.listeners[name] = [];
        }

        if (Helpers.isFunction(handler)) {
            this.listeners[name].push(handler);
        }

        return this;
    }

    one(name: string, handler: Function) {
        if (Helpers.isFunction(handler)) {
            (<any>handler).isOne = true;

            this.on(name, handler);
        }

        return this;
    }

    off(name: string, handler?: Function) {
        if (Helpers.isArray(this.listeners[name])) {
            if (Helpers.isFunction(handler)) {
                this.listeners[name].forEach(function (item: any, index: number) {
                    if (item === handler) {
                        this.listeners[name].splice(index, 1);
                    }
                }.bind(this));
            } else {
                this.listeners[name] = [];
            }
        }

        return this;
    }

    trigger(name: string, data?: any) {
        if (Helpers.isArray(this.listeners[name])) {
            this.listeners[name].forEach(function (item: any) {
                item({
                    type: name
                }, data);

                if (item.isOne) {
                    this.off(name, item);
                }
            });
        }

        return this;
    }
}