import {EventEmitter} from './event';
import {Model} from './model';
import {DomElement} from './element';
import {Helpers} from './utils/helpers';

export class View extends EventEmitter {

    protected model: Model;
    protected $el: DomElement;
    protected _domEventHandlers: any;
    protected promiseRender: Promise<any>;
    protected promiseCss: Promise<any>;
    protected _isReady = false;
    protected _isRendered = false;
    protected template: string;
    protected events: any = {};
    protected elements: any = {};
    protected css: string[] = [];
    protected optionsSelector = 'script[type="text/plain"]';

    constructor(options?: any) {
        super(options);

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
        this.$el = null;

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
        this.promiseRender = new Promise((resolve: Function, reject: Function) => {
            this.on('render', resolve);
        });

        /**
         * Обещание загрузки css
         *
         * @type {Promise}
         * @private
         * @memberOf View
         */
        this.promiseCss = new Promise((resolve: Function, reject: Function) => {
            this.on('cssLoad', resolve);
        });

        Promise.all([this.promiseRender, this.promiseCss]).then(this.onViewReady.bind(this));

        this.loadCss();

        return this;
    }

    init() {
        return this;
    }

    /**
     * Уничтожение
     *
     * @returns {View}
     * @memberOf View
     */
    destroy() {
        if (!this.isDestroyed) {
            this.unDelegateEvents();

            if (Helpers.isjQueryObject(this.$el)) {
                this.$el.off();
            }

            delete this.$el;
            delete this.model;
            delete this._domEventHandlers;
        }

        super.destroy();

        return this;
    }

    /**
     * Получение корневого элемента
     *
     * @returns {jQuery}
     * @memberOf View
     */
    getElement() {
        return this.$el;
    }

    /**
     * Добавление обрабочика готовности
     *
     * @param {Function} callback обработчик
     * @returns {Promise}
     * @memberOf View
     */
    ready(callback: Function) {
        return new Promise((resolve: Function, reject: Function) => {
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
        });
    }

    getTemplateUrl(): string {
        return this.template;
    }

    setTemplateUrl(url: string) {
        this.template = url;
    }

    /**
     * Рендеринг шаблона
     */
    render(vars: any) {
        vars = vars || {};

        return new Promise((resolve: Function, reject: Function) => {
            let modelData,
                data: any;

            if (this.model) {
                modelData = this.model.toJSON();
            }


            data = Helpers.extend({}, modelData, vars, {
                locales: (this.options && this.options.locales) || vars.locales || {},
                options: this.options
            });

            (<any> window).requirejs([this.getTemplateUrl()], (template: Function) => {
                let html,
                    $html,
                    element: Element = document.createElement('div');

                if (!this.isDestroyed) {
                    html = template(data).trim();

                    element.innerHTML = html;
                    $html = new DomElement(element.firstElementChild);

                    this.setElement($html);

                    this._isRendered = true;
                    this.delegateEvents();

                    this.trigger('render');

                    resolve($html);
                }
            });
        });
    }

    /**
     * Проверка отрендерен ли шаблон
     *
     * @returns {Boolean}
     * @memberOf View
     */
    isRendered() {
        return this._isRendered;
    }

    /**
     * Выполнение функции после рендеринга
     *
     * @param {Function} callback
     * @param {Boolean} [isSingle = false] выполнить обработчик только один раз
     * @memberOf View
     */
    rendered(callback: Function, isSingle?: boolean) {
        return new Promise((resolve: Function, reject: Function) => {
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
        });
    }

    /**
     * Установка корневого Dom элемента
     *
     * @param {jQuery} $el элемент
     * @returns {View}
     * @private
     * @memberOf View
     */
    setElement($el: DomElement) {
        this.$el = $el;

        this.updateElements();

        return this;
    }

