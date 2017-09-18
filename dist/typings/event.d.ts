import { Event } from './utils/event';
export declare class EventEmitter {
    protected options: any;
    protected defaultOptions: any;
    protected _event: Event;
    protected deferred: any;
    isDestroyed: boolean;
    constructor(options?: any);
    destroy(): this;
    on(name: string, handler: Function, isSingle?: boolean): this;
    off(): this;
    trigger(name: string, data?: any): this;
    require(module: string | string[], callback: Function): Promise<{}>;
}
