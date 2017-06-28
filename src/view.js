/*global requirejs*/
/*jslint nomen: true */

/**
 * Модуль представления
 *
 * @class
 * @name View
 * @abstract
 * @augments Event
 */

define([
    'jquery',
    'event',
    'utils/helpers'
], function (
    $,
    EventEmitter,
    Helpers
) {
    'use strict';

    var View,
        cachedTemplates = {};

    View = EventEmitter.extend({

        create: function () {

            /**
             * Модель, связанная с представлением
             *
             * @type {Model}
             * @memberOf View
             */
            this.model = this.options.model;

            /**
             * Корневой jQuery элемент
             *
             * @type {jQuery}
             * @memberOf View
             */
            this.$el = $();

            /**
             * jQuery элементы созданные при рендеринге
             *
             * @type {jQuery}
             * @memberOf View
             */
            this.$els = $();

            /**
             * Корневой Dom элемент
             *
             * @type {Element}
             * @memberOf View
             */
            this.el = null;

            /**
             * Обработчики событий на Dom элементах
             *
             * @type {Object}
             * @private
             * @memberOf View
             */
            this._domEventHandlers = {};

            /**
             * Обещание рендеринга
             *
             * @type {Promise}
             * @private
             * @memberOf View
             */
            this.promiseRender = new Promise(function (resolve) {
                this.on('render', resolve);
            }.bind(this));

            /**
             * Обещание загрузки css
             *
             * @type {Promise}
             * @private
             * @memberOf View
             */
            this.promiseCss = new Promise(function (resolve) {
                this.on('cssLoad', resolve);
            }.bind(this));

            Promise.all([this.promiseRender, this.promiseCss]).then(this.onViewReady.bind(this));

            this.loadCss();

            return this;
        },

        props: {

            /**
             * Массив подключаемых css файлов
             *
             * @type {Array.<String>}
             * @memberOf View
             */
            css: [],

            /**
             * События, назначающиеся Dom элементам
             *
             * @type {Object}
             * @memberOf View
             */
            events: {},

            /**
             * Кеширующиеся Dom элементы
             *
             * @type {Object}
             * @memberOf View
             */
            elements: {},

            /**
             * Селектор элемента, в котором находится JSON с опциями
             *
             * @type {String}
             * @memberOf View
             */
            optionsSelector: 'script[type="text/plain"]',

            /**
             * Автоматически удалять DOM-элемент при уничтожении
             *
             * @type {Boolean}
             * @memberOf View
             */
            autoRemove: true

        },

        public: {

            /**
             * Уничтожение
             *
             * @returns {View}
             * @memberOf View
             */
            destroy: function () {
                if (!this.isDestroyed) {
                    this.unDelegateEvents();

                    if (Helpers.isjQueryObject(this.$el)) {
                        this.$el.off();

                        if (this.autoInit && this.autoRemove) {
                            this.$el.remove();
                        }
                    }
                    if (Helpers.isjQueryObject(this.$els)) {
                        this.$els.off();

                        if (this.autoInit && this.autoRemove) {
                            this.$els.remove();
                        }
                    }

                    delete this.$el;
                    delete this.el;
                    delete this.model;
                    delete this._domEventHandlers;
                }

                View.__super__.destroy.call(this);

                return this;
            },

            /**
             * Получение корневого элемента
             *
             * @returns {jQuery}
             * @memberOf View
             */
            getElement: function () {
                return this.$el;
            },

            /**
             * Добавление обрабочика готовности
             *
             * @param {Function} callback обработчик
             * @returns {Promise}
             * @memberOf View
             */
            ready: function (callback) {
                return new Promise(function (resolve) {
                    if (this._isReady) {
                        resolve();
                        if (Helpers.isFunction(callback)) {
                            callback();
                        }
                    } else {
                        if (Helpers.isFunction(callback)) {
                            this.on('ready', callback);
                        }
                        this.on('ready', resolve);
                    }
                }.bind(this));
            },

            /**
             * Рендеринг шаблона
             *
             * @param {String} [options.template = 'main'] идентификатор шаблона или путь к нему
             * @param {String} [options.data] данные, передаваемые в шаблон
             * @param {String} options.type тип рендеринга (при значении 'plain' выполняется только непосредственно рендеринг и возвращается строка с html)
             * @param {Function} callback функция, в которую будет передан созданный jQuery элемент
             * @returns {Promise}
             * @memberOf View
             */
            render: function (options, callback) {
                var args = arguments;

                webConsole.time('before render');
                return new Promise(function (resolve) {
                    var templateId,
                        modelData,
                        data,
                        templatePath;

                    options = options || {};

                    if (Helpers.isFunction(options)) {
                        callback = options;
                        options = {};
                    }

                    if (Helpers.isPlainObject(options) && !options.template) {
                        options = {
                            data: options
                        };
                    }

                    if (Helpers.isString(options)) {
                        options = {
                            template: options
                        };
                        if (Helpers.isPlainObject(callback)) {
                            options.data = callback;
                            callback = args[2];
                        }
                    }

                    if (this.model) {
                        modelData = this.model.toJSON();
                    }


                    data = Helpers.extend(true, {}, modelData, options.data, {
                        locales: (this.options && this.options.locales) || options.locales,
                        options: this.options
                    });

                    templateId = options.template || 'main';

                    if (this.templates[templateId]) {
                        templatePath = this.templates[templateId];
                    } else {
                        templatePath = templateId;
                    }

                    webConsole.timeEnd('before render', '/logs/render');
                    if (templatePath) {
                        webConsole.time('require template');
                        this.constructor.getTemplate(templatePath, function (template) {
                            var html,
                                $html;

                            webConsole.timeEnd('require template', '/logs/render');
                            if (!this.isDestroyed) {
                                webConsole.time('handlebars');
                                html = template(data).trim();
                                webConsole.timeEnd('handlebars', '/logs/render');

                                if (options.type === 'plain') {
                                    resolve(html);
                                    if (Helpers.isFunction(callback)) {
                                        callback(html);
                                    }
                                } else {
                                    webConsole.time('after render');

                                    $html = html.string ? $(html.string) : $(html);

                                    if (templateId === 'main') {
                                        this.setElement($html);
                                    } else {
                                        if (this.options.isCollectElements) {
                                            this.$els = this.$els.add($html);
                                        }
                                        this.updateElements();
                                    }

                                    this._isRendered = true;
                                    this.delegateEvents();

                                    if (Helpers.isFunction(this.onRender) && templateId === 'main') {
                                        this.onRender();
                                    }
                                    webConsole.timeEnd('after render', '/logs/render');
                                    this.trigger('render', {
                                        templateId: templateId
                                    });

                                    resolve($html);
                                    if (Helpers.isFunction(callback)) {
                                        callback($html);
                                    }
                                }
                            }
                        }.bind(this));
                    }
                }.bind(this));
            },

            /**
             * Проверка отрендерен ли шаблон
             *
             * @returns {Boolean}
             * @memberOf View
             */
            isRendered: function () {
                return this._isRendered;
            },

            /**
             * Выполнение функции после рендеринга
             *
             * @param {Function} callback
             * @param {Boolean} [isSingle = false] выполнить обработчик только один раз
             * @memberOf View
             */
            rendered: function (callback, isSingle) {
                return new Promise(function (resolve) {
                    if (this.isRendered()) {
                        resolve();
                        if (Helpers.isFunction(callback)) {
                            callback();
                        }
                    } else {
                        if (Helpers.isFunction(callback)) {
                            this.on('render', callback, isSingle);
                        }
                        this.on('render', resolve);
                    }
                }.bind(this));
            },

            /**
             * Удаление отрендеренного Dom элемента
             *
             * @param {jQuery} $el Dom элемент для удаления
             * @memberOf View
             */
            remove: function ($el) {
                if (Helpers.isNode($el)) {
                    $el = $($el);
                }
                this.$els.each(function (index, el) {
                    if (el === $el.get(0)) {
                        this.$els.splice(index, 1);
                    }
                }.bind(this));
            }

        },

        protected: {

            /**
             * Установка корневого Dom элемента
             *
             * @param {jQuery} $el элемент
             * @returns {View}
             * @private
             * @memberOf View
             */
            setElement: function ($el) {
                if (Helpers.isjQueryObject($el)) {
                    this.$el = $el;
                    this.el = this.$el.get(0);
                } else if (Helpers.isNode($el)) {
                    this.$el = $($el);
                    this.el = $el;
                }

                this.updateElements();

                return this;
            },

            /**
             * Назначение обработчиков событий
             *
             * @returns {View}
             * @private
             * @memberOf View
             */
            delegateEvents: function () {
                if (!this.isDestroyed) {
                    this.unDelegateEvents();

                    Object.keys(this.events).forEach(function (eventItem) {
                        var eventData = eventItem.match(/^(\S+)(?: ([\w\W]*))?/),
                            eventHandlerData = this.events[eventItem],
                            isDelegate = true,
                            isThrottled = false,
                            isPreventDefault = false,
                            isStopPropagation = false,
                            throttling = 0,
                            handler,
                            eventType = eventData[1],
                            eventSelector = eventData[2],
                            $delegator;

                        if (Helpers.isString(eventHandlerData)) {
                            handler = this[eventHandlerData];
                        } else if (Helpers.isObject(eventHandlerData)) {
                            handler = this[eventHandlerData.method];
                            isDelegate = eventHandlerData.delegate !== false;
                            throttling = eventHandlerData.throttling;
                            isPreventDefault = eventHandlerData.preventDefault || false;
                            isStopPropagation = eventHandlerData.stopPropagation || false;
                        }

                        if (Helpers.isFunction(handler)) {
                            this._domEventHandlers[eventItem] = function (event, data) {
                                var $target;

                                if (isPreventDefault) {
                                    event.preventDefault();
                                }

                                if (isStopPropagation) {
                                    event.stopPropagation();
                                }

                                if (eventSelector) {
                                    if ($(event.target).is(eventSelector)) {
                                        $target = $(event.target);
                                    } else {
                                        $target = $(event.target).closest(eventSelector);
                                    }
                                } else {
                                    $target = this.$el;
                                }

                                if (throttling) {
                                    if (!isThrottled) {
                                        isThrottled = true;
                                        setTimeout(function () {
                                            isThrottled = false;
                                        }, throttling);
                                        handler.call(this, $target, event, data);
                                    }
                                } else {
                                    handler.call(this, $target, event, data);
                                }

                            }.bind(this);

                            if (eventType === 'input' && $.browser.msie && $.browser.version <= 11) {
                                eventType = 'keyup';
                            }

                            if (this.options.isCollectElements) {
                                $delegator = this.$el.add(this.$els);
                            } else {
                                $delegator = this.$el;
                            }

                            if (eventSelector) {
                                if (isDelegate) {
                                    $delegator.on(eventType, eventSelector, this._domEventHandlers[eventItem]);
                                } else {
                                    $delegator.find(eventSelector).on(eventType, this._domEventHandlers[eventItem]);
                                }
                            } else {
                                $delegator.on(eventType, this._domEventHandlers[eventItem]);
                            }
                        }
                    }.bind(this));
                }

                return this;
            },

            /**
             * Удаление обработчиков событий
             *
             * @returns {View}
             * @private
             * @memberOf View
             */
            unDelegateEvents: function () {
                if (!this.isDestroyed) {
                    Object.keys(this.events).forEach(function (eventItem) {
                        var eventData = eventItem.match(/^(\S+)(?: ([\w\W]*))?/),
                            eventType = eventData[1],
                            eventSelector = eventData[2];

                        if (this._domEventHandlers && Helpers.isFunction(this._domEventHandlers[eventItem]) && Helpers.isjQueryObject(this.$el)) {
                            if (eventSelector) {
                                this.$el.add(this.$els).off(eventType, eventSelector, this._domEventHandlers[eventItem]);
                            } else {
                                this.$el.add(this.$els).off(eventType, this._domEventHandlers[eventItem]);
                            }
                        }
                    }.bind(this));
                }

                return this;
            },

            /**
             * Обновление закешированных Dom элементов
             *
             * @private
             * @memberOf View
             */
            updateElements: function () {
                if (Helpers.isjQueryObject(this.$el)) {
                    Object.keys(this.elements).forEach(function (item) {
                        var selector = this.elements[item],
                            $el,
                            $filter;

                        if (this.options.isCollectElements) {
                            $el = this.$el.add(this.$els).find(selector).add(this.$els.filter(selector));

                            if ($el.size() === 0) {
                                $filter = this.$el.filter(selector);
                                if ($filter.size() !== 0) {
                                    $el = $filter;
                                }
                            }
                            if ($el.size() === 0) {
                                this.$els.each(function (index, el) {
                                    if ($(el).is(selector)) {
                                        $el = $(el);
                                    }
                                });
                            }
                        } else {
                            $el = this.$el.find(selector);
                        }

                        this['$' + item] = $el;
                    }.bind(this));
                }

                return this;
            },

            /**
             * Сброс отрендеренных элементов
             */
            clearEls: function () {
                this.$els = $();
                return this;
            },

            /**
             * Парсинг опций
             *
             * @private
             * @memberOf View
             */
            parseOptions: function () {
                var options;
                try {
                    options = JSON.parse(this.$el.find(this.optionsSelector).html().replace(/\r|\n|\t|\s{2,}/g, ''));
                } catch (err) {
                    options = {};
                }

                this.options = Helpers.extend(true, {}, this.defaultOptions, this.options, options);
            },

            /**
             * Загрузка css файлов
             *
             * @private
             * @memberOf View
             */
            loadCss: function () {
                var promises = [];

                this.css.forEach(function (item) {
                    promises.push(new Promise(function (resolve) {
                        window.requirejs(['util/css-manager'], function (CssManager) {
                            CssManager.require(item, resolve);
                        });
                    }));
                });
                Promise.all(promises).then(this.trigger.bind(this, 'cssLoad'));
            },

            /**
             * Обработчик готовности
             *
             * @private
             * @memberOf View
             */
            onViewReady: function () {
                this.trigger('ready');
                this._isReady = true;
            }

        },

        static: {

            create: function (options) {
                var self = new this(options);

                return {
                    onLoad: function ($el, isNotCallInit) {
                        self.setElement($el);
                        self.loadCss();
                        self.parseOptions();
                        self.delegateEvents();
                        if (!isNotCallInit) {
                            self.init();
                        }

                        return self;
                    },

                    onUnload: function () {
                        self.destroy();

                        return self;
                    }
                };
            },

            createRunTime: function (options, $el, isNotCallInit) {
                if (Helpers.isjQueryObject(options)) {
                    $el = options;
                    options = {};
                }
                if (Helpers.isNode(options)) {
                    $el = $(options);
                    options = {};
                }

                if (!Helpers.isjQueryObject($el) && Helpers.isNode($el)) {
                    $el = $($el);
                }

                return this.create(options).onLoad($el, isNotCallInit);
            },


            /**
             * Получение откомпилированного шаблона
             *
             * @param {String} templatePath путь к шаблону
             * @param callback функция, в которую будет передана функция-шаблон
             */
            getTemplate: function (templatePath, callback) {
                if (Helpers.isFunction(callback)) {
                    if (cachedTemplates[templatePath]) {
                        callback(cachedTemplates[templatePath]);
                    } else {
                        requirejs([templatePath], function (template) {
                            cachedTemplates[templatePath] = template;
                            callback(template);
                        });
                    }
                }
            },

            renderListPlain: function (options) {
                return new Promise(function (resolve) {
                    var promises;

                    promises = options.data.map(function (item) {
                        return this.prototype.render({
                            template: options.template,
                            locales: options.locales,
                            data: item,
                            type: 'plain'
                        });
                    }.bind(this));

                    Promise.all(promises).then(function (results) {
                        var html = results.join('');

                        if (Helpers.isFunction(options.callback)) {
                            options.callback(html);
                        }

                        resolve(html);
                    }.bind(this));
                }.bind(this));
            },

            renderList: function (options) {
                return new Promise(function (resolve) {
                    this.renderListPlain({
                        template: options.template || 'main',
                        data: options.data,
                        locales: options.locales
                    }).then(function (html) {
                        var element,
                            views = [],
                            result = {
                                html: html
                            },
                            viewOptions = options.viewOptions || {},
                            i = 0;

                        if (options.$container) {
                            element = options.$container.get(0).lastChild;
                            options.$container.append(html);

                            if (Helpers.isFunction(options.callback)) {
                                options.callback(result);
                            }
                            resolve(result);

                            if (!options.isNoCreateViews) {
                                if (!element) {
                                    element = options.$container.get(0).firstChild;
                                } else {
                                    element = element.nextSibling;
                                }

                                while (element) {
                                    if (options.models) {
                                        viewOptions.model = options.models[i];
                                    }

                                    views.push(this.createRunTime(Helpers.isArray(viewOptions) ? viewOptions[i] : viewOptions, element));
                                    element = element.nextSibling;
                                    i++;
                                }

                                if (Helpers.isFunction(options.onViewsCreated)) {
                                    options.onViewsCreated(views);
                                }
                            }
                        }
                    }.bind(this));
                }.bind(this));
            }

        }
    });

    return View;
});
