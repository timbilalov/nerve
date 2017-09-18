import { EventEmitter } from './event';
import { Model } from './model';
export declare class Collection extends EventEmitter {
    protected items: Model[];
    protected url: string;
    protected fetchXHR: any;
    protected model: typeof Model;
    destroy(): this;
    fetch(): Promise<any>;
    abort(): this;
    isPending(): boolean;
    setResponse(response: any): Model[];
    getByAttr(attrKey: string, attrValue: any): Model;
    getArrayByAttr(attrKey: string, attrValue: any): Model[];
    getById(id: any): Model;
    getByClientId(cid: number): Model;
    getItems(): Model[];
    getByIndex(index: number): Model;
    add(model: Model): this;
    remove(id: any): this;
    removeByClientId(cid: number): this;
    forEach(iterator: (item: Model, index?: number) => void): this;
    map(iterator: (item: Model, index?: number) => void): any[];
    forEachAsync(iterator: (...args: any[]) => void, callback: () => void): this;
    filter(condition: () => boolean): Model[];
    clear(options: any): this;
    getLength(isAll: boolean): number;
    toJSON(): any[];
    protected getUrl(): string;
    protected adapter(data: any): any;
    protected getFetchParams(): any;
    protected getFetchSettings(): any;
}
