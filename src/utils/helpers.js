define([
    'jquery'
], function ($) {
    'use strict';

    return {

        /**
         * Проверка является ли переменная массивом
         *
         * @param {mixed} any
         * @returns {boolean}
         */
        isArray : function (any) {
            return Array.isArray(any);
        },

        /**
         * Перевод в строковый тип
         *
         * @param {mixed} any
         * @returns {string}
         */
        toString : function (any) {
            return Object.prototype.toString.call(any);
        },

        /**
         * Проверка является ли переменная функцией
         *
         * @param {mixed} any
         * @returns {boolean}
         */
        isFunction : function (any) {
            return this.toString(any) === '[object Function]';
        },

        /**
         * Проверка является ли переменная dom-элементом
         *
         * @param {mixed} any
         * @returns {boolean}
         */
        isNode : function (any) {
            return (any && any.nodeType) || this.isNodeList(any);
        },

        /**
         * Проверка является ли переменная списком dom-элементов
         *
         * @param {mixed} any
         * @returns {boolean}
         */
        isNodeList : function (any) {
            return !this.isjQueryObject(any) && any && any[0] && any[0].nodeType;
        },

        /**
         * Проверка является ли переменная jQuery-элементом
         *
         * @param {mixed} any
         * @returns {boolean}
         */
        isjQueryObject : function (any) {
            return any instanceof $;
        },

        /**
         * Проверка является ли переменная объектом
         *
         * @param {mixed} any
         * @returns {boolean}
         */
        isObject : function (any) {
            var result = false;
            if (window.Object) {
                result = any === window.Object(any) && !this.isNode(any) && !this.isFunction(any) && !this.isjQueryObject(any);
            } else {
                result = any && $.toString(any) === '[object Object]' && !this.isNode(any) && !this.isFunction(any) && !this.isjQueryObject(any);
            }
            return result;
        },

        /**
         * Проверка является ли переменная простым объектом
         *
         * @param {mixed} any
         * @returns {boolean}
         */
        isPlainObject : function (any) {
            return this.isObject(any) && $.isPlainObject(any);
        },

        /**
         * Проверка является ли переменная строкой
         *
         * @param {mixed} any
         * @returns {boolean}
         */
        isString : function (any) {
            return this.toString(any) === '[object String]';
        },

        /**
         * Преобразование первого символа строки к верхнему регистру
         *
         * @param {string} str
         * @returns {string}
         */
        capitalize : function (str) {
            return str.charAt(0).toUpperCase() + str.substr(1);
        },

        extend: $.extend

    };
});