    /**
     * Назначение обработчиков событий
     *
     * @returns {View}
     * @private
     * @memberOf View
     */
    protected delegateEvents() {
        if (!this.isDestroyed) {
            this.unDelegateEvents();

            Object.keys(this.events).forEach((eventItem: any) => {
                var eventData = eventItem.match(/^(\S+)(?: ([\w\W]*))?/),
                    eventHandlerData = this.events[eventItem],
                    isDelegate = true,
                    isThrottled = false,
                    isPreventDefault = false,
                    isStopPropagation = false,
                    throttling = 0,
                    handler: Function,
                    eventType = eventData[1],
                    eventSelector = eventData[2],
                    $delegator;

                if (Helpers.isString(eventHandlerData)) {
                    handler = (<any> this)[eventHandlerData];
                } else if (Helpers.isObject(eventHandlerData)) {
                    handler = (<any> this)[eventHandlerData.method];
                    isDelegate = eventHandlerData.delegate !== false;
                    throttling = eventHandlerData.throttling;
                    isPreventDefault = eventHandlerData.preventDefault || false;
                    isStopPropagation = eventHandlerData.stopPropagation || false;
                }

                if (Helpers.isFunction(handler)) {
                    this._domEventHandlers[eventItem] = function (event: Event, data: any) {
                        let $target = new DomElement(<Element> event.target);

                        if (isPreventDefault) {
                            event.preventDefault();
                        }

                        if (isStopPropagation) {
                            event.stopPropagation();
                        }

                        if (eventSelector) {
                            if (!$target.is(eventSelector)) {
                                $target = $target.closest(eventSelector)[0];
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

                    // if (eventType === 'input') {
                    //     eventType = 'keyup';
                    // }

                    // if (this.options.isCollectElements) {
                    //     $delegator = this.$el.add(this.$els);
                    // } else {
                    //     $delegator = this.$el;
                    // }

                    if (eventSelector) {
                        this.$el.find(eventSelector).forEach(($el: DomElement) => {
                            $el.on(eventType, this._domEventHandlers[eventItem]);
                        });
                    } else {
                        this.$el.on(eventType, this._domEventHandlers[eventItem]);
                    }
                }
            });
        }

        return this;
    }

    /**
     * Удаление обработчиков событий
     *
     * @returns {View}
     * @private
     * @memberOf View
     */
    protected unDelegateEvents() {
        if (!this.isDestroyed) {
            Object.keys(this.events).forEach((eventItem: string) => {
                var eventData = eventItem.match(/^(\S+)(?: ([\w\W]*))?/),
                    eventType = eventData[1];

                if (this._domEventHandlers && Helpers.isFunction(this._domEventHandlers[eventItem]) && Helpers.isjQueryObject(this.$el)) {
                    this.$el.off(eventType, this._domEventHandlers[eventItem]);
                }
            });
        }

        return this;
    }

    /**
     * Обновление закешированных Dom элементов
     *
     * @private
     * @memberOf View
     */
    protected updateElements() {
        if (this.$el) {
            Object.keys(this.elements).forEach((item: string) => {
                var selector = this.elements[item],
                    $el,
                    $find;

                $find = this.$el.find(selector);

                if ($find.length === 1) {
                    $el = $find[0]
                } else {
                    $el = $find;
                }

                (<any> this)['$' + item] = $el;
            });
        }

        return this;
    }

    /**
     * Парсинг опций
     *
     * @private
     * @memberOf View
     */
    protected parseOptions() {
        var options;
        try {
            options = JSON.parse(this.$el.find(this.optionsSelector).html().replace(/\r|\n|\t|\s{2,}/g, ''));
        } catch (err) {
            options = {};
        }

        this.options = Helpers.extend({}, this.defaultOptions, this.options, options);
    }

    /**
     * Загрузка css файлов
     *
     * @private
     * @memberOf View
     */
    protected loadCss() {
        var promises: Promise<any>[] = [];

        this.css.forEach(function (item) {
            promises.push(new Promise((resolve: Function, reject: Function) => {
                (<any> window).requirejs(['util/css-manager'], function (CssManager: any) {
                    CssManager.require(item, resolve);
                });
            }));
        });

        Promise.all(promises).then(this.trigger.bind(this, 'cssLoad'));
    }

    /**
     * Обработчик готовности
     *
     * @private
     * @memberOf View
     */
    protected onViewReady() {
        this.trigger('ready');
        this._isReady = true;
    }

    static createRunTime(options: any, $el?: any) {
        let module;

        if (Helpers.isNode(options)) {
            $el = options;
            options = {};
        }

        if (options instanceof DomElement) {
            $el = options.getElement();
            options = {};
        }

        module = new this(options);
        module.setElement(new DomElement($el));
        module.parseOptions();
        module.delegateEvents();
        module.init();

        return module;
    }

}
