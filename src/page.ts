import {View} from './view';
import {Helpers} from './utils/helpers';
import {Http} from './utils/http';
import {Router} from './router';
import {AxiosResponse} from 'axios';
import {DomElement} from './element';

export class Page extends View {

    /**
     * URL загрузки страницы
     *
     * @type {String}
     */
    protected url: string;

    /**
     * Название страницы
     *
     * @type {String}
     */
    protected pageName: string;

     /**
     * Состояние отменены запроса данных с сервера
     *
     * @type {Boolean}
     */
    protected isAbortedState = false;

    protected pageOptions: any = {};

    protected xhr: any;

    protected app: any;

    /**
     * Адаптированные данные, полученные от сервера
     *
     * @type {Object}
     */
    protected pageResponse: any = {};

    constructor(options?: any) {
        super(options);

        this.options = Helpers.extend({
            isRunTimeCreated: false,
            isNeedLoad: true,
            loadDataType: 'json',
            pageOptionsSelector: '.b-page-config'
        }, options);
    }

    /**
     * Инициализация страницы после загрузки и рендера
     *
     * @returns {Page}
     */
    initPage() {
        const $config: DomElement[] = this.$el.find(this.options.pageOptionsSelector);

        if ($config.length) {
            this.pageOptions = JSON.parse($config[0].html().replace(/\r|\n|\t|\s{2,}/g, ''));
        }

        this.trigger('pageLoad', {
            page: this.getPageName()
        });

        return this;
    }

    /**
     * Ajax загрука страницы
     */
    load() {
        const settings = this.getLoadSettings();

        this.xhr = Http.get(settings.url, {
            params: this.getLoadParams()
        })
            .then((response: AxiosResponse) => {
                if (response.data.isRedirect) {
                    Router.go(response.data.location);
                } else if (response.data.request && response.data.request.path !== window.location.pathname) {
                    Router.checkRoutes({
                        url: response.data.request.path
                    }, true, response.data);
                } else {
                    this.onLoadSuccess(response.data);
                }
            })
            .catch(() => this.onLoadError());
    }

    /**
     * Отмена загрузки страницы
     *
     * @returns {Page}
     */
    abort() {
        this.isAbortedState = true;
        this.xhr.abort();

        return this;
    }

    /**
     * Возвращает состояние текущей загрузки данных от сервера (true - загрузка выполняется, false - не выполняется)
     *
     * @returns {Boolean}
     */
    isPending(): boolean {
        // return this.xhr && this.xhr.state() === 'pending';
        return false;
    }

    /**
     * Возвращает состояние отмены запроса данных с сервера
     *
     * @returns {boolean}
     */
    isAborted() {
        return this.isAbortedState;
    }

    /**
     * Возвращает true, если страница создана в режиме выполнения (аяксовый переход) и false, если страница загружена первоначально (точка входа)
     *
     * @returns {Boolean}
     */
    isRunTimeCreated() {
        return this.options.isRunTimeCreated;
    }

    /**
     * Возращает true, если для страницы необходимо загружать данные с сервера и false, если нет такой необходимости (для статических страниц)
     *
     * @returns {Boolean}
     */
    isNeedLoad() {
        return this.options.isNeedLoad;
    }

    /**
     * Устанавливает объект приложения
     *
     * @param {App} app объект приложения
     * @returns {Page}
     */
    setApp(app: any) {
        this.app = app;

        return this;
    }

    /**
     * Устанавливает название страницы
     *
     * @param {String} pageName новое название
     * @returns {Page}
     */
    setPageName(pageName: string) {
        this.pageName = pageName;

        return this;
    }

    /**
     * Возвращает название страницы
     *
     * @returns {Boolean}
     */
    getPageName() {
        return this.pageName || false;
    }

    /**
     * Получение заголовка
     *
     * @returns {String}
     */
    getTitle() {
        return '';
    }

    /**
     * Получение адаптированных данных, полученных от сервера
     *
     * @protected
     * @returns {Object}
     */
    getResponse(): any {
        return this.pageResponse;
    }

    /**
     * Установка адаптированных данных, полученных от сервера
     *
     * @protected
     * @param {Object} response адаптированные данные
     * @returns {Page}
     */
    setResponse(response: any) {
        this.pageResponse = Helpers.extend({}, true, this.pageResponse, response);

        return this;
    }

    /**
     * Обработчик успешной загрузке AJAX страницы
     *
     * @protected
     * @param {Object} response данные, полученные от сервера
     */
    onLoadSuccess(response?: any) {
        this.setResponse(this.adapter(response));
        this.setPageTitle();

        this.render(this.getResponse());
    }

    /**
     * Получение URL для загрузки данных с сервера
     *
     * @protected
     * @returns {String}
     */
    protected getUrl(): string {
        return this.url || this.options.request.url;
    }

    /**
     * Адаптирование данных, полученных с сервера
     *
     * @protected
     * @param {Object} response данные, полученные от сервера
     * @returns {Object} адаптированные данные
     */
    protected adapter(response: any): any {
        return response;
    }

    /**
     * Получение данных, отправляемых на сервер при загрузке страницы
     *
     * @protected
     * @returns {Object}
     */
    protected getLoadParams(): any {
        return {};
    }

    /**
     * Получение настроек AJAX запроса при загрузке страницы
     *
     * @protected
     * @returns {Object}
     */
    protected getLoadSettings(): any {
        return {
            url: this.getUrl(),
            dataType: this.options.loadDataType
        };
    }

    /**
     * Установка заголовка страницы
     *
     * @protected
     */
    protected setPageTitle() {
        document.title = this.getTitle();
    }

    /**
     * Обработчик ошибки при загрузке AJAX страницы
     *
     * @protected
     */
    protected onLoadError() {
        this.trigger('error');
    }
}