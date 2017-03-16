/*jslint regexp: true */

(function () {
    'use strict';

    window.requirejs(['//127.0.0.1:4344/socket.io/socket.io.js'], function (io) {
        var socket = io('https://127.0.0.1:4344');

        socket.on('changeCss', function (data) {
            var links = document.querySelectorAll('link[href*="' + data.path + '"]');

            Array.prototype.forEach.call(links, function (link) {
                var tmp = link.href;

                link.href = tmp;
            });
        });

        socket.on('changeJs', function (data) {
            var scripts = document.querySelectorAll('script[src*="' + data.path + '"]'),
                moduleName = data.path;

            Array.prototype.forEach.call(scripts, function (script) {
                var tmp = script.src;

                window.requirejs([tmp.replace(/\.js.*/, '.js?' + Math.random())], function (Module) {
                    window.require.undef(moduleName);
                    define(moduleName, [], function () {
                        return Module;
                    });
                });
            });
        });
    });

}());