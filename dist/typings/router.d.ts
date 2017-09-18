import { EventEmitter } from './event';
import { Page } from './page';
export declare class Router extends EventEmitter {
    protected routes: any;
    protected currentRoute: any;
    protected currentPage: Page;
    protected static instance: Router;
    constructor(options?: any);
    init(url: string): void;
    route(routeUrl: string, callback: any): void;
    checkRoutes(state: any, load: boolean, response?: any): void;
    error404(load: boolean, response: any): void;
    proccessingRoute(route: any, params: any, query: any, load: boolean, response: any): void;
    go(url: string): void;
    update(): void;
    onLinkClick(event: MouseEvent): boolean;
    static init(url: string): void;
    static on(event: string, handler: Function): any;
    static off(event: string, handler?: Function): any;
    static setOptions(options: any): void;
    static route(routes: any, options?: any): void;
    static go(url: string): void;
    static checkRoutes(state: any, load: boolean, response?: any): void;
    static error404(load: boolean, response?: any): void;
    static update(): void;
    static getCurrentPage(): Page;
}
