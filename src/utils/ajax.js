define([
    'jquery'
], function ($) {
    'use strict';

    var Ajax = {

        send: function (options) {
            var xhr = $.ajax(options);

            return {

                success: function (callback) {
                    return xhr.success(callback);
                },

                error: function (callback) {
                    return xhr.error(callback);
                },

                abort: function () {
                    return xhr.abort();
                }

            };
        }

    };

    return Ajax;
});