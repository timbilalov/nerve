/**
 * Модуль маршрутизатора
 *
 * @class
 * @name Router
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

    var Router = EventEmitter.extend({

        autoInit: true,

        props: {

            defaultOptions: {
                linkSelector: '.js-router-link,.sp-music-booster,[type="booster"]',
                activeSelector: 'js-router-link_active',
                routes: {}
            }

        },

        create: function () {
            this.routes = {};

            Object.keys(this.options.routes).forEach(function (route) {
                this.route(route, this.options.routes[route]);
            }.bind(this));

            $(window).on('popstate', function () {
                return this.checkRoutes(window.history.state, true);
            }.bind(this));

            $(document.body).on('click', this.options.linkSelector, this.onLinkClick.bind(this));
        },

        public: {

            init: function (url) {
                this.checkRoutes({
                    url: url
                }, false);
            },

            route: function (routeUrl, callback) {
                var route,
                    namedParams;

                if (Helpers.isFunction(callback)) {
                    route = {
                        callback: callback
                    };
                } else if (Helpers.isString(callback)) {
                    route = {
                        module: callback
                    };
                } else if (Helpers.isPlainObject(callback)) {
                    route = {
                        module: callback.module,
                        callback: callback.callback,
                        reload: callback.reload
                    };
                }

                if (route) {
                    route.params = [];
                    namedParams = routeUrl.match(/:\w+/g);
                    if (namedParams) {
                        namedParams.forEach(function (param) {
                            route.params.push(param.slice(1));
                        });
                    }
                    routeUrl = routeUrl
                        .replace(/:\w+/g, '([^\/]+)')
                        .replace(/\*\w+/g, '(.*?)');

                    if (['default', 'error404', 'error500'].indexOf(routeUrl) === -1) {
                        routeUrl = '^' + routeUrl + '$';
                    }

                    this.routes[routeUrl] = route;
                }
            },

            checkRoutes: function (state, load, response) {
                var url = (state && (state.url || state.hash)) || window.location.pathname,
                    path = url
                        .split('?')[0]
                        .replace(/\/{2,}/g, '/'),
                    query = {},
                    isFound = false;

                if (url.indexOf('?') !== -1) {
                    url.split('?')[1].split('&').forEach(function (item) {
                        var queryItem = item.split('=');

                        query[queryItem[0]] = queryItem[1];
                    });
                }

                Object.keys(this.routes).forEach(function (routeUrl) {
                    var regex = new RegExp(routeUrl),
                        route = this.routes[routeUrl],
                        paramValues,
                        params = {};

                    if (regex.test(path)) {
                        paramValues = regex.exec(path).slice(1);
                        route.params.forEach(function (paramName, index) {
                            params[paramName] = paramValues[index];
                        });

                        if (load && (route.reload || (this.currentRoute && this.currentRoute.reload))) {
                            location.reload();
                        } else {
                            this.proccessingRoute(route, params, query, load, response);
                        }

                        this.currentRoute = route;

                        isFound = true;
                    }
                }.bind(this));

                if (!isFound && this.routes.default) {
                    this.proccessingRoute(this.routes.default, {}, query, load, response);
                }
            },

            error404: function (load, response) {
                this.proccessingRoute(this.routes.error404, {}, {}, load, response);
            },

            proccessingRoute: function (route, params, query, load, response) {
                if (Helpers.isFunction(route.callback)) {
                    route.callback(load, params);
                }
                if (Helpers.isString(route.module)) {
                    this.require(route.module, function (Page) {
                        var oldPage = this.currentPage;

                        if (load) {
                            if (oldPage && oldPage.isPending()) {
                                oldPage.abort();
                            }

                            this.currentPage = new Page({
                                isRunTimeCreated: true,
                                request: {
                                    params: params,
                                    query: query
                                }
                            });

                            this.trigger('route', {
                                page: this.currentPage
                            });

                            if (this.currentPage.isNeedLoad()) {
                                if (!response) {
                                    this.currentPage.load();
                                } else {
                                    this.currentPage.setResponse(response);
                                    this.currentPage.onLoadSuccess();
                                }
                            } else {
                                this.currentPage.onLoadSuccess();
                            }

                            this.currentPage.on('render', function () {
                                if (oldPage) {
                                    oldPage.destroy();
                                }
                                setTimeout(function () {
                                    this.currentPage.initPage();
                                    this.currentPage.afterInitPage();
                                }.bind(this));
                            }.bind(this));
                        } else {
                            this.currentPage = Page.createRunTime(
                                {
                                    isRunTimeCreated: false,
                                    request: {
                                        params: params,
                                        query: query
                                    }
                                },
                                $('[data-routing-page="' + route.module + '"]'),
                                true
                            );

                            this.trigger('route', {
                                page: this.currentPage
                            });
                            this.currentPage.initPage();
                            this.currentPage.afterInitPage();
                        }
                    }.bind(this));
                }
            },

            go: function (url) {
                window.history.pushState({
                    url : url
                }, null, url);

                this.checkRoutes({
                    url: url
                }, true);
            },

            navigate: function (url) {
                this.go(url);
            },

            update: function () {
                var url = window.location.pathname + window.location.search;

                this.go(url);
            }

        },

        protected: {

            onLinkClick: function (event) {
                var $target = $(event.target),
                    $link = $target.closest(this.options.linkSelector);

                if (!$link.size()) {
                    $link = $target;
                }

                webConsole.time('full processing page');

                if (event.ctrlKey || event.shiftKey || event.metaKey) {
                    return true;
                }
                event.preventDefault();
                event.stopPropagation();
                event.cancelBubble = true;

                if (!$link.hasClass(this.options.activeSelector)) {
                    this.go($link.attr('href').replace(/^http[s]?:\/\/[\w\d\._\-]+/, ''));
                }

                return false;
            }

        },

        static: {

            instance: null,

            init: function (url) {
                if (!this.instance) {
                    this.instance = new this();
                }

                this.instance.checkRoutes({
                    url: url
                }, false);
            },

            on: function () {
                if (!this.instance) {
                    this.instance = new this();
                }

                return this.instance.on.apply(this.instance, arguments);
            },

            off: function () {
                if (!this.instance) {
                    this.instance = new this();
                }

                return this.instance.off.apply(this.instance, arguments);
            },

            setOptions: function (options) {
                if (!this.instance) {
                    this.instance = new this(options);
                }

                this.instance.options = Helpers.extend(true, {}, this.instance.options, options);
            },

            route: function (routes) {
                if (!this.instance) {
                    this.instance = new this();
                }

                Object.keys(routes).forEach(function (route) {
                    this.instance.route(route, routes[route]);
                }.bind(this));
            },

            default: function (defaultRoute) {
                if (!this.instance) {
                    this.instance = new this();
                }

                this.instance.default(defaultRoute);
            },

            go: function (url) {
                if (!this.instance) {
                    this.instance = new this();
                }

                this.instance.go(url);
            },

            checkRoutes: function (state, load, response) {
                if (!this.instance) {
                    this.instance = new this();
                }

                this.instance.checkRoutes(state, load, response);
            },

            error404: function (load, response) {
                if (!this.instance) {
                    this.instance = new this();
                }

                this.instance.error404(load, response);
            },

            update: function () {
                if (!this.instance) {
                    this.instance = new this();
                }

                this.instance.update();
            },

            getCurrentPage: function () {
                var page = null;

                if (this.instance) {
                    page = this.instance.currentPage;
                }

                return page;
            }

        }

    });

    return Router;

});