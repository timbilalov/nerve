import {Helpers} from './utils/helpers';
import {Event} from './utils/event';

export class EventEmitter {

    protected options: any;

    protected defaultOptions: any = {};

    protected _event: Event;

    protected deferred: any = {};

    public isDestroyed = false;

    constructor(options?: any) {
        /**
         * Параметры, собирающиеся из defaultOptions и переданных в аргументе
         *
         * @type {Object}
         */
        this.options = Helpers.extend({}, this.defaultOptions, options || {});

        /**
         * Объект, реализующий работу с событиями
         *
         * @type {Event}
         * @protected
         */
        this._event = new Event();

        return this;
    }

    /**
     * Уничтожение
     *
     * @returns {EventEmitter}
     */
    destroy() {
        if (!this.isDestroyed) {
            this.trigger('destroy');
            this.off();

            delete this.options;
            delete this._event;

            this.isDestroyed = true;
        }

        return this;
    }

    /**
     * Подписка на событие
     *
     * @param {String} name название события
     * @param {Function} handler обработчик события
     * @returns {EventEmitter}
     */
    on(name: string, handler: Function, isSingle?: boolean) {
        if (this._event) {
            this._event.on.apply(this._event, arguments);
        }

        return this;
    }

    /**
     * Отписка от события
     *
     * @param {String} name название события
     * @param {Function} handler обработчик события
     * @returns {EventEmitter}
     */
    off(name?: string, handler?: Function) {
        if (this._event) {
            this._event.off.apply(this._event, arguments);
        }

        return this;
    }

    /**
     * Генерирование события
     *
     * @param {String} name название события
     * @param {*} data данные, передаваемые в обработчик
     * @returns {EventEmitter}
     */
    trigger(name: string, data?: any) {
        if (this._event) {
            this._event.trigger.apply(this._event, arguments);
        }
        return this;
    }

    /**
     * Подгрузка модуля
     *
     * @param {String | Array.<String>} module название модуля
     * @param {Function} [callback] функция, в которую будет передан объект модуля
     * @returns {Promise}
     */
    require(module: string | string[], callback: Function) {
        let promises: Promise<any>[] = [],
            modules: any = {},
            promise;

        if (!Helpers.isArray(module)) {
            promise = new Promise((resolve: Function, reject: Function) => {
                (<any> window).requirejs([this.deferred[<any> module] || module], (...args: any[]) => {
                    if (!this.isDestroyed) {
                        if (Helpers.isFunction(callback)) {
                            callback(...args);
                        }
                        resolve.apply(this, arguments);
                    }
                }, reject);
            });
        } else {
            (<string[]> module).forEach((item) => {
                let moduleName: string;

                promises.push(new Promise((resolve: Function, reject: Function) => {
                    moduleName = this.deferred[item] || item;
                    (<any> window).requirejs([moduleName], (Module: any) => {
                        modules[moduleName] = Module;
                        resolve();
                    }, reject);
                }));
            });

            promise = new Promise((resolve: Function, reject: () => void) => {
                Promise.all(promises)
                    .then(() => {
                        let deps: any[] = [];

                        (<string[]> module).forEach((item: string) => {
                            const moduleName = this.deferred[item] || item;

                            deps.push(modules[moduleName]);
                        });

                        if (!this.isDestroyed) {
                            resolve.apply(this, deps);
                            if (Helpers.isFunction(callback)) {
                                callback.apply(this, deps);
                            }
                        }
                    })
                    .catch(reject);
            });
        }

        return promise;
    }
}