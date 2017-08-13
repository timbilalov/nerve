import {EventEmitter} from './event';
import {DomElement} from './element';
import {Helpers} from './utils/helpers';
import {Page} from './page';

export class Router extends EventEmitter {

    protected routes: any;
    protected currentRoute: any;
    protected currentPage: Page;

    protected static instance: Router = null;

    constructor(options?: any) {
        super(options);

        this.options = Helpers.extend({
            linkSelector: '[routeLink]',
            activeSelector: 'js-router-link_active',
            routes: {}
        }, this.options);

        this.routes = {};

        Object.keys(this.options.routes).forEach((route: string) => this.route(route, this.options.routes[route]));

        window.addEventListener('popstate', () => this.checkRoutes(window.history.state, true));

        document.body.addEventListener('click', (event) => {
            if (new DomElement(<Element> event.target).closest(this.options.linkSelector)) {
                this.onLinkClick(event);
            }
        });
    }

    init(url: string): void {
        this.checkRoutes({
            url: url
        }, false);
    }

    route(routeUrl: string, callback: any): void {
        var route: any,
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
    }

    checkRoutes(state: any, load: boolean, response?: any) {
        var url = (state && (state.url || state.hash)) || window.location.pathname,
            path = url
                .split('?')[0]
                .replace(/\/{2,}/g, '/'),
            query: any = {},
            isFound = false;

        if (url.indexOf('?') !== -1) {
            url.split('?')[1].split('&').forEach((item: string) => {
                var queryItem = item.split('=');

                query[queryItem[0]] = queryItem[1];
            });
        }

        Object.keys(this.routes).forEach((routeUrl: string) => {
            var regex = new RegExp(routeUrl),
                route = this.routes[routeUrl],
                paramValues: string[],
                params: any = {};

            if (regex.test(path)) {
                paramValues = regex.exec(path).slice(1);
                route.params.forEach((paramName: string, index: number) => params[paramName] = paramValues[index]);

                if (load && (route.reload || (this.currentRoute && this.currentRoute.reload))) {
                    location.reload();
                } else {
                    this.proccessingRoute(route, params, query, load, response);
                }

                this.currentRoute = route;

                isFound = true;
            }
        });

        if (!isFound && this.routes.default) {
            this.proccessingRoute(this.routes.default, {}, query, load, response);
        }
    }

    error404(load: boolean, response: any) {
        this.proccessingRoute(this.routes.error404, {}, {}, load, response);
    }

    proccessingRoute(route: any, params: any, query: any, load: boolean, response: any) {
        if (Helpers.isFunction(route.callback)) {
            route.callback(load, params);
        }
        if (Helpers.isString(route.module)) {
            this.require(route.module, (PageClass: typeof Page) => {
                var oldPage = this.currentPage;

                if (load) {
                    if (oldPage && oldPage.isPending()) {
                        oldPage.abort();
                    }

                    this.currentPage = new PageClass({
                        isRunTimeCreated: true,
                        request: {
                            url: location.pathname,
                            params: params,
                            query: query
                        }
                    });

                    this.trigger('route', {
                        page: this.currentPage,
                        isLoad: load
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
                        }.bind(this));
                    }.bind(this));
                } else {
                    this.currentPage = <Page> PageClass.createRunTime(
                        {
                            isRunTimeCreated: false,
                            request: {
                                params: params,
                                query: query
                            }
                        },
                        document.querySelector('[data-routing-page="' + route.module + '"]')
                    );

                    this.trigger('route', {
                        page: this.currentPage,
                        isLoad: load
                    });
                    this.currentPage.initPage();
                }
            });
        }
    }

    go(url: string) {
        window.history.pushState({
            url : url
        }, null, url);

        this.checkRoutes({
            url: url
        }, true);
    }

    update() {
        var url = window.location.pathname + window.location.search;

        this.go(url);
    }

    onLinkClick(event: MouseEvent) {
        let $target = new DomElement(<Element> event.target),
            $links = $target.closest(this.options.linkSelector),
            $link;

        if (!$links.length) {
            $link = $target;
        } else {
            $link = $links[0];
        }

        if (event.ctrlKey || event.shiftKey || event.metaKey) {
            return true;
        }

        event.preventDefault();
        event.stopPropagation();
        event.cancelBubble = true;

        if (!$link.hasClass(this.options.activeSelector)) {
            let href = $link.attr('href');

            if (href) {
                this.go(href.replace(/^http[s]?:\/\/[\w\d\._\-]+/, ''));
            }
        }

        return false;
    }

    static init(url: string) {
        if (!this.instance) {
            this.instance = new this();
        }

        this.instance.checkRoutes({
            url: url
        }, false);
    }

    static on(event: string, handler: Function) {
        if (!this.instance) {
            this.instance = new this();
        }

        return this.instance.on.apply(this.instance, arguments);
    }

    static off(event: string, handler?: Function) {
        if (!this.instance) {
            this.instance = new this();
        }

        return this.instance.off.apply(this.instance, arguments);
    }

    static setOptions(options: any) {
        if (!this.instance) {
            this.instance = new this(options);
        }

        this.instance.options = Helpers.extend({}, this.instance.options, options);
    }

    static route(routes: any, options?: any) {
        if (!this.instance) {
            this.instance = new this(options);
        }

        Object.keys(routes).forEach((route: string) => this.instance.route(route, routes[route]));
    }

    static go(url: string) {
        if (!this.instance) {
            this.instance = new this();
        }

        this.instance.go(url);
    }

    static checkRoutes(state: any, load: boolean, response?: any) {
        if (!this.instance) {
            this.instance = new this();
        }

        this.instance.checkRoutes(state, load, response);
    }

    static error404(load: boolean, response?: any) {
        if (!this.instance) {
            this.instance = new this();
        }

        this.instance.error404(load, response);
    }

    static update() {
        if (!this.instance) {
            this.instance = new this();
        }

        this.instance.update();
    }

    static getCurrentPage(): Page {
        var page = null;

        if (this.instance) {
            page = this.instance.currentPage;
        }

        return page;
    }

}