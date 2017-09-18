export declare class Event {
    protected listeners: any;
    on(name: string, data: any, handler?: Function): this;
    one(name: string, handler: Function): this;
    off(name: string, handler?: Function): this;
    trigger(name: string, data?: any): this;
}
