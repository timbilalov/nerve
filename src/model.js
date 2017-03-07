/*jslint nomen:true*/

/**
 * Модуль модели
 *
 * @class
 * @name Model
 * @abstract
 * @augments EventEmitter
 */

define([
    'event',
    'utils/ajax',
    'utils/helpers',
    'utils/cookie'
], function (
    EventEmitter,
    Ajax,
    Helpers,
    Cookie
) {

    'use strict';

    var counter = 0,
        Model;

    Model = EventEmitter.extend(
        /** @lends Model.prototype */
        {

            /**
             * Создание
             *
             * @param {Object} attr атрибуты
             * @param {Object} options опции
             * @returns {Model}
             */
            create: function (attr, options) {

                /**
                 * Атрибуты
                 *
                 * @type {Object}
                 * @protected
                 */
                this._attr = Helpers.extend(true, {}, this.defaults, attr);

                /**
                 * Параметры, собирающиеся из defaultOptions и переданных в аргументе
                 *
                 * @type {Object}
                 */
                this.options = Helpers.extend(true, {}, this.defaultOptions, options);

                /**
                 * Идентификатор сущности
                 *
                 * @type {Number | String}
                 */
                this.id = this._attr.id;

                /**
                 * Клиентский идентификатор сущности
                 *
                 * @type {Number}
                 */
                this.cid = counter++;

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
                this.init();

                return this;
            },

            /** @lends Model.prototype */
            props: {
                /**
                 * URL получения данных
                 *
                 * @type {String}
                 */
                url: '',

                /**
                 * URL сохранения
                 *
                 * @type {String}
                 */
                urlSave: '',

                /**
                 * URL создания
                 *
                 * @type {String}
                 */
                urlCreate: '',

                /**
                 * URL удаления
                 *
                 * @type {String}
                 */
                urlRemove: '',

                /**
                 * Правила валидации
                 *
                 * @type {Array}
                 */
                validation: []
            },

            /** @lends Model.prototype */
            public: {

                /**
                 * Уничтожение
                 *
                 * @returns {Model}
                 */
                destroy: function () {
                    delete this._attr;
                    delete this.id;
                    delete this.cid;
                    delete this.errors;

                    Model.__super__.destroy.call(this);

                    return this;
                },

                /**
                 * Получение значения атрибута
                 *
                 * @param {String} key название атрибута
                 * @returns {*}
                 */
                getSingle: function (key) {
                    var arIds = key.split('.'),
                        iteration = 0,
                        attrItem = this._attr;

                    while (attrItem && iteration < arIds.length) {
                        if (attrItem[arIds[iteration]] !== undefined) {
                            attrItem = attrItem[arIds[iteration]];
                        } else {
                            attrItem = undefined;
                        }

                        iteration++;
                    }

                    return attrItem;
                },

                /**
                 * Установка значения атрибута
                 *
                 * @param {String} key название атрибута
                 * @param {*} value значение атрибута
                 * @param {Boolean} [options.silent = false]
                 * @returns {Boolean} изменился ли атрибут
                 */
                setSingle: function (key, value, options) {
                    var isChanged = false;

                    options = options || {};

                    if (this._attr[key] !== value) {
                        if (Helpers.isString(value)) {
                            value = String(value).trim();
                        }
                        this._attr[key] = value;


                        if (key === 'id') {
                            this.id = value;
                        }

                        if (!options.silent && !options.isNotChangeTrigger) {
                            this.trigger('change.' + key);
                            this.trigger('change');
                        }

                        isChanged = true;
                    }

                    return isChanged;
                },

                /**
                 * Получение значения атрибута или атрибутов
                 *
                 * @param {String | Array.<String>} key названия атрибутов
                 * @returns {* | Object}
                 */
                get: function (key) {
                    var result = null;

                    if (Helpers.isString(key)) {
                        result = this.getSingle(key);
                    }

                    if (Helpers.isArray(key)) {
                        result = {};
                        key.forEach(function (item) {
                            result[item] = this.getSingle(item);
                        }.bind(this));
                    }

                    return result;
                },

                /**
                 * Установка значения атрибута или атрибутов
                 *
                 * @param {String | Object} key название атрибутов или объект с атрибутами
                 * @param {*} [value] значение (для установки одного атрибута)
                 * @param {Boolean} [options.silent = false]
                 */
                set: function (key, value, options) {
                    var changedAttrs = [];

                    if (Helpers.isString(key)) {
                        if (this.setSingle(key, value, Helpers.extend({}, options, {isNotChangeTrigger: true}))) {
                            this.trigger('change.' + key);
                        }
                    }

                    if (Helpers.isObject(key)) {
                        options = value;

                        Object.keys(key).forEach(function (item) {
                            if (this.setSingle(item, key[item], Helpers.extend({}, options, {isNotChangeTrigger: true}))) {
                                changedAttrs.push(item);
                            }
                        }.bind(this));

                        if (!options || !options.silent) {
                            changedAttrs.forEach(function (item) {
                                this.trigger('change.' + item);
                            }.bind(this));
                        }
                    }

                    if (!options || !options.silent) {
                        this.trigger('change');
                    }

                    return this;
                },

                /**
                 * Валидация атрибутов
                 *
                 * @returns {Boolean}
                 */
                validate: function (options) {
                    this.errors = [];

                    this.validation.forEach(function (item) {
                        var value;

                        if (String(item.value).indexOf('@') === 0) {
                            value = this.get(item.value.slice(1));
                        } else {
                            value = item.value;
                        }

                        if (!Helpers.isFunction(item.condition) || item.condition.call(this, options)) {
                            switch (item.type) {
                            case 'eq':
                                item.attr.forEach(function (attr1) {
                                    item.attr.forEach(function (attr2) {
                                        if (item.byLength) {
                                            if (String(this.get(attr1)).length === String(this.get(attr2)).length) {
                                                this.errors.push(item.errorCode);
                                            }
                                        } else {
                                            if (this.get(attr1) !== this.get(attr2)) {
                                                this.errors.push(item.errorCode);
                                            }
                                        }
                                    }.bind(this));
                                }.bind(this));
                                break;
                            case 'lt':
                                item.attr.forEach(function (attr) {
                                    var length,
                                        attrValue = this.get(attr);

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
                                }.bind(this));
                                break;
                            case 'gt':
                                item.attr.forEach(function (attr) {
                                    var length,
                                        attrValue = this.get(attr);

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
                                }.bind(this));
                                break;
                            case 'required':
                                item.attr.forEach(function (attr) {
                                    var attrValue = this.get(attr),
                                        isError = (Helpers.isArray(attrValue) && attrValue.length === 0) || !attrValue;

                                    if (isError) {
                                        this.errors.push(item.errorCode);
                                    }
                                }.bind(this));
                                break;
                            case 'regexp':
                                item.attr.forEach(function (attr) {
                                    if (!value.test(this.get(attr))) {
                                        this.errors.push(item.errorCode);
                                    }
                                }.bind(this));
                                break;
                            }
                        }
                    }.bind(this));

                    return this.errors.length === 0;
                },

                /**
                 * Преобразование атрибутов в объект
                 *
                 * @returns {Object}
                 */
                toJSON: function () {
                    return Helpers.extend(true, {}, this._attr);
                },

                /**
                 * Получение данных с сервера
                 *
                 * @returns {Promise}
                 */
                fetch: function () {
                    this.trigger('beforeFetche');

                    return new Promise(function (resolve, reject) {
                        this.fetchXHR = Ajax.send(Helpers.extend(this.getFetchSettings(), {
                            url: this.url,
                            data: this.getFetchParams()
                        }));

                        this.fetchXHR
                            .success(function (response) {
                                if (!this.isDestroyed) {
                                    if (Helpers.isString(response)) {
                                        response = JSON.parse(response);
                                    }

                                    this.set(this.adapter(response));

                                    this.isFetchedState = true;
                                    if (Helpers.isFunction(this._onFetched)) {
                                        this._onFetched();
                                    }
                                    this.trigger('fetched');

                                    resolve(response);
                                }
                            }.bind(this))

                            .error(function () {
                                this.trigger('fetched');
                                reject();
                            }.bind(this));

                    }.bind(this));
                },

                /**
                 * Отправление запроса на сохранение
                 *
                 * @returns {Promise}
                 */
                save: function () {
                    this.trigger('beforeSave');

                    return new Promise(function (resolve, reject) {
                        var validateOptions = {
                            mode: 'save'
                        };

                        if (this.validate(validateOptions)) {
                            Ajax.send(Helpers.extend(this.getSaveSettings(), {
                                url: this.urlSave,
                                data: this.getSaveParams()
                            }))
                                .success(function (response) {
                                    if (Helpers.isString(response)) {
                                        response = JSON.parse(response);
                                    }

                                    this.trigger('saved');
                                    resolve(response);
                                }.bind(this))
                                .error(reject);
                        } else {
                            reject();
                        }

                    }.bind(this));
                },

                /**
                 * Отправление запроса на создание
                 *
                 * @returns {Promise}
                 */
                create: function () {
                    this.trigger('beforeCreate');

                    return new Promise(function (resolve, reject) {
                        var validateOptions = {
                            mode: 'create'
                        };

                        if (this.validate(validateOptions)) {
                            Ajax.send(Helpers.extend(this.getCreateSettings(), {
                                url: this.urlCreate,
                                data: this.getCreateParams()
                            }))
                                .success(function (response) {
                                    if (Helpers.isString(response)) {
                                        response = JSON.parse(response);
                                    }

                                    this.trigger('created');
                                    resolve(response);
                                }.bind(this))
                                .error(reject);
                        } else {
                            reject();
                        }

                    }.bind(this));
                },

                /**
                 * Отправление запроса на удаление
                 *
                 * @returns {Promise}
                 */
                remove: function () {
                    this.trigger('beforeRemove');
                    this.isRemovedState = true;

                    return new Promise(function (resolve, reject) {

                        if (this.isRemoveReady()) {
                            Ajax.send(Helpers.extend(this.getRemoveSettings(), {
                                url: this.urlRemove,
                                data: this.getRemoveParams()
                            }))
                                .success(function (response) {
                                    if (Helpers.isString(response)) {
                                        response = JSON.parse(response);
                                    }

                                    this.trigger('removed');
                                    resolve(response);
                                }.bind(this))
                                .error(reject);
                        } else {
                            this.trigger('removed');
                            reject();
                        }

                    }.bind(this));
                },

                /**
                 * Отмена текущей загрузки
                 *
                 * @returns {Model}
                 */
                abort: function () {
                    if (this.fetchXHR) {
                        this.fetchXHR.abort();
                        this.trigger('aborted');
                    }

                    return this;
                },

                /**
                 * Метод, позволяющий выполнить некторое действие только после того, как данные с сервера будут получены
                 *
                 * @returns {Promise}
                 */
                fetched: function () {
                    return new Promise(function (resolve) {
                        if (this.isFetched()) {
                            resolve();
                        } else {
                            this.on('fetched', function () {
                                resolve();
                            });
                        }
                    }.bind(this));
                },

                /**
                 * Метод добавляющий свойста в модель после получения от сервера
                 *
                 * @returns {Model}
                 */
                setResponse: function (response) {
                    this.set(this.adapter(response));

                    return this;
                },

                /**
                 * Проверка на то, были ли получены данные с сервера
                 *
                 * @returns {Boolean}
                 */
                isFetched: function () {
                    return this.isFetchedState;
                },

                /**
                 * Проверка на то, что модель была удалена
                 *
                 * @returns {Boolean}
                 */
                isRemoved: function () {
                    return this.isRemovedState;
                },

                /**
                 * Проверка готовности удаления
                 *
                 * @returns {Boolean}
                 */
                isRemoveReady: function () {
                    return !!this.get(this.uniqueKey);
                },

                /**
                 * Проверка состояния текущей загрузки
                 *
                 * @returns {Boolean}
                 */
                isPending: function () {
                    return this.fetchXHR && this.fetchXHR.state() === 'pending';
                }
            },

            /** @lends Model.prototype */
            protected: {

                /**
                 * Уникальный ключ для модели
                 *
                 * @protected
                 * @type {String}
                 */
                uniqueKey: 'id',

                /**
                 * Назначение обработчиков событий
                 *
                 * @protected
                 * @returns {Model}
                 */
                delegateEvents: function () {
                    if (this.events) {
                        Object.keys(this.events).forEach(function (eventItem) {
                            this.on(eventItem, this[this.events[eventItem]].bind(this));
                        }.bind(this));
                    }

                    return this;
                },

                /**
                 * Адаптирование данных, приходящих от сервера
                 *
                 * @protected
                 * @param {Object} srcAttr данные, пришедшие от сервера
                 * @returns {Object}
                 */
                adapter: function (srcAttr) {
                    return srcAttr;
                },

                /**
                 * Получение URL для AJAX запросов на сервер
                 *
                 * @protected
                 * @returns {String}
                 */
                getUrl: function () {
                    return (Cookie.get('_sp_model') || '') + this.url;
                },

                /**
                 * Получение данных, отправляемых на сервер при получении данных
                 *
                 * @protected
                 * @returns {Object}
                 */
                getFetchParams: function () {
                    var params = {};
                    params[this.uniqueKey] = this.get(this.uniqueKey);

                    return params;
                },

                /**
                 * Получение данных, отправляемых на сервер при сохраненнии
                 *
                 * @protected
                 * @returns {Object}
                 */
                getSaveParams: function () {
                    return Helpers.extend(true, {}, this.toJSON());
                },

                /**
                 * Получение данных, отправляемых на сервер при создании
                 *
                 * @protected
                 * @returns {Object}
                 */
                getCreateParams: function () {
                    return Helpers.extend(true, {}, this.toJSON());
                },

                /**
                 * Получение данных, отправляемых на сервер при удалении
                 *
                 * @protected
                 * @returns {Object}
                 */
                getRemoveParams: function () {
                    return Helpers.extend(true, {}, {
                        id: this.get('id')
                    });
                },

                /**
                 * Получение настроек AJAX запроса при получении данных
                 *
                 * @protected
                 * @returns {Object}
                 */
                getFetchSettings: function () {
                    return {
                        url: this.getUrl()
                    };
                },

                /**
                 * Получение настроек AJAX запроса при сохранении
                 *
                 * @protected
                 * @returns {Object}
                 */
                getSaveSettings: function () {
                    return {
                        url: this.getUrl(),
                        type: 'post'
                    };
                },

                /**
                 * Получение настроек AJAX запроса при создании
                 *
                 * @protected
                 * @returns {Object}
                 */
                getCreateSettings: function () {
                    return {
                        url: this.getUrl(),
                        type: 'post',
                        abortCaptcha: function () {
                            this.trigger('abortCaptcha');
                        }.bind(this)
                    };
                },

                /**
                 * Получение настроек AJAX запроса при удалении
                 *
                 * @protected
                 * @returns {Object}
                 */
                getRemoveSettings: function () {
                    return {
                        url: this.getUrl(),
                        type: 'post'
                    };
                }

            }
        }
    );

    return Model;
});
