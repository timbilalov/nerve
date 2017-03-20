define([
    'nerve/utils/helpers'
], function (
    Helpers
) {
    'use strict';

    function Event() {
        this.listeners = {};
    }

    Event.prototype = {

        on: function (name, data, handler) {
            if (!Helpers.isArray(this.listeners[name])) {
                this.listeners[name] = [];
            }

            if (Helpers.isFunction(handler)) {
                this.listeners[name].push(handler);
            }

            return this;
        },

        one: function (name, handler) {
            if (Helpers.isFunction(handler)) {
                handler.isOne = true;

                this.on(name, handler);
            }

            return this;
        },

        off: function (name, handler) {
            if (Helpers.isArray(this.listeners[name])) {
                if (Helpers.isFunction(handler)) {
                    this.listeners[name].forEach(function (item, index) {
                        if (item === handler) {
                            this.listeners[name].splice(index, 1);
                        }
                    }.bind(this));
                } else {
                    this.listeners[name] = [];
                }
            }

            return this;
        },

        trigger: function (name, data) {
            if (Helpers.isArray(this.listeners[name])) {
                this.listeners[name].forEach(function (item) {
                    item({
                        type: name
                    }, data);

                    if (item.isOne) {
                        this.off(name, item);
                    }
                });
            }

            return this;
        }

    };

    return Event;
});