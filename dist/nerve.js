/** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.1.14 Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */
//Not using strict: uneven strict support in browsers, #392, and causes
//problems with requirejs.exec()/transpiler plugins that may not be strict.
/*jslint regexp: true, nomen: true, sloppy: true */
/*global window, navigator, document, importScripts, setTimeout, opera */

var requirejs, require, define;
(function (global) {
    var req, s, head, baseElement, dataMain, src,
        interactiveScript, currentlyAddingScript, mainScript, subPath,
        version = '2.1.14',
        commentRegExp = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg,
        cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g,
        jsSuffixRegExp = /\.js$/,
        currDirRegExp = /^\.\//,
        op = Object.prototype,
        ostring = op.toString,
        hasOwn = op.hasOwnProperty,
        ap = Array.prototype,
        apsp = ap.splice,
        isBrowser = !!(typeof window !== 'undefined' && typeof navigator !== 'undefined' && window.document),
        isWebWorker = !isBrowser && typeof importScripts !== 'undefined',
        //PS3 indicates loaded and complete, but need to wait for complete
        //specifically. Sequence is 'loading', 'loaded', execution,
        // then 'complete'. The UA check is unfortunate, but not sure how
        //to feature test w/o causing perf issues.
        readyRegExp = isBrowser && navigator.platform === 'PLAYSTATION 3' ?
                      /^complete$/ : /^(complete|loaded)$/,
        defContextName = '_',
        //Oh the tragedy, detecting opera. See the usage of isOpera for reason.
        isOpera = typeof opera !== 'undefined' && opera.toString() === '[object Opera]',
        msieVersion = (navigator.userAgent.toLowerCase().indexOf('msie') != -1) ? parseInt(navigator.userAgent.toLowerCase().split('msie')[1]) : false,
        contexts = {},
        cfg = {},
        globalDefQueue = [],
        useInteractive = false;

    function isFunction(it) {
        return ostring.call(it) === '[object Function]';
    }

    function isArray(it) {
        return ostring.call(it) === '[object Array]';
    }

    /**
     * Helper function for iterating over an array. If the func returns
     * a true value, it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    /**
     * Helper function for iterating over an array backwards. If the func
     * returns a true value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1; i > -1; i -= 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function getOwn(obj, prop) {
        return hasProp(obj, prop) && obj[prop];
    }

    /**
     * Cycles over properties in an object and calls a function for each
     * property value. If the function returns a truthy value, then the
     * iteration is stopped.
     */
    function eachProp(obj, func) {
        var prop;
        for (prop in obj) {
            if (hasProp(obj, prop)) {
                if (func(obj[prop], prop)) {
                    break;
                }
            }
        }
    }

    /**
     * Simple function to mix in properties from source into target,
     * but only if target does not already have a property of the same name.
     */
    function mixin(target, source, force, deepStringMixin) {
        if (source) {
            eachProp(source, function (value, prop) {
                if (force || !hasProp(target, prop)) {
                    if (deepStringMixin && typeof value === 'object' && value &&
                        !isArray(value) && !isFunction(value) &&
                        !(value instanceof RegExp)) {

                        if (!target[prop]) {
                            target[prop] = {};
                        }
                        mixin(target[prop], value, force, deepStringMixin);
                    } else {
                        target[prop] = value;
                    }
                }
            });
        }
        return target;
    }

    //Similar to Function.prototype.bind, but the 'this' object is specified
    //first, since it is easier to read/figure out what 'this' will be.
    function bind(obj, fn) {
        return function () {
            return fn.apply(obj, arguments);
        };
    }

    function scripts() {
        return document.getElementsByTagName('script');
    }

    function defaultOnError(err) {
        throw err;
    }

    //Allow getting a global that is expressed in
    //dot notation, like 'a.b.c'.
    function getGlobal(value) {
        if (!value) {
            return value;
        }
        var g = global;
        each(value.split('.'), function (part) {
            g = g[part];
        });
        return g;
    }

    /**
     * Constructs an error with a pointer to an URL with more information.
     * @param {String} id the error ID that maps to an ID on a web page.
     * @param {String} message human readable error.
     * @param {Error} [err] the original error, if there is one.
     *
     * @returns {Error}
     */
    function makeError(id, msg, err, requireModules) {
        var e = new Error(msg + '\nhttp://requirejs.org/docs/errors.html#' + id);
        e.requireType = id;
        e.requireModules = requireModules;
        if (err) {
            e.originalError = err;
        }
        return e;
    }

    if (typeof define !== 'undefined') {
        //If a define is already in play via another AMD loader,
        //do not overwrite.
        return;
    }

    if (typeof requirejs !== 'undefined') {
        if (isFunction(requirejs)) {
            //Do not overwrite an existing requirejs instance.
            return;
        }
        cfg = requirejs;
        requirejs = undefined;
    }

    //Allow for a require config object
    if (typeof require !== 'undefined' && !isFunction(require)) {
        //assume it is a config object.
        cfg = require;
        require = undefined;
    }

    function newContext(contextName) {
        var inCheckLoaded, Module, context, handlers,
            checkLoadedTimeoutId,
            config = {
                //Defaults. Do not set a default for map
                //config to speed up normalize(), which
                //will run faster if there is no default.
                waitSeconds: 7,
                baseUrl: './',
                paths: {},
                bundles: {},
                pkgs: {},
                shim: {},
                config: {}
            },
            registry = {},
            //registry of just enabled modules, to speed
            //cycle breaking code when lots of modules
            //are registered, but not activated.
            enabledRegistry = {},
            undefEvents = {},
            defQueue = [],
            defined = {},
            urlFetched = {},
            bundlesMap = {},
            requireCounter = 1,
            unnormalizedCounter = 1;

        /**
         * Trims the . and .. from an array of path segments.
         * It will keep a leading path segment if a .. will become
         * the first path segment, to help with module name lookups,
         * which act like paths, but can be remapped. But the end result,
         * all paths that use this function should look normalized.
         * NOTE: this method MODIFIES the input array.
         * @param {Array} ary the array of path segments.
         */
        function trimDots(ary) {
            var i, part;
            for (i = 0; i < ary.length; i++) {
                part = ary[i];
                if (part === '.') {
                    ary.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    // If at the start, or previous value is still ..,
                    // keep them so that when converted to a path it may
                    // still work when converted to a path, even though
                    // as an ID it is less than ideal. In larger point
                    // releases, may be better to just kick out an error.
                    if (i === 0 || (i == 1 && ary[2] === '..') || ary[i - 1] === '..') {
                        continue;
                    } else if (i > 0) {
                        ary.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
        }

        /**
         * Given a relative module name, like ./something, normalize it to
         * a real name that can be mapped to a path.
         * @param {String} name the relative name
         * @param {String} baseName a real name that the name arg is relative
         * to.
         * @param {Boolean} applyMap apply the map config to the value. Should
         * only be done if this normalization is for a dependency ID.
         * @returns {String} normalized name
         */
        function normalize(name, baseName, applyMap) {
            var pkgMain, mapValue, nameParts, i, j, nameSegment, lastIndex,
                foundMap, foundI, foundStarMap, starI, normalizedBaseParts,
                baseParts = (baseName && baseName.split('/')),
                map = config.map,
                starMap = map && map['*'];

            //Adjust any relative paths.
            if (name) {
                name = name.split('/');
                lastIndex = name.length - 1;

                // If wanting node ID compatibility, strip .js from end
                // of IDs. Have to do this here, and not in nameToUrl
                // because node allows either .js or non .js to map
                // to same file.
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                // Starts with a '.' so need the baseName
                if (name[0].charAt(0) === '.' && baseParts) {
                    //Convert baseName to array, and lop off the last part,
                    //so that . matches that 'directory' and not name of the baseName's
                    //module. For instance, baseName of 'one/two/three', maps to
                    //'one/two/three.js', but we want the directory, 'one/two' for
                    //this normalization.
                    normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                    name = normalizedBaseParts.concat(name);
                }

                trimDots(name);
                name = name.join('/');
            }

            //Apply map config if available.
            if (applyMap && map && (baseParts || starMap)) {
                nameParts = name.split('/');

                outerLoop: for (i = nameParts.length; i > 0; i -= 1) {
                    nameSegment = nameParts.slice(0, i).join('/');

                    if (baseParts) {
                        //Find the longest baseName segment match in the config.
                        //So, do joins on the biggest to smallest lengths of baseParts.
                        for (j = baseParts.length; j > 0; j -= 1) {
                            mapValue = getOwn(map, baseParts.slice(0, j).join('/'));

                            //baseName segment has config, find if it has one for
                            //this name.
                            if (mapValue) {
                                mapValue = getOwn(mapValue, nameSegment);
                                if (mapValue) {
                                    //Match, update name to the new value.
                                    foundMap = mapValue;
                                    foundI = i;
                                    break outerLoop;
                                }
                            }
                        }
                    }

                    //Check for a star map match, but just hold on to it,
                    //if there is a shorter segment match later in a matching
                    //config, then favor over this star map.
                    if (!foundStarMap && starMap && getOwn(starMap, nameSegment)) {
                        foundStarMap = getOwn(starMap, nameSegment);
                        starI = i;
                    }
                }

                if (!foundMap && foundStarMap) {
                    foundMap = foundStarMap;
                    foundI = starI;
                }

                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    name = nameParts.join('/');
                }
            }

            // If the name points to a package's name, use
            // the package main instead.
            pkgMain = getOwn(config.pkgs, name);

            return pkgMain ? pkgMain : name;
        }

        function removeScript(name) {
            if (isBrowser) {
                each(scripts(), function (scriptNode) {
                    if (scriptNode.getAttribute('data-requiremodule') === name &&
                            scriptNode.getAttribute('data-requirecontext') === context.contextName) {
                        scriptNode.parentNode.removeChild(scriptNode);
                        return true;
                    }
                });
            }
        }

        function hasPathFallback(id) {
            var pathConfig = getOwn(config.paths, id);
            if (pathConfig && isArray(pathConfig) && pathConfig.length > 1) {
                //Pop off the first array value, since it failed, and
                //retry
                pathConfig.shift();
                context.require.undef(id);

                //Custom require that does not do map translation, since
                //ID is "absolute", already mapped/resolved.
                context.makeRequire(null, {
                    skipMap: true
                })([id]);

                return true;
            }
        }

        //Turns a plugin!resource to [plugin, resource]
        //with the plugin being undefined if the name
        //did not have a plugin prefix.
        function splitPrefix(name) {
            var prefix,
                index = name ? name.indexOf('!') : -1;
            if (index > -1) {
                prefix = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Creates a module mapping that includes plugin prefix, module
         * name, and path. If parentModuleMap is provided it will
         * also normalize the name via require.normalize()
         *
         * @param {String} name the module name
         * @param {String} [parentModuleMap] parent module map
         * for the module name, used to resolve relative names.
         * @param {Boolean} isNormalized: is the ID already normalized.
         * This is true if this call is done for a define() module ID.
         * @param {Boolean} applyMap: apply the map config to the ID.
         * Should only be true if this map is for a dependency.
         *
         * @returns {Object}
         */
        function makeModuleMap(name, parentModuleMap, isNormalized, applyMap) {
            var url, pluginModule, suffix, nameParts,
                prefix = null,
                parentName = parentModuleMap ? parentModuleMap.name : null,
                originalName = name,
                isDefine = true,
                normalizedName = '';

            //If no name, then it means it is a require call, generate an
            //internal name.
            if (!name) {
                isDefine = false;
                name = '_@r' + (requireCounter += 1);
            }

            nameParts = splitPrefix(name);
            prefix = nameParts[0];
            name = nameParts[1];

            if (prefix) {
                prefix = normalize(prefix, parentName, applyMap);
                pluginModule = getOwn(defined, prefix);
            }

            //Account for relative paths if there is a base name.
            if (name) {
                if (prefix) {
                    if (pluginModule && pluginModule.normalize) {
                        //Plugin is loaded, use its normalize method.
                        normalizedName = pluginModule.normalize(name, function (name) {
                            return normalize(name, parentName, applyMap);
                        });
                    } else {
                        // If nested plugin references, then do not try to
                        // normalize, as it will not normalize correctly. This
                        // places a restriction on resourceIds, and the longer
                        // term solution is not to normalize until plugins are
                        // loaded and all normalizations to allow for async
                        // loading of a loader plugin. But for now, fixes the
                        // common uses. Details in #1131
                        normalizedName = name.indexOf('!') === -1 ?
                                         normalize(name, parentName, applyMap) :
                                         name;
                    }
                } else {
                    //A regular module.
                    normalizedName = normalize(name, parentName, applyMap);

                    //Normalized name may be a plugin ID due to map config
                    //application in normalize. The map config values must
                    //already be normalized, so do not need to redo that part.
                    nameParts = splitPrefix(normalizedName);
                    prefix = nameParts[0];
                    normalizedName = nameParts[1];
                    isNormalized = true;

                    url = context.nameToUrl(normalizedName);
                }
            }

            //If the id is a plugin id that cannot be determined if it needs
            //normalization, stamp it with a unique ID so two matching relative
            //ids that may conflict can be separate.
            suffix = prefix && !pluginModule && !isNormalized ?
                     '_unnormalized' + (unnormalizedCounter += 1) :
                     '';

            return {
                prefix: prefix,
                name: normalizedName,
                parentMap: parentModuleMap,
                unnormalized: !!suffix,
                url: url,
                originalName: originalName,
                isDefine: isDefine,
                id: (prefix ?
                        prefix + '!' + normalizedName :
                        normalizedName) + suffix
            };
        }

        function getModule(depMap) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (!mod) {
                mod = registry[id] = new context.Module(depMap);
            }

            return mod;
        }

        function on(depMap, name, fn) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (hasProp(defined, id) &&
                    (!mod || mod.defineEmitComplete)) {
                if (name === 'defined') {
                    fn(defined[id]);
                }
            } else {
                mod = getModule(depMap);
                if (mod.error && name === 'error') {
                    fn(mod.error);
                } else {
                    mod.on(name, fn);
                }
            }
        }

        function onError(err, errback) {
            var ids = err.requireModules,
                notified = false;

            if (errback) {
                errback(err);
            } else {
                each(ids, function (id) {
                    var mod = getOwn(registry, id);
                    if (mod) {
                        //Set error on module, so it skips timeout checks.
                        mod.error = err;
                        if (mod.events.error) {
                            notified = true;
                            mod.emit('error', err);
                        }
                    }
                });

                if (!notified) {
                    req.onError(err);
                }
            }
        }

        /**
         * Internal method to transfer globalQueue items to this context's
         * defQueue.
         */
        function takeGlobalQueue() {
            //Push all the globalDefQueue items into the context's defQueue
            if (globalDefQueue.length) {
                //Array splice in the values since the context code has a
                //local var ref to defQueue, so cannot just reassign the one
                //on context.
                apsp.apply(defQueue,
                           [defQueue.length, 0].concat(globalDefQueue));
                globalDefQueue = [];
            }
        }

        handlers = {
            'require': function (mod) {
                if (mod.require) {
                    return mod.require;
                } else {
                    return (mod.require = context.makeRequire(mod.map));
                }
            },
            'exports': function (mod) {
                mod.usingExports = true;
                if (mod.map.isDefine) {
                    if (mod.exports) {
                        return (defined[mod.map.id] = mod.exports);
                    } else {
                        return (mod.exports = defined[mod.map.id] = {});
                    }
                }
            },
            'module': function (mod) {
                if (mod.module) {
                    return mod.module;
                } else {
                    return (mod.module = {
                        id: mod.map.id,
                        uri: mod.map.url,
                        config: function () {
                            return  getOwn(config.config, mod.map.id) || {};
                        },
                        exports: mod.exports || (mod.exports = {})
                    });
                }
            }
        };

        function cleanRegistry(id) {
            //Clean up machinery used for waiting modules.
            delete registry[id];
            delete enabledRegistry[id];
        }

        function breakCycle(mod, traced, processed) {
            var id = mod.map.id;

            if (mod.error) {
                mod.emit('error', mod.error);
            } else {
                traced[id] = true;
                each(mod.depMaps, function (depMap, i) {
                    var depId = depMap.id,
                        dep = getOwn(registry, depId);

                    //Only force things that have not completed
                    //being defined, so still in the registry,
                    //and only if it has not been matched up
                    //in the module already.
                    if (dep && !mod.depMatched[i] && !processed[depId]) {
                        if (getOwn(traced, depId)) {
                            mod.defineDep(i, defined[depId]);
                            mod.check(); //pass false?
                        } else {
                            breakCycle(dep, traced, processed);
                        }
                    }
                });
                processed[id] = true;
            }
        }

        function checkLoaded() {
            var err, usingPathFallback,
                waitInterval = config.waitSeconds * 1000,
                //It is possible to disable the wait interval by using waitSeconds of 0.
                expired = waitInterval && (context.startTime + waitInterval) < new Date().getTime(),
                noLoads = [],
                reqCalls = [],
                stillLoading = false,
                needCycleCheck = true;

            //Do not bother if this call was a result of a cycle break.
            if (inCheckLoaded) {
                return;
            }

            inCheckLoaded = true;

            //Figure out the state of all the modules.
            eachProp(enabledRegistry, function (mod) {
                var map = mod.map,
                    modId = map.id;

                //Skip things that are not enabled or in error state.
                if (!mod.enabled) {
                    return;
                }

                if (!map.isDefine) {
                    reqCalls.push(mod);
                }

                if (!mod.error) {
                    //If the module should be executed, and it has not
                    //been inited and time is up, remember it.
                    if (!mod.inited && expired) {
                        if (hasPathFallback(modId)) {
                            usingPathFallback = true;
                            stillLoading = true;
                        } else {
                            noLoads.push(modId);
                            removeScript(modId);
                        }
                    } else if (!mod.inited && mod.fetched && map.isDefine) {
                        stillLoading = true;
                        if (!map.prefix) {
                            //No reason to keep looking for unfinished
                            //loading. If the only stillLoading is a
                            //plugin resource though, keep going,
                            //because it may be that a plugin resource
                            //is waiting on a non-plugin cycle.
                            return (needCycleCheck = false);
                        }
                    }
                }
            });

            if (expired && noLoads.length) {
                //If wait time expired, throw error of unloaded modules.
                err = makeError('timeout', 'Load timeout for modules: ' + noLoads, null, noLoads);
                err.contextName = context.contextName;
                return onError(err);
            }

            //Not expired, check for a cycle.
            if (needCycleCheck) {
                each(reqCalls, function (mod) {
                    breakCycle(mod, {}, {});
                });
            }

            //If still waiting on loads, and the waiting load is something
            //other than a plugin resource, or there are still outstanding
            //scripts, then just try back later.
            if ((!expired || usingPathFallback) && stillLoading) {
                //Something is still waiting to load. Wait for it, but only
                //if a timeout is not already in effect.
                if ((isBrowser || isWebWorker) && !checkLoadedTimeoutId) {
                    checkLoadedTimeoutId = setTimeout(function () {
                        checkLoadedTimeoutId = 0;
                        checkLoaded();
                    }, 50);
                }
            }

            inCheckLoaded = false;
        }

        Module = function (map) {
            this.events = getOwn(undefEvents, map.id) || {};
            this.map = map;
            this.shim = getOwn(config.shim, map.id);
            this.depExports = [];
            this.depMaps = [];
            this.depMatched = [];
            this.pluginMaps = {};
            this.depCount = 0;

            /* this.exports this.factory
               this.depMaps = [],
               this.enabled, this.fetched
            */
        };

        Module.prototype = {
            init: function (depMaps, factory, errback, options) {
                options = options || {};

                //Do not do more inits if already done. Can happen if there
                //are multiple define calls for the same module. That is not
                //a normal, common case, but it is also not unexpected.
                if (this.inited) {
                    return;
                }

                this.factory = factory;

                if (errback) {
                    //Register for errors on this module.
                    this.on('error', errback);
                } else if (this.events.error) {
                    //If no errback already, but there are error listeners
                    //on this module, set up an errback to pass to the deps.
                    errback = bind(this, function (err) {
                        this.emit('error', err);
                    });
                }

                //Do a copy of the dependency array, so that
                //source inputs are not modified. For example
                //"shim" deps are passed in here directly, and
                //doing a direct modification of the depMaps array
                //would affect that config.
                this.depMaps = depMaps && depMaps.slice(0);

                this.errback = errback;

                //Indicate this module has be initialized
                this.inited = true;

                this.ignore = options.ignore;

                //Could have option to init this module in enabled mode,
                //or could have been previously marked as enabled. However,
                //the dependencies are not known until init is called. So
                //if enabled previously, now trigger dependencies as enabled.
                if (options.enabled || this.enabled) {
                    //Enable this module and dependencies.
                    //Will call this.check()
                    this.enable();
                } else {
                    this.check();
                }
            },

            defineDep: function (i, depExports) {
                //Because of cycles, defined callback for a given
                //export can be called more than once.
                if (!this.depMatched[i]) {
                    this.depMatched[i] = true;
                    this.depCount -= 1;
                    this.depExports[i] = depExports;
                }
            },

            fetch: function () {
                if (this.fetched) {
                    return;
                }
                this.fetched = true;

                context.startTime = (new Date()).getTime();

                var map = this.map;

                //If the manager is for a plugin managed resource,
                //ask the plugin to load it now.
                if (this.shim) {
                    context.makeRequire(this.map, {
                        enableBuildCallback: true
                    })(this.shim.deps || [], bind(this, function () {
                        return map.prefix ? this.callPlugin() : this.load();
                    }));
                } else {
                    //Regular dependency.
                    return map.prefix ? this.callPlugin() : this.load();
                }
            },

            load: function () {
                var url = this.map.url;

                //Regular dependency.
                if (!urlFetched[url]) {
                    urlFetched[url] = true;
                    context.load(this.map.id, url);
                }
            },

            /**
             * Checks if the module is ready to define itself, and if so,
             * define it.
             */
            check: function () {
                if (!this.enabled || this.enabling) {
                    return;
                }

                var err, cjsModule,
                    id = this.map.id,
                    depExports = this.depExports,
                    exports = this.exports,
                    factory = this.factory;

                if (!this.inited) {
                    this.fetch();
                } else if (this.error) {
                    this.emit('error', this.error);
                } else if (!this.defining) {
                    //The factory could trigger another require call
                    //that would result in checking this module to
                    //define itself again. If already in the process
                    //of doing that, skip this work.
                    this.defining = true;

                    if (this.depCount < 1 && !this.defined) {
                        if (isFunction(factory)) {
                            //If there is an error listener, favor passing
                            //to that instead of throwing an error. However,
                            //only do it for define()'d  modules. require
                            //errbacks should not be called for failures in
                            //their callbacks (#699). However if a global
                            //onError is set, use that.
                            if ((this.events.error && this.map.isDefine) ||
                                req.onError !== defaultOnError) {
                                try {
                                    exports = context.execCb(id, factory, depExports, exports);
                                } catch (e) {
                                    err = e;
                                }
                            } else {
                                exports = context.execCb(id, factory, depExports, exports);
                            }

                            // Favor return value over exports. If node/cjs in play,
                            // then will not have a return value anyway. Favor
                            // module.exports assignment over exports object.
                            if (this.map.isDefine && exports === undefined) {
                                cjsModule = this.module;
                                if (cjsModule) {
                                    exports = cjsModule.exports;
                                } else if (this.usingExports) {
                                    //exports already set the defined value.
                                    exports = this.exports;
                                }
                            }

                            if (err) {
                                err.requireMap = this.map;
                                err.requireModules = this.map.isDefine ? [this.map.id] : null;
                                err.requireType = this.map.isDefine ? 'define' : 'require';
                                return onError((this.error = err));
                            }

                        } else {
                            //Just a literal value
                            exports = factory;
                        }

                        this.exports = exports;

                        if (this.map.isDefine && !this.ignore) {
                            defined[id] = exports;

                            if (req.onResourceLoad) {
                                req.onResourceLoad(context, this.map, this.depMaps);
                            }
                        }

                        //Clean up
                        cleanRegistry(id);

                        this.defined = true;
                    }

                    //Finished the define stage. Allow calling check again
                    //to allow define notifications below in the case of a
                    //cycle.
                    this.defining = false;

                    if (this.defined && !this.defineEmitted) {
                        this.defineEmitted = true;
                        this.emit('defined', this.exports);
                        this.defineEmitComplete = true;
                    }

                }
            },

            callPlugin: function () {
                var map = this.map,
                    id = map.id,
                    //Map already normalized the prefix.
                    pluginMap = makeModuleMap(map.prefix);

                //Mark this as a dependency for this plugin, so it
                //can be traced for cycles.
                this.depMaps.push(pluginMap);

                on(pluginMap, 'defined', bind(this, function (plugin) {
                    var load, normalizedMap, normalizedMod,
                        bundleId = getOwn(bundlesMap, this.map.id),
                        name = this.map.name,
                        parentName = this.map.parentMap ? this.map.parentMap.name : null,
                        localRequire = context.makeRequire(map.parentMap, {
                            enableBuildCallback: true
                        });

                    //If current map is not normalized, wait for that
                    //normalized name to load instead of continuing.
                    if (this.map.unnormalized) {
                        //Normalize the ID if the plugin allows it.
                        if (plugin.normalize) {
                            name = plugin.normalize(name, function (name) {
                                return normalize(name, parentName, true);
                            }) || '';
                        }

                        //prefix and name should already be normalized, no need
                        //for applying map config again either.
                        normalizedMap = makeModuleMap(map.prefix + '!' + name,
                                                      this.map.parentMap);
                        on(normalizedMap,
                            'defined', bind(this, function (value) {
                                this.init([], function () { return value; }, null, {
                                    enabled: true,
                                    ignore: true
                                });
                            }));

                        normalizedMod = getOwn(registry, normalizedMap.id);
                        if (normalizedMod) {
                            //Mark this as a dependency for this plugin, so it
                            //can be traced for cycles.
                            this.depMaps.push(normalizedMap);

                            if (this.events.error) {
                                normalizedMod.on('error', bind(this, function (err) {
                                    this.emit('error', err);
                                }));
                            }
                            normalizedMod.enable();
                        }

                        return;
                    }

                    //If a paths config, then just load that file instead to
                    //resolve the plugin, as it is built into that paths layer.
                    if (bundleId) {
                        this.map.url = context.nameToUrl(bundleId);
                        this.load();
                        return;
                    }

                    load = bind(this, function (value) {
                        this.init([], function () { return value; }, null, {
                            enabled: true
                        });
                    });

                    load.error = bind(this, function (err) {
                        this.inited = true;
                        this.error = err;
                        err.requireModules = [id];

                        //Remove temp unnormalized modules for this module,
                        //since they will never be resolved otherwise now.
                        eachProp(registry, function (mod) {
                            if (mod.map.id.indexOf(id + '_unnormalized') === 0) {
                                cleanRegistry(mod.map.id);
                            }
                        });

                        onError(err);
                    });

                    //Allow plugins to load other code without having to know the
                    //context or how to 'complete' the load.
                    load.fromText = bind(this, function (text, textAlt) {
                        /*jslint evil: true */
                        var moduleName = map.name,
                            moduleMap = makeModuleMap(moduleName),
                            hasInteractive = useInteractive;

                        //As of 2.1.0, support just passing the text, to reinforce
                        //fromText only being called once per resource. Still
                        //support old style of passing moduleName but discard
                        //that moduleName in favor of the internal ref.
                        if (textAlt) {
                            text = textAlt;
                        }

                        //Turn off interactive script matching for IE for any define
                        //calls in the text, then turn it back on at the end.
                        if (hasInteractive) {
                            useInteractive = false;
                        }

                        //Prime the system by creating a module instance for
                        //it.
                        getModule(moduleMap);

                        //Transfer any config to this other module.
                        if (hasProp(config.config, id)) {
                            config.config[moduleName] = config.config[id];
                        }

                        try {
                            req.exec(text);
                        } catch (e) {
                            return onError(makeError('fromtexteval',
                                             'fromText eval for ' + id +
                                            ' failed: ' + e,
                                             e,
                                             [id]));
                        }

                        if (hasInteractive) {
                            useInteractive = true;
                        }

                        //Mark this as a dependency for the plugin
                        //resource
                        this.depMaps.push(moduleMap);

                        //Support anonymous modules.
                        context.completeLoad(moduleName);

                        //Bind the value of that module to the value for this
                        //resource ID.
                        localRequire([moduleName], load);
                    });

                    //Use parentName here since the plugin's name is not reliable,
                    //could be some weird string with no path that actually wants to
                    //reference the parentName's path.
                    plugin.load(map.name, localRequire, load, config);
                }));

                context.enable(pluginMap, this);
                this.pluginMaps[pluginMap.id] = pluginMap;
            },

            enable: function () {
                enabledRegistry[this.map.id] = this;
                this.enabled = true;

                //Set flag mentioning that the module is enabling,
                //so that immediate calls to the defined callbacks
                //for dependencies do not trigger inadvertent load
                //with the depCount still being zero.
                this.enabling = true;

                //Enable each dependency
                each(this.depMaps, bind(this, function (depMap, i) {
                    var id, mod, handler;

                    if (typeof depMap === 'string') {
                        //Dependency needs to be converted to a depMap
                        //and wired up to this module.
                        depMap = makeModuleMap(depMap,
                                               (this.map.isDefine ? this.map : this.map.parentMap),
                                               false,
                                               !this.skipMap);
                        this.depMaps[i] = depMap;

                        handler = getOwn(handlers, depMap.id);

                        if (handler) {
                            this.depExports[i] = handler(this);
                            return;
                        }

                        this.depCount += 1;

                        on(depMap, 'defined', bind(this, function (depExports) {
                            this.defineDep(i, depExports);
                            this.check();
                        }));

                        if (this.errback) {
                            on(depMap, 'error', bind(this, this.errback));
                        }
                    }

                    id = depMap.id;
                    mod = registry[id];

                    //Skip special modules like 'require', 'exports', 'module'
                    //Also, don't call enable if it is already enabled,
                    //important in circular dependency cases.
                    if (!hasProp(handlers, id) && mod && !mod.enabled) {
                        context.enable(depMap, this);
                    }
                }));

                //Enable each plugin that is used in
                //a dependency
                eachProp(this.pluginMaps, bind(this, function (pluginMap) {
                    var mod = getOwn(registry, pluginMap.id);
                    if (mod && !mod.enabled) {
                        context.enable(pluginMap, this);
                    }
                }));

                this.enabling = false;

                this.check();
            },

            on: function (name, cb) {
                var cbs = this.events[name];
                if (!cbs) {
                    cbs = this.events[name] = [];
                }
                cbs.push(cb);
            },

            emit: function (name, evt) {
                each(this.events[name], function (cb) {
                    cb(evt);
                });
                if (name === 'error') {
                    //Now that the error handler was triggered, remove
                    //the listeners, since this broken Module instance
                    //can stay around for a while in the registry.
                    delete this.events[name];
                }
            }
        };

        function callGetModule(args) {
            //Skip modules already defined.
            if (!hasProp(defined, args[0])) {
                getModule(makeModuleMap(args[0], null, true)).init(args[1], args[2]);
            }
        }

        function removeListener(node, func, name, ieName) {
            //Favor detachEvent because of IE9
            //issue, see attachEvent/addEventListener comment elsewhere
            //in this file.
            if (node.detachEvent && !isOpera) {
                //Probably IE. If not it will throw an error, which will be
                //useful to know.
                if (ieName) {
                    node.detachEvent(ieName, func);
                }
            } else {
                node.removeEventListener(name, func, false);
            }
        }

        /**
         * Given an event from a script node, get the requirejs info from it,
         * and then removes the event listeners on the node.
         * @param {Event} evt
         * @returns {Object}
         */
        function getScriptData(evt) {
            //Using currentTarget instead of target for Firefox 2.0's sake. Not
            //all old browsers will be supported, but this one was easy enough
            //to support and still makes sense.
            var node = evt.currentTarget || evt.srcElement;

            //Remove the listeners once here.
            removeListener(node, context.onScriptLoad, 'load', 'onreadystatechange');
            removeListener(node, context.onScriptError, 'error');

            return {
                node: node,
                id: node && node.getAttribute('data-requiremodule')
            };
        }

        function intakeDefines() {
            var args;

            //Any defined modules in the global queue, intake them now.
            takeGlobalQueue();

            //Make sure any remaining defQueue items get properly processed.
            while (defQueue.length) {
                args = defQueue.shift();
                if (args[0] === null) {
                    return onError(makeError('mismatch', 'Mismatched anonymous define() module: ' + args[args.length - 1]));
                } else {
                    //args are id, deps, factory. Should be normalized by the
                    //define() function.
                    callGetModule(args);
                }
            }
        }

        context = {
            config: config,
            contextName: contextName,
            registry: registry,
            defined: defined,
            urlFetched: urlFetched,
            defQueue: defQueue,
            Module: Module,
            makeModuleMap: makeModuleMap,
            nextTick: req.nextTick,
            onError: onError,

            /**
             * Set a configuration for the context.
             * @param {Object} cfg config object to integrate.
             */
            configure: function (cfg) {
                //Make sure the baseUrl ends in a slash.
                if (cfg.baseUrl) {
                    if (cfg.baseUrl.charAt(cfg.baseUrl.length - 1) !== '/') {
                        cfg.baseUrl += '/';
                    }
                }

                //Save off the paths since they require special processing,
                //they are additive.
                var shim = config.shim,
                    objs = {
                        paths: true,
                        bundles: true,
                        config: true,
                        map: true
                    };

                eachProp(cfg, function (value, prop) {
                    if (objs[prop]) {
                        if (!config[prop]) {
                            config[prop] = {};
                        }
                        mixin(config[prop], value, true, true);
                    } else {
                        config[prop] = value;
                    }
                });

                //Reverse map the bundles
                if (cfg.bundles) {
                    eachProp(cfg.bundles, function (value, prop) {
                        each(value, function (v) {
                            if (v !== prop) {
                                bundlesMap[v] = prop;
                            }
                        });
                    });
                }

                //Merge shim
                if (cfg.shim) {
                    eachProp(cfg.shim, function (value, id) {
                        //Normalize the structure
                        if (isArray(value)) {
                            value = {
                                deps: value
                            };
                        }
                        if ((value.exports || value.init) && !value.exportsFn) {
                            value.exportsFn = context.makeShimExports(value);
                        }
                        shim[id] = value;
                    });
                    config.shim = shim;
                }

                //Adjust packages if necessary.
                if (cfg.packages) {
                    each(cfg.packages, function (pkgObj) {
                        var location, name;

                        pkgObj = typeof pkgObj === 'string' ? { name: pkgObj } : pkgObj;

                        name = pkgObj.name;
                        location = pkgObj.location;
                        if (location) {
                            config.paths[name] = pkgObj.location;
                        }

                        //Save pointer to main module ID for pkg name.
                        //Remove leading dot in main, so main paths are normalized,
                        //and remove any trailing .js, since different package
                        //envs have different conventions: some use a module name,
                        //some use a file name.
                        config.pkgs[name] = pkgObj.name + '/' + (pkgObj.main || 'main')
                                     .replace(currDirRegExp, '')
                                     .replace(jsSuffixRegExp, '');
                    });
                }

                //If there are any "waiting to execute" modules in the registry,
                //update the maps for them, since their info, like URLs to load,
                //may have changed.
                eachProp(registry, function (mod, id) {
                    //If module already has init called, since it is too
                    //late to modify them, and ignore unnormalized ones
                    //since they are transient.
                    if (!mod.inited && !mod.map.unnormalized) {
                        mod.map = makeModuleMap(id);
                    }
                });

                //If a deps array or a config callback is specified, then call
                //require with those args. This is useful when require is defined as a
                //config object before require.js is loaded.
                if (cfg.deps || cfg.callback) {
                    context.require(cfg.deps || [], cfg.callback);
                }
            },

            makeShimExports: function (value) {
                function fn() {
                    var ret;
                    if (value.init) {
                        ret = value.init.apply(global, arguments);
                    }
                    return ret || (value.exports && getGlobal(value.exports));
                }
                return fn;
            },

            makeRequire: function (relMap, options) {
                options = options || {};

                function localRequire(deps, callback, errback) {
                    var id, map, requireMod;

                    if (options.enableBuildCallback && callback && isFunction(callback)) {
                        callback.__requireJsBuild = true;
                    }

                    if (typeof deps === 'string') {
                        if (isFunction(callback)) {
                            //Invalid call
                            return onError(makeError('requireargs', 'Invalid require call'), errback);
                        }

                        //If require|exports|module are requested, get the
                        //value for them from the special handlers. Caveat:
                        //this only works while module is being defined.
                        if (relMap && hasProp(handlers, deps)) {
                            return handlers[deps](registry[relMap.id]);
                        }

                        //Synchronous access to one module. If require.get is
                        //available (as in the Node adapter), prefer that.
                        if (req.get) {
                            return req.get(context, deps, relMap, localRequire);
                        }

                        //Normalize module name, if it contains . or ..
                        map = makeModuleMap(deps, relMap, false, true);
                        id = map.id;

                        if (!hasProp(defined, id)) {
                            return onError(makeError('notloaded', 'Module name "' +
                                        id +
                                        '" has not been loaded yet for context: ' +
                                        contextName +
                                        (relMap ? '' : '. Use require([])')));
                        }
                        return defined[id];
                    }

                    //Grab defines waiting in the global queue.
                    intakeDefines();

                    //Mark all the dependencies as needing to be loaded.
                    context.nextTick(function () {
                        //Some defines could have been added since the
                        //require call, collect them.
                        intakeDefines();

                        requireMod = getModule(makeModuleMap(null, relMap));

                        //Store if map config should be applied to this require
                        //call for dependencies.
                        requireMod.skipMap = options.skipMap;

                        requireMod.init(deps, callback, errback, {
                            enabled: true
                        });

                        checkLoaded();
                    });

                    return localRequire;
                }

                mixin(localRequire, {
                    isBrowser: isBrowser,

                    /**
                     * Converts a module name + .extension into an URL path.
                     * *Requires* the use of a module name. It does not support using
                     * plain URLs like nameToUrl.
                     */
                    toUrl: function (moduleNamePlusExt) {
                        var ext,
                            index = moduleNamePlusExt.lastIndexOf('.'),
                            segment = moduleNamePlusExt.split('/')[0],
                            isRelative = segment === '.' || segment === '..';

                        //Have a file extension alias, and it is not the
                        //dots from a relative path.
                        if (index !== -1 && (!isRelative || index > 1)) {
                            ext = moduleNamePlusExt.substring(index, moduleNamePlusExt.length);
                            moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
                        }

                        return context.nameToUrl(normalize(moduleNamePlusExt,
                                                relMap && relMap.id, true), ext,  true);
                    },

                    defined: function (id) {
                        return hasProp(defined, makeModuleMap(id, relMap, false, true).id);
                    },

                    specified: function (id) {
                        id = makeModuleMap(id, relMap, false, true).id;
                        return hasProp(defined, id) || hasProp(registry, id);
                    }
                });

                //Only allow undef on top level require calls
                if (!relMap) {
                    localRequire.undef = function (id) {
                        //Bind any waiting define() calls to this context,
                        //fix for #408
                        takeGlobalQueue();

                        var map = makeModuleMap(id, relMap, true),
                            mod = getOwn(registry, id);

                        removeScript(id);

                        delete defined[id];
                        delete urlFetched[map.url];
                        delete undefEvents[id];

                        //Clean queued defines too. Go backwards
                        //in array so that the splices do not
                        //mess up the iteration.
                        eachReverse(defQueue, function(args, i) {
                            if(args[0] === id) {
                                defQueue.splice(i, 1);
                            }
                        });

                        if (mod) {
                            //Hold on to listeners in case the
                            //module will be attempted to be reloaded
                            //using a different config.
                            if (mod.events.defined) {
                                undefEvents[id] = mod.events;
                            }

                            cleanRegistry(id);
                        }
                    };
                }

                return localRequire;
            },

            /**
             * Called to enable a module if it is still in the registry
             * awaiting enablement. A second arg, parent, the parent module,
             * is passed in for context, when this method is overridden by
             * the optimizer. Not shown here to keep code compact.
             */
            enable: function (depMap) {
                var mod = getOwn(registry, depMap.id);
                if (mod) {
                    getModule(depMap).enable();
                }
            },

            /**
             * Internal method used by environment adapters to complete a load event.
             * A load event could be a script load or just a load pass from a synchronous
             * load call.
             * @param {String} moduleName the name of the module to potentially complete.
             */
            completeLoad: function (moduleName) {
                var found, args, mod,
                    shim = getOwn(config.shim, moduleName) || {},
                    shExports = shim.exports;

                takeGlobalQueue();

                while (defQueue.length) {
                    args = defQueue.shift();
                    if (args[0] === null) {
                        args[0] = moduleName;
                        //If already found an anonymous module and bound it
                        //to this name, then this is some other anon module
                        //waiting for its completeLoad to fire.
                        if (found) {
                            break;
                        }
                        found = true;
                    } else if (args[0] === moduleName) {
                        //Found matching define call for this script!
                        found = true;
                    }

                    callGetModule(args);
                }

                //Do this after the cycle of callGetModule in case the result
                //of those calls/init calls changes the registry.
                mod = getOwn(registry, moduleName);

                if (!found && !hasProp(defined, moduleName) && mod && !mod.inited) {
                    if (config.enforceDefine && (!shExports || !getGlobal(shExports))) {
                        if (hasPathFallback(moduleName)) {
                            return;
                        } else {
                            return onError(makeError('nodefine',
                                             'No define call for ' + moduleName,
                                             null,
                                             [moduleName]));
                        }
                    } else {
                        //A script that does not call define(), so just simulate
                        //the call for it.
                        callGetModule([moduleName, (shim.deps || []), shim.exportsFn]);
                    }
                }

                checkLoaded();
            },

            /**
             * Converts a module name to a file path. Supports cases where
             * moduleName may actually be just an URL.
             * Note that it **does not** call normalize on the moduleName,
             * it is assumed to have already been normalized. This is an
             * internal API, not a public one. Use toUrl for the public API.
             */
            nameToUrl: function (moduleName, ext, skipExt) {
                var paths, syms, i, parentModule, url,
                    parentPath, bundleId,
                    pkgMain = getOwn(config.pkgs, moduleName),
                    cdnHost;

                if (pkgMain) {
                    moduleName = pkgMain;
                }

                bundleId = getOwn(bundlesMap, moduleName);

                if (bundleId) {
                    return context.nameToUrl(bundleId, ext, skipExt);
                }

                //If a colon is in the URL, it indicates a protocol is used and it is just
                //an URL to a file, or if it starts with a slash, contains a query arg (i.e. ?)
                //or ends with .js, then assume the user meant to use an url and not a module id.
                //The slash is important for protocol-less URLs as well as full paths.
                if (req.jsExtRegExp.test(moduleName)) {
                    //Just a plain path, not module name lookup, so just return it.
                    //Add extension if it is included. This is a bit wonky, only non-.js things pass
                    //an extension, this method probably needs to be reworked.
                    url = moduleName + (ext || '');
                } else {
                    //A module that needs to be converted to a path.
                    paths = config.paths;

                    syms = moduleName.split('/');
                    //For each module name segment, see if there is a path
                    //registered for it. Start with most specific name
                    //and work up from it.
                    for (i = syms.length; i > 0; i -= 1) {
                        parentModule = syms.slice(0, i).join('/');

                        parentPath = getOwn(paths, parentModule);
                        if (parentPath) {
                            //If an array, it means there are a few choices,
                            //Choose the one that is desired
                            if (isArray(parentPath)) {
                                parentPath = parentPath[0];
                            }
                            syms.splice(0, i, parentPath);
                            break;
                        }
                    }

                    //Join the path parts together, then figure out if baseUrl is needed.
                    url = syms.join('/');
                    url += (ext || (/^data\:|\?/.test(url) || skipExt ? '' : '.js'));
                    url = (url.charAt(0) === '/' || url.match(/^[\w\+\.\-]+:/) ? '' : config.baseUrl) + url;
                }

                url =  config.urlArgs ? url +
                                        ((url.indexOf('?') === -1 ? '?' : '&') +
                                         config.urlArgs) : url;

                if (isFunction(cfg.getCdn)) {
                    cdnHost = cfg.getCdn(moduleName);
                    if (cdnHost) {
                        url = url.replace(url.match(/http(s)?:\/\/[\w\d\.].*?\//)[0], cdnHost + '/');
                    }
                }

                return url;
            },

            //Delegates to req.load. Broken out as a separate function to
            //allow overriding in the optimizer.
            load: function (id, url) {
                req.load(context, id, url);
            },

            /**
             * Executes a module callback function. Broken out as a separate function
             * solely to allow the build system to sequence the files in the built
             * layer in the right sequence.
             *
             * @private
             */
            execCb: function (name, callback, args, exports) {
                return callback.apply(exports, args);
            },

            /**
             * callback for script loads, used to check status of loading.
             *
             * @param {Event} evt the event from the browser for the script
             * that was loaded.
             */
            onScriptLoad: function (evt) {
                //Using currentTarget instead of target for Firefox 2.0's sake. Not
                //all old browsers will be supported, but this one was easy enough
                //to support and still makes sense.
                if (evt.type === 'load' ||
                        (readyRegExp.test((evt.currentTarget || evt.srcElement).readyState))) {
                    //Reset interactive script so a script node is not held onto for
                    //to long.
                    interactiveScript = null;

                    //Pull out the name of the module and the context.
                    var data = getScriptData(evt);
                    context.completeLoad(data.id);
                }
            },

            /**
             * Callback for script errors.
             */
            onScriptError: function (evt) {
                var data = getScriptData(evt);
                if (!hasPathFallback(data.id)) {
                    return onError(makeError('scripterror', 'Script error for: ' + data.id, evt, [data.id]));
                }
            }
        };

        context.require = context.makeRequire();
        return context;
    }

    /**
     * Main entry point.
     *
     * If the only argument to require is a string, then the module that
     * is represented by that string is fetched for the appropriate context.
     *
     * If the first argument is an array, then it will be treated as an array
     * of dependency string names to fetch. An optional function callback can
     * be specified to execute when all of those dependencies are available.
     *
     * Make a local req variable to help Caja compliance (it assumes things
     * on a require that are not standardized), and to give a short
     * name for minification/local scope use.
     */
    req = requirejs = function (deps, callback, errback, optional) {

        //Find the right context, use default
        var context, config,
            contextName = defContextName;

        // Determine if have config object in the call.
        if (!isArray(deps) && typeof deps !== 'string') {
            // deps is a config object
            config = deps;
            if (isArray(callback)) {
                // Adjust args if there are dependencies
                deps = callback;
                callback = errback;
                errback = optional;
            } else {
                deps = [];
            }
        }

        if (config && config.context) {
            contextName = config.context;
        }

        context = getOwn(contexts, contextName);
        if (!context) {
            context = contexts[contextName] = req.s.newContext(contextName);
        }

        if (config) {
            context.configure(config);
        }

        if (config && isFunction(config.getCdn)) {
            cfg.getCdn = config.getCdn;
        }

        return context.require(deps, callback, errback);
    };

    /**
     * Support require.config() to make it easier to cooperate with other
     * AMD loaders on globally agreed names.
     */
    req.config = function (config) {
        return req(config);
    };

    /**
     * Execute something after the current tick
     * of the event loop. Override for other envs
     * that have a better solution than setTimeout.
     * @param  {Function} fn function to execute later.
     */
    if (msieVersion <= 8) {
        req.nextTick = typeof setTimeout !== 'undefined' ? function (fn) {
            setTimeout(fn, 4);
        } : function (fn) { fn(); };
    } else {
        req.nextTick = function (fn) { fn(); };
    }

    /**
     * Export require as a global, but only if it does not already exist.
     */
    if (!require) {
        require = req;
    }

    req.version = version;

    //Used to filter out dependencies that are already paths.
    req.jsExtRegExp = /^\/|:|\?|\.js$/;
    req.isBrowser = isBrowser;
    s = req.s = {
        contexts: contexts,
        newContext: newContext
    };

    //Create default context.
    req({});

    //Exports some context-sensitive methods on global require.
    each([
        'toUrl',
        'undef',
        'defined',
        'specified'
    ], function (prop) {
        //Reference from contexts instead of early binding to default context,
        //so that during builds, the latest instance of the default context
        //with its config gets used.
        req[prop] = function () {
            var ctx = contexts[defContextName];
            return ctx.require[prop].apply(ctx, arguments);
        };
    });

    if (isBrowser) {
        head = s.head = document.getElementsByTagName('head')[0];
        //If BASE tag is in play, using appendChild is a problem for IE6.
        //When that browser dies, this can be removed. Details in this jQuery bug:
        //http://dev.jquery.com/ticket/2709
        baseElement = document.getElementsByTagName('base')[0];
        if (baseElement) {
            head = s.head = baseElement.parentNode;
        }
    }

    /**
     * Any errors that require explicitly generates will be passed to this
     * function. Intercept/override it if you want custom error handling.
     * @param {Error} err the error object.
     */
    req.onError = defaultOnError;

    /**
     * Creates the node for the load command. Only used in browser envs.
     */
    req.createNode = function (config, moduleName, url) {
        var node = config.xhtml ?
                document.createElementNS('http://www.w3.org/1999/xhtml', 'html:script') :
                document.createElement('script');
        node.type = config.scriptType || 'text/javascript';
        node.charset = 'utf-8';
        node.async = true;
        return node;
    };

    /**
     * Does the request to load a module for the browser case.
     * Make this a separate function to allow other environments
     * to override it.
     *
     * @param {Object} context the require context to find state.
     * @param {String} moduleName the name of the module.
     * @param {Object} url the URL to the module.
     */
    req.load = function (context, moduleName, url) {
        var config = (context && context.config) || {},
            node;
        if (isBrowser) {
            //In the browser so use a script tag
            node = req.createNode(config, moduleName, url);

            node.setAttribute('data-requirecontext', context.contextName);
            node.setAttribute('data-requiremodule', moduleName);

            //Set up load listener. Test attachEvent first because IE9 has
            //a subtle issue in its addEventListener and script onload firings
            //that do not match the behavior of all other browsers with
            //addEventListener support, which fire the onload event for a
            //script right after the script execution. See:
            //https://connect.microsoft.com/IE/feedback/details/648057/script-onload-event-is-not-fired-immediately-after-script-execution
            //UNFORTUNATELY Opera implements attachEvent but does not follow the script
            //script execution mode.
            if (node.attachEvent &&
                    //Check if node.attachEvent is artificially added by custom script or
                    //natively supported by browser
                    //read https://github.com/jrburke/requirejs/issues/187
                    //if we can NOT find [native code] then it must NOT natively supported.
                    //in IE8, node.attachEvent does not have toString()
                    //Note the test for "[native code" with no closing brace, see:
                    //https://github.com/jrburke/requirejs/issues/273
                    !(node.attachEvent.toString && node.attachEvent.toString().indexOf('[native code') < 0) &&
                    !isOpera) {
                //Probably IE. IE (at least 6-8) do not fire
                //script onload right after executing the script, so
                //we cannot tie the anonymous define call to a name.
                //However, IE reports the script as being in 'interactive'
                //readyState at the time of the define call.
                useInteractive = true;

                node.attachEvent('onreadystatechange', context.onScriptLoad);
                //It would be great to add an error handler here to catch
                //404s in IE9+. However, onreadystatechange will fire before
                //the error handler, so that does not help. If addEventListener
                //is used, then IE will fire error before load, but we cannot
                //use that pathway given the connect.microsoft.com issue
                //mentioned above about not doing the 'script execute,
                //then fire the script load event listener before execute
                //next script' that other browsers do.
                //Best hope: IE10 fixes the issues,
                //and then destroys all installs of IE 6-9.
                //node.attachEvent('onerror', context.onScriptError);
            } else {
                node.addEventListener('load', context.onScriptLoad, false);
                node.addEventListener('error', context.onScriptError, false);
            }
            node.src = url;

            //For some cache cases in IE 6-8, the script executes before the end
            //of the appendChild execution, so to tie an anonymous define
            //call to the module name (which is stored on the node), hold on
            //to a reference to this node, but clear after the DOM insertion.
            currentlyAddingScript = node;
            if (baseElement) {
                head.insertBefore(node, baseElement);
            } else {
                head.appendChild(node);
            }
            currentlyAddingScript = null;

            return node;
        } else if (isWebWorker) {
            try {
                //In a web worker, use importScripts. This is not a very
                //efficient use of importScripts, importScripts will block until
                //its script is downloaded and evaluated. However, if web workers
                //are in play, the expectation that a build has been done so that
                //only one script needs to be loaded anyway. This may need to be
                //reevaluated if other use cases become common.
                importScripts(url);

                //Account for anonymous modules
                context.completeLoad(moduleName);
            } catch (e) {
                context.onError(makeError('importscripts',
                                'importScripts failed for ' +
                                    moduleName + ' at ' + url,
                                e,
                                [moduleName]));
            }
        }
    };

    function getInteractiveScript() {
        if (interactiveScript && interactiveScript.readyState === 'interactive') {
            return interactiveScript;
        }

        eachReverse(scripts(), function (script) {
            if (script.readyState === 'interactive') {
                return (interactiveScript = script);
            }
        });
        return interactiveScript;
    }

    //Look for a data-main script attribute, which could also adjust the baseUrl.
    if (isBrowser && !cfg.skipDataMain) {
        //Figure out baseUrl. Get it from the script tag with require.js in it.
        eachReverse(scripts(), function (script) {
            //Set the 'head' where we can append children by
            //using the script's parent.
            if (!head) {
                head = script.parentNode;
            }

            //Look for a data-main attribute to set main script for the page
            //to load. If it is there, the path to data main becomes the
            //baseUrl, if it is not already set.
            dataMain = script.getAttribute('data-main');
            if (dataMain) {
                //Preserve dataMain in case it is a path (i.e. contains '?')
                mainScript = dataMain;

                //Set final baseUrl if there is not already an explicit one.
                if (!cfg.baseUrl) {
                    //Pull off the directory of data-main for use as the
                    //baseUrl.
                    src = mainScript.split('/');
                    mainScript = src.pop();
                    subPath = src.length ? src.join('/')  + '/' : './';

                    cfg.baseUrl = subPath;
                }

                //Strip off any trailing .js since mainScript is now
                //like a module name.
                mainScript = mainScript.replace(jsSuffixRegExp, '');

                 //If mainScript is still a path, fall back to dataMain
                if (req.jsExtRegExp.test(mainScript)) {
                    mainScript = dataMain;
                }

                //Put the data-main script in the files to load.
                cfg.deps = cfg.deps ? cfg.deps.concat(mainScript) : [mainScript];

                return true;
            }
        });
    }

    /**
     * The function that handles definitions of modules. Differs from
     * require() in that a string for the module should be the first argument,
     * and the function to execute after dependencies are loaded should
     * return a value to define the module corresponding to the first argument's
     * name.
     */
    define = function (name, deps, callback) {
        var node, context;

        //Allow for anonymous modules
        if (typeof name !== 'string') {
            //Adjust args appropriately
            callback = deps;
            deps = name;
            name = null;
        }

        //This module may not have dependencies
        if (!isArray(deps)) {
            callback = deps;
            deps = null;
        }

        //If no name, and callback is a function, then figure out if it a
        //CommonJS thing with dependencies.
        if (!deps && isFunction(callback)) {
            deps = [];
            //Remove comments from the callback string,
            //look for require calls, and pull them into the dependencies,
            //but only if there are function args.
            if (callback.length) {
                callback
                    .toString()
                    .replace(commentRegExp, '')
                    .replace(cjsRequireRegExp, function (match, dep) {
                        deps.push(dep);
                    });

                //May be a CommonJS thing even without require calls, but still
                //could use exports, and module. Avoid doing exports and module
                //work though if it just needs require.
                //REQUIRES the function to expect the CommonJS variables in the
                //order listed below.
                deps = (callback.length === 1 ? ['require'] : ['require', 'exports', 'module']).concat(deps);
            }
        }

        //If in IE 6-8 and hit an anonymous define() call, do the interactive
        //work.
        if (useInteractive) {
            node = currentlyAddingScript || getInteractiveScript();
            if (node) {
                if (!name) {
                    name = node.getAttribute('data-requiremodule');
                }
                context = contexts[node.getAttribute('data-requirecontext')];
            }
        }

        //Always save off evaluating the def call until the script onload handler.
        //This allows multiple modules to be in a file without prematurely
        //tracing dependencies, and allows for anonymous module support,
        //where the module name is not known until the script onload event
        //occurs. If no context, use the global queue, and get it processed
        //in the onscript load callback.
        (context ? context.defQueue : globalDefQueue).push([name, deps, callback]);
    };

    define.amd = {
        jQuery: true
    };


    /**
     * Executes the text. Normally just uses eval, but can be modified
     * to use a better, environment-specific call. Only used for transpiling
     * loader plugins, not for plain JS modules.
     * @param {String} text the text to execute/evaluate.
     */
    req.exec = function (text) {
        /*jslint evil: true */
        return eval(text);
    };

    //Set up with config info.
    req(cfg);
}(this));
define('jquery',[], function () {
    'use strict';

    return window.jQuery;
});
define('nerve/utils/helpers',[
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
define('utils/event',[
    'nerve/utils/helpers'
], function (
    Helpers
) {
    'use strict';

    function Event() {
        this.listeners = {};
    }

    Event.prototype = {

        on: function (name, handler) {
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
define('utils/helpers',[
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
/**
 * Базовый модуль, реализующий событийную модель
 *
 * @class
 * @name Event
 * @abstract
 */
define('event',[
    'utils/event',
    'utils/helpers'
], function (
    Event,
    Helpers
) {
    'use strict';

    function EventEmitter(options) {

        /**
         * Параметры, собирающиеся из defaultOptions и переданных в аргументе
         *
         * @type {Object}
         */
        this.options = Helpers.extend(true, {}, this.defaultOptions, options);

        /**
         * Объект, реализующий работу с событиями
         *
         * @type {Event}
         * @protected
         */
        this._event = new Event();

        this
            .initVars()
            .generateAccessors();

        return this;
    }

    EventEmitter.prototype = {

        /**
         * Список свойств для автоматической генерации геттеров и сеттеров
         *
         * @type {Object}
         */
        accessors: {
            get: [],
            set: []
        },

        /**
         * Ининциализация
         *
         * @returns {EventEmitter}
         */
        init: function () {
            return this;
        },

        /**
         * Уничтожение
         *
         * @returns {EventEmitter}
         */
        destroy: function () {
            if (!this.isDestroyed) {
                this.trigger('destroy');
                this.off();

                delete this.options;
                delete this._event;

                this.isDestroyed = true;
            }

            return this;
        },

        /**
         * Подписка на событие
         *
         * @param {String} name название события
         * @param {Function} handler обработчик события
         * @returns {EventEmitter}
         */
        on: function () {
            if (this._event) {
                this._event.on.apply(this._event, arguments);
            }

            return this;
        },

        /**
         * Отписка от события
         *
         * @param {String} name название события
         * @param {Function} handler обработчик события
         * @returns {EventEmitter}
         */
        off: function () {
            if (this._event) {
                this._event.off.apply(this._event, arguments);
            }

            return this;
        },

        /**
         * Генерирование события
         *
         * @param {String} name название события
         * @param {*} data данные, передаваемые в обработчик
         * @returns {EventEmitter}
         */
        trigger: function () {
            if (this._event) {
                this._event.trigger.apply(this._event, arguments);
            }
            return this;
        },

        /**
         * Подгрузка модуля
         *
         * @param {String | Array.<String>} module название модуля
         * @param {Function} [callback] функция, в которую будет передан объект модуля
         * @returns {Promise}
         */
        require: function (module, callback) {
            var promises = [],
                modules = {},
                promise;

            if (!Helpers.isArray(module)) {
                promise = new Promise(function (resolve, reject) {
                    window.requirejs([this.deferred[module] || module], function () {
                        if (!this.isDestroyed) {
                            if (Helpers.isFunction(callback)) {
                                callback.apply(this, arguments);
                            }
                            resolve.apply(this, arguments);
                        }
                    }.bind(this));
                }.bind(this));
            } else {
                module.forEach(function (item) {
                    var moduleName;

                    promises.push(new Promise(function (resolve, reject) {
                        moduleName = this.deferred[item] || item;
                        window.requirejs([moduleName], function (Module) {
                            modules[moduleName] = Module;
                            resolve();
                        });
                    }.bind(this)));
                }.bind(this));

                promise = new Promise(function (resolve, reject) {
                    Promise.all(promises).then(function () {
                        var deps = [];

                        module.forEach(function (item) {
                            var moduleName = this.deferred[item] || item;

                            deps.push(modules[moduleName]);
                        }.bind(this));

                        if (!this.isDestroyed) {
                            resolve.apply(this, deps);
                            if (Helpers.isFunction(callback)) {
                                callback.apply(this, deps);
                            }
                        }
                    }.bind(this)).catch(reject);
                }.bind(this));
            }

            return promise;
        },

        /**
         * Инициализация перменных
         */
        initVars: function () {
            if (Helpers.isPlainObject(this.vars)) {
                Object.keys(this.vars).forEach(function (varName) {
                    this[varName] = this.vars[varName];
                }.bind(this));
            }

            return this;
        },

        /**
         * Генерирование геттеров и сеттеров
         */
        generateAccessors: function () {
            if (Helpers.isArray(this.accessors.get)) {
                this.accessors.get.forEach(function (item) {
                    this['get' + Helpers.capitalize(item)] = function () {
                        return this[item];
                    };
                }.bind(this));
            }

            if (Helpers.isArray(this.accessors.set)) {
                this.accessors.set.forEach(function (item) {
                    this['set' + Helpers.capitalize(item)] = function (value) {
                        this[item] = value;

                        return this;
                    };
                }.bind(this));
            }

            return this;
        }
    };

    EventEmitter.extend = function (proto) {
        var Parent = this,
            Child,
            Surrogate,
            props,
            publicMethods,
            protectedMethods,
            staticMethods;

        Child = function () {
            Parent.apply(this, arguments);

            if (Helpers.isFunction(proto.create)) {
                proto.create.apply(this, arguments);
            }

            if (Helpers.isFunction(proto._constructor)) {
                proto._constructor.apply(this, arguments);
            }

            if (proto.autoInit && !Child.instance) {
                this.autoInit = proto.autoInit;

                if (!this._inited && !this.isDestroyed) {
                    this.init();
                    this._inited = true;
                }
            }

            if (proto.singleton === true && !Child.instance) {
                Child.instance = this;
            }

            return Child.instance || this;
        };

        Helpers.extend(Child, Parent);

        Surrogate = function () {
            this.constructor = Child;
            this.__super__ = Parent.prototype;
        };
        Surrogate.prototype = Parent.prototype;
        Child.prototype = new Surrogate();
        Child.__super__ = Parent.prototype;

        publicMethods = proto.public || {};
        protectedMethods = proto.protected || {};
        staticMethods = proto.static || {};

        props = proto.props || {};

        props.defaultOptions = Helpers.extend(true, {}, Parent.prototype.defaultOptions, props.defaultOptions);
        props.deferred = Helpers.extend(true, {}, Parent.prototype.deferred, props.deferred);
        props.events = Helpers.extend(true, {}, Parent.prototype.events, props.events);
        props.defaults = Helpers.extend(true, {}, Parent.prototype.defaults, props.defaults);
        props.templates = Helpers.extend(true, {}, Parent.prototype.templates, props.templates);
        props.elements = Helpers.extend(true, {}, Parent.prototype.elements, props.elements);
        props.vars = Helpers.extend(true, {}, Parent.prototype.vars, props.vars);

        if (props.accessors) {
            if (Helpers.isArray(props.accessors.get)) {
                props.accessors.get = props.accessors.get.concat(Parent.prototype.accessors.get);
            }
            if (Helpers.isArray(props.accessors.set)) {
                props.accessors.set = props.accessors.set.concat(Parent.prototype.accessors.set);
            }
        }

        Helpers.extend(Child.prototype, Helpers.extend(true, {}, publicMethods, protectedMethods, props));
        Helpers.extend(true, Child, staticMethods);

        return Child;
    };

    return EventEmitter;
});

define('utils/ajax',[
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
/*
 * Cookies.js - 1.2.2
 * https://github.com/ScottHamper/Cookies
 *
 * This is free and unencumbered software released into the public domain.
 */
(function (global, undefined) {
    'use strict';

    var factory = function (window) {
        if (typeof window.document !== 'object') {
            throw new Error('Cookies.js requires a `window` with a `document` object');
        }

        var Cookies = function (key, value, options) {
            return arguments.length === 1 ?
                Cookies.get(key) : Cookies.set(key, value, options);
        };

        // Allows for setter injection in unit tests
        Cookies._document = window.document;

        // Used to ensure cookie keys do not collide with
        // built-in `Object` properties
        Cookies._cacheKeyPrefix = 'cookey.'; // Hurr hurr, :)
        
        Cookies._maxExpireDate = new Date('Fri, 31 Dec 9999 23:59:59 UTC');

        Cookies.defaults = {
            path: '/',
            secure: false
        };

        Cookies.get = function (key) {
            if (Cookies._cachedDocumentCookie !== Cookies._document.cookie) {
                Cookies._renewCache();
            }
            
            var value = Cookies._cache[Cookies._cacheKeyPrefix + key];

            return value === undefined ? undefined : decodeURIComponent(value);
        };

        Cookies.set = function (key, value, options) {
            options = Cookies._getExtendedOptions(options);
            options.expires = Cookies._getExpiresDate(value === undefined ? -1 : options.expires);

            Cookies._document.cookie = Cookies._generateCookieString(key, value, options);

            return Cookies;
        };

        Cookies.expire = function (key, options) {
            return Cookies.set(key, undefined, options);
        };

        Cookies._getExtendedOptions = function (options) {
            return {
                path: options && options.path || Cookies.defaults.path,
                domain: options && options.domain || Cookies.defaults.domain,
                expires: options && options.expires || Cookies.defaults.expires,
                secure: options && options.secure !== undefined ?  options.secure : Cookies.defaults.secure
            };
        };

        Cookies._isValidDate = function (date) {
            return Object.prototype.toString.call(date) === '[object Date]' && !isNaN(date.getTime());
        };

        Cookies._getExpiresDate = function (expires, now) {
            now = now || new Date();

            if (typeof expires === 'number') {
                expires = expires === Infinity ?
                    Cookies._maxExpireDate : new Date(now.getTime() + expires * 1000);
            } else if (typeof expires === 'string') {
                expires = new Date(expires);
            }

            if (expires && !Cookies._isValidDate(expires)) {
                throw new Error('`expires` parameter cannot be converted to a valid Date instance');
            }

            return expires;
        };

        Cookies._generateCookieString = function (key, value, options) {
            key = key.replace(/[^#$&+\^`|]/g, encodeURIComponent);
            key = key.replace(/\(/g, '%28').replace(/\)/g, '%29');
            value = (value + '').replace(/[^!#$&-+\--:<-\[\]-~]/g, encodeURIComponent);
            options = options || {};

            var cookieString = key + '=' + value;
            cookieString += options.path ? ';path=' + options.path : '';
            cookieString += options.domain ? ';domain=' + options.domain : '';
            cookieString += options.expires ? ';expires=' + options.expires.toUTCString() : '';
            cookieString += options.secure ? ';secure' : '';

            return cookieString;
        };

        Cookies._getCacheFromString = function (documentCookie) {
            var cookieCache = {};
            var cookiesArray = documentCookie ? documentCookie.split('; ') : [];

            for (var i = 0; i < cookiesArray.length; i++) {
                var cookieKvp = Cookies._getKeyValuePairFromCookieString(cookiesArray[i]);

                if (cookieCache[Cookies._cacheKeyPrefix + cookieKvp.key] === undefined) {
                    cookieCache[Cookies._cacheKeyPrefix + cookieKvp.key] = cookieKvp.value;
                }
            }

            return cookieCache;
        };

        Cookies._getKeyValuePairFromCookieString = function (cookieString) {
            // "=" is a valid character in a cookie value according to RFC6265, so cannot `split('=')`
            var separatorIndex = cookieString.indexOf('=');

            // IE omits the "=" when the cookie value is an empty string
            separatorIndex = separatorIndex < 0 ? cookieString.length : separatorIndex;

            var key = cookieString.substr(0, separatorIndex);
            var decodedKey;
            try {
                decodedKey = decodeURIComponent(key);
            } catch (e) {
                if (console && typeof console.error === 'function') {
                    console.error('Could not decode cookie with key "' + key + '"', e);
                }
            }
            
            return {
                key: decodedKey,
                value: cookieString.substr(separatorIndex + 1) // Defer decoding value until accessed
            };
        };

        Cookies._renewCache = function () {
            Cookies._cache = Cookies._getCacheFromString(Cookies._document.cookie);
            Cookies._cachedDocumentCookie = Cookies._document.cookie;
        };

        Cookies._areEnabled = function () {
            var testKey = 'cookies.js';
            var areEnabled = Cookies.set(testKey, 1).get(testKey) === '1';
            Cookies.expire(testKey);
            return areEnabled;
        };

        Cookies.enabled = Cookies._areEnabled();

        return Cookies;
    };

    var cookiesExport = typeof global.document === 'object' ? factory(global) : factory;

    // AMD support
    if (typeof define === 'function' && define.amd) {
        define('components/Cookies/dist/cookies',[],function () { return cookiesExport; });
    // CommonJS/Node.js support
    } else if (typeof exports === 'object') {
        // Support Node.js specific `module.exports` (which can be a function)
        if (typeof module === 'object' && typeof module.exports === 'object') {
            exports = module.exports = cookiesExport;
        }
        // But always support CommonJS module 1.1.1 spec (`exports` cannot be a function)
        exports.Cookies = cookiesExport;
    } else {
        global.Cookies = cookiesExport;
    }
})(typeof window === 'undefined' ? this : window);
define('utils/cookie',[
    'components/Cookies/dist/cookies'
], function (Cookies) {
    'use strict';

    return Cookies;
});
/*jslint nomen:true*/

/**
 * Модуль модели
 *
 * @class
 * @name Model
 * @abstract
 * @augments EventEmitter
 */

define('model',[
    'event',
    'utils/ajax',
    'utils/helpers',
    'utils/cookie'
], function (
    EventEmitter,
    Ajax,
    Helpers,
    Cookie
) {

    'use strict';

    var counter = 0,
        Model;

    Model = EventEmitter.extend(
        /** @lends Model.prototype */
        {

            /**
             * Создание
             *
             * @param {Object} attr атрибуты
             * @param {Object} options опции
             * @returns {Model}
             */
            create: function (attr, options) {

                /**
                 * Атрибуты
                 *
                 * @type {Object}
                 * @protected
                 */
                this._attr = Helpers.extend(true, {}, this.defaults, attr);

                /**
                 * Параметры, собирающиеся из defaultOptions и переданных в аргументе
                 *
                 * @type {Object}
                 */
                this.options = Helpers.extend(true, {}, this.defaultOptions, options);

                /**
                 * Идентификатор сущности
                 *
                 * @type {Number | String}
                 */
                this.id = this._attr.id;

                /**
                 * Клиентский идентификатор сущности
                 *
                 * @type {Number}
                 */
                this.cid = counter++;

                /**
                 * Ошибки, связанные с валидацией
                 *
                 * @type {Array}
                 */
                this.errors = [];

                /**
                 * Получены ли данные с сервера
                 * @type {Boolean}
                 */
                this.isFetchedState = false;

                /**
                 * Удалена ли модель
                 * @type {Boolean}
                 */
                this.isRemovedState = false;

                this.delegateEvents();
                this.init();

                return this;
            },

            /** @lends Model.prototype */
            props: {
                /**
                 * URL получения данных
                 *
                 * @type {String}
                 */
                url: '',

                /**
                 * URL сохранения
                 *
                 * @type {String}
                 */
                urlSave: '',

                /**
                 * URL создания
                 *
                 * @type {String}
                 */
                urlCreate: '',

                /**
                 * URL удаления
                 *
                 * @type {String}
                 */
                urlRemove: '',

                /**
                 * Правила валидации
                 *
                 * @type {Array}
                 */
                validation: []
            },

            /** @lends Model.prototype */
            public: {

                /**
                 * Уничтожение
                 *
                 * @returns {Model}
                 */
                destroy: function () {
                    delete this._attr;
                    delete this.id;
                    delete this.cid;
                    delete this.errors;

                    Model.__super__.destroy.call(this);

                    return this;
                },

                /**
                 * Получение значения атрибута
                 *
                 * @param {String} key название атрибута
                 * @returns {*}
                 */
                getSingle: function (key) {
                    var arIds = key.split('.'),
                        iteration = 0,
                        attrItem = this._attr;

                    while (attrItem && iteration < arIds.length) {
                        if (attrItem[arIds[iteration]] !== undefined) {
                            attrItem = attrItem[arIds[iteration]];
                        } else {
                            attrItem = undefined;
                        }

                        iteration++;
                    }

                    return attrItem;
                },

                /**
                 * Установка значения атрибута
                 *
                 * @param {String} key название атрибута
                 * @param {*} value значение атрибута
                 * @param {Boolean} [options.silent = false]
                 * @returns {Boolean} изменился ли атрибут
                 */
                setSingle: function (key, value, options) {
                    var isChanged = false;

                    options = options || {};

                    if (this._attr[key] !== value) {
                        if (Helpers.isString(value)) {
                            value = String(value).trim();
                        }
                        this._attr[key] = value;


                        if (key === 'id') {
                            this.id = value;
                        }

                        if (!options.silent && !options.isNotChangeTrigger) {
                            this.trigger('change.' + key);
                            this.trigger('change');
                        }

                        isChanged = true;
                    }

                    return isChanged;
                },

                /**
                 * Получение значения атрибута или атрибутов
                 *
                 * @param {String | Array.<String>} key названия атрибутов
                 * @returns {* | Object}
                 */
                get: function (key) {
                    var result = null;

                    if (Helpers.isString(key)) {
                        result = this.getSingle(key);
                    }

                    if (Helpers.isArray(key)) {
                        result = {};
                        key.forEach(function (item) {
                            result[item] = this.getSingle(item);
                        }.bind(this));
                    }

                    return result;
                },

                /**
                 * Установка значения атрибута или атрибутов
                 *
                 * @param {String | Object} key название атрибутов или объект с атрибутами
                 * @param {*} [value] значение (для установки одного атрибута)
                 * @param {Boolean} [options.silent = false]
                 */
                set: function (key, value, options) {
                    var changedAttrs = [];

                    if (Helpers.isString(key)) {
                        if (this.setSingle(key, value, Helpers.extend({}, options, {isNotChangeTrigger: true}))) {
                            this.trigger('change.' + key);
                        }
                    }

                    if (Helpers.isObject(key)) {
                        options = value;

                        Object.keys(key).forEach(function (item) {
                            if (this.setSingle(item, key[item], Helpers.extend({}, options, {isNotChangeTrigger: true}))) {
                                changedAttrs.push(item);
                            }
                        }.bind(this));

                        if (!options || !options.silent) {
                            changedAttrs.forEach(function (item) {
                                this.trigger('change.' + item);
                            }.bind(this));
                        }
                    }

                    if (!options || !options.silent) {
                        this.trigger('change');
                    }

                    return this;
                },

                /**
                 * Валидация атрибутов
                 *
                 * @returns {Boolean}
                 */
                validate: function (options) {
                    this.errors = [];

                    this.validation.forEach(function (item) {
                        var value;

                        if (String(item.value).indexOf('@') === 0) {
                            value = this.get(item.value.slice(1));
                        } else {
                            value = item.value;
                        }

                        if (!Helpers.isFunction(item.condition) || item.condition.call(this, options)) {
                            switch (item.type) {
                            case 'eq':
                                item.attr.forEach(function (attr1) {
                                    item.attr.forEach(function (attr2) {
                                        if (item.byLength) {
                                            if (String(this.get(attr1)).length === String(this.get(attr2)).length) {
                                                this.errors.push(item.errorCode);
                                            }
                                        } else {
                                            if (this.get(attr1) !== this.get(attr2)) {
                                                this.errors.push(item.errorCode);
                                            }
                                        }
                                    }.bind(this));
                                }.bind(this));
                                break;
                            case 'lt':
                                item.attr.forEach(function (attr) {
                                    var length,
                                        attrValue = this.get(attr);

                                    if (item.byLength) {
                                        if (Helpers.isArray(attrValue)) {
                                            length = attrValue.length;
                                        } else {
                                            length = String(attrValue).length;
                                        }

                                        if ((item.strict && length > value) || (!item.strict && length >= value)) {
                                            this.errors.push(item.errorCode);
                                        }
                                    } else {
                                        if ((item.strict && attrValue > value) || (!item.strict && attrValue >= value)) {
                                            this.errors.push(item.errorCode);
                                        }
                                    }
                                }.bind(this));
                                break;
                            case 'gt':
                                item.attr.forEach(function (attr) {
                                    var length,
                                        attrValue = this.get(attr);

                                    if (item.byLength) {
                                        if (Helpers.isArray(attrValue)) {
                                            length = attrValue.length;
                                        } else {
                                            length = String(attrValue).length;
                                        }

                                        if ((item.strict && length < value) || (!item.strict && length <= value)) {
                                            this.errors.push(item.errorCode);
                                        }
                                    } else {
                                        if ((item.strict && attrValue < value) || (!item.strict && attrValue <= value)) {
                                            this.errors.push(item.errorCode);
                                        }
                                    }
                                }.bind(this));
                                break;
                            case 'required':
                                item.attr.forEach(function (attr) {
                                    var attrValue = this.get(attr),
                                        isError = (Helpers.isArray(attrValue) && attrValue.length === 0) || !attrValue;

                                    if (isError) {
                                        this.errors.push(item.errorCode);
                                    }
                                }.bind(this));
                                break;
                            case 'regexp':
                                item.attr.forEach(function (attr) {
                                    if (!value.test(this.get(attr))) {
                                        this.errors.push(item.errorCode);
                                    }
                                }.bind(this));
                                break;
                            }
                        }
                    }.bind(this));

                    return this.errors.length === 0;
                },

                /**
                 * Преобразование атрибутов в объект
                 *
                 * @returns {Object}
                 */
                toJSON: function () {
                    return Helpers.extend(true, {}, this._attr);
                },

                /**
                 * Получение данных с сервера
                 *
                 * @returns {Promise}
                 */
                fetch: function () {
                    return new Promise(function (resolve, reject) {
                        this.fetchXHR = Ajax.send(Helpers.extend(this.getFetchSettings(), {
                            url: this.url,
                            data: this.getFetchParams()
                        }));

                        this.fetchXHR
                            .success(function (response) {
                                if (!this.isDestroyed) {
                                    if (Helpers.isString(response)) {
                                        response = JSON.parse(response);
                                    }

                                    this.set(this.adapter(response));

                                    this.isFetchedState = true;
                                    if (Helpers.isFunction(this.onFetched)) {
                                        this.onFetched(response);
                                    }
                                    this.trigger('fetched');

                                    resolve(response);
                                }
                            }.bind(this))

                            .error(function () {
                                this.trigger('fetched');
                                reject();
                            }.bind(this));

                    }.bind(this));
                },

                /**
                 * Отправление запроса на сохранение
                 *
                 * @returns {Promise}
                 */
                save: function () {
                    this.trigger('beforeSave');

                    return new Promise(function (resolve, reject) {
                        var validateOptions = {
                            mode: 'save'
                        };

                        if (this.validate(validateOptions)) {
                            Ajax.send(Helpers.extend(this.getSaveSettings(), {
                                url: this.urlSave,
                                data: this.getSaveParams()
                            }))
                                .success(function (response) {
                                    if (Helpers.isString(response)) {
                                        response = JSON.parse(response);
                                    }

                                    this.trigger('saved');
                                    resolve(response);
                                }.bind(this))
                                .error(reject);
                        } else {
                            reject();
                        }

                    }.bind(this));
                },

                /**
                 * Отправление запроса на создание
                 *
                 * @returns {Promise}
                 */
                create: function () {
                    this.trigger('beforeCreate');

                    return new Promise(function (resolve, reject) {
                        var validateOptions = {
                            mode: 'create'
                        };

                        if (this.validate(validateOptions)) {
                            Ajax.send(Helpers.extend(this.getCreateSettings(), {
                                url: this.urlCreate,
                                data: this.getCreateParams()
                            }))
                                .success(function (response) {
                                    if (Helpers.isString(response)) {
                                        response = JSON.parse(response);
                                    }

                                    this.trigger('created');
                                    resolve(response);
                                }.bind(this))
                                .error(reject);
                        } else {
                            reject();
                        }

                    }.bind(this));
                },

                /**
                 * Отправление запроса на удаление
                 *
                 * @returns {Promise}
                 */
                remove: function () {
                    this.trigger('beforeRemove');
                    this.isRemovedState = true;

                    return new Promise(function (resolve, reject) {

                        if (this.isRemoveReady()) {
                            Ajax.send(Helpers.extend(this.getRemoveSettings(), {
                                url: this.urlRemove,
                                data: this.getRemoveParams()
                            }))
                                .success(function (response) {
                                    if (Helpers.isString(response)) {
                                        response = JSON.parse(response);
                                    }

                                    this.trigger('removed');
                                    resolve(response);
                                }.bind(this))
                                .error(reject);
                        } else {
                            this.trigger('removed');
                            reject();
                        }

                    }.bind(this));
                },

                /**
                 * Отмена текущей загрузки
                 *
                 * @returns {Model}
                 */
                abort: function () {
                    if (this.fetchXHR) {
                        this.fetchXHR.abort();
                        this.trigger('aborted');
                    }

                    return this;
                },

                /**
                 * Метод, позволяющий выполнить некторое действие только после того, как данные с сервера будут получены
                 *
                 * @returns {Promise}
                 */
                fetched: function () {
                    return new Promise(function (resolve) {
                        if (this.isFetched()) {
                            resolve();
                        } else {
                            this.on('fetched', function () {
                                resolve();
                            });
                        }
                    }.bind(this));
                },

                /**
                 * Метод добавляющий свойста в модель после получения от сервера
                 *
                 * @returns {Model}
                 */
                setResponse: function (response) {
                    this.set(this.adapter(response));

                    return this;
                },

                /**
                 * Проверка на то, были ли получены данные с сервера
                 *
                 * @returns {Boolean}
                 */
                isFetched: function () {
                    return this.isFetchedState;
                },

                /**
                 * Проверка на то, что модель была удалена
                 *
                 * @returns {Boolean}
                 */
                isRemoved: function () {
                    return this.isRemovedState;
                },

                /**
                 * Проверка готовности удаления
                 *
                 * @returns {Boolean}
                 */
                isRemoveReady: function () {
                    return !!this.get(this.uniqueKey);
                },

                /**
                 * Проверка состояния текущей загрузки
                 *
                 * @returns {Boolean}
                 */
                isPending: function () {
                    return this.fetchXHR && this.fetchXHR.state() === 'pending';
                }
            },

            /** @lends Model.prototype */
            protected: {

                /**
                 * Уникальный ключ для модели
                 *
                 * @protected
                 * @type {String}
                 */
                uniqueKey: 'id',

                /**
                 * Назначение обработчиков событий
                 *
                 * @protected
                 * @returns {Model}
                 */
                delegateEvents: function () {
                    if (this.events) {
                        Object.keys(this.events).forEach(function (eventItem) {
                            this.on(eventItem, this[this.events[eventItem]].bind(this));
                        }.bind(this));
                    }

                    return this;
                },

                /**
                 * Адаптирование данных, приходящих от сервера
                 *
                 * @protected
                 * @param {Object} srcAttr данные, пришедшие от сервера
                 * @returns {Object}
                 */
                adapter: function (srcAttr) {
                    return srcAttr;
                },

                /**
                 * Получение URL для AJAX запросов на сервер
                 *
                 * @protected
                 * @returns {String}
                 */
                getUrl: function () {
                    return (Cookie.get('_sp_model') || '') + this.url;
                },

                /**
                 * Получение данных, отправляемых на сервер при получении данных
                 *
                 * @protected
                 * @returns {Object}
                 */
                getFetchParams: function () {
                    var params = {};
                    params[this.uniqueKey] = this.get(this.uniqueKey);

                    return params;
                },

                /**
                 * Получение данных, отправляемых на сервер при сохраненнии
                 *
                 * @protected
                 * @returns {Object}
                 */
                getSaveParams: function () {
                    return Helpers.extend(true, {}, this.toJSON());
                },

                /**
                 * Получение данных, отправляемых на сервер при создании
                 *
                 * @protected
                 * @returns {Object}
                 */
                getCreateParams: function () {
                    return Helpers.extend(true, {}, this.toJSON());
                },

                /**
                 * Получение данных, отправляемых на сервер при удалении
                 *
                 * @protected
                 * @returns {Object}
                 */
                getRemoveParams: function () {
                    return Helpers.extend(true, {}, {
                        id: this.get('id')
                    });
                },

                /**
                 * Получение настроек AJAX запроса при получении данных
                 *
                 * @protected
                 * @returns {Object}
                 */
                getFetchSettings: function () {
                    return {
                        url: this.getUrl()
                    };
                },

                /**
                 * Получение настроек AJAX запроса при сохранении
                 *
                 * @protected
                 * @returns {Object}
                 */
                getSaveSettings: function () {
                    return {
                        url: this.getUrl(),
                        type: 'post'
                    };
                },

                /**
                 * Получение настроек AJAX запроса при создании
                 *
                 * @protected
                 * @returns {Object}
                 */
                getCreateSettings: function () {
                    return {
                        url: this.getUrl(),
                        type: 'post',
                        abortCaptcha: function () {
                            this.trigger('abortCaptcha');
                        }.bind(this)
                    };
                },

                /**
                 * Получение настроек AJAX запроса при удалении
                 *
                 * @protected
                 * @returns {Object}
                 */
                getRemoveSettings: function () {
                    return {
                        url: this.getUrl(),
                        type: 'post'
                    };
                }

            }
        }
    );

    return Model;
});

/*global requirejs*/
/*jslint nomen: true */

/**
 * Модуль представления
 *
 * @class
 * @name View
 * @abstract
 * @augments Event
 */

define('view',[
    'jquery',
    'event',
    'utils/helpers'
], function (
    $,
    EventEmitter,
    Helpers
) {
    'use strict';

    var View,
        cachedTemplates = {};

    View = EventEmitter.extend({

        create: function () {

            /**
             * Модель, связанная с представлением
             *
             * @type {Model}
             * @memberOf View
             */
            this.model = this.options.model;

            /**
             * Корневой jQuery элемент
             *
             * @type {jQuery}
             * @memberOf View
             */
            this.$el = $();

            /**
             * jQuery элементы созданные при рендеринге
             *
             * @type {jQuery}
             * @memberOf View
             */
            this.$els = $();

            /**
             * Корневой Dom элемент
             *
             * @type {Element}
             * @memberOf View
             */
            this.el = null;

            /**
             * Обработчики событий на Dom элементах
             *
             * @type {Object}
             * @private
             * @memberOf View
             */
            this._domEventHandlers = {};

            /**
             * Обещание рендеринга
             *
             * @type {Promise}
             * @private
             * @memberOf View
             */
            this.promiseRender = new Promise(function (resolve) {
                this.on('render', resolve);
            }.bind(this));

            /**
             * Обещание загрузки css
             *
             * @type {Promise}
             * @private
             * @memberOf View
             */
            this.promiseCss = new Promise(function (resolve) {
                this.on('cssLoad', resolve);
            }.bind(this));

            Promise.all([this.promiseRender, this.promiseCss]).then(this.onViewReady.bind(this));

            this.loadCss();

            return this;
        },

        props: {

            /**
             * Массив подключаемых css файлов
             *
             * @type {Array.<String>}
             * @memberOf View
             */
            css: [],

            /**
             * События, назначающиеся Dom элементам
             *
             * @type {Object}
             * @memberOf View
             */
            events: {},

            /**
             * Кеширующиеся Dom элементы
             *
             * @type {Object}
             * @memberOf View
             */
            elements: {},

            /**
             * Селектор элемента, в котором находится JSON с опциями
             *
             * @type {String}
             * @memberOf View
             */
            optionsSelector: 'script[type="text/plain"]',

            /**
             * Автоматически удалять DOM-элемент при уничтожении
             *
             * @type {Boolean}
             * @memberOf View
             */
            autoRemove: true

        },

        public: {

            /**
             * Уничтожение
             *
             * @returns {View}
             * @memberOf View
             */
            destroy: function () {
                if (!this.isDestroyed) {
                    this.unDelegateEvents();

                    if (Helpers.isjQueryObject(this.$el)) {
                        this.$el.off();

                        if (this.autoInit && this.autoRemove) {
                            this.$el.remove();
                        }
                    }
                    if (Helpers.isjQueryObject(this.$els)) {
                        this.$els.off();

                        if (this.autoInit && this.autoRemove) {
                            this.$els.remove();
                        }
                    }

                    delete this.$el;
                    delete this.el;
                    delete this.model;
                    delete this._domEventHandlers;
                }

                View.__super__.destroy.call(this);

                return this;
            },

            /**
             * Получение корневого элемента
             *
             * @returns {jQuery}
             * @memberOf View
             */
            getElement: function () {
                return this.$el;
            },

            /**
             * Добавление обрабочика готовности
             *
             * @param {Function} callback обработчик
             * @returns {Promise}
             * @memberOf View
             */
            ready: function (callback) {
                return new Promise(function (resolve) {
                    if (this._isReady) {
                        resolve();
                        if (Helpers.isFunction(callback)) {
                            callback();
                        }
                    } else {
                        if (Helpers.isFunction(callback)) {
                            this.on('ready', callback);
                        }
                        this.on('ready', resolve);
                    }
                }.bind(this));
            },

            /**
             * Рендеринг шаблона
             *
             * @param {String} [options.template = 'main'] идентификатор шаблона или путь к нему
             * @param {String} [options.data] данные, передаваемые в шаблон
             * @param {String} options.type тип рендеринга (при значении 'plain' выполняется только непосредственно рендеринг и возвращается строка с html)
             * @param {Function} callback функция, в которую будет передан созданный jQuery элемент
             * @returns {Promise}
             * @memberOf View
             */
            render: function (options, callback) {
                var args = arguments;

                webConsole.time('before render');
                return new Promise(function (resolve) {
                    var templateId,
                        modelData,
                        data,
                        templatePath;

                    options = options || {};

                    if (Helpers.isFunction(options)) {
                        callback = options;
                        options = {};
                    }

                    if (Helpers.isPlainObject(options) && !options.template) {
                        options = {
                            data: options
                        };
                    }

                    if (Helpers.isString(options)) {
                        options = {
                            template: options
                        };
                        if (Helpers.isPlainObject(callback)) {
                            options.data = callback;
                            callback = args[2];
                        }
                    }

                    if (this.model) {
                        modelData = this.model.toJSON();
                    }


                    data = Helpers.extend(true, {}, modelData, options.data, {
                        locales: (this.options && this.options.locales) || options.locales,
                        options: this.options
                    });

                    templateId = options.template || 'main';

                    if (this.templates[templateId]) {
                        templatePath = this.templates[templateId];
                    } else {
                        templatePath = templateId;
                    }

                    webConsole.timeEnd('before render', '/logs/render');
                    if (templatePath) {
                        webConsole.time('require template');
                        this.constructor.getTemplate(templatePath, function (template) {
                            var html,
                                $html;

                            webConsole.timeEnd('require template', '/logs/render');
                            if (!this.isDestroyed) {
                                webConsole.time('handlebars');
                                html = template(data).trim();
                                webConsole.timeEnd('handlebars', '/logs/render');

                                if (options.type === 'plain') {
                                    resolve(html);
                                    if (Helpers.isFunction(callback)) {
                                        callback(html);
                                    }
                                } else {
                                    webConsole.time('after render');

                                    $html = html.string ? $(html.string) : $(html);

                                    if (templateId === 'main') {
                                        this.setElement($html);
                                    } else {
                                        if (this.options.isCollectElements) {
                                            this.$els = this.$els.add($html);
                                        }
                                        this.updateElements();
                                    }

                                    this._isRendered = true;
                                    this.delegateEvents();

                                    if (Helpers.isFunction(this.onRender) && templateId === 'main') {
                                        this.onRender();
                                    }
                                    webConsole.timeEnd('after render', '/logs/render');
                                    this.trigger('render', {
                                        templateId: templateId
                                    });

                                    resolve($html);
                                    if (Helpers.isFunction(callback)) {
                                        callback($html);
                                    }
                                }
                            }
                        }.bind(this));
                    }
                }.bind(this));
            },

            /**
             * Проверка отрендерен ли шаблон
             *
             * @returns {Boolean}
             * @memberOf View
             */
            isRendered: function () {
                return this._isRendered;
            },

            /**
             * Выполнение функции после рендеринга
             *
             * @param {Function} callback
             * @param {Boolean} [isSingle = false] выполнить обработчик только один раз
             * @memberOf View
             */
            rendered: function (callback, isSingle) {
                return new Promise(function (resolve) {
                    if (this.isRendered()) {
                        resolve();
                        if (Helpers.isFunction(callback)) {
                            callback();
                        }
                    } else {
                        if (Helpers.isFunction(callback)) {
                            this.on('render', callback, isSingle);
                        }
                        this.on('render', resolve);
                    }
                }.bind(this));
            },

            /**
             * Удаление отрендеренного Dom элемента
             *
             * @param {jQuery} $el Dom элемент для удаления
             * @memberOf View
             */
            remove: function ($el) {
                if (Helpers.isNode($el)) {
                    $el = $($el);
                }
                this.$els.each(function (index, el) {
                    if (el === $el.get(0)) {
                        this.$els.splice(index, 1);
                    }
                }.bind(this));
            }

        },

        protected: {

            /**
             * Установка корневого Dom элемента
             *
             * @param {jQuery} $el элемент
             * @returns {View}
             * @private
             * @memberOf View
             */
            setElement: function ($el) {
                if (Helpers.isjQueryObject($el)) {
                    this.$el = $el;
                    this.el = this.$el.get(0);
                } else if (Helpers.isNode($el)) {
                    this.$el = $($el);
                    this.el = $el;
                }

                this.updateElements();

                return this;
            },

            /**
             * Назначение обработчиков событий
             *
             * @returns {View}
             * @private
             * @memberOf View
             */
            delegateEvents: function () {
                if (!this.isDestroyed) {
                    this.unDelegateEvents();

                    Object.keys(this.events).forEach(function (eventItem) {
                        var eventData = eventItem.match(/^(\S+)(?: ([\w\W]*))?/),
                            eventHandlerData = this.events[eventItem],
                            isDelegate = true,
                            isThrottled = false,
                            isPreventDefault = false,
                            isStopPropagation = false,
                            throttling = 0,
                            handler,
                            eventType = eventData[1],
                            eventSelector = eventData[2],
                            $delegator;

                        if (Helpers.isString(eventHandlerData)) {
                            handler = this[eventHandlerData];
                        } else if (Helpers.isObject(eventHandlerData)) {
                            handler = this[eventHandlerData.method];
                            isDelegate = eventHandlerData.delegate !== false;
                            throttling = eventHandlerData.throttling;
                            isPreventDefault = eventHandlerData.preventDefault || false;
                            isStopPropagation = eventHandlerData.stopPropagation || false;
                        }

                        if (Helpers.isFunction(handler)) {
                            this._domEventHandlers[eventItem] = function (event, data) {
                                var $target;

                                if (isPreventDefault) {
                                    event.preventDefault();
                                }

                                if (isStopPropagation) {
                                    event.stopPropagation();
                                }

                                if (eventSelector) {
                                    if ($(event.target).is(eventSelector)) {
                                        $target = $(event.target);
                                    } else {
                                        $target = $(event.target).closest(eventSelector);
                                    }
                                } else {
                                    $target = this.$el;
                                }

                                if (throttling) {
                                    if (!isThrottled) {
                                        isThrottled = true;
                                        setTimeout(function () {
                                            isThrottled = false;
                                        }, throttling);
                                        handler.call(this, $target, event, data);
                                    }
                                } else {
                                    handler.call(this, $target, event, data);
                                }

                            }.bind(this);

                            if (eventType === 'input' && $.browser.msie && $.browser.version <= 11) {
                                eventType = 'keyup';
                            }

                            if (this.options.isCollectElements) {
                                $delegator = this.$el.add(this.$els);
                            } else {
                                $delegator = this.$el;
                            }

                            if (eventSelector) {
                                if (isDelegate) {
                                    $delegator.on(eventType, eventSelector, this._domEventHandlers[eventItem]);
                                } else {
                                    $delegator.find(eventSelector).on(eventType, this._domEventHandlers[eventItem]);
                                }
                            } else {
                                $delegator.on(eventType, this._domEventHandlers[eventItem]);
                            }
                        }
                    }.bind(this));
                }

                return this;
            },

            /**
             * Удаление обработчиков событий
             *
             * @returns {View}
             * @private
             * @memberOf View
             */
            unDelegateEvents: function () {
                if (!this.isDestroyed) {
                    Object.keys(this.events).forEach(function (eventItem) {
                        var eventData = eventItem.match(/^(\S+)(?: ([\w\W]*))?/),
                            eventType = eventData[1],
                            eventSelector = eventData[2];

                        if (this._domEventHandlers && Helpers.isFunction(this._domEventHandlers[eventItem]) && Helpers.isjQueryObject(this.$el)) {
                            if (eventSelector) {
                                this.$el.add(this.$els).off(eventType, eventSelector, this._domEventHandlers[eventItem]);
                            } else {
                                this.$el.add(this.$els).off(eventType, this._domEventHandlers[eventItem]);
                            }
                        }
                    }.bind(this));
                }

                return this;
            },

            /**
             * Обновление закешированных Dom элементов
             *
             * @private
             * @memberOf View
             */
            updateElements: function () {
                if (Helpers.isjQueryObject(this.$el)) {
                    Object.keys(this.elements).forEach(function (item) {
                        var selector = this.elements[item],
                            $el,
                            $filter;

                        if (this.options.isCollectElements) {
                            $el = this.$el.add(this.$els).find(selector).add(this.$els.filter(selector));

                            if ($el.size() === 0) {
                                $filter = this.$el.filter(selector);
                                if ($filter.size() !== 0) {
                                    $el = $filter;
                                }
                            }
                            if ($el.size() === 0) {
                                this.$els.each(function (index, el) {
                                    if ($(el).is(selector)) {
                                        $el = $(el);
                                    }
                                });
                            }
                        } else {
                            $el = this.$el.find(selector);
                        }

                        this['$' + item] = $el;
                    }.bind(this));
                }

                return this;
            },

            /**
             * Сброс отрендеренных элементов
             */
            clearEls: function () {
                this.$els = $();
                return this;
            },

            /**
             * Парсинг опций
             *
             * @private
             * @memberOf View
             */
            parseOptions: function () {
                var options;
                try {
                    options = JSON.parse(this.$el.find(this.optionsSelector).html().replace(/\r|\n|\t|\s{2,}/g, ''));
                } catch (err) {
                    options = {};
                }

                this.options = Helpers.extend(true, {}, this.defaultOptions, this.options, options);
            },

            /**
             * Загрузка css файлов
             *
             * @private
             * @memberOf View
             */
            loadCss: function () {
                var promises = [];

                this.css.forEach(function (item) {
                    promises.push(new Promise(function (resolve) {
                        window.requirejs(['util/css-manager'], function (CssManager) {
                            CssManager.require(item, resolve);
                        });
                    }));
                });
                Promise.all(promises).then(this.trigger.bind(this, 'cssLoad'));
            },

            /**
             * Обработчик готовности
             *
             * @private
             * @memberOf View
             */
            onViewReady: function () {
                this.trigger('ready');
                this._isReady = true;
            }

        },

        static: {

            create: function (options) {
                var self = new this(options);

                return {
                    onLoad: function ($el, isNotCallInit) {
                        self.setElement($el);
                        self.loadCss();
                        self.parseOptions();
                        self.delegateEvents();
                        if (!isNotCallInit) {
                            self.init();
                        }

                        return self;
                    },

                    onUnload: function () {
                        self.destroy();

                        return self;
                    }
                };
            },

            createRunTime: function (options, $el, isNotCallInit) {
                if (Helpers.isjQueryObject(options)) {
                    $el = options;
                    options = {};
                }
                if (Helpers.isNode(options)) {
                    $el = $(options);
                    options = {};
                }

                if (!Helpers.isjQueryObject($el) && Helpers.isNode($el)) {
                    $el = $($el);
                }

                return this.create(options).onLoad($el, isNotCallInit);
            },


            /**
             * Получение откомпилированного шаблона
             *
             * @param {String} templatePath путь к шаблону
             * @param callback функция, в которую будет передана функция-шаблон
             */
            getTemplate: function (templatePath, callback) {
                if (Helpers.isFunction(callback)) {
                    if (cachedTemplates[templatePath]) {
                        callback(cachedTemplates[templatePath]);
                    } else {
                        requirejs([templatePath], function (template) {
                            cachedTemplates[templatePath] = template;
                            callback(template);
                        });
                    }
                }
            },

            renderListPlain: function (options) {
                return new Promise(function (resolve) {
                    var promises;

                    promises = options.data.map(function (item) {
                        return this.prototype.render({
                            template: options.template,
                            locales: options.locales,
                            data: item,
                            type: 'plain'
                        });
                    }.bind(this));

                    Promise.all(promises).then(function (results) {
                        var html = results.join('');

                        if (Helpers.isFunction(options.callback)) {
                            options.callback(html);
                        }

                        resolve(html);
                    }.bind(this));
                }.bind(this));
            },

            renderList: function (options) {
                return new Promise(function (resolve) {
                    this.renderListPlain({
                        template: options.template || 'main',
                        data: options.data,
                        locales: options.locales
                    }).then(function (html) {
                        var element,
                            views = [],
                            result = {
                                html: html
                            },
                            viewOptions = options.viewOptions || {},
                            i = 0;

                        if (options.$container) {
                            element = options.$container.get(0).lastChild;
                            options.$container.append(html);

                            if (Helpers.isFunction(options.callback)) {
                                options.callback(result);
                            }
                            resolve(result);

                            if (!options.isNoCreateViews) {
                                if (!element) {
                                    element = options.$container.get(0).firstChild;
                                } else {
                                    element = element.nextSibling;
                                }

                                while (element) {
                                    if (options.models) {
                                        viewOptions.model = options.models[i++];
                                    }

                                    views.push(this.createRunTime(viewOptions, element));
                                    element = element.nextSibling;
                                }
                            }
                        }
                    }.bind(this));
                }.bind(this));
            }

        }
    });

    return View;
});

/**
 * Модуль маршрутизатора
 *
 * @class
 * @name Router
 * @augments Event
 */

define('router',[
    'jquery',
    'event',
    'utils/helpers'
], function (
    $,
    EventEmitter,
    Helpers
) {
    'use strict';

    var Router = EventEmitter.extend({

        autoInit: true,

        props: {

            defaultOptions: {
                linkSelector: '.js-router-link,.sp-music-booster,[type="booster"]',
                activeSelector: 'js-router-link_active',
                routes: {}
            }

        },

        create: function () {
            this.routes = {};

            Object.keys(this.options.routes).forEach(function (route) {
                this.route(route, this.options.routes[route]);
            }.bind(this));

            $(window).on('popstate', function () {
                return this.checkRoutes(window.history.state, true);
            }.bind(this));

            $(document.body).on('click', this.options.linkSelector, this.onLinkClick.bind(this));
        },

        public: {

            init: function (url) {
                this.checkRoutes({
                    url: url
                }, false);
            },

            route: function (routeUrl, callback) {
                var route,
                    namedParams;

                if (Helpers.isFunction(callback)) {
                    route = {
                        callback: callback
                    };
                } else if (Helpers.isString(callback)) {
                    route = {
                        module: callback
                    };
                } else if (Helpers.isPlainObject(callback)) {
                    route = {
                        module: callback.module,
                        callback: callback.callback,
                        reload: callback.reload
                    };
                }

                if (route) {
                    route.params = [];
                    namedParams = routeUrl.match(/:\w+/g);
                    if (namedParams) {
                        namedParams.forEach(function (param) {
                            route.params.push(param.slice(1));
                        });
                    }
                    routeUrl = routeUrl
                        .replace(/:\w+/g, '([^\/]+)')
                        .replace(/\*\w+/g, '(.*?)');

                    if (routeUrl !== 'default') {
                        routeUrl = '^' + routeUrl + '$';
                    }

                    this.routes[routeUrl] = route;
                }
            },

            checkRoutes: function (state, load, response) {
                var url = (state && (state.url || state.hash)) || window.location.pathname,
                    path = url
                        .split('?')[0]
                        .replace(/\/{2,}/g, '/'),
                    query = {},
                    isFound = false;

                if (url.indexOf('?') !== -1) {
                    url.split('?')[1].split('&').forEach(function (item) {
                        var queryItem = item.split('=');

                        query[queryItem[0]] = queryItem[1];
                    });
                }

                Object.keys(this.routes).forEach(function (routeUrl) {
                    var regex = new RegExp(routeUrl),
                        route = this.routes[routeUrl],
                        paramValues,
                        params = {};

                    if (regex.test(path)) {
                        paramValues = regex.exec(path).slice(1);
                        route.params.forEach(function (paramName, index) {
                            params[paramName] = paramValues[index];
                        });

                        if (load && (route.reload || (this.currentRoute && this.currentRoute.reload))) {
                            location.reload();
                        } else {
                            this.proccessingRoute(route, params, query, load, response);
                        }

                        this.currentRoute = route;

                        isFound = true;
                    }
                }.bind(this));

                if (!isFound && this.routes.default) {
                    this.proccessingRoute(this.routes.default, {}, query, load, response);
                }
            },

            proccessingRoute: function (route, params, query, load, response) {
                if (Helpers.isFunction(route.callback)) {
                    route.callback(load, params);
                }
                if (Helpers.isString(route.module)) {
                    this.require(route.module, function (Page) {
                        var oldPage = this.currentPage;

                        if (load) {
                            if (oldPage && oldPage.isPending()) {
                                oldPage.abort();
                            }

                            this.currentPage = new Page({
                                isRunTimeCreated: true,
                                request: {
                                    params: params,
                                    query: query
                                }
                            });

                            this.trigger('route', {
                                page: this.currentPage
                            });

                            if (this.currentPage.isNeedLoad()) {
                                if (!response) {
                                    this.currentPage.load();
                                } else {
                                    this.currentPage.setResponse(response);
                                    this.currentPage.onLoadSuccess();
                                }
                            } else {
                                this.currentPage.onLoadSuccess();
                            }

                            this.currentPage.on('render', function () {
                                if (oldPage) {
                                    oldPage.destroy();
                                }
                                setTimeout(function () {
                                    this.currentPage.initPage();
                                    this.currentPage.afterInitPage();
                                }.bind(this));
                            }.bind(this));
                        } else {
                            this.currentPage = Page.createRunTime(
                                {
                                    isRunTimeCreated: false,
                                    request: {
                                        params: params,
                                        query: query
                                    }
                                },
                                $('[data-routing-page="' + route.module + '"]'),
                                true
                            );

                            this.trigger('route', {
                                page: this.currentPage
                            });
                            this.currentPage.initPage();
                            this.currentPage.afterInitPage();
                        }
                    }.bind(this));
                }
            },

            go: function (url) {
                window.history.pushState({
                    url : url
                }, null, url);

                this.checkRoutes({
                    url: url
                }, true);
            },

            navigate: function (url) {
                this.go(url);
            },

            update: function () {
                var url = window.location.pathname + window.location.search;

                this.go(url);
            }

        },

        protected: {

            onLinkClick: function (event) {
                var $target = $(event.target),
                    $link = $target.closest(this.options.linkSelector);

                if (!$link.size()) {
                    $link = $target;
                }

                webConsole.time('full processing page');

                if (event.ctrlKey || event.shiftKey || event.metaKey) {
                    return true;
                }
                event.preventDefault();
                event.stopPropagation();
                event.cancelBubble = true;

                if (!$link.hasClass(this.options.activeSelector)) {
                    this.go($link.attr('href').replace(/^http[s]?:\/\/[\w\d\._\-]+/, ''));
                }

                return false;
            }

        },

        static: {

            instance: null,

            init: function (url) {
                if (!this.instance) {
                    this.instance = new this();
                }

                this.instance.checkRoutes({
                    url: url
                }, false);
            },

            on: function () {
                if (!this.instance) {
                    this.instance = new this();
                }

                return this.instance.on.apply(this.instance, arguments);
            },

            off: function () {
                if (!this.instance) {
                    this.instance = new this();
                }

                return this.instance.off.apply(this.instance, arguments);
            },

            setOptions: function (options) {
                if (!this.instance) {
                    this.instance = new this(options);
                }

                this.instance.options = Helpers.extend(true, {}, this.instance.options, options);
            },

            route: function (routes) {
                if (!this.instance) {
                    this.instance = new this();
                }

                Object.keys(routes).forEach(function (route) {
                    this.instance.route(route, routes[route]);
                }.bind(this));
            },

            default: function (defaultRoute) {
                if (!this.instance) {
                    this.instance = new this();
                }

                this.instance.default(defaultRoute);
            },

            go: function (url) {
                if (!this.instance) {
                    this.instance = new this();
                }

                this.instance.go(url);
            },

            checkRoutes: function (state, load, response) {
                if (!this.instance) {
                    this.instance = new this();
                }

                this.instance.checkRoutes(state, load, response);
            },

            update: function () {
                if (!this.instance) {
                    this.instance = new this();
                }

                this.instance.update();
            },

            getCurrentPage: function () {
                var page = null;

                if (this.instance) {
                    page = this.instance.currentPage;
                }

                return page;
            }

        }

    });

    return Router;

});
/*jslint nomen:true*/

/**
 * Модуль коллекции
 *
 * @class
 * @name Collection
 * @abstract
 * @augments Event
 */

define('collection',[
    'event',
    'utils/ajax',
    'utils/helpers',
    'utils/cookie'
], function (
    EventEmitter,
    Ajax,
    Helpers,
    Cookie
) {

    'use strict';

    var Collection = EventEmitter.extend({

        create: function () {
            this.ajaxSettings = Helpers.extend(this.options.ajaxSettings, {
                url: this.options.url
            });
            this.ajaxParams = Helpers.extend(true, {}, this.options.ajaxParams);
            this.items = [];
            this.offset = 0;
            this.init();

            return this;
        },

        props: {

            /**
             * URL для получения данных
             *
             * @type {String}
             */
            url: '',

            /**
             * Параметры по умолчанию для всех коллекций
             *
             * @type {Object}
             * @property {Object} ajaxParams параметры отправляемые на сервер
             * @property {number} [limit = 50] параметр, лимитирующий размер выдачи
             * @property {String} [ajaxSettings.dataType = json] тип получаемых от сервера данных
             * @property {String} [ajaxSettings.type = get] http метод запроса на сервер
             * @private
             */
            defaultOptions: {
                ajaxParams: {},
                limit: 50,
                ajaxSettings: {
                    dataType : 'json',
                    type: 'get'
                }
            }
        },

        public: {

            /**
             * Уничтожение
             *
             * @returns {Collection}
             */
            destroy: function () {
                Collection.__super__.destroy.call(this);
                delete this.items;

                if (this.fetchXHR) {
                    this.fetchXHR.abort();
                    delete this.fetchXHR;
                }

                return this;
            },

            /**
             * Установка одного параметра
             *
             * @param {String} key название параметра
             * @param {String} value значение фильтра
             * @returns {Collection}
             */
            setParam: function (key, value) {
                this.ajaxParams[key] = value;

                return this;
            },

            /**
             * Установка нескольких параметра
             *
             * @param {String} key название параметра
             * @param {String} value значение фильтра
             * @returns {Collection}
             */
            setParams: function (params) {
                Object.keys(params).forEach(function (key) {
                    this.setParam(key, params[key]);
                }.bind(this));

                return this;
            },

            /**
             * Получение значения параметра
             *
             * @param {String} key название параметра
             * @returns {String}
             */
            getParam: function (key) {
                return this.ajaxParams[key];
            },

            /**
             * Удаление параметра
             *
             * @param {String} key название параметра
             * @returns {Collection}
             */
            removeParam: function (key) {
                delete this.ajaxParams[key];

                return this;
            },

            /**
             * Удаление всех параметров
             *
             * @param {String} key название параметра
             * @returns {Collection}
             */
            removeParams: function () {
                Object.keys(this.ajaxParams).forEach(function (item) {
                    this.removeParam(item);
                }.bind(this));

                return this;
            },

            /**
             * Получение данных с сервера
             *
             * @returns {Promise}
             */
            fetch: function () {
                return new Promise(function (resolve, reject) {
                    var userParams = this.getFetchParamsWithOffset(),
                        fetchSettings = this.getFetchSettings() || {},
                        userSettings = Helpers.extend({}, fetchSettings, {
                            url: this.getUrl(),

                            success: function (response) {
                                var items;

                                if (this.isDestroyed) {
                                    return;
                                }

                                if (Helpers.isString(response)) {
                                    response = JSON.parse(response);
                                } else if (!Helpers.isObject(response)) {
                                    response = {};
                                }

                                if (Helpers.isFunction(fetchSettings.success)) {
                                    fetchSettings.success(response);
                                }

                                items = this.setResponse(response);

                                this.trigger('fetched', {
                                    items: items,
                                    response: response
                                });

                                if (items.length === 0) {
                                    this.trigger('end');
                                }

                                resolve(items);
                            }.bind(this),

                            error: function (jqXHR, textStatus) {
                                if (Helpers.isFunction(fetchSettings.error)) {
                                    fetchSettings.error(jqXHR, textStatus);
                                }

                                this.trigger('fetched', {
                                    status: textStatus
                                });
                                reject(textStatus);
                            }.bind(this)
                        });

                    this.fetchXHR = Ajax.send(Helpers.extend(userSettings, {
                        data: userParams
                    }));
                }.bind(this));
            },

            abort: function () {
                if (this.fetchXHR) {
                    this.fetchXHR.abort();
                    this.trigger('aborted');
                }

                return this;
            },

            isPending: function () {
                return this.fetchXHR && this.fetchXHR.state() === 'pending';
            },

            setResponse: function (response) {
                var model,
                    models = [],
                    data = this.adapter(response),
                    offset = this.getOffsetByResponse(response);

                if (!Helpers.isArray(data.items)) {
                    return models;
                }

                data.items.forEach(function (item) {
                    model = new this.model();
                    model.set(item);
                    this.add(model);
                    models.push(model);
                }.bind(this));

                if (offset) {
                    this.offset = offset;
                } else {
                    this.offset += data.items.length;
                }

                return models;
            },

            getOffsetByResponse: function (response) {
                return response ? response.offset : 0;
            },

            getOffset: function () {
                return this.offset;
            },

            setOffset: function (offset) {
                this.offset = offset;

                return this;
            },

            /**
             * Адаптирование данных, приходящих от сервера
             *
             * @param {Object} data данные, пришедшие от сервера
             * @returns {Object}
             */
            adapter: function (data) {
                return data;
            },

            /**
             * Поиск модели по названию и значению атрибута
             *
             * @param {String} attrKey название атрибута
             * @param {String} attrValue значение
             * @returns {Model}
             */
            getByAttr: function (attrKey, attrValue) {
                var model = null;

                this.items.forEach(function (item) {
                    if ((!isNaN(Number(item.get(attrKey))) && Number(item.get(attrKey)) === Number(attrValue)) || (String(item.get(attrKey)) === String(attrValue))) {
                        model = item;
                    }
                });

                return model;
            },
            getArrayByAttr: function (attrKey, attrValue) {
                var models = [];

                this.items.forEach(function (item) {
                    if ((!isNaN(Number(item.get(attrKey))) && Number(item.get(attrKey)) === Number(attrValue)) || (String(item.get(attrKey)) === String(attrValue))) {
                        models.push(item);
                    }
                });

                return models;
            },

            /**
             * Поиск по идентификатору модели
             *
             * @param {Numner | String} id идентификатор
             * @returns {Model}
             * @memberOf Collection
             */
            getById: function (id) {
                return this.getByAttr('id', id);
            },

            /**
             * Поиск по клиентскому идентификатору модели
             *
             * @param {Numner} cid клиентский идентификатор
             * @returns {Model}
             * @memberOf Collection
             */
            getByClientId: function (cid) {
                var result = null;

                this.items.forEach(function (item, index) {
                    if (item.cid === cid) {
                        result = item;
                    }
                }.bind(this));

                return result;
            },

            /**
             * Получение массива моделей
             *
             * @returns {Array}
             * @memberOf Collection
             */
            getItems: function () {
                return this.items;
            },

            /**
             * Получение элемента по индексу
             *
             * @param {Number} index индекс
             * @returns {Model}
             * @memberOf Collection
             */
            getByIndex: function (index) {
                return this.items[index];
            },

            /**
             * Добавление модели в коллекцию
             *
             * @param {Model} model объект модели
             * @memberOf Collection
             */
            add: function (model) {
                this.items.push(model);

                this.trigger('add');
                this.trigger('change');

                return this;
            },

            /**
             * Удаление модели из коллекции
             *
             * @param {Number | String} id идентификатор модели
             * @memberOf Collection
             */
            remove: function (id) {
                this.items.forEach(function (item, index) {
                    if (item.get('id') === id) {
                        this.items.splice(index, 1);
                        this.trigger('remove', {
                            id: item.id,
                            cid: item.cid
                        });
                        this.trigger('change');
                    }
                }.bind(this));

                return this;
            },

            /**
             * Удаление модели из коллекции по клиентскому идентификатору
             *
             * @param {Number | String} cid клиентский идентификатор модели
             * @memberOf Collection
             */
            removeByClientId: function (cid) {
                this.items.forEach(function (item, index) {
                    if (item.cid === cid) {
                        this.items.splice(index, 1);
                        this.trigger('remove', {
                            id: item.id,
                            cid: item.cid
                        });
                        this.trigger('change');
                    }
                }.bind(this));

                return this;
            },

            /**
             * Обход коллеции заданным итератором
             *
             * @param {Function} iterator итератор
             * @memberOf Collection
             */
            forEach: function (iterator) {
                this.items.forEach(iterator);

                return this;
            },

            /**
             * Преобразование коллекции заданным итератором
             *
             * @param {Function} iterator итератор
             * @returns {Array}
             * @memberOf Collection
             */
            map: function (iterator) {
                return this.items.map(iterator);
            },

            /**
             * Асинхронный обход коллекции
             *
             * @param {Function} iterator функция итератор
             * @param {Function} callback функция, которая будет вызвана просле обхода
             * @memberOf Collection
             */
            forEachAsync: function (iterator, callback) {
                var step = function (iterator, index) {
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
            },

            /**
             * Фильтрация коллекции
             *
             * @param {Function} condition функция с условием фильтрации
             * @memberOf Collection
             */
            filter: function (condition) {
                return this.items.filter(condition);
            },

            /**
             * Очищение коллекции
             *
             * @param {Boolean} [options.destroy}
             * @memberOf Collection
             */
            clear: function (options) {
                options = Helpers.extend({
                    destroy: true
                }, options);

                if (options.destroy) {
                    this.forEach(function (item) {
                        item.destroy();
                    });
                }

                this.items = [];
                this.offset = 0;

                return this;
            },

            /**
             * Получение количества элементов в коллекции
             *
             * @params {Boolean} [isAll = false] не исключать удаленные
             * @return {Number}
             * @memberOf Collection
             */
            getLength: function (isAll) {
                var items;

                if (isAll) {
                    items = this.items;
                } else {
                    items = this.items.filter(function (item) {
                        return !item.isRemoved();
                    });
                }

                return items.length;
            },

            /**
             * Получения ограничения загрузки
             *
             * @returns {Number}
             * @memberOf Collection
             */
            getLimit: function () {
                return this.limit || this.options.limit;
            },

            /**
             * Установка ограничения загрузки
             *
             * @params {Number} limit количество загружаемых за раз элементов
             * @memberOf Collection
             */
            setLimit: function (limit) {
                this.limit = limit;

                return this;
            },

            /**
             * Получение элементов в виде массива объектов, состоящих из атрибутов моделей
             *
             * @returns {Array.<Object>}
             * @memberOf Collection
             */
            toJSON: function () {
                var json = [];

                this.forEach(function (model) {
                    json.push(model.toJSON());
                });

                return json;
            }

        },

        protected: {

            /**
             * Получение URL для AJAX запросов на сервер
             *
             * @returns {String}
             * @protected
             */
            getUrl: function () {
                return (Cookie.get('_sp_model') || '') + this.options.url;
            },

            /**
             * Получение данных, отправляемых на сервер при получении данных
             *
             * @returns {Object}
             */
            getFetchParams: function () {
                return this.ajaxParams;
            },

            /**
             * Получение данных, отправляемых на сервер при получении данных с добавление offset
             *
             * @returns {Object}
             */
            getFetchParamsWithOffset: function () {
                return Helpers.extend({}, this.ajaxParams, this.getFetchParams(), {
                    offset: this.offset,
                    limit: this.getLimit()
                });
            },

            /**
             * Получение настроек AJAX запроса при получении данных
             *
             * @returns {Object}
             */
            getFetchSettings: function () {
                return Helpers.extend({
                    url: this.getUrl()
                }, this.ajaxSettings);
            }
        }

    });

    return Collection;

});

/**
 * Базовая View для страничных модулей
 *
 * @class
 * @name Page
 * @abstract
 * @augments View
 */

define('page',[
    'view',
    'router',
    'utils/ajax',
    'utils/helpers',
    'utils/cookie'
], function (
    View,
    Router,
    Ajax,
    Helpers,
    Cookie
) {
    'use strict';

    var Page = View.extend(
        {

            /** @lends Page.prototype */
            props: {

                /**
                 * URL загрузки страницы
                 *
                 * @type {String}
                 */
                url: '',

                /**
                 * Название страницы
                 *
                 * @type {String}
                 */
                pageName: '',

                /**
                 * Опции по умолчанию
                 *
                 * @type {Object}
                 * @property {Boolean} [isRunTimeCreated = false] страница создана в режиме выполнения (аяксовый переход)
                 * @property {Boolean} [isNoArgPrefix = true] не добавлять префикс arg_ к данным, передаваемым в ajax запросе за данными
                 * @property {String} [pageOptionsSelector = '.b-page-config'] селектор элемента, из которого парсятся опции страницы
                 */
                defaultOptions: {
                    isRunTimeCreated: false,
                    isNeedLoad: true,
                    loadDataType: 'json',
                    pageOptionsSelector: '.b-page-config'
                },

                /** @lends Page.prototype */
                vars: {

                    /**
                     * Состояние отменены запроса данных с сервера
                     *
                     * @type {Boolean}
                     */
                    isAbortedState: false,

                    /**
                     * Адаптированные данные, полученные от сервера
                     * 
                     * @type {Object}
                     */
                    pageResponse: {}
                }

            },

            /** @lends Page.prototype */
            public: {

                /**
                 * Инициализация страницы после загрузки и рендера
                 *
                 * @returns {Page}
                 */
                initPage: function () {
                    var $config = this.$el.find(this.options.pageOptionsSelector);

                    if ($config.length) {
                        this.pageOptions = JSON.parse($config.html().replace(/\r|\n|\t|\s{2,}/g, ''));
                    }

                    this.trigger('pageLoad', {
                        page: this.getPageName()
                    });

                    return this;
                },

                /**
                 * Установка опций (совмещение с текущими)
                 *
                 * @param {Object} options
                 * @returns {Page}
                 */
                setOptions: function (options) {
                    if (Helpers.isPlainObject(options)) {
                        Helpers.extend(true, this.options, options);
                    }

                    return this;
                },

                /**
                 * Ajax загрука страницы
                 */
                load: function () {
                    var settings = this.getLoadSettings();

                    this.xhr = Ajax.send(Helpers.extend(settings), {
                        data: this.getLoadParams()
                    })
                        .success(function (response) {
                            if (response.isRedirect) {
                                Router.go(response.location);
                            } else if (response.request && response.request.path !== window.location.pathname) {
                                Router.checkRoutes({
                                    url: response.request.path
                                }, true, response);
                            } else {
                                this.onLoadSuccess(response);
                            }
                        }.bind(this))
                        .error(function () {
                            this.onLoadError();
                        }.bind(this));
                },

                /**
                 * Отмена загрузки страницы
                 *
                 * @returns {Page}
                 */
                abort: function () {
                    this.isAbortedState = true;
                    this.xhr.abort();

                    return this;
                },

                /**
                 * Возвращает состояние текущей загрузки данных от сервера (true - загрузка выполняется, false - не выполняется)
                 *
                 * @returns {Boolean}
                 */
                isPending: function () {
                    return this.xhr && this.xhr.state() === 'pending';
                },

                /**
                 * Возвращает состояние отмены запроса данных с сервера
                 *
                 * @returns {boolean}
                 */
                isAborted: function () {
                    return this.isAbortedState;
                },

                /**
                 * Возвращает true, если страница создана в режиме выполнения (аяксовый переход) и false, если страница загружена первоначально (точка входа)
                 *
                 * @returns {Boolean}
                 */
                isRunTimeCreated: function () {
                    return this.options.isRunTimeCreated;
                },

                /**
                 * Возращает true, если для страницы необходимо загружать данные с сервера и false, если нет такой необходимости (для статических страниц)
                 * 
                 * @returns {Boolean}
                 */
                isNeedLoad: function () {
                    return this.options.isNeedLoad;
                },

                /**
                 * Устанавливает объект приложения
                 * 
                 * @param {App} app объект приложения
                 * @returns {Page}
                 */
                setApp: function (app) {
                    this.app = app;

                    return this;
                },

                /**
                 * Устанавливает название страницы
                 * 
                 * @param {String} pageName новое название
                 * @returns {Page}
                 */
                setPageName: function (pageName) {
                    this.pageName = pageName;

                    return this;
                },

                /**
                 * Возвращает название страницы
                 * 
                 * @returns {Boolean}
                 */
                getPageName: function () {
                    return this.pageName || false;
                },

                /**
                 * Получение заголовка
                 * 
                 * @returns {String}
                 */
                getTitle: function () {
                    return '';
                }
            },

            /** @lends Page.prototype */
            protected: {

                /**
                 * Получение URL для загрузки данных с сервера
                 * 
                 * @protected
                 * @returns {String}
                 */
                getUrl: function () {
                    return (Cookie.get('_sp_pages') || '') + this.url;
                },

                /**
                 * Адаптирование данных, полученных с сервера
                 *
                 * @protected
                 * @param {Object} response данные, полученные от сервера
                 * @returns {Object} адаптированные данные
                 */
                adapter: function (response) {
                    return response;
                },

                /**
                 * Получение адаптированных данных, полученных от сервера
                 * 
                 * @protected
                 * @returns {Object}
                 */
                getResponse: function () {
                    return this.pageResponse;
                },

                /**
                 * Установка адаптированных данных, полученных от сервера
                 * 
                 * @protected
                 * @param {Object} response адаптированные данные
                 * @returns {Page}
                 */
                setResponse: function (response) {
                    this.pageResponse = Helpers.extend({}, true, this.pageResponse, response);

                    return this;
                },

                /**
                 * Получение данных, отправляемых на сервер при загрузке страницы
                 *
                 * @protected
                 * @returns {Object}
                 */
                getLoadParams: function () {
                    return {};
                },

                /**
                 * Получение настроек AJAX запроса при загрузке страницы
                 *
                 * @protected
                 * @returns {Object}
                 */
                getLoadSettings: function () {
                    return {
                        url: this.getUrl(),
                        dataType: this.options.loadDataType
                    };
                },

                /**
                 * Установка заголовка страницы
                 *
                 * @protected
                 */
                setPageTitle: function () {
                    document.title = this.getTitle();
                },

                /**
                 * Обработчик успешной загрузке AJAX страницы
                 * 
                 * @protected
                 * @param {Object} response данные, полученные от сервера
                 */
                onLoadSuccess: function (response) {
                    this.setResponse(this.adapter(response));
                    this.setPageTitle();

                    this.render('main', this.getResponse());
                },

                /**
                 * Обработчик ошибки при загрузке AJAX страницы
                 *
                 * @protected
                 */
                onLoadError: function () {
                    this.trigger('error');
                }

            }
        }
    );

    return Page;

});
define('config',[], function () {
    'use strict';

    return {
        env: 'prod'
    };
});
define('main',[
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
(function () {
    'use strict';

    define('nerve', [
        'main'
    ], function (Nerve) {
        return Nerve;
    });
}());