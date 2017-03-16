define([
    'event',
    'model',
    'view',
    'router',
    'collection',
    'page',
    'config'
], function (
    Event,
    Model,
    View,
    Router,
    Collection,
    Page,
    CONFIG
) {
    'use strict';

    return {
        Event: Event,
        Model: Model,
        View: View,
        Router: Router,
        Collection: Collection,
        Page: Page,
        CONFIG: CONFIG
    };
});