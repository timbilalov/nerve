/**
 * Базовая View для страничных модулей
 *
 * @class
 * @name Page
 * @abstract
 * @augments View
 */

define([
    'view',
    'router',
    'utils/ajax',
    'utils/helpers',
    'utils/cookie'
], function (
    View,
    Router,
    Ajax,
    Helpers,
    Cookie
) {
    'use strict';

    var Page = View.extend(
        {

            /** @lends Page.prototype */
            props: {

                /**
                 * URL загрузки страницы
                 *
                 * @type {String}
                 */
                url: '',

                /**
                 * Название страницы
                 *
                 * @type {String}
                 */
                pageName: '',

                /**
                 * Опции по умолчанию
                 *
                 * @type {Object}
                 * @property {Boolean} [isRunTimeCreated = false] страница создана в режиме выполнения (аяксовый переход)
                 * @property {Boolean} [isNoArgPrefix = true] не добавлять префикс arg_ к данным, передаваемым в ajax запросе за данными
                 * @property {String} [pageOptionsSelector = '.b-page-config'] селектор элемента, из которого парсятся опции страницы
                 */
                defaultOptions: {
                    isRunTimeCreated: false,
                    isNeedLoad: true,
                    loadDataType: 'json',
                    pageOptionsSelector: '.b-page-config'
                },

                /** @lends Page.prototype */
                vars: {

                    /**
                     * Состояние отменены запроса данных с сервера
                     *
                     * @type {Boolean}
                     */
                    isAbortedState: false,

                    /**
                     * Адаптированные данные, полученные от сервера
                     * 
                     * @type {Object}
                     */
                    pageResponse: {}
                }

            },

            /** @lends Page.prototype */
            public: {

                /**
                 * Инициализация страницы после загрузки и рендера
                 *
                 * @returns {Page}
                 */
                initPage: function () {
                    var $config = this.$el.find(this.options.pageOptionsSelector);

                    if ($config.length) {
                        this.pageOptions = JSON.parse($config.html().replace(/\r|\n|\t|\s{2,}/g, ''));
                    }

                    this.trigger('pageLoad', {
                        page: this.getPageName()
                    });

                    return this;
                },

                /**
                 * Установка опций (совмещение с текущими)
                 *
                 * @param {Object} options
                 * @returns {Page}
                 */
                setOptions: function (options) {
                    if (Helpers.isPlainObject(options)) {
                        Helpers.extend(true, this.options, options);
                    }

                    return this;
                },

                /**
                 * Ajax загрука страницы
                 */
                load: function () {
                    var settings = this.getLoadSettings();

                    this.xhr = Ajax.send(Helpers.extend(settings), {
                        data: this.getLoadParams()
                    })
                        .success(function (response) {
                            if (response.isRedirect) {
                                Router.go(response.location);
                            } else if (response.request && response.request.path !== window.location.pathname) {
                                Router.checkRoutes({
                                    url: response.request.path
                                }, true, response);
                            } else {
                                this.onLoadSuccess(response);
                            }
                        }.bind(this))
                        .error(function () {
                            this.onLoadError();
                        }.bind(this));
                },

                /**
                 * Отмена загрузки страницы
                 *
                 * @returns {Page}
                 */
                abort: function () {
                    this.isAbortedState = true;
                    this.xhr.abort();

                    return this;
                },

                /**
                 * Возвращает состояние текущей загрузки данных от сервера (true - загрузка выполняется, false - не выполняется)
                 *
                 * @returns {Boolean}
                 */
                isPending: function () {
                    return this.xhr && this.xhr.state() === 'pending';
                },

                /**
                 * Возвращает состояние отмены запроса данных с сервера
                 *
                 * @returns {boolean}
                 */
                isAborted: function () {
                    return this.isAbortedState;
                },

                /**
                 * Возвращает true, если страница создана в режиме выполнения (аяксовый переход) и false, если страница загружена первоначально (точка входа)
                 *
                 * @returns {Boolean}
                 */
                isRunTimeCreated: function () {
                    return this.options.isRunTimeCreated;
                },

                /**
                 * Возращает true, если для страницы необходимо загружать данные с сервера и false, если нет такой необходимости (для статических страниц)
                 * 
                 * @returns {Boolean}
                 */
                isNeedLoad: function () {
                    return this.options.isNeedLoad;
                },

                /**
                 * Устанавливает объект приложения
                 * 
                 * @param {App} app объект приложения
                 * @returns {Page}
                 */
                setApp: function (app) {
                    this.app = app;

                    return this;
                },

                /**
                 * Устанавливает название страницы
                 * 
                 * @param {String} pageName новое название
                 * @returns {Page}
                 */
                setPageName: function (pageName) {
                    this.pageName = pageName;

                    return this;
                },

                /**
                 * Возвращает название страницы
                 * 
                 * @returns {Boolean}
                 */
                getPageName: function () {
                    return this.pageName || false;
                },

                /**
                 * Получение заголовка
                 * 
                 * @returns {String}
                 */
                getTitle: function () {
                    return '';
                }
            },

            /** @lends Page.prototype */
            protected: {

                /**
                 * Получение URL для загрузки данных с сервера
                 * 
                 * @protected
                 * @returns {String}
                 */
                getUrl: function () {
                    return (Cookie.get('_sp_pages') || '') + this.url;
                },

                /**
                 * Адаптирование данных, полученных с сервера
                 *
                 * @protected
                 * @param {Object} response данные, полученные от сервера
                 * @returns {Object} адаптированные данные
                 */
                adapter: function (response) {
                    return response;
                },

                /**
                 * Получение адаптированных данных, полученных от сервера
                 * 
                 * @protected
                 * @returns {Object}
                 */
                getResponse: function () {
                    return this.pageResponse;
                },

                /**
                 * Установка адаптированных данных, полученных от сервера
                 * 
                 * @protected
                 * @param {Object} response адаптированные данные
                 * @returns {Page}
                 */
                setResponse: function (response) {
                    this.pageResponse = Helpers.extend({}, true, this.pageResponse, response);

                    return this;
                },

                /**
                 * Получение данных, отправляемых на сервер при загрузке страницы
                 *
                 * @protected
                 * @returns {Object}
                 */
                getLoadParams: function () {
                    return {};
                },

                /**
                 * Получение настроек AJAX запроса при загрузке страницы
                 *
                 * @protected
                 * @returns {Object}
                 */
                getLoadSettings: function () {
                    return {
                        url: this.getUrl(),
                        dataType: this.options.loadDataType
                    };
                },

                /**
                 * Установка заголовка страницы
                 *
                 * @protected
                 */
                setPageTitle: function () {
                    document.title = this.getTitle();
                },

                /**
                 * Обработчик успешной загрузке AJAX страницы
                 * 
                 * @protected
                 * @param {Object} response данные, полученные от сервера
                 */
                onLoadSuccess: function (response) {
                    this.setResponse(this.adapter(response));
                    this.setPageTitle();

                    this.render('main', this.getResponse());
                },

                /**
                 * Обработчик ошибки при загрузке AJAX страницы
                 *
                 * @protected
                 */
                onLoadError: function () {
                    this.trigger('error');
                }

            }
        }
    );

    return Page;

});