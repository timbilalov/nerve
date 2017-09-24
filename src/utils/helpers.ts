export class Helpers {
    /**
     * Проверка является ли переменная массивом
     *
     * @param {mixed} any
     * @returns {boolean}
     */
    static isArray(any: any) {
        return Array.isArray(any);
    }

    /**
     * Перевод в строковый тип
     *
     * @param {mixed} any
     * @returns {string}
     */
    static toString(any: any) {
        return Object.prototype.toString.call(any);
    }

    /**
     * Проверка является ли переменная функцией
     *
     * @param {mixed} any
     * @returns {boolean}
     */
    static isFunction(any: any) {
        return this.toString(any) === '[object Function]';
    }

    /**
     * Проверка является ли переменная dom-элементом
     *
     * @param {mixed} any
     * @returns {boolean}
     */
    static isNode(any: any) {
        return (any && any.nodeType) || this.isNodeList(any);
    }

    /**
     * Проверка является ли переменная списком dom-элементов
     *
     * @param {mixed} any
     * @returns {boolean}
     */
    static isNodeList(any: any) {
        return !this.isjQueryObject(any) && any && any[0] && any[0].nodeType;
    }

    /**
     * Проверка является ли переменная jQuery-элементом
     *
     * @param {mixed} any
     * @returns {boolean}
     */
    static isjQueryObject(any: any) {
        return false;
    }

    /**
     * Проверка является ли переменная объектом
     *
     * @param {mixed} any
     * @returns {boolean}
     */
    static isObject(any: any) {
        var result = false;
        if ((<any> window).Object) {
            result = any === (<any> window).Object(any) && !this.isNode(any) && !this.isFunction(any) && !this.isjQueryObject(any);
        } else {
            result = any && Helpers.toString(any) === '[object Object]' && !this.isNode(any) && !this.isFunction(any) && !this.isjQueryObject(any);
        }
        return result;
    }

    /**
     * Проверка является ли переменная простым объектом
     *
     * @param {mixed} any
     * @returns {boolean}
     */
    static isPlainObject(any: any) {
        return this.isObject(any);
    }

    /**
     * Проверка является ли переменная строкой
     *
     * @param {mixed} any
     * @returns {boolean}
     */
    static isString(any: any) {
        return this.toString(any) === '[object String]';
    }

    /**
     * Преобразование первого символа строки к верхнему регистру
     *
     * @param {string} str
     * @returns {string}
     */
    static capitalize(str: string) {
        return str.charAt(0).toUpperCase() + str.substr(1);
    }

    static extend(...args: any[]) {
        return (<any> Object).assign(...args);
    }

    /**
     * Преобразование данных в x-www-form-urlencoded
     *
     * @param data
     * @param {string} mainKey
     * @returns {string}
     */
    static toFormData(data: any, mainKey: string = '') {
        let form = '';

        if (mainKey) {
            mainKey += '.';
        }

        for (let key in data) {
            if (form != '') {
                form += '&';
            }

            if (Helpers.isObject(data[key])) {
                form += Helpers.toFormData(data[key], mainKey + key);
            } else {
                form += mainKey + key + '=' + encodeURIComponent(data[key]);
            }
        }

        return form;
    }

    static templateUrl(url: string, params: any): string {
        Object.keys(params).forEach((key: string) => {
            url = url.replace(`{${ key }}`, params[key]);
        });

        return url;
    }
}