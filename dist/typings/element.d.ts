export declare class DomElement {
    protected el: Element;
    constructor(el: Element);
    getElement(): Element;
    val(): string;
    is(selector: string): boolean;
    closest(selector: string): DomElement[];
    find(selector: string): any;
    hasClass(className: string): boolean;
    attr(attrName: string): string;
    html(html?: string): string;
    scrollTo(x: number, y: number): void;
    on(event: string, handler: EventListenerOrEventListenerObject): void;
    off(event?: string, handler?: EventListenerOrEventListenerObject): void;
    empty(): void;
    appendTo($el: DomElement): void;
    addClass(className: string): void;
    removeClass(className: string): void;
}
