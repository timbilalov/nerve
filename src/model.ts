import {EventEmitter} from './event';
import {Helpers} from './utils/helpers';
import {Http} from './utils/http';
import {AxiosResponse} from 'axios';

export class Model<T> extends EventEmitter {

    private _attr: any;

    protected events: any;
    protected errors: any[];
    protected isFetchedState: boolean;
    protected isRemovedState: boolean;
    protected fetchXHR: any;

    public id: any;
    public cid: number;

    /**
     * URL получения данных
     *
     * @type {String}
     */
    protected url: string;

    /**
     * URL сохранения
     *
     * @type {String}
     */
    protected urlSave: string;

    /**
     * URL создания
     *
     * @type {String}
     */
    protected urlCreate: string;

    /**
     * URL удаления
     *
     * @type {String}
     */
    protected urlRemove: string;

    /**
     * Правила валидации
     *
     * @type {Array}
     */
    protected validation: any[];

    /**
     * Уникальный ключ для модели
     *
     * @protected
     * @type {String}
     */
    protected uniqueKey: string = 'id';

    protected static counter: number = 0;

    constructor(attr: any, options?: any) {
        super(options);

        this.set(attr, true);

        /**
         * Параметры, собирающиеся из defaultOptions и переданных в аргументе
         *
         * @type {Object}
         */
        this.options = Helpers.extend({}, this.defaultOptions, options);

        /**
         * Клиентский идентификатор сущности
         *
         * @type {Number}
         */
        this.cid = Model.counter++;

        /**
         * Ошибки, связанные с валидацией
         *
         * @type {Array}
         */
        this.errors = [];

        /**
         * Получены ли данные с сервера
         * @type {Boolean}
         */
        this.isFetchedState = false;

        /**
         * Удалена ли модель
         * @type {Boolean}
         */
        this.isRemovedState = false;

        this.delegateEvents();

        return this;
    }

    /**
     * Уничтожение
     *
     * @returns {Model}
     */
    destroy() {
        delete this._attr;
        delete this.id;
        delete this.cid;
        delete this.errors;

        super.destroy();

        return this;
    }

    /**
     * Установка атрибутов
     *
     * @param {String | Object} key название атрибутов или объект с атрибутами
     * @param {*} [value] значение (для установки одного атрибута)
     * @param {Boolean} [options.silent = false]
     */
    protected set(data: T, silent = false) {
        let changedAttrs: string[] = [];

        for (let key in <any> data) {
            (<any> this)[key] = (<any> data)[key];
            changedAttrs.push((<any> data)[key]);
        }

        if (!silent) {
            changedAttrs.forEach((item: string) =>{
                this.trigger('change.' + item);
            });
            this.trigger('change');
        }

        return this;
    }


    /**
     * Валидация атрибутов
     *
     * @returns {Boolean}
     */
    private validate(options: any): boolean {
        this.errors = [];

        this.validation.forEach((item: any) => {
            var value: any;

            if (String(item.value).indexOf('@') === 0) {
                value = (<any> this)[item.value.slice(1)];
            } else {
                value = item.value;
            }

            if (!Helpers.isFunction(item.condition) || item.condition.call(this, options)) {
                switch (item.type) {
                case 'eq':
                    item.attr.forEach((attr1: string) => {
                        item.attr.forEach((attr2: string) => {
                            if (item.byLength) {
                                if (String((<any> this)[attr1]).length === String((<any> this)[attr2]).length) {
                                    this.errors.push(item.errorCode);
                                }
                            } else {
                                if ((<any> this)[attr1] !== (<any> this)[attr2]) {
                                    this.errors.push(item.errorCode);
                                }
                            }
                        });
                    });
                    break;
                case 'lt':
                    item.attr.forEach((attr: string) => {
                        var length,
                            attrValue = (<any> this)[attr];

                        if (item.byLength) {
                            if (Helpers.isArray(attrValue)) {
                                length = attrValue.length;
                            } else {
                                length = String(attrValue).length;
                            }

                            if ((item.strict && length > value) || (!item.strict && length >= value)) {
                                this.errors.push(item.errorCode);
                            }
                        } else {
                            if ((item.strict && attrValue > value) || (!item.strict && attrValue >= value)) {
                                this.errors.push(item.errorCode);
                            }
                        }
                    });
                    break;
                case 'gt':
                    item.attr.forEach((attr: string) => {
                        let length,
                            attrValue = (<any> this)[attr];

                        if (item.byLength) {
                            if (Helpers.isArray(attrValue)) {
                                length = attrValue.length;
                            } else {
                                length = String(attrValue).length;
                            }

                            if ((item.strict && length < value) || (!item.strict && length <= value)) {
                                this.errors.push(item.errorCode);
                            }
                        } else {
                            if ((item.strict && attrValue < value) || (!item.strict && attrValue <= value)) {
                                this.errors.push(item.errorCode);
                            }
                        }
                    });
                    break;
                case 'required':
                    item.attr.forEach((attr: string) => {
                        var attrValue = (<any> this)[attr],
                            isError = (Helpers.isArray(attrValue) && attrValue.length === 0) || !attrValue;

                        if (isError) {
                            this.errors.push(item.errorCode);
                        }
                    });
                    break;
                case 'regexp':
                    item.attr.forEach((attr: string) => {
                        if (!value.test((<any> this)[attr])) {
                            this.errors.push(item.errorCode);
                        }
                    });
                    break;
                }
            }
        });

        return this.errors.length === 0;
    }

