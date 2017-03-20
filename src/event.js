/**
 * Базовый модуль, реализующий событийную модель
 *
 * @class
 * @name Event
 * @abstract
 */
define([
    'utils/event',
    'utils/helpers'
], function (
    Event,
    Helpers
) {
    'use strict';

    function EventEmitter(options) {

        /**
         * Параметры, собирающиеся из defaultOptions и переданных в аргументе
         *
         * @type {Object}
         */
        this.options = Helpers.extend(true, {}, this.defaultOptions, options);

        /**
         * Объект, реализующий работу с событиями
         *
         * @type {Event}
         * @protected
         */
        this._event = new Event();

        this
            .initVars()
            .generateAccessors();

        return this;
    }

    EventEmitter.prototype = {

        /**
         * Список свойств для автоматической генерации геттеров и сеттеров
         *
         * @type {Object}
         */
        accessors: {
            get: [],
            set: []
        },

        /**
         * Ининциализация
         *
         * @returns {EventEmitter}
         */
        init: function () {
            return this;
        },

        /**
         * Уничтожение
         *
         * @returns {EventEmitter}
         */
        destroy: function () {
            if (!this.isDestroyed) {
                this.trigger('destroy');
                this.off();

                delete this.options;
                delete this._event;

                this.isDestroyed = true;
            }

            return this;
        },

        /**
         * Подписка на событие
         *
         * @param {String} name название события
         * @param {Function} handler обработчик события
         * @returns {EventEmitter}
         */
        on: function () {
            if (this._event) {
                this._event.on.apply(this._event, arguments);
            }

            return this;
        },

        /**
         * Отписка от события
         *
         * @param {String} name название события
         * @param {Function} handler обработчик события
         * @returns {EventEmitter}
         */
        off: function () {
            if (this._event) {
                this._event.off.apply(this._event, arguments);
            }

            return this;
        },

        /**
         * Генерирование события
         *
         * @param {String} name название события
         * @param {*} data данные, передаваемые в обработчик
         * @returns {EventEmitter}
         */
        trigger: function () {
            if (this._event) {
                this._event.trigger.apply(this._event, arguments);
            }
            return this;
        },

        /**
         * Подгрузка модуля
         *
         * @param {String | Array.<String>} module название модуля
         * @param {Function} [callback] функция, в которую будет передан объект модуля
         * @returns {Promise}
         */
        require: function (module, callback) {
            var promises = [],
                modules = {},
                promise;

            if (!Helpers.isArray(module)) {
                promise = new Promise(function (resolve, reject) {
                    window.requirejs([this.deferred[module] || module], function () {
                        if (!this.isDestroyed) {
                            if (Helpers.isFunction(callback)) {
                                callback.apply(this, arguments);
                            }
                            resolve.apply(this, arguments);
                        }
                    }.bind(this));
                }.bind(this));
            } else {
                module.forEach(function (item) {
                    var moduleName;

                    promises.push(new Promise(function (resolve, reject) {
                        moduleName = this.deferred[item] || item;
                        window.requirejs([moduleName], function (Module) {
                            modules[moduleName] = Module;
                            resolve();
                        });
                    }.bind(this)));
                }.bind(this));

                promise = new Promise(function (resolve, reject) {
                    Promise.all(promises).then(function () {
                        var deps = [];

                        module.forEach(function (item) {
                            var moduleName = this.deferred[item] || item;

                            deps.push(modules[moduleName]);
                        }.bind(this));

                        if (!this.isDestroyed) {
                            resolve.apply(this, deps);
                            if (Helpers.isFunction(callback)) {
                                callback.apply(this, deps);
                            }
                        }
                    }.bind(this)).catch(reject);
                }.bind(this));
            }

            return promise;
        },

        /**
         * Инициализация перменных
         */
        initVars: function () {
            if (Helpers.isPlainObject(this.vars)) {
                Object.keys(this.vars).forEach(function (varName) {
                    this[varName] = this.vars[varName];
                }.bind(this));
            }

            return this;
        },

        /**
         * Генерирование геттеров и сеттеров
         */
        generateAccessors: function () {
            if (Helpers.isArray(this.accessors.get)) {
                this.accessors.get.forEach(function (item) {
                    this['get' + Helpers.capitalize(item)] = function () {
                        return this[item];
                    };
                }.bind(this));
            }

            if (Helpers.isArray(this.accessors.set)) {
                this.accessors.set.forEach(function (item) {
                    this['set' + Helpers.capitalize(item)] = function (value) {
                        this[item] = value;

                        return this;
                    };
                }.bind(this));
            }

            return this;
        }
    };

    EventEmitter.extend = function (proto) {
        var Parent = this,
            Child,
            Surrogate,
            props,
            publicMethods,
            protectedMethods,
            staticMethods;

        Child = function () {
            Parent.apply(this, arguments);

            if (Helpers.isFunction(proto.create)) {
                proto.create.apply(this, arguments);
            }

            if (Helpers.isFunction(proto._constructor)) {
                proto._constructor.apply(this, arguments);
            }

            if (proto.autoInit && !Child.instance) {
                this.autoInit = proto.autoInit;

                if (!this._inited && !this.isDestroyed) {
                    this.init();
                    this._inited = true;
                }
            }

            if (proto.singleton === true && !Child.instance) {
                Child.instance = this;
            }

            return Child.instance || this;
        };

        Helpers.extend(Child, Parent);

        Surrogate = function () {
            this.constructor = Child;
            this.__super__ = Parent.prototype;
        };
        Surrogate.prototype = Parent.prototype;
        Child.prototype = new Surrogate();
        Child.__super__ = Parent.prototype;

        publicMethods = proto.public || {};
        protectedMethods = proto.protected || {};
        staticMethods = proto.static || {};

        props = proto.props || {};

        props.defaultOptions = Helpers.extend(true, {}, Parent.prototype.defaultOptions, props.defaultOptions);
        props.deferred = Helpers.extend(true, {}, Parent.prototype.deferred, props.deferred);
        props.events = Helpers.extend(true, {}, Parent.prototype.events, props.events);
        props.defaults = Helpers.extend(true, {}, Parent.prototype.defaults, props.defaults);
        props.templates = Helpers.extend(true, {}, Parent.prototype.templates, props.templates);
        props.elements = Helpers.extend(true, {}, Parent.prototype.elements, props.elements);
        props.vars = Helpers.extend(true, {}, Parent.prototype.vars, props.vars);

        if (props.accessors) {
            if (Helpers.isArray(props.accessors.get)) {
                props.accessors.get = props.accessors.get.concat(Parent.prototype.accessors.get);
            }
            if (Helpers.isArray(props.accessors.set)) {
                props.accessors.set = props.accessors.set.concat(Parent.prototype.accessors.set);
            }
        }

        Helpers.extend(Child.prototype, Helpers.extend(true, {}, publicMethods, protectedMethods, props));
        Helpers.extend(true, Child, staticMethods);

        return Child;
    };

    return EventEmitter;
});
