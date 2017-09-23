import {EventEmitter} from './event';
import {Helpers} from './utils/helpers';
import {Model} from './model';
import {Http} from './utils/http';
import {AxiosResponse} from 'axios';

export class Collection<T> extends EventEmitter {

    protected items: T[] = [];
    protected url: string;
    protected fetchXHR: any;
    protected model: typeof Model;

    /**
     * Уничтожение
     *
     * @returns {Collection}
     */
    destroy() {
        super.destroy();

        delete this.items;

        if (this.fetchXHR) {
            this.fetchXHR.abort();
            delete this.fetchXHR;
        }

        return this;
    }

    /**
     * Получение данных с сервера
     *
     * @returns {Promise}
     */
    fetch(): Promise<any> {
        return new Promise((resolve, reject) => {
            const settings = this.getFetchSettings();

            this.fetchXHR = Http.get(settings.url, {
                params: this.getFetchParams()
            })
                .then((response: AxiosResponse) => {
                    let items;

                    if (this.isDestroyed) {
                        return;
                    }

                    if (Helpers.isString(response.data)) {
                        response.data = JSON.parse(response.data);
                    } else if (!Helpers.isObject(response.data)) {
                        response.data = {};
                    }

                    items = this.setResponse(response.data);

                    this.trigger('fetched', {
                        items: items,
                        response: response
                    });

                    if (items.length === 0) {
                        this.trigger('end');
                    }

                    resolve(items);
                });
        });
    }

    abort() {
        if (this.fetchXHR) {
            this.fetchXHR.abort();
            this.trigger('aborted');
        }

        return this;
    }

    isPending() {
        return this.fetchXHR && this.fetchXHR.state() === 'pending';
    }

    setResponse(response: any) {
        var model,
            models: T[] = [],
            data = this.adapter(response);

        if (!Helpers.isArray(data.items)) {
            return models;
        }

        data.items.forEach((item: any) => {
            model = new (<any> this.model)();
            model.set(item);
            this.add(model);
            models.push(model);
        });

        // if (offset) {
        //     this.offset = offset;
        // } else {
        //     this.offset += data.items.length;
        // }

        return models;
    }

    // getOffsetByResponse(response) {
    //     return response ? response.offset : 0;
    // }
    //
    // getOffset: function () {
    //     return this.offset;
    // },
    //
    // setOffset: function (offset) {
    //     this.offset = offset;
    //
    //     return this;
    // },


    /**
     * Поиск модели по названию и значению атрибута
     *
     * @param {String} attrKey название атрибута
     * @param {String} attrValue значение
     * @returns {Model}
     */
    getByAttr(attrKey: string, attrValue: any): T {
        var model: T = null;

        this.items.forEach(function (item) {
            if ((!isNaN(Number((<any> item)[attrKey])) && Number((<any> item)[attrKey]) === Number(attrValue)) || (String((<any> item)[attrKey]) === String(attrValue))) {
                model = item;
            }
        });

        return model;
    }

    getArrayByAttr(attrKey: string, attrValue: any): T[] {
        var models: T[] = [];

        this.items.forEach(function (item) {
            if ((!isNaN(Number((<any> item)[attrKey])) && Number((<any> item)[attrKey]) === Number(attrValue)) || (String((<any> item)[attrKey])) === String(attrValue)) {
                models.push(item);
            }
        });

        return models;
    }

    /**
     * Поиск по идентификатору модели
     *
     * @param {Numner | String} id идентификатор
     * @returns {Model}
     * @memberOf Collection
     */
    getById(id: any): T {
        return this.getByAttr('id', id);
    }

    /**
     * Поиск по клиентскому идентификатору модели
     *
     * @param {Numner} cid клиентский идентификатор
     * @returns {Model}
     * @memberOf Collection
     */
    getByClientId(cid: number): T {
        var result = null;

        this.items.forEach((item: T, index: number) => {
            if ((<any> item).cid === cid) {
                result = item;
            }
        });

        return result;
    }

    /**
     * Получение массива моделей
     *
     * @returns {Array}
     * @memberOf Collection
     */
    getItems(): T[] {
        return this.items;
    }

    /**
     * Получение элемента по индексу
     *
     * @param {Number} index индекс
     * @returns {Model}
     * @memberOf Collection
     */
    getByIndex(index: number): T {
        return this.items[index];
    }

    /**
     * Добавление модели в коллекцию
     *
     * @param {Model} model объект модели
     * @memberOf Collection
     */
    add(model: T) {
        this.items.push(model);

        this.trigger('add');
        this.trigger('change');

        return this;
    }

    /**
     * Удаление модели из коллекции
     *
     * @param {Number | String} id идентификатор модели
     * @memberOf Collection
     */
    remove(id: any) {
        this.items.forEach((item: T, index: number) => {
            if ((<any> item).id === id) {
                this.items.splice(index, 1);
                this.trigger('remove', {
                    id: (<any> item).id,
                    cid: (<any> item).cid
                });
                this.trigger('change');
            }
        });

        return this;
    }