    /**
     * Преобразование атрибутов в объект
     *
     * @returns {Object}
     */
    toJSON(): any {
        return {};
    }

    /**
     * Получение данных с сервера
     *
     * @returns {Promise}
     */
    fetch(): Promise<any> {
        return new Promise((resolve: Function, reject: Function) => {
            const settings = this.getFetchSettings();

            this.fetchXHR = Http.get(settings.url, {
                params: this.getFetchParams()
            })
                .then((response: AxiosResponse) => {
                    // response.data
                    if (!this.isDestroyed) {
                        const attr: T = this.adapter(response.data);

                        if (Helpers.isString(response.data)) {
                            response = JSON.parse(response.data);
                        }

                        for (let key in <any> attr) {
                            (<any> this)[key] = (<any> attr)[key];
                        }

                        this.isFetchedState = true;
                        this.trigger('fetched', response.data);

                        resolve(response, response.data);
                    }
                });

        });
    }

    /**
     * Отправление запроса на сохранение
     *
     * @returns {Promise}
     */
    save(): Promise<any> {
        this.trigger('beforeSave');

        return new Promise((resolve: Function, reject: Function) => {
            var validateOptions = {
                mode: 'save'
            };

            if (this.validate(validateOptions)) {
                const settings = this.getSaveSettings();
                Http.request({
                    method: 'put',
                    url: settings.url,
                    headers: Helpers.extend({}, settings.headers),
                    data: this.getSaveParams(),
                    withCredentials: true
                })
                    .then((response: AxiosResponse) => {
                        if (Helpers.isString(response.data)) {
                            response = JSON.parse(response.data);
                        }

                        this.trigger('saved');
                        resolve(response.data);
                    });
            } else {
                reject();
            }

        });
    }

    /**
     * Отправление запроса на создание
     *
     * @returns {Promise}
     */
    create(): Promise<any> {
        this.trigger('beforeCreate');

        return new Promise((resolve: Function, reject: Function) => {
            var validateOptions = {
                mode: 'create'
            };

            if (this.validate(validateOptions)) {
                const settings = this.getCreateSettings();

                Http.request({
                    method: 'post',
                    url: settings.url,
                    headers: Helpers.extend({}, settings.headers),
                    data: this.getCreateParams(),
                    withCredentials: true
                })
                    .then((response: AxiosResponse) => {
                        if (Helpers.isString(response.data)) {
                            response = JSON.parse(response.data);
                        }

                        this.trigger('created');
                        resolve(response.data);
                    });
            } else {
                reject();
            }

        });
    }

    /**
     * Отправление запроса на удаление
     *
     * @returns {Promise}
     */
    remove(): Promise<any> {
        this.trigger('beforeRemove');
        this.isRemovedState = true;

        return new Promise((resolve: Function, reject: Function) => {

            if (this.isRemoveReady()) {
                const settings = this.getRemoveSettings();

                Http.request({
                    method: 'delete',
                    url: settings.url,
                    headers: settings.headers,
                    params: this.getRemoveParams(),
                    withCredentials: true
                })
                    .then((response: AxiosResponse) => {
                        if (Helpers.isString(response.data)) {
                            response = JSON.parse(response.data);
                        }

                        this.trigger('removed');
                        resolve(response.data);
                    });
            } else {
                this.trigger('removed');
                reject();
            }

        });
    }

