/*jslint nomen:true*/

/**
 * Модуль коллекции
 *
 * @class
 * @name Collection
 * @abstract
 * @augments Event
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

    var Collection = EventEmitter.extend({

        create: function () {
            this.ajaxSettings = Helpers.extend(this.options.ajaxSettings, {
                url: this.options.url
            });
            this.ajaxParams = Helpers.extend(true, {}, this.options.ajaxParams);
            this.items = [];
            this.offset = 0;
            this.init();

            return this;
        },

        props: {

            /**
             * URL для получения данных
             *
             * @type {String}
             */
            url: '',

            /**
             * Параметры по умолчанию для всех коллекций
             *
             * @type {Object}
             * @property {Object} ajaxParams параметры отправляемые на сервер
             * @property {number} [limit = 50] параметр, лимитирующий размер выдачи
             * @property {String} [ajaxSettings.dataType = json] тип получаемых от сервера данных
             * @property {String} [ajaxSettings.type = get] http метод запроса на сервер
             * @private
             */
            defaultOptions: {
                ajaxParams: {},
                limit: 50,
                ajaxSettings: {
                    dataType : 'json',
                    type: 'get'
                }
            }
        },

        public: {

            /**
             * Уничтожение
             *
             * @returns {Collection}
             */
            destroy: function () {
                Collection.__super__.destroy.call(this);
                delete this.items;

                if (this.fetchXHR) {
                    this.fetchXHR.abort();
                    delete this.fetchXHR;
                }

                return this;
            },

            /**
             * Установка одного параметра
             *
             * @param {String} key название параметра
             * @param {String} value значение фильтра
             * @returns {Collection}
             */
            setParam: function (key, value) {
                this.ajaxParams[key] = value;

                return this;
            },

            /**
             * Установка нескольких параметра
             *
             * @param {String} key название параметра
             * @param {String} value значение фильтра
             * @returns {Collection}
             */
            setParams: function (params) {
                Object.keys(params).forEach(function (key) {
                    this.setParam(key, params[key]);
                }.bind(this));

                return this;
            },

            /**
             * Получение значения параметра
             *
             * @param {String} key название параметра
             * @returns {String}
             */
            getParam: function (key) {
                return this.ajaxParams[key];
            },

            /**
             * Удаление параметра
             *
             * @param {String} key название параметра
             * @returns {Collection}
             */
            removeParam: function (key) {
                delete this.ajaxParams[key];

                return this;
            },

            /**
             * Удаление всех параметров
             *
             * @param {String} key название параметра
             * @returns {Collection}
             */
            removeParams: function () {
                Object.keys(this.ajaxParams).forEach(function (item) {
                    this.removeParam(item);
                }.bind(this));

                return this;
            },

            /**
             * Получение данных с сервера
             *
             * @returns {Promise}
             */
            fetch: function () {
                return new Promise(function (resolve, reject) {
                    var userParams = this.getFetchParamsWithOffset(),
                        fetchSettings = this.getFetchSettings() || {},
                        userSettings = Helpers.extend({}, fetchSettings, {
                            url: this.getUrl(),

                            success: function (response) {
                                var items;

                                if (this.isDestroyed) {
                                    return;
                                }

                                if (Helpers.isString(response)) {
                                    response = JSON.parse(response);
                                } else if (!Helpers.isObject(response)) {
                                    response = {};
                                }

                                if (Helpers.isFunction(fetchSettings.success)) {
                                    fetchSettings.success(response);
                                }

                                items = this.setResponse(response);

                                this.trigger('fetched', {
                                    items: items,
                                    response: response
                                });

                                if (items.length === 0) {
                                    this.trigger('end');
                                }

                                resolve(items);
                            }.bind(this),

                            error: function (jqXHR, textStatus) {
                                if (Helpers.isFunction(fetchSettings.error)) {
                                    fetchSettings.error(jqXHR, textStatus);
                                }

                                this.trigger('fetched', {
                                    status: textStatus
                                });
                                reject(textStatus);
                            }.bind(this)
                        });

                    this.fetchXHR = Ajax.send(Helpers.extend(userSettings, {
                        data: userParams
                    }));
                }.bind(this));
            },

            abort: function () {
                if (this.fetchXHR) {
                    this.fetchXHR.abort();
                    this.trigger('aborted');
                }

                return this;
            },

            isPending: function () {
                return this.fetchXHR && this.fetchXHR.state() === 'pending';
            },

            setResponse: function (response) {
                var model,
                    models = [],
                    data = this.adapter(response),
                    offset = this.getOffsetByResponse(response);

                if (!Helpers.isArray(data.items)) {
                    return models;
                }

                data.items.forEach(function (item) {
                    model = new this.model();
                    model.set(item);
                    this.add(model);
                    models.push(model);
                }.bind(this));

                if (offset) {
                    this.offset = offset;
                } else {
                    this.offset += data.items.length;
                }

                return models;
            },

            getOffsetByResponse: function (response) {
                return response ? response.offset : 0;
            },

            getOffset: function () {
                return this.offset;
            },

            setOffset: function (offset) {
                this.offset = offset;

                return this;
            },

            /**
             * Адаптирование данных, приходящих от сервера
             *
             * @param {Object} data данные, пришедшие от сервера
             * @returns {Object}
             */
            adapter: function (data) {
                return data;
            },

            /**
             * Поиск модели по названию и значению атрибута
             *
             * @param {String} attrKey название атрибута
             * @param {String} attrValue значение
             * @returns {Model}
             */
            getByAttr: function (attrKey, attrValue) {
                var model = null;

                this.items.forEach(function (item) {
                    if ((!isNaN(Number(item.get(attrKey))) && Number(item.get(attrKey)) === Number(attrValue)) || (String(item.get(attrKey)) === String(attrValue))) {
                        model = item;
                    }
                });

                return model;
            },
            getArrayByAttr: function (attrKey, attrValue) {
                var models = [];

                this.items.forEach(function (item) {
                    if ((!isNaN(Number(item.get(attrKey))) && Number(item.get(attrKey)) === Number(attrValue)) || (String(item.get(attrKey)) === String(attrValue))) {
                        models.push(item);
                    }
                });

                return models;
            },

            /**
             * Поиск по идентификатору модели
             *
             * @param {Numner | String} id идентификатор
             * @returns {Model}
             * @memberOf Collection
             */
            getById: function (id) {
                return this.getByAttr('id', id);
            },

            /**
             * Поиск по клиентскому идентификатору модели
             *
             * @param {Numner} cid клиентский идентификатор
             * @returns {Model}
             * @memberOf Collection
             */
            getByClientId: function (cid) {
                var result = null;

                this.items.forEach(function (item, index) {
                    if (item.cid === cid) {
                        result = item;
                    }
                }.bind(this));

                return result;
            },

            /**
             * Получение массива моделей
             *
             * @returns {Array}
             * @memberOf Collection
             */
            getItems: function () {
                return this.items;
            },

            /**
             * Получение элемента по индексу
             *
             * @param {Number} index индекс
             * @returns {Model}
             * @memberOf Collection
             */
            getByIndex: function (index) {
                return this.items[index];
            },

            /**
             * Добавление модели в коллекцию
             *
             * @param {Model} model объект модели
             * @memberOf Collection
             */
            add: function (model) {
                this.items.push(model);

                this.trigger('add');
                this.trigger('change');

                return this;
            },

            /**
             * Удаление модели из коллекции
             *
             * @param {Number | String} id идентификатор модели
             * @memberOf Collection
             */
            remove: function (id) {
                this.items.forEach(function (item, index) {
                    if (item.get('id') === id) {
                        this.items.splice(index, 1);
                        this.trigger('remove', {
                            id: item.id,
                            cid: item.cid
                        });
                        this.trigger('change');
                    }
                }.bind(this));

                return this;
            },

            /**
             * Удаление модели из коллекции по клиентскому идентификатору
             *
             * @param {Number | String} cid клиентский идентификатор модели
             * @memberOf Collection
             */
            removeByClientId: function (cid) {
                this.items.forEach(function (item, index) {
                    if (item.cid === cid) {
                        this.items.splice(index, 1);
                        this.trigger('remove', {
                            id: item.id,
                            cid: item.cid
                        });
                        this.trigger('change');
                    }
                }.bind(this));

                return this;
            },

            /**
             * Обход коллеции заданным итератором
             *
             * @param {Function} iterator итератор
             * @memberOf Collection
             */
            forEach: function (iterator) {
                this.items.forEach(iterator);

                return this;
            },

            /**
             * Преобразование коллекции заданным итератором
             *
             * @param {Function} iterator итератор
             * @returns {Array}
             * @memberOf Collection
             */
            map: function (iterator) {
                return this.items.map(iterator);
            },

            /**
             * Асинхронный обход коллекции
             *
             * @param {Function} iterator функция итератор
             * @param {Function} callback функция, которая будет вызвана просле обхода
             * @memberOf Collection
             */
            forEachAsync: function (iterator, callback) {
                var step = function (iterator, index) {
                    if (this.getLength(true) > index) {
                        iterator(this.items[index], index, step.bind(this, iterator, index + 1));
                    } else {
                        if (Helpers.isFunction(callback)) {
                            callback();
                        }
                    }
                };

                if (this.getLength(true)) {
                    iterator(this.items[0], 0, step.bind(this, iterator, 1));
                }

                return this;
            },

            /**
             * Фильтрация коллекции
             *
             * @param {Function} condition функция с условием фильтрации
             * @memberOf Collection
             */
            filter: function (condition) {
                return this.items.filter(condition);
            },

            /**
             * Очищение коллекции
             *
             * @param {Boolean} [options.destroy}
             * @memberOf Collection
             */
            clear: function (options) {
                options = Helpers.extend({
                    destroy: true
                }, options);

                if (options.destroy) {
                    this.forEach(function (item) {
                        item.destroy();
                    });
                }

                this.items = [];
                this.offset = 0;

                return this;
            },

            /**
             * Получение количества элементов в коллекции
             *
             * @params {Boolean} [isAll = false] не исключать удаленные
             * @return {Number}
             * @memberOf Collection
             */
            getLength: function (isAll) {
                var items;

                if (isAll) {
                    items = this.items;
                } else {
                    items = this.items.filter(function (item) {
                        return !item.isRemoved();
                    });
                }

                return items.length;
            },

            /**
             * Получения ограничения загрузки
             *
             * @returns {Number}
             * @memberOf Collection
             */
            getLimit: function () {
                return this.limit || this.options.limit;
            },

            /**
             * Установка ограничения загрузки
             *
             * @params {Number} limit количество загружаемых за раз элементов
             * @memberOf Collection
             */
            setLimit: function (limit) {
                this.limit = limit;

                return this;
            },

            /**
             * Получение элементов в виде массива объектов, состоящих из атрибутов моделей
             *
             * @returns {Array.<Object>}
             * @memberOf Collection
             */
            toJSON: function () {
                var json = [];

                this.forEach(function (model) {
                    json.push(model.toJSON());
                });

                return json;
            }

        },

        protected: {

            /**
             * Получение URL для AJAX запросов на сервер
             *
             * @returns {String}
             * @protected
             */
            getUrl: function () {
                return (Cookie.get('_sp_model') || '') + this.options.url;
            },

            /**
             * Получение данных, отправляемых на сервер при получении данных
             *
             * @returns {Object}
             */
            getFetchParams: function () {
                return this.ajaxParams;
            },

            /**
             * Получение данных, отправляемых на сервер при получении данных с добавление offset
             *
             * @returns {Object}
             */
            getFetchParamsWithOffset: function () {
                return Helpers.extend({}, this.ajaxParams, this.getFetchParams(), {
                    offset: this.offset,
                    limit: this.getLimit()
                });
            },

            /**
             * Получение настроек AJAX запроса при получении данных
             *
             * @returns {Object}
             */
            getFetchSettings: function () {
                return Helpers.extend({
                    url: this.getUrl()
                }, this.ajaxSettings);
            }
        }

    });

    return Collection;

});
