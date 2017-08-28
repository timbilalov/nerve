export class DomElement {

    protected el: Element;

    constructor(el: Element) {
        this.el = el;
    }

    getElement() {
        return this.el;
    }

    val(): string {
        return (<HTMLInputElement>this.el).value;
    }

    is(selector: string) {
        let isEqual = false;

        if (typeof selector === 'string') {
            if (this.el.parentElement) {
                Array.prototype.forEach.call(this.el.parentElement.querySelectorAll(selector), (item: Element) => {
                    if (item === this.el) {
                        isEqual = true;
                    }
                });
            }
        } else {
            isEqual = this.el === selector;
        }

        return isEqual;
    }

    closest(selector: string) {
        let el,
            elInstance,
            els = [];

        if (this.is(selector)) {
            els.push(this);
        }

        if (this.el.parentNode) {
            el = this.el.parentElement;

            while (el) {
                elInstance = new DomElement(el);
                if (elInstance.is(selector)) {
                    els.push(elInstance);
                }

                el = el.parentElement;
            }
        }

        return els;
    }

    find(selector: string) {
        return Array.prototype.map.call(this.el.querySelectorAll(selector), (el: Element) => new DomElement(el));
    }

    hasClass(className: string) {
        const classList: string[] = this.el.className.split(' ').map((className: string) => className.trim());

        return classList.indexOf(className) !== -1;
    }

    attr(attrName: string): string {
        return this.el.getAttribute(attrName);
    }

    html(html?: string): string {
        if (html) {
            this.el.innerHTML = html;
        }

        return this.el.innerHTML;
    }

    on(event: string, handler: EventListenerOrEventListenerObject) {
        this.el.addEventListener(event, handler);
    }

    off(event?: string, handler?: EventListenerOrEventListenerObject) {
        this.el.removeEventListener(event, handler);
    }

    empty() {
        this.el.innerHTML = '';
    }

    appendTo($el: DomElement) {
        $el.getElement().appendChild(this.el);
    }

    addClass(className: string) {
        this.el.classList.add(className);
    }

    removeClass(className: string) {
        this.el.classList.remove(className);
    }

}