    /**
     * Отмена текущей загрузки
     *
     * @returns {Model}
     */
    abort() {
        if (this.fetchXHR) {
            this.fetchXHR.abort();
            this.trigger('aborted');
        }

        return this;
    }

    /**
     * Метод, позволяющий выполнить некторое действие только после того, как данные с сервера будут получены
     *
     * @returns {Promise}
     */
    fetched(): Promise<any> {
        return new Promise((resolve: Function) => {
            if (this.isFetched()) {
                resolve();
            } else {
                this.on('fetched', function () {
                    resolve();
                });
            }
        });
    }

    /**
     * Метод добавляющий свойста в модель после получения от сервера
     *
     * @returns {Model}
     */
    setResponse(response: any) {
        this.set(this.adapter(response));

        return this;
    }

    /**
     * Проверка на то, были ли получены данные с сервера
     *
     * @returns {Boolean}
     */
    isFetched(): boolean {
        return this.isFetchedState;
    }

    /**
     * Проверка на то, что модель была удалена
     *
     * @returns {Boolean}
     */
    isRemoved(): boolean {
        return this.isRemovedState;
    }

    /**
     * Проверка готовности удаления
     *
     * @returns {Boolean}
     */
    isRemoveReady(): boolean {
        return !!(<any> this)[this.uniqueKey];
    }

    /**
     * Проверка состояния текущей загрузки
     *
     * @returns {Boolean}
     */
    isPending(): boolean {
        return this.fetchXHR && this.fetchXHR.state() === 'pending';
    }

    /**
     * Назначение обработчиков событий
     *
     * @protected
     * @returns {Model}
     */
    protected delegateEvents() {
        if (this.events) {
            Object.keys(this.events).forEach((eventItem: string) => {
                this.on(eventItem, (<any> this)[this.events[eventItem]].bind(this));
            });
        }

        return this;
    }

    /**
     * Адаптирование данных, приходящих от сервера
     *
     * @protected
     * @param {Object} srcAttr данные, пришедшие от сервера
     * @returns {Object}
     */
    protected adapter(srcAttr: any) {
        return srcAttr;
    }

    /**
     * Получение URL для AJAX запросов на сервер
     *
     * @protected
     * @returns {String}
     */
    protected getUrl(): string {
        return this.url;
    }

    /**
     * Получение данных, отправляемых на сервер при получении данных
     *
     * @protected
     * @returns {Object}
     */
    protected getFetchParams(): any {
        let params: any = {};

        params[this.uniqueKey] = this.uniqueKey;

        return params;
    }

    /**
     * Получение данных, отправляемых на сервер при сохраненнии
     *
     * @protected
     * @returns {Object}
     */
    protected getSaveParams(): any {
        return Helpers.extend({}, this.toJSON());
    }

    /**
     * Получение данных, отправляемых на сервер при создании
     *
     * @protected
     * @returns {Object}
     */
    protected getCreateParams(): any {
        return Helpers.extend({}, this.toJSON());
    }

    /**
     * Получение данных, отправляемых на сервер при удалении
     *
     * @protected
     * @returns {Object}
     */
    protected getRemoveParams(): any {
        return Helpers.extend({}, {
            id: this.id
        });
    }

    /**
     * Получение настроек AJAX запроса при получении данных
     *
     * @protected
     * @returns {Object}
     */
    protected getFetchSettings(): any {
        return {
            url: this.getUrl()
        };
    }

    /**
     * Получение настроек AJAX запроса при сохранении
     *
     * @protected
     * @returns {Object}
     */
    protected getSaveSettings(): any {
        return {
            url: this.getUrl(),
            type: 'post',
            headers: {
                'Content-Type' : 'application/x-www-form-urlencoded'
            }
        };
    }

    /**
     * Получение настроек AJAX запроса при создании
     *
     * @protected
     * @returns {Object}
     */
    protected getCreateSettings(): any {
        return {
            url: this.getUrl(),
            type: 'post',
            abortCaptcha: function () {
                this.trigger('abortCaptcha');
            }.bind(this),
            headers: {
                'Content-Type' : 'application/x-www-form-urlencoded'
            }
        };
    }

    /**
     * Получение настроек AJAX запроса при удалении
     *
     * @protected
     * @returns {Object}
     */
    protected getRemoveSettings(): any {
        return {
            url: this.getUrl(),
            type: 'post'
        };
    }

}