    /**
     * Удаление модели из коллекции по клиентскому идентификатору
     *
     * @param {Number | String} cid клиентский идентификатор модели
     * @memberOf Collection
     */
    removeByClientId(cid: number) {
        this.items.forEach((item: T, index: number) => {
            if ((<any> item).cid === cid) {
                this.items.splice(index, 1);
                this.trigger('remove', {
                    id: (<any> item).id,
                    cid: (<any> item).cid
                });
                this.trigger('change');
            }
        });

        return this;
    }

    /**
     * Обход коллеции заданным итератором
     *
     * @param {Function} iterator итератор
     * @memberOf Collection
     */
    forEach(iterator: (item: T, index?: number) => void) {
        this.items.forEach(iterator);

        return this;
    }

    /**
     * Преобразование коллекции заданным итератором
     *
     * @param {Function} iterator итератор
     * @returns {Array}
     * @memberOf Collection
     */
    map(iterator: (item: T, index?: number) => void): any[] {
        return this.items.map(iterator);
    }

    /**
     * Асинхронный обход коллекции
     *
     * @param {Function} iterator функция итератор
     * @param {Function} callback функция, которая будет вызвана просле обхода
     * @memberOf Collection
     */
    forEachAsync(iterator: (...args: any[]) => void, callback: () => void) {
        const step = function (iterator: (...args: any[]) => void, index: number) {
            if (this.getLength(true) > index) {
                iterator(this.items[index], index, step.bind(this, iterator, index + 1));
            } else {
                if (Helpers.isFunction(callback)) {
                    callback();
                }
            }
        };

        if (this.getLength(true)) {
            iterator(this.items[0], 0, step.bind(this, iterator, 1));
        }

        return this;
    }

    /**
     * Фильтрация коллекции
     *
     * @param {Function} condition функция с условием фильтрации
     * @memberOf Collection
     */
    filter(condition: () => boolean) {
        return this.items.filter(condition);
    }

    /**
     * Очищение коллекции
     *
     * @param {Boolean} [options.destroy}
     * @memberOf Collection
     */
    clear(options: any) {
        options = Helpers.extend({
            destroy: true
        }, options);

        if (options.destroy) {
            this.forEach((item: T) => {
                (<any> item).destroy();
            });
        }

        this.items = [];
        // this.offset = 0;

        return this;
    }

    /**
     * Получение количества элементов в коллекции
     *
     * @params {Boolean} [isAll = false] не исключать удаленные
     * @return {Number}
     * @memberOf Collection
     */
    getLength(isAll: boolean) {
        let items;

        if (isAll) {
            items = this.items;
        } else {
            items = this.items.filter(function (item) {
                return !(<any> item).isRemoved();
            });
        }

        return items.length;
    }

    // /**
    //  * Получения ограничения загрузки
    //  *
    //  * @returns {Number}
    //  * @memberOf Collection
    //  */
    // getLimit() {
    //     return this.limit || this.options.limit;
    // }
    //
    // /**
    //  * Установка ограничения загрузки
    //  *
    //  * @params {Number} limit количество загружаемых за раз элементов
    //  * @memberOf Collection
    //  */
    // setLimit: function (limit) {
    //     this.limit = limit;
    //
    //     return this;
    // },

    /**
     * Получение элементов в виде массива объектов, состоящих из атрибутов моделей
     *
     * @returns {Array.<Object>}
     * @memberOf Collection
     */
    toJSON() {
        let json: any[] = [];

        this.forEach((model) => json.push((<any> model).toJSON()));

        return json;
    }

    /**
     * Получение URL для AJAX запросов на сервер
     *
     * @returns {String}
     * @protected
     */
    protected getUrl(): string {
        return this.options.url || this.url;
    }

    /**
     * Адаптирование данных, приходящих от сервера
     *
     * @param {Object} data данные, пришедшие от сервера
     * @returns {Object}
     */
    protected adapter(data: any): any {
        return data;
    }

    /**
     * Получение данных, отправляемых на сервер при получении данных
     *
     * @returns {Object}
     */
    protected getFetchParams(): any {
        return {};
    }

    // /**
    //  * Получение данных, отправляемых на сервер при получении данных с добавление offset
    //  *
    //  * @returns {Object}
    //  */
    // protected getFetchParamsWithOffset: function () {
    //     return Helpers.extend({}, this.ajaxParams, this.getFetchParams(), {
    //         offset: this.offset,
    //         limit: this.getLimit()
    //     });
    // },

    /**
     * Получение настроек AJAX запроса при получении данных
     *
     * @returns {Object}
     */
    protected getFetchSettings(): any {
        return Helpers.extend({
            url: this.getUrl()
        });
    }

}