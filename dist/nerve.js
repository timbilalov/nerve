/** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.3.4 Copyright jQuery Foundation and other contributors.
 * Released under MIT license, https://github.com/requirejs/requirejs/blob/master/LICENSE
 */
//Not using strict: uneven strict support in browsers, #392, and causes
//problems with requirejs.exec()/transpiler plugins that may not be strict.
/*jslint regexp: true, nomen: true, sloppy: true */
/*global window, navigator, document, importScripts, setTimeout, opera */

var requirejs, require, define;
(function (global, setTimeout) {
    var req, s, head, baseElement, dataMain, src,
        interactiveScript, currentlyAddingScript, mainScript, subPath,
        version = '2.3.4',
        commentRegExp = /\/\*[\s\S]*?\*\/|([^:"'=]|^)\/\/.*$/mg,
        cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g,
        jsSuffixRegExp = /\.js$/,
        currDirRegExp = /^\.\//,
        op = Object.prototype,
        ostring = op.toString,
        hasOwn = op.hasOwnProperty,
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
        contexts = {},
        cfg = {},
        globalDefQueue = [],
        useInteractive = false;

    //Could match something like ')//comment', do not lose the prefix to comment.
    function commentReplace(match, singlePrefix) {
        return singlePrefix || '';
    }

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
                    if (i === 0 || (i === 1 && ary[2] === '..') || ary[i - 1] === '..') {
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
                    if (isNormalized) {
                        normalizedName = name;
                    } else if (pluginModule && pluginModule.normalize) {
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
                each(globalDefQueue, function(queueItem) {
                    var id = queueItem[0];
                    if (typeof id === 'string') {
                        context.defQueueMap[id] = true;
                    }
                    defQueue.push(queueItem);
                });
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
                            return getOwn(config.config, mod.map.id) || {};
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
                    // Only fetch if not already in the defQueue.
                    if (!hasProp(context.defQueueMap, id)) {
                        this.fetch();
                    }
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
                                var resLoadMaps = [];
                                each(this.depMaps, function (depMap) {
                                    resLoadMaps.push(depMap.normalizedMap || depMap);
                                });
                                req.onResourceLoad(context, this.map, resLoadMaps);
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
                                                      this.map.parentMap,
                                                      true);
                        on(normalizedMap,
                            'defined', bind(this, function (value) {
                                this.map.normalizedMap = normalizedMap;
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
                            if (this.undefed) {
                                return;
                            }
                            this.defineDep(i, depExports);
                            this.check();
                        }));

                        if (this.errback) {
                            on(depMap, 'error', bind(this, this.errback));
                        } else if (this.events.error) {
                            // No direct errback on this module, but something
                            // else is listening for errors, so be sure to
                            // propagate the error correctly.
                            on(depMap, 'error', bind(this, function(err) {
                                this.emit('error', err);
                            }));
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
                    return onError(makeError('mismatch', 'Mismatched anonymous define() module: ' +
                        args[args.length - 1]));
                } else {
                    //args are id, deps, factory. Should be normalized by the
                    //define() function.
                    callGetModule(args);
                }
            }
            context.defQueueMap = {};
        }

        context = {
            config: config,
            contextName: contextName,
            registry: registry,
            defined: defined,
            urlFetched: urlFetched,
            defQueue: defQueue,
            defQueueMap: {},
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

                // Convert old style urlArgs string to a function.
                if (typeof cfg.urlArgs === 'string') {
                    var urlArgs = cfg.urlArgs;
                    cfg.urlArgs = function(id, url) {
                        return (url.indexOf('?') === -1 ? '?' : '&') + urlArgs;
                    };
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

                        pkgObj = typeof pkgObj === 'string' ? {name: pkgObj} : pkgObj;

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
                        mod.map = makeModuleMap(id, null, true);
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

                        mod.undefed = true;
                        removeScript(id);

                        delete defined[id];
                        delete urlFetched[map.url];
                        delete undefEvents[id];

                        //Clean queued defines too. Go backwards
                        //in array so that the splices do not
                        //mess up the iteration.
                        eachReverse(defQueue, function(args, i) {
                            if (args[0] === id) {
                                defQueue.splice(i, 1);
                            }
                        });
                        delete context.defQueueMap[id];

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
                context.defQueueMap = {};

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
                    pkgMain = getOwn(config.pkgs, moduleName);

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
                    url += (ext || (/^data\:|^blob\:|\?/.test(url) || skipExt ? '' : '.js'));
                    url = (url.charAt(0) === '/' || url.match(/^[\w\+\.\-]+:/) ? '' : config.baseUrl) + url;
                }

                return config.urlArgs && !/^blob\:/.test(url) ?
                       url + config.urlArgs(moduleName, url) : url;
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
                    var parents = [];
                    eachProp(registry, function(value, key) {
                        if (key.indexOf('_@r') !== 0) {
                            each(value.depMaps, function(depMap) {
                                if (depMap.id === data.id) {
                                    parents.push(key);
                                    return true;
                                }
                            });
                        }
                    });
                    return onError(makeError('scripterror', 'Script error for "' + data.id +
                                             (parents.length ?
                                             '", needed by: ' + parents.join(', ') :
                                             '"'), evt, [data.id]));
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
    req.nextTick = typeof setTimeout !== 'undefined' ? function (fn) {
        setTimeout(fn, 4);
    } : function (fn) { fn(); };

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
                    //read https://github.com/requirejs/requirejs/issues/187
                    //if we can NOT find [native code] then it must NOT natively supported.
                    //in IE8, node.attachEvent does not have toString()
                    //Note the test for "[native code" with no closing brace, see:
                    //https://github.com/requirejs/requirejs/issues/273
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

            //Calling onNodeCreated after all properties on the node have been
            //set, but before it is placed in the DOM.
            if (config.onNodeCreated) {
                config.onNodeCreated(node, config, moduleName, url);
            }

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
                //are in play, the expectation is that a build has been done so
                //that only one script needs to be loaded anyway. This may need
                //to be reevaluated if other use cases become common.

                // Post a task to the event loop to work around a bug in WebKit
                // where the worker gets garbage-collected after calling
                // importScripts(): https://webkit.org/b/153317
                setTimeout(function() {}, 0);
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

                //Set final baseUrl if there is not already an explicit one,
                //but only do so if the data-main value is not a loader plugin
                //module ID.
                if (!cfg.baseUrl && mainScript.indexOf('!') === -1) {
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
                    .replace(commentRegExp, commentReplace)
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
        if (context) {
            context.defQueue.push([name, deps, callback]);
            context.defQueueMap[name] = true;
        } else {
            globalDefQueue.push([name, deps, callback]);
        }
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
}(this, (typeof setTimeout === 'undefined' ? undefined : setTimeout)));


var _classCallCheck2 = require("babel-runtime/helpers/classCallCheck");

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require("babel-runtime/helpers/createClass");

var _createClass3 = _interopRequireDefault(_createClass2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

define('utils/helpers',["require", "exports"], function (require, exports) {
    "use strict";

    Object.defineProperty(exports, "__esModule", { value: true });

    var Helpers = function () {
        function Helpers() {
            (0, _classCallCheck3.default)(this, Helpers);
        }

        (0, _createClass3.default)(Helpers, null, [{
            key: "isArray",
            value: function isArray(any) {
                return Array.isArray(any);
            }
        }, {
            key: "toString",
            value: function toString(any) {
                return Object.prototype.toString.call(any);
            }
        }, {
            key: "isFunction",
            value: function isFunction(any) {
                return this.toString(any) === '[object Function]';
            }
        }, {
            key: "isNode",
            value: function isNode(any) {
                return any && any.nodeType || this.isNodeList(any);
            }
        }, {
            key: "isNodeList",
            value: function isNodeList(any) {
                return !this.isjQueryObject(any) && any && any[0] && any[0].nodeType;
            }
        }, {
            key: "isjQueryObject",
            value: function isjQueryObject(any) {
                return false;
            }
        }, {
            key: "isObject",
            value: function isObject(any) {
                var result = false;
                if (window.Object) {
                    result = any === window.Object(any) && !this.isNode(any) && !this.isFunction(any) && !this.isjQueryObject(any);
                } else {
                    result = any && Helpers.toString(any) === '[object Object]' && !this.isNode(any) && !this.isFunction(any) && !this.isjQueryObject(any);
                }
                return result;
            }
        }, {
            key: "isPlainObject",
            value: function isPlainObject(any) {
                return this.isObject(any);
            }
        }, {
            key: "isString",
            value: function isString(any) {
                return this.toString(any) === '[object String]';
            }
        }, {
            key: "capitalize",
            value: function capitalize(str) {
                return str.charAt(0).toUpperCase() + str.substr(1);
            }
        }, {
            key: "extend",
            value: function extend() {
                return Object.assign.apply(Object, arguments);
            }
        }]);
        return Helpers;
    }();

    exports.Helpers = Helpers;
});
//# sourceMappingURL=helpers.js.map;
/* axios v0.16.2 | (c) 2017 by Matt Zabriskie */
(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define('axios',[], factory);
	else if(typeof exports === 'object')
		exports["axios"] = factory();
	else
		root["axios"] = factory();
})(this, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;
/******/
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	module.exports = __webpack_require__(1);

/***/ },
/* 1 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var utils = __webpack_require__(2);
	var bind = __webpack_require__(3);
	var Axios = __webpack_require__(5);
	var defaults = __webpack_require__(6);
	
	/**
	 * Create an instance of Axios
	 *
	 * @param {Object} defaultConfig The default config for the instance
	 * @return {Axios} A new instance of Axios
	 */
	function createInstance(defaultConfig) {
	  var context = new Axios(defaultConfig);
	  var instance = bind(Axios.prototype.request, context);
	
	  // Copy axios.prototype to instance
	  utils.extend(instance, Axios.prototype, context);
	
	  // Copy context to instance
	  utils.extend(instance, context);
	
	  return instance;
	}
	
	// Create the default instance to be exported
	var axios = createInstance(defaults);
	
	// Expose Axios class to allow class inheritance
	axios.Axios = Axios;
	
	// Factory for creating new instances
	axios.create = function create(instanceConfig) {
	  return createInstance(utils.merge(defaults, instanceConfig));
	};
	
	// Expose Cancel & CancelToken
	axios.Cancel = __webpack_require__(23);
	axios.CancelToken = __webpack_require__(24);
	axios.isCancel = __webpack_require__(20);
	
	// Expose all/spread
	axios.all = function all(promises) {
	  return Promise.all(promises);
	};
	axios.spread = __webpack_require__(25);
	
	module.exports = axios;
	
	// Allow use of default import syntax in TypeScript
	module.exports.default = axios;


/***/ },
/* 2 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var bind = __webpack_require__(3);
	var isBuffer = __webpack_require__(4);
	
	/*global toString:true*/
	
	// utils is a library of generic helper functions non-specific to axios
	
	var toString = Object.prototype.toString;
	
	/**
	 * Determine if a value is an Array
	 *
	 * @param {Object} val The value to test
	 * @returns {boolean} True if value is an Array, otherwise false
	 */
	function isArray(val) {
	  return toString.call(val) === '[object Array]';
	}
	
	/**
	 * Determine if a value is an ArrayBuffer
	 *
	 * @param {Object} val The value to test
	 * @returns {boolean} True if value is an ArrayBuffer, otherwise false
	 */
	function isArrayBuffer(val) {
	  return toString.call(val) === '[object ArrayBuffer]';
	}
	
	/**
	 * Determine if a value is a FormData
	 *
	 * @param {Object} val The value to test
	 * @returns {boolean} True if value is an FormData, otherwise false
	 */
	function isFormData(val) {
	  return (typeof FormData !== 'undefined') && (val instanceof FormData);
	}
	
	/**
	 * Determine if a value is a view on an ArrayBuffer
	 *
	 * @param {Object} val The value to test
	 * @returns {boolean} True if value is a view on an ArrayBuffer, otherwise false
	 */
	function isArrayBufferView(val) {
	  var result;
	  if ((typeof ArrayBuffer !== 'undefined') && (ArrayBuffer.isView)) {
	    result = ArrayBuffer.isView(val);
	  } else {
	    result = (val) && (val.buffer) && (val.buffer instanceof ArrayBuffer);
	  }
	  return result;
	}
	
	/**
	 * Determine if a value is a String
	 *
	 * @param {Object} val The value to test
	 * @returns {boolean} True if value is a String, otherwise false
	 */
	function isString(val) {
	  return typeof val === 'string';
	}
	
	/**
	 * Determine if a value is a Number
	 *
	 * @param {Object} val The value to test
	 * @returns {boolean} True if value is a Number, otherwise false
	 */
	function isNumber(val) {
	  return typeof val === 'number';
	}
	
	/**
	 * Determine if a value is undefined
	 *
	 * @param {Object} val The value to test
	 * @returns {boolean} True if the value is undefined, otherwise false
	 */
	function isUndefined(val) {
	  return typeof val === 'undefined';
	}
	
	/**
	 * Determine if a value is an Object
	 *
	 * @param {Object} val The value to test
	 * @returns {boolean} True if value is an Object, otherwise false
	 */
	function isObject(val) {
	  return val !== null && typeof val === 'object';
	}
	
	/**
	 * Determine if a value is a Date
	 *
	 * @param {Object} val The value to test
	 * @returns {boolean} True if value is a Date, otherwise false
	 */
	function isDate(val) {
	  return toString.call(val) === '[object Date]';
	}
	
	/**
	 * Determine if a value is a File
	 *
	 * @param {Object} val The value to test
	 * @returns {boolean} True if value is a File, otherwise false
	 */
	function isFile(val) {
	  return toString.call(val) === '[object File]';
	}
	
	/**
	 * Determine if a value is a Blob
	 *
	 * @param {Object} val The value to test
	 * @returns {boolean} True if value is a Blob, otherwise false
	 */
	function isBlob(val) {
	  return toString.call(val) === '[object Blob]';
	}
	
	/**
	 * Determine if a value is a Function
	 *
	 * @param {Object} val The value to test
	 * @returns {boolean} True if value is a Function, otherwise false
	 */
	function isFunction(val) {
	  return toString.call(val) === '[object Function]';
	}
	
	/**
	 * Determine if a value is a Stream
	 *
	 * @param {Object} val The value to test
	 * @returns {boolean} True if value is a Stream, otherwise false
	 */
	function isStream(val) {
	  return isObject(val) && isFunction(val.pipe);
	}
	
	/**
	 * Determine if a value is a URLSearchParams object
	 *
	 * @param {Object} val The value to test
	 * @returns {boolean} True if value is a URLSearchParams object, otherwise false
	 */
	function isURLSearchParams(val) {
	  return typeof URLSearchParams !== 'undefined' && val instanceof URLSearchParams;
	}
	
	/**
	 * Trim excess whitespace off the beginning and end of a string
	 *
	 * @param {String} str The String to trim
	 * @returns {String} The String freed of excess whitespace
	 */
	function trim(str) {
	  return str.replace(/^\s*/, '').replace(/\s*$/, '');
	}
	
	/**
	 * Determine if we're running in a standard browser environment
	 *
	 * This allows axios to run in a web worker, and react-native.
	 * Both environments support XMLHttpRequest, but not fully standard globals.
	 *
	 * web workers:
	 *  typeof window -> undefined
	 *  typeof document -> undefined
	 *
	 * react-native:
	 *  navigator.product -> 'ReactNative'
	 */
	function isStandardBrowserEnv() {
	  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
	    return false;
	  }
	  return (
	    typeof window !== 'undefined' &&
	    typeof document !== 'undefined'
	  );
	}
	
	/**
	 * Iterate over an Array or an Object invoking a function for each item.
	 *
	 * If `obj` is an Array callback will be called passing
	 * the value, index, and complete array for each item.
	 *
	 * If 'obj' is an Object callback will be called passing
	 * the value, key, and complete object for each property.
	 *
	 * @param {Object|Array} obj The object to iterate
	 * @param {Function} fn The callback to invoke for each item
	 */
	function forEach(obj, fn) {
	  // Don't bother if no value provided
	  if (obj === null || typeof obj === 'undefined') {
	    return;
	  }
	
	  // Force an array if not already something iterable
	  if (typeof obj !== 'object' && !isArray(obj)) {
	    /*eslint no-param-reassign:0*/
	    obj = [obj];
	  }
	
	  if (isArray(obj)) {
	    // Iterate over array values
	    for (var i = 0, l = obj.length; i < l; i++) {
	      fn.call(null, obj[i], i, obj);
	    }
	  } else {
	    // Iterate over object keys
	    for (var key in obj) {
	      if (Object.prototype.hasOwnProperty.call(obj, key)) {
	        fn.call(null, obj[key], key, obj);
	      }
	    }
	  }
	}
	
	/**
	 * Accepts varargs expecting each argument to be an object, then
	 * immutably merges the properties of each object and returns result.
	 *
	 * When multiple objects contain the same key the later object in
	 * the arguments list will take precedence.
	 *
	 * Example:
	 *
	 * ```js
	 * var result = merge({foo: 123}, {foo: 456});
	 * console.log(result.foo); // outputs 456
	 * ```
	 *
	 * @param {Object} obj1 Object to merge
	 * @returns {Object} Result of all merge properties
	 */
	function merge(/* obj1, obj2, obj3, ... */) {
	  var result = {};
	  function assignValue(val, key) {
	    if (typeof result[key] === 'object' && typeof val === 'object') {
	      result[key] = merge(result[key], val);
	    } else {
	      result[key] = val;
	    }
	  }
	
	  for (var i = 0, l = arguments.length; i < l; i++) {
	    forEach(arguments[i], assignValue);
	  }
	  return result;
	}
	
	/**
	 * Extends object a by mutably adding to it the properties of object b.
	 *
	 * @param {Object} a The object to be extended
	 * @param {Object} b The object to copy properties from
	 * @param {Object} thisArg The object to bind function to
	 * @return {Object} The resulting value of object a
	 */
	function extend(a, b, thisArg) {
	  forEach(b, function assignValue(val, key) {
	    if (thisArg && typeof val === 'function') {
	      a[key] = bind(val, thisArg);
	    } else {
	      a[key] = val;
	    }
	  });
	  return a;
	}
	
	module.exports = {
	  isArray: isArray,
	  isArrayBuffer: isArrayBuffer,
	  isBuffer: isBuffer,
	  isFormData: isFormData,
	  isArrayBufferView: isArrayBufferView,
	  isString: isString,
	  isNumber: isNumber,
	  isObject: isObject,
	  isUndefined: isUndefined,
	  isDate: isDate,
	  isFile: isFile,
	  isBlob: isBlob,
	  isFunction: isFunction,
	  isStream: isStream,
	  isURLSearchParams: isURLSearchParams,
	  isStandardBrowserEnv: isStandardBrowserEnv,
	  forEach: forEach,
	  merge: merge,
	  extend: extend,
	  trim: trim
	};


/***/ },
/* 3 */
/***/ function(module, exports) {

	'use strict';
	
	module.exports = function bind(fn, thisArg) {
	  return function wrap() {
	    var args = new Array(arguments.length);
	    for (var i = 0; i < args.length; i++) {
	      args[i] = arguments[i];
	    }
	    return fn.apply(thisArg, args);
	  };
	};


/***/ },
/* 4 */
/***/ function(module, exports) {

	/*!
	 * Determine if an object is a Buffer
	 *
	 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
	 * @license  MIT
	 */
	
	// The _isBuffer check is for Safari 5-7 support, because it's missing
	// Object.prototype.constructor. Remove this eventually
	module.exports = function (obj) {
	  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer)
	}
	
	function isBuffer (obj) {
	  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
	}
	
	// For Node v0.10 support. Remove this eventually.
	function isSlowBuffer (obj) {
	  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0))
	}


/***/ },
/* 5 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var defaults = __webpack_require__(6);
	var utils = __webpack_require__(2);
	var InterceptorManager = __webpack_require__(17);
	var dispatchRequest = __webpack_require__(18);
	var isAbsoluteURL = __webpack_require__(21);
	var combineURLs = __webpack_require__(22);
	
	/**
	 * Create a new instance of Axios
	 *
	 * @param {Object} instanceConfig The default config for the instance
	 */
	function Axios(instanceConfig) {
	  this.defaults = instanceConfig;
	  this.interceptors = {
	    request: new InterceptorManager(),
	    response: new InterceptorManager()
	  };
	}
	
	/**
	 * Dispatch a request
	 *
	 * @param {Object} config The config specific for this request (merged with this.defaults)
	 */
	Axios.prototype.request = function request(config) {
	  /*eslint no-param-reassign:0*/
	  // Allow for axios('example/url'[, config]) a la fetch API
	  if (typeof config === 'string') {
	    config = utils.merge({
	      url: arguments[0]
	    }, arguments[1]);
	  }
	
	  config = utils.merge(defaults, this.defaults, { method: 'get' }, config);
	  config.method = config.method.toLowerCase();
	
	  // Support baseURL config
	  if (config.baseURL && !isAbsoluteURL(config.url)) {
	    config.url = combineURLs(config.baseURL, config.url);
	  }
	
	  // Hook up interceptors middleware
	  var chain = [dispatchRequest, undefined];
	  var promise = Promise.resolve(config);
	
	  this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
	    chain.unshift(interceptor.fulfilled, interceptor.rejected);
	  });
	
	  this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
	    chain.push(interceptor.fulfilled, interceptor.rejected);
	  });
	
	  while (chain.length) {
	    promise = promise.then(chain.shift(), chain.shift());
	  }
	
	  return promise;
	};
	
	// Provide aliases for supported request methods
	utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
	  /*eslint func-names:0*/
	  Axios.prototype[method] = function(url, config) {
	    return this.request(utils.merge(config || {}, {
	      method: method,
	      url: url
	    }));
	  };
	});
	
	utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
	  /*eslint func-names:0*/
	  Axios.prototype[method] = function(url, data, config) {
	    return this.request(utils.merge(config || {}, {
	      method: method,
	      url: url,
	      data: data
	    }));
	  };
	});
	
	module.exports = Axios;


/***/ },
/* 6 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var utils = __webpack_require__(2);
	var normalizeHeaderName = __webpack_require__(7);
	
	var DEFAULT_CONTENT_TYPE = {
	  'Content-Type': 'application/x-www-form-urlencoded'
	};
	
	function setContentTypeIfUnset(headers, value) {
	  if (!utils.isUndefined(headers) && utils.isUndefined(headers['Content-Type'])) {
	    headers['Content-Type'] = value;
	  }
	}
	
	function getDefaultAdapter() {
	  var adapter;
	  if (typeof XMLHttpRequest !== 'undefined') {
	    // For browsers use XHR adapter
	    adapter = __webpack_require__(8);
	  } else if (typeof process !== 'undefined') {
	    // For node use HTTP adapter
	    adapter = __webpack_require__(8);
	  }
	  return adapter;
	}
	
	var defaults = {
	  adapter: getDefaultAdapter(),
	
	  transformRequest: [function transformRequest(data, headers) {
	    normalizeHeaderName(headers, 'Content-Type');
	    if (utils.isFormData(data) ||
	      utils.isArrayBuffer(data) ||
	      utils.isBuffer(data) ||
	      utils.isStream(data) ||
	      utils.isFile(data) ||
	      utils.isBlob(data)
	    ) {
	      return data;
	    }
	    if (utils.isArrayBufferView(data)) {
	      return data.buffer;
	    }
	    if (utils.isURLSearchParams(data)) {
	      setContentTypeIfUnset(headers, 'application/x-www-form-urlencoded;charset=utf-8');
	      return data.toString();
	    }
	    if (utils.isObject(data)) {
	      setContentTypeIfUnset(headers, 'application/json;charset=utf-8');
	      return JSON.stringify(data);
	    }
	    return data;
	  }],
	
	  transformResponse: [function transformResponse(data) {
	    /*eslint no-param-reassign:0*/
	    if (typeof data === 'string') {
	      try {
	        data = JSON.parse(data);
	      } catch (e) { /* Ignore */ }
	    }
	    return data;
	  }],
	
	  timeout: 0,
	
	  xsrfCookieName: 'XSRF-TOKEN',
	  xsrfHeaderName: 'X-XSRF-TOKEN',
	
	  maxContentLength: -1,
	
	  validateStatus: function validateStatus(status) {
	    return status >= 200 && status < 300;
	  }
	};
	
	defaults.headers = {
	  common: {
	    'Accept': 'application/json, text/plain, */*'
	  }
	};
	
	utils.forEach(['delete', 'get', 'head'], function forEachMethodNoData(method) {
	  defaults.headers[method] = {};
	});
	
	utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
	  defaults.headers[method] = utils.merge(DEFAULT_CONTENT_TYPE);
	});
	
	module.exports = defaults;


/***/ },
/* 7 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var utils = __webpack_require__(2);
	
	module.exports = function normalizeHeaderName(headers, normalizedName) {
	  utils.forEach(headers, function processHeader(value, name) {
	    if (name !== normalizedName && name.toUpperCase() === normalizedName.toUpperCase()) {
	      headers[normalizedName] = value;
	      delete headers[name];
	    }
	  });
	};


/***/ },
/* 8 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var utils = __webpack_require__(2);
	var settle = __webpack_require__(9);
	var buildURL = __webpack_require__(12);
	var parseHeaders = __webpack_require__(13);
	var isURLSameOrigin = __webpack_require__(14);
	var createError = __webpack_require__(10);
	var btoa = (typeof window !== 'undefined' && window.btoa && window.btoa.bind(window)) || __webpack_require__(15);
	
	module.exports = function xhrAdapter(config) {
	  return new Promise(function dispatchXhrRequest(resolve, reject) {
	    var requestData = config.data;
	    var requestHeaders = config.headers;
	
	    if (utils.isFormData(requestData)) {
	      delete requestHeaders['Content-Type']; // Let the browser set it
	    }
	
	    var request = new XMLHttpRequest();
	    var loadEvent = 'onreadystatechange';
	    var xDomain = false;
	
	    // For IE 8/9 CORS support
	    // Only supports POST and GET calls and doesn't returns the response headers.
	    // DON'T do this for testing b/c XMLHttpRequest is mocked, not XDomainRequest.
	    if (("production") !== 'test' &&
	        typeof window !== 'undefined' &&
	        window.XDomainRequest && !('withCredentials' in request) &&
	        !isURLSameOrigin(config.url)) {
	      request = new window.XDomainRequest();
	      loadEvent = 'onload';
	      xDomain = true;
	      request.onprogress = function handleProgress() {};
	      request.ontimeout = function handleTimeout() {};
	    }
	
	    // HTTP basic authentication
	    if (config.auth) {
	      var username = config.auth.username || '';
	      var password = config.auth.password || '';
	      requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
	    }
	
	    request.open(config.method.toUpperCase(), buildURL(config.url, config.params, config.paramsSerializer), true);
	
	    // Set the request timeout in MS
	    request.timeout = config.timeout;
	
	    // Listen for ready state
	    request[loadEvent] = function handleLoad() {
	      if (!request || (request.readyState !== 4 && !xDomain)) {
	        return;
	      }
	
	      // The request errored out and we didn't get a response, this will be
	      // handled by onerror instead
	      // With one exception: request that using file: protocol, most browsers
	      // will return status as 0 even though it's a successful request
	      if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
	        return;
	      }
	
	      // Prepare the response
	      var responseHeaders = 'getAllResponseHeaders' in request ? parseHeaders(request.getAllResponseHeaders()) : null;
	      var responseData = !config.responseType || config.responseType === 'text' ? request.responseText : request.response;
	      var response = {
	        data: responseData,
	        // IE sends 1223 instead of 204 (https://github.com/mzabriskie/axios/issues/201)
	        status: request.status === 1223 ? 204 : request.status,
	        statusText: request.status === 1223 ? 'No Content' : request.statusText,
	        headers: responseHeaders,
	        config: config,
	        request: request
	      };
	
	      settle(resolve, reject, response);
	
	      // Clean up request
	      request = null;
	    };
	
	    // Handle low level network errors
	    request.onerror = function handleError() {
	      // Real errors are hidden from us by the browser
	      // onerror should only fire if it's a network error
	      reject(createError('Network Error', config, null, request));
	
	      // Clean up request
	      request = null;
	    };
	
	    // Handle timeout
	    request.ontimeout = function handleTimeout() {
	      reject(createError('timeout of ' + config.timeout + 'ms exceeded', config, 'ECONNABORTED',
	        request));
	
	      // Clean up request
	      request = null;
	    };
	
	    // Add xsrf header
	    // This is only done if running in a standard browser environment.
	    // Specifically not if we're in a web worker, or react-native.
	    if (utils.isStandardBrowserEnv()) {
	      var cookies = __webpack_require__(16);
	
	      // Add xsrf header
	      var xsrfValue = (config.withCredentials || isURLSameOrigin(config.url)) && config.xsrfCookieName ?
	          cookies.read(config.xsrfCookieName) :
	          undefined;
	
	      if (xsrfValue) {
	        requestHeaders[config.xsrfHeaderName] = xsrfValue;
	      }
	    }
	
	    // Add headers to the request
	    if ('setRequestHeader' in request) {
	      utils.forEach(requestHeaders, function setRequestHeader(val, key) {
	        if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
	          // Remove Content-Type if data is undefined
	          delete requestHeaders[key];
	        } else {
	          // Otherwise add header to the request
	          request.setRequestHeader(key, val);
	        }
	      });
	    }
	
	    // Add withCredentials to request if needed
	    if (config.withCredentials) {
	      request.withCredentials = true;
	    }
	
	    // Add responseType to request if needed
	    if (config.responseType) {
	      try {
	        request.responseType = config.responseType;
	      } catch (e) {
	        // Expected DOMException thrown by browsers not compatible XMLHttpRequest Level 2.
	        // But, this can be suppressed for 'json' type as it can be parsed by default 'transformResponse' function.
	        if (config.responseType !== 'json') {
	          throw e;
	        }
	      }
	    }
	
	    // Handle progress if needed
	    if (typeof config.onDownloadProgress === 'function') {
	      request.addEventListener('progress', config.onDownloadProgress);
	    }
	
	    // Not all browsers support upload events
	    if (typeof config.onUploadProgress === 'function' && request.upload) {
	      request.upload.addEventListener('progress', config.onUploadProgress);
	    }
	
	    if (config.cancelToken) {
	      // Handle cancellation
	      config.cancelToken.promise.then(function onCanceled(cancel) {
	        if (!request) {
	          return;
	        }
	
	        request.abort();
	        reject(cancel);
	        // Clean up request
	        request = null;
	      });
	    }
	
	    if (requestData === undefined) {
	      requestData = null;
	    }
	
	    // Send the request
	    request.send(requestData);
	  });
	};


/***/ },
/* 9 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var createError = __webpack_require__(10);
	
	/**
	 * Resolve or reject a Promise based on response status.
	 *
	 * @param {Function} resolve A function that resolves the promise.
	 * @param {Function} reject A function that rejects the promise.
	 * @param {object} response The response.
	 */
	module.exports = function settle(resolve, reject, response) {
	  var validateStatus = response.config.validateStatus;
	  // Note: status is not exposed by XDomainRequest
	  if (!response.status || !validateStatus || validateStatus(response.status)) {
	    resolve(response);
	  } else {
	    reject(createError(
	      'Request failed with status code ' + response.status,
	      response.config,
	      null,
	      response.request,
	      response
	    ));
	  }
	};


/***/ },
/* 10 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var enhanceError = __webpack_require__(11);
	
	/**
	 * Create an Error with the specified message, config, error code, request and response.
	 *
	 * @param {string} message The error message.
	 * @param {Object} config The config.
	 * @param {string} [code] The error code (for example, 'ECONNABORTED').
	 * @param {Object} [request] The request.
	 * @param {Object} [response] The response.
	 * @returns {Error} The created error.
	 */
	module.exports = function createError(message, config, code, request, response) {
	  var error = new Error(message);
	  return enhanceError(error, config, code, request, response);
	};


/***/ },
/* 11 */
/***/ function(module, exports) {

	'use strict';
	
	/**
	 * Update an Error with the specified config, error code, and response.
	 *
	 * @param {Error} error The error to update.
	 * @param {Object} config The config.
	 * @param {string} [code] The error code (for example, 'ECONNABORTED').
	 * @param {Object} [request] The request.
	 * @param {Object} [response] The response.
	 * @returns {Error} The error.
	 */
	module.exports = function enhanceError(error, config, code, request, response) {
	  error.config = config;
	  if (code) {
	    error.code = code;
	  }
	  error.request = request;
	  error.response = response;
	  return error;
	};


/***/ },
/* 12 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var utils = __webpack_require__(2);
	
	function encode(val) {
	  return encodeURIComponent(val).
	    replace(/%40/gi, '@').
	    replace(/%3A/gi, ':').
	    replace(/%24/g, '$').
	    replace(/%2C/gi, ',').
	    replace(/%20/g, '+').
	    replace(/%5B/gi, '[').
	    replace(/%5D/gi, ']');
	}
	
	/**
	 * Build a URL by appending params to the end
	 *
	 * @param {string} url The base of the url (e.g., http://www.google.com)
	 * @param {object} [params] The params to be appended
	 * @returns {string} The formatted url
	 */
	module.exports = function buildURL(url, params, paramsSerializer) {
	  /*eslint no-param-reassign:0*/
	  if (!params) {
	    return url;
	  }
	
	  var serializedParams;
	  if (paramsSerializer) {
	    serializedParams = paramsSerializer(params);
	  } else if (utils.isURLSearchParams(params)) {
	    serializedParams = params.toString();
	  } else {
	    var parts = [];
	
	    utils.forEach(params, function serialize(val, key) {
	      if (val === null || typeof val === 'undefined') {
	        return;
	      }
	
	      if (utils.isArray(val)) {
	        key = key + '[]';
	      }
	
	      if (!utils.isArray(val)) {
	        val = [val];
	      }
	
	      utils.forEach(val, function parseValue(v) {
	        if (utils.isDate(v)) {
	          v = v.toISOString();
	        } else if (utils.isObject(v)) {
	          v = JSON.stringify(v);
	        }
	        parts.push(encode(key) + '=' + encode(v));
	      });
	    });
	
	    serializedParams = parts.join('&');
	  }
	
	  if (serializedParams) {
	    url += (url.indexOf('?') === -1 ? '?' : '&') + serializedParams;
	  }
	
	  return url;
	};


/***/ },
/* 13 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var utils = __webpack_require__(2);
	
	/**
	 * Parse headers into an object
	 *
	 * ```
	 * Date: Wed, 27 Aug 2014 08:58:49 GMT
	 * Content-Type: application/json
	 * Connection: keep-alive
	 * Transfer-Encoding: chunked
	 * ```
	 *
	 * @param {String} headers Headers needing to be parsed
	 * @returns {Object} Headers parsed into an object
	 */
	module.exports = function parseHeaders(headers) {
	  var parsed = {};
	  var key;
	  var val;
	  var i;
	
	  if (!headers) { return parsed; }
	
	  utils.forEach(headers.split('\n'), function parser(line) {
	    i = line.indexOf(':');
	    key = utils.trim(line.substr(0, i)).toLowerCase();
	    val = utils.trim(line.substr(i + 1));
	
	    if (key) {
	      parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
	    }
	  });
	
	  return parsed;
	};


/***/ },
/* 14 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var utils = __webpack_require__(2);
	
	module.exports = (
	  utils.isStandardBrowserEnv() ?
	
	  // Standard browser envs have full support of the APIs needed to test
	  // whether the request URL is of the same origin as current location.
	  (function standardBrowserEnv() {
	    var msie = /(msie|trident)/i.test(navigator.userAgent);
	    var urlParsingNode = document.createElement('a');
	    var originURL;
	
	    /**
	    * Parse a URL to discover it's components
	    *
	    * @param {String} url The URL to be parsed
	    * @returns {Object}
	    */
	    function resolveURL(url) {
	      var href = url;
	
	      if (msie) {
	        // IE needs attribute set twice to normalize properties
	        urlParsingNode.setAttribute('href', href);
	        href = urlParsingNode.href;
	      }
	
	      urlParsingNode.setAttribute('href', href);
	
	      // urlParsingNode provides the UrlUtils interface - http://url.spec.whatwg.org/#urlutils
	      return {
	        href: urlParsingNode.href,
	        protocol: urlParsingNode.protocol ? urlParsingNode.protocol.replace(/:$/, '') : '',
	        host: urlParsingNode.host,
	        search: urlParsingNode.search ? urlParsingNode.search.replace(/^\?/, '') : '',
	        hash: urlParsingNode.hash ? urlParsingNode.hash.replace(/^#/, '') : '',
	        hostname: urlParsingNode.hostname,
	        port: urlParsingNode.port,
	        pathname: (urlParsingNode.pathname.charAt(0) === '/') ?
	                  urlParsingNode.pathname :
	                  '/' + urlParsingNode.pathname
	      };
	    }
	
	    originURL = resolveURL(window.location.href);
	
	    /**
	    * Determine if a URL shares the same origin as the current location
	    *
	    * @param {String} requestURL The URL to test
	    * @returns {boolean} True if URL shares the same origin, otherwise false
	    */
	    return function isURLSameOrigin(requestURL) {
	      var parsed = (utils.isString(requestURL)) ? resolveURL(requestURL) : requestURL;
	      return (parsed.protocol === originURL.protocol &&
	            parsed.host === originURL.host);
	    };
	  })() :
	
	  // Non standard browser envs (web workers, react-native) lack needed support.
	  (function nonStandardBrowserEnv() {
	    return function isURLSameOrigin() {
	      return true;
	    };
	  })()
	);


/***/ },
/* 15 */
/***/ function(module, exports) {

	'use strict';
	
	// btoa polyfill for IE<10 courtesy https://github.com/davidchambers/Base64.js
	
	var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
	
	function E() {
	  this.message = 'String contains an invalid character';
	}
	E.prototype = new Error;
	E.prototype.code = 5;
	E.prototype.name = 'InvalidCharacterError';
	
	function btoa(input) {
	  var str = String(input);
	  var output = '';
	  for (
	    // initialize result and counter
	    var block, charCode, idx = 0, map = chars;
	    // if the next str index does not exist:
	    //   change the mapping table to "="
	    //   check if d has no fractional digits
	    str.charAt(idx | 0) || (map = '=', idx % 1);
	    // "8 - idx % 1 * 8" generates the sequence 2, 4, 6, 8
	    output += map.charAt(63 & block >> 8 - idx % 1 * 8)
	  ) {
	    charCode = str.charCodeAt(idx += 3 / 4);
	    if (charCode > 0xFF) {
	      throw new E();
	    }
	    block = block << 8 | charCode;
	  }
	  return output;
	}
	
	module.exports = btoa;


/***/ },
/* 16 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var utils = __webpack_require__(2);
	
	module.exports = (
	  utils.isStandardBrowserEnv() ?
	
	  // Standard browser envs support document.cookie
	  (function standardBrowserEnv() {
	    return {
	      write: function write(name, value, expires, path, domain, secure) {
	        var cookie = [];
	        cookie.push(name + '=' + encodeURIComponent(value));
	
	        if (utils.isNumber(expires)) {
	          cookie.push('expires=' + new Date(expires).toGMTString());
	        }
	
	        if (utils.isString(path)) {
	          cookie.push('path=' + path);
	        }
	
	        if (utils.isString(domain)) {
	          cookie.push('domain=' + domain);
	        }
	
	        if (secure === true) {
	          cookie.push('secure');
	        }
	
	        document.cookie = cookie.join('; ');
	      },
	
	      read: function read(name) {
	        var match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
	        return (match ? decodeURIComponent(match[3]) : null);
	      },
	
	      remove: function remove(name) {
	        this.write(name, '', Date.now() - 86400000);
	      }
	    };
	  })() :
	
	  // Non standard browser env (web workers, react-native) lack needed support.
	  (function nonStandardBrowserEnv() {
	    return {
	      write: function write() {},
	      read: function read() { return null; },
	      remove: function remove() {}
	    };
	  })()
	);


/***/ },
/* 17 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var utils = __webpack_require__(2);
	
	function InterceptorManager() {
	  this.handlers = [];
	}
	
	/**
	 * Add a new interceptor to the stack
	 *
	 * @param {Function} fulfilled The function to handle `then` for a `Promise`
	 * @param {Function} rejected The function to handle `reject` for a `Promise`
	 *
	 * @return {Number} An ID used to remove interceptor later
	 */
	InterceptorManager.prototype.use = function use(fulfilled, rejected) {
	  this.handlers.push({
	    fulfilled: fulfilled,
	    rejected: rejected
	  });
	  return this.handlers.length - 1;
	};
	
	/**
	 * Remove an interceptor from the stack
	 *
	 * @param {Number} id The ID that was returned by `use`
	 */
	InterceptorManager.prototype.eject = function eject(id) {
	  if (this.handlers[id]) {
	    this.handlers[id] = null;
	  }
	};
	
	/**
	 * Iterate over all the registered interceptors
	 *
	 * This method is particularly useful for skipping over any
	 * interceptors that may have become `null` calling `eject`.
	 *
	 * @param {Function} fn The function to call for each interceptor
	 */
	InterceptorManager.prototype.forEach = function forEach(fn) {
	  utils.forEach(this.handlers, function forEachHandler(h) {
	    if (h !== null) {
	      fn(h);
	    }
	  });
	};
	
	module.exports = InterceptorManager;


/***/ },
/* 18 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var utils = __webpack_require__(2);
	var transformData = __webpack_require__(19);
	var isCancel = __webpack_require__(20);
	var defaults = __webpack_require__(6);
	
	/**
	 * Throws a `Cancel` if cancellation has been requested.
	 */
	function throwIfCancellationRequested(config) {
	  if (config.cancelToken) {
	    config.cancelToken.throwIfRequested();
	  }
	}
	
	/**
	 * Dispatch a request to the server using the configured adapter.
	 *
	 * @param {object} config The config that is to be used for the request
	 * @returns {Promise} The Promise to be fulfilled
	 */
	module.exports = function dispatchRequest(config) {
	  throwIfCancellationRequested(config);
	
	  // Ensure headers exist
	  config.headers = config.headers || {};
	
	  // Transform request data
	  config.data = transformData(
	    config.data,
	    config.headers,
	    config.transformRequest
	  );
	
	  // Flatten headers
	  config.headers = utils.merge(
	    config.headers.common || {},
	    config.headers[config.method] || {},
	    config.headers || {}
	  );
	
	  utils.forEach(
	    ['delete', 'get', 'head', 'post', 'put', 'patch', 'common'],
	    function cleanHeaderConfig(method) {
	      delete config.headers[method];
	    }
	  );
	
	  var adapter = config.adapter || defaults.adapter;
	
	  return adapter(config).then(function onAdapterResolution(response) {
	    throwIfCancellationRequested(config);
	
	    // Transform response data
	    response.data = transformData(
	      response.data,
	      response.headers,
	      config.transformResponse
	    );
	
	    return response;
	  }, function onAdapterRejection(reason) {
	    if (!isCancel(reason)) {
	      throwIfCancellationRequested(config);
	
	      // Transform response data
	      if (reason && reason.response) {
	        reason.response.data = transformData(
	          reason.response.data,
	          reason.response.headers,
	          config.transformResponse
	        );
	      }
	    }
	
	    return Promise.reject(reason);
	  });
	};


/***/ },
/* 19 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var utils = __webpack_require__(2);
	
	/**
	 * Transform the data for a request or a response
	 *
	 * @param {Object|String} data The data to be transformed
	 * @param {Array} headers The headers for the request or response
	 * @param {Array|Function} fns A single function or Array of functions
	 * @returns {*} The resulting transformed data
	 */
	module.exports = function transformData(data, headers, fns) {
	  /*eslint no-param-reassign:0*/
	  utils.forEach(fns, function transform(fn) {
	    data = fn(data, headers);
	  });
	
	  return data;
	};


/***/ },
/* 20 */
/***/ function(module, exports) {

	'use strict';
	
	module.exports = function isCancel(value) {
	  return !!(value && value.__CANCEL__);
	};


/***/ },
/* 21 */
/***/ function(module, exports) {

	'use strict';
	
	/**
	 * Determines whether the specified URL is absolute
	 *
	 * @param {string} url The URL to test
	 * @returns {boolean} True if the specified URL is absolute, otherwise false
	 */
	module.exports = function isAbsoluteURL(url) {
	  // A URL is considered absolute if it begins with "<scheme>://" or "//" (protocol-relative URL).
	  // RFC 3986 defines scheme name as a sequence of characters beginning with a letter and followed
	  // by any combination of letters, digits, plus, period, or hyphen.
	  return /^([a-z][a-z\d\+\-\.]*:)?\/\//i.test(url);
	};


/***/ },
/* 22 */
/***/ function(module, exports) {

	'use strict';
	
	/**
	 * Creates a new URL by combining the specified URLs
	 *
	 * @param {string} baseURL The base URL
	 * @param {string} relativeURL The relative URL
	 * @returns {string} The combined URL
	 */
	module.exports = function combineURLs(baseURL, relativeURL) {
	  return relativeURL
	    ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
	    : baseURL;
	};


/***/ },
/* 23 */
/***/ function(module, exports) {

	'use strict';
	
	/**
	 * A `Cancel` is an object that is thrown when an operation is canceled.
	 *
	 * @class
	 * @param {string=} message The message.
	 */
	function Cancel(message) {
	  this.message = message;
	}
	
	Cancel.prototype.toString = function toString() {
	  return 'Cancel' + (this.message ? ': ' + this.message : '');
	};
	
	Cancel.prototype.__CANCEL__ = true;
	
	module.exports = Cancel;


/***/ },
/* 24 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var Cancel = __webpack_require__(23);
	
	/**
	 * A `CancelToken` is an object that can be used to request cancellation of an operation.
	 *
	 * @class
	 * @param {Function} executor The executor function.
	 */
	function CancelToken(executor) {
	  if (typeof executor !== 'function') {
	    throw new TypeError('executor must be a function.');
	  }
	
	  var resolvePromise;
	  this.promise = new Promise(function promiseExecutor(resolve) {
	    resolvePromise = resolve;
	  });
	
	  var token = this;
	  executor(function cancel(message) {
	    if (token.reason) {
	      // Cancellation has already been requested
	      return;
	    }
	
	    token.reason = new Cancel(message);
	    resolvePromise(token.reason);
	  });
	}
	
	/**
	 * Throws a `Cancel` if cancellation has been requested.
	 */
	CancelToken.prototype.throwIfRequested = function throwIfRequested() {
	  if (this.reason) {
	    throw this.reason;
	  }
	};
	
	/**
	 * Returns an object that contains a new `CancelToken` and a function that, when called,
	 * cancels the `CancelToken`.
	 */
	CancelToken.source = function source() {
	  var cancel;
	  var token = new CancelToken(function executor(c) {
	    cancel = c;
	  });
	  return {
	    token: token,
	    cancel: cancel
	  };
	};
	
	module.exports = CancelToken;


/***/ },
/* 25 */
/***/ function(module, exports) {

	'use strict';
	
	/**
	 * Syntactic sugar for invoking a function and expanding an array for arguments.
	 *
	 * Common use case would be to use `Function.prototype.apply`.
	 *
	 *  ```js
	 *  function f(x, y, z) {}
	 *  var args = [1, 2, 3];
	 *  f.apply(null, args);
	 *  ```
	 *
	 * With `spread` this example can be re-written.
	 *
	 *  ```js
	 *  spread(function(x, y, z) {})([1, 2, 3]);
	 *  ```
	 *
	 * @param {Function} callback
	 * @returns {Function}
	 */
	module.exports = function spread(callback) {
	  return function wrap(arr) {
	    return callback.apply(null, arr);
	  };
	};


/***/ }
/******/ ])
});
;
//# sourceMappingURL=axios.map;


define('utils/http',["require", "exports", "axios"], function (require, exports, axios_1) {
    "use strict";

    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Http = axios_1.default;
});
//# sourceMappingURL=http.js.map;


var _classCallCheck2 = require("babel-runtime/helpers/classCallCheck");

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require("babel-runtime/helpers/createClass");

var _createClass3 = _interopRequireDefault(_createClass2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

define('utils/event',["require", "exports", "./helpers"], function (require, exports, helpers_1) {
    "use strict";

    Object.defineProperty(exports, "__esModule", { value: true });

    var Event = function () {
        function Event() {
            (0, _classCallCheck3.default)(this, Event);

            this.listeners = {};
        }

        (0, _createClass3.default)(Event, [{
            key: "on",
            value: function on(name, data, handler) {
                if (typeof data === 'function' && handler === undefined) {
                    handler = data;
                    data = undefined;
                }
                if (!helpers_1.Helpers.isArray(this.listeners[name])) {
                    this.listeners[name] = [];
                }
                if (helpers_1.Helpers.isFunction(handler)) {
                    this.listeners[name].push(handler);
                }
                return this;
            }
        }, {
            key: "one",
            value: function one(name, handler) {
                if (helpers_1.Helpers.isFunction(handler)) {
                    handler.isOne = true;
                    this.on(name, handler);
                }
                return this;
            }
        }, {
            key: "off",
            value: function off(name, handler) {
                if (helpers_1.Helpers.isArray(this.listeners[name])) {
                    if (helpers_1.Helpers.isFunction(handler)) {
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
            }
        }, {
            key: "trigger",
            value: function trigger(name, data) {
                if (helpers_1.Helpers.isArray(this.listeners[name])) {
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
        }]);
        return Event;
    }();

    exports.Event = Event;
});
//# sourceMappingURL=event.js.map;


var _classCallCheck2 = require("babel-runtime/helpers/classCallCheck");

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require("babel-runtime/helpers/createClass");

var _createClass3 = _interopRequireDefault(_createClass2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

define('event',["require", "exports", "./utils/helpers", "./utils/event"], function (require, exports, helpers_1, event_1) {
    "use strict";

    Object.defineProperty(exports, "__esModule", { value: true });

    var EventEmitter = function () {
        function EventEmitter(options) {
            (0, _classCallCheck3.default)(this, EventEmitter);

            this.defaultOptions = {};
            this.deferred = {};
            this.isDestroyed = false;
            this.options = helpers_1.Helpers.extend({}, this.defaultOptions, options || {});
            this._event = new event_1.Event();
            return this;
        }

        (0, _createClass3.default)(EventEmitter, [{
            key: "destroy",
            value: function destroy() {
                if (!this.isDestroyed) {
                    this.trigger('destroy');
                    this.off();
                    delete this.options;
                    delete this._event;
                    this.isDestroyed = true;
                }
                return this;
            }
        }, {
            key: "on",
            value: function on(name, handler, isSingle) {
                if (this._event) {
                    this._event.on.apply(this._event, arguments);
                }
                return this;
            }
        }, {
            key: "off",
            value: function off() {
                if (this._event) {
                    this._event.off.apply(this._event, arguments);
                }
                return this;
            }
        }, {
            key: "trigger",
            value: function trigger(name, data) {
                if (this._event) {
                    this._event.trigger.apply(this._event, arguments);
                }
                return this;
            }
        }, {
            key: "require",
            value: function require(module, callback) {
                var _this = this,
                    _arguments = arguments;

                var promises = [],
                    modules = {},
                    promise = void 0;
                if (!helpers_1.Helpers.isArray(module)) {
                    promise = new Promise(function (resolve, reject) {
                        window.requirejs([_this.deferred[module] || module], function () {
                            for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
                                args[_key] = arguments[_key];
                            }

                            if (!_this.isDestroyed) {
                                if (helpers_1.Helpers.isFunction(callback)) {
                                    callback.apply(undefined, args);
                                }
                                resolve.apply(_this, _arguments);
                            }
                        }, reject);
                    });
                } else {
                    module.forEach(function (item) {
                        var moduleName = void 0;
                        promises.push(new Promise(function (resolve, reject) {
                            moduleName = _this.deferred[item] || item;
                            window.requirejs([moduleName], function (Module) {
                                modules[moduleName] = Module;
                                resolve();
                            }, reject);
                        }));
                    });
                    promise = new Promise(function (resolve, reject) {
                        Promise.all(promises).then(function () {
                            var deps = [];
                            module.forEach(function (item) {
                                var moduleName = _this.deferred[item] || item;
                                deps.push(modules[moduleName]);
                            });
                            if (!_this.isDestroyed) {
                                resolve.apply(_this, deps);
                                if (helpers_1.Helpers.isFunction(callback)) {
                                    callback.apply(_this, deps);
                                }
                            }
                        }).catch(reject);
                    });
                }
                return promise;
            }
        }]);
        return EventEmitter;
    }();

    exports.EventEmitter = EventEmitter;
});
//# sourceMappingURL=event.js.map;


var _classCallCheck2 = require("babel-runtime/helpers/classCallCheck");

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require("babel-runtime/helpers/createClass");

var _createClass3 = _interopRequireDefault(_createClass2);

var _possibleConstructorReturn2 = require("babel-runtime/helpers/possibleConstructorReturn");

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _get2 = require("babel-runtime/helpers/get");

var _get3 = _interopRequireDefault(_get2);

var _inherits2 = require("babel-runtime/helpers/inherits");

var _inherits3 = _interopRequireDefault(_inherits2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

define('collection',["require", "exports", "./event", "./utils/helpers", "./utils/http"], function (require, exports, event_1, helpers_1, http_1) {
    "use strict";

    Object.defineProperty(exports, "__esModule", { value: true });

    var Collection = function (_event_1$EventEmitter) {
        (0, _inherits3.default)(Collection, _event_1$EventEmitter);

        function Collection() {
            (0, _classCallCheck3.default)(this, Collection);

            var _this = (0, _possibleConstructorReturn3.default)(this, (Collection.__proto__ || Object.getPrototypeOf(Collection)).apply(this, arguments));

            _this.items = [];
            return _this;
        }

        (0, _createClass3.default)(Collection, [{
            key: "destroy",
            value: function destroy() {
                (0, _get3.default)(Collection.prototype.__proto__ || Object.getPrototypeOf(Collection.prototype), "destroy", this).call(this);
                delete this.items;
                if (this.fetchXHR) {
                    this.fetchXHR.abort();
                    delete this.fetchXHR;
                }
                return this;
            }
        }, {
            key: "fetch",
            value: function fetch() {
                var _this2 = this;

                return new Promise(function (resolve, reject) {
                    var settings = _this2.getFetchSettings();
                    _this2.fetchXHR = http_1.Http.get(settings.url, {
                        params: _this2.getFetchParams()
                    }).then(function (response) {
                        var items = void 0;
                        if (_this2.isDestroyed) {
                            return;
                        }
                        if (helpers_1.Helpers.isString(response.data)) {
                            response.data = JSON.parse(response.data);
                        } else if (!helpers_1.Helpers.isObject(response.data)) {
                            response.data = {};
                        }
                        items = _this2.setResponse(response.data);
                        _this2.trigger('fetched', {
                            items: items,
                            response: response
                        });
                        if (items.length === 0) {
                            _this2.trigger('end');
                        }
                        resolve(items);
                    });
                });
            }
        }, {
            key: "abort",
            value: function abort() {
                if (this.fetchXHR) {
                    this.fetchXHR.abort();
                    this.trigger('aborted');
                }
                return this;
            }
        }, {
            key: "isPending",
            value: function isPending() {
                return this.fetchXHR && this.fetchXHR.state() === 'pending';
            }
        }, {
            key: "setResponse",
            value: function setResponse(response) {
                var _this3 = this;

                var model,
                    models = [],
                    data = this.adapter(response);
                if (!helpers_1.Helpers.isArray(data.items)) {
                    return models;
                }
                data.items.forEach(function (item) {
                    model = new _this3.model();
                    model.set(item);
                    _this3.add(model);
                    models.push(model);
                });
                return models;
            }
        }, {
            key: "getByAttr",
            value: function getByAttr(attrKey, attrValue) {
                var model = null;
                this.items.forEach(function (item) {
                    if (!isNaN(Number(item.get(attrKey))) && Number(item.get(attrKey)) === Number(attrValue) || String(item.get(attrKey)) === String(attrValue)) {
                        model = item;
                    }
                });
                return model;
            }
        }, {
            key: "getArrayByAttr",
            value: function getArrayByAttr(attrKey, attrValue) {
                var models = [];
                this.items.forEach(function (item) {
                    if (!isNaN(Number(item.get(attrKey))) && Number(item.get(attrKey)) === Number(attrValue) || String(item.get(attrKey)) === String(attrValue)) {
                        models.push(item);
                    }
                });
                return models;
            }
        }, {
            key: "getById",
            value: function getById(id) {
                return this.getByAttr('id', id);
            }
        }, {
            key: "getByClientId",
            value: function getByClientId(cid) {
                var result = null;
                this.items.forEach(function (item, index) {
                    if (item.cid === cid) {
                        result = item;
                    }
                });
                return result;
            }
        }, {
            key: "getItems",
            value: function getItems() {
                return this.items;
            }
        }, {
            key: "getByIndex",
            value: function getByIndex(index) {
                return this.items[index];
            }
        }, {
            key: "add",
            value: function add(model) {
                this.items.push(model);
                this.trigger('add');
                this.trigger('change');
                return this;
            }
        }, {
            key: "remove",
            value: function remove(id) {
                var _this4 = this;

                this.items.forEach(function (item, index) {
                    if (item.get('id') === id) {
                        _this4.items.splice(index, 1);
                        _this4.trigger('remove', {
                            id: item.id,
                            cid: item.cid
                        });
                        _this4.trigger('change');
                    }
                });
                return this;
            }
        }, {
            key: "removeByClientId",
            value: function removeByClientId(cid) {
                var _this5 = this;

                this.items.forEach(function (item, index) {
                    if (item.cid === cid) {
                        _this5.items.splice(index, 1);
                        _this5.trigger('remove', {
                            id: item.id,
                            cid: item.cid
                        });
                        _this5.trigger('change');
                    }
                });
                return this;
            }
        }, {
            key: "forEach",
            value: function forEach(iterator) {
                this.items.forEach(iterator);
                return this;
            }
        }, {
            key: "map",
            value: function map(iterator) {
                return this.items.map(iterator);
            }
        }, {
            key: "forEachAsync",
            value: function forEachAsync(iterator, callback) {
                var step = function step(iterator, index) {
                    if (this.getLength(true) > index) {
                        iterator(this.items[index], index, step.bind(this, iterator, index + 1));
                    } else {
                        if (helpers_1.Helpers.isFunction(callback)) {
                            callback();
                        }
                    }
                };
                if (this.getLength(true)) {
                    iterator(this.items[0], 0, step.bind(this, iterator, 1));
                }
                return this;
            }
        }, {
            key: "filter",
            value: function filter(condition) {
                return this.items.filter(condition);
            }
        }, {
            key: "clear",
            value: function clear(options) {
                options = helpers_1.Helpers.extend({
                    destroy: true
                }, options);
                if (options.destroy) {
                    this.forEach(function (item) {
                        item.destroy();
                    });
                }
                this.items = [];
                return this;
            }
        }, {
            key: "getLength",
            value: function getLength(isAll) {
                var items = void 0;
                if (isAll) {
                    items = this.items;
                } else {
                    items = this.items.filter(function (item) {
                        return !item.isRemoved();
                    });
                }
                return items.length;
            }
        }, {
            key: "toJSON",
            value: function toJSON() {
                var json = [];
                this.forEach(function (model) {
                    return json.push(model.toJSON());
                });
                return json;
            }
        }, {
            key: "getUrl",
            value: function getUrl() {
                return this.options.url || this.url;
            }
        }, {
            key: "adapter",
            value: function adapter(data) {
                return data;
            }
        }, {
            key: "getFetchParams",
            value: function getFetchParams() {
                return {};
            }
        }, {
            key: "getFetchSettings",
            value: function getFetchSettings() {
                return helpers_1.Helpers.extend({
                    url: this.getUrl()
                });
            }
        }]);
        return Collection;
    }(event_1.EventEmitter);

    exports.Collection = Collection;
});
//# sourceMappingURL=collection.js.map;


var _classCallCheck2 = require("babel-runtime/helpers/classCallCheck");

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require("babel-runtime/helpers/createClass");

var _createClass3 = _interopRequireDefault(_createClass2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

define('element',["require", "exports"], function (require, exports) {
    "use strict";

    Object.defineProperty(exports, "__esModule", { value: true });

    var DomElement = function () {
        function DomElement(el) {
            (0, _classCallCheck3.default)(this, DomElement);

            this.el = el;
        }

        (0, _createClass3.default)(DomElement, [{
            key: "getElement",
            value: function getElement() {
                return this.el;
            }
        }, {
            key: "val",
            value: function val() {
                return this.el.value;
            }
        }, {
            key: "is",
            value: function is(selector) {
                var _this = this;

                var isEqual = false;
                if (typeof selector === 'string') {
                    if (this.el.parentElement) {
                        Array.prototype.forEach.call(this.el.parentElement.querySelectorAll(selector), function (item) {
                            if (item === _this.el) {
                                isEqual = true;
                            }
                        });
                    }
                } else {
                    isEqual = this.el === selector;
                }
                return isEqual;
            }
        }, {
            key: "closest",
            value: function closest(selector) {
                var el = void 0,
                    elInstance = void 0,
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
        }, {
            key: "find",
            value: function find(selector) {
                return Array.prototype.map.call(this.el.querySelectorAll(selector), function (el) {
                    return new DomElement(el);
                });
            }
        }, {
            key: "hasClass",
            value: function hasClass(className) {
                var classList = this.el.className.split(' ').map(function (className) {
                    return className.trim();
                });
                return classList.indexOf(className) !== -1;
            }
        }, {
            key: "attr",
            value: function attr(attrName) {
                return this.el.getAttribute(attrName);
            }
        }, {
            key: "html",
            value: function html(_html) {
                if (_html) {
                    this.el.innerHTML = _html;
                }
                return this.el.innerHTML;
            }
        }, {
            key: "scrollTo",
            value: function scrollTo(x, y) {
                this.el.scrollTo(x, y);
            }
        }, {
            key: "on",
            value: function on(event, handler) {
                this.el.addEventListener(event, handler);
            }
        }, {
            key: "off",
            value: function off(event, handler) {
                this.el.removeEventListener(event, handler);
            }
        }, {
            key: "empty",
            value: function empty() {
                this.el.innerHTML = '';
            }
        }, {
            key: "appendTo",
            value: function appendTo($el) {
                $el.getElement().appendChild(this.el);
            }
        }, {
            key: "addClass",
            value: function addClass(className) {
                this.el.classList.add(className);
            }
        }, {
            key: "removeClass",
            value: function removeClass(className) {
                this.el.classList.remove(className);
            }
        }]);
        return DomElement;
    }();

    exports.DomElement = DomElement;
});
//# sourceMappingURL=element.js.map;


var _classCallCheck2 = require("babel-runtime/helpers/classCallCheck");

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require("babel-runtime/helpers/createClass");

var _createClass3 = _interopRequireDefault(_createClass2);

var _possibleConstructorReturn2 = require("babel-runtime/helpers/possibleConstructorReturn");

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _get2 = require("babel-runtime/helpers/get");

var _get3 = _interopRequireDefault(_get2);

var _inherits2 = require("babel-runtime/helpers/inherits");

var _inherits3 = _interopRequireDefault(_inherits2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

define('model',["require", "exports", "./event", "./utils/helpers", "./utils/http"], function (require, exports, event_1, helpers_1, http_1) {
    "use strict";

    Object.defineProperty(exports, "__esModule", { value: true });

    var Model = function (_event_1$EventEmitter) {
        (0, _inherits3.default)(Model, _event_1$EventEmitter);

        function Model(attr, options) {
            var _ret;

            (0, _classCallCheck3.default)(this, Model);

            var _this = (0, _possibleConstructorReturn3.default)(this, (Model.__proto__ || Object.getPrototypeOf(Model)).call(this, options));

            _this.uniqueKey = 'id';
            _this._attr = helpers_1.Helpers.extend({}, _this.defaults, attr);
            _this.options = helpers_1.Helpers.extend({}, _this.defaultOptions, options);
            _this.id = _this._attr.id;
            _this.cid = Model.counter++;
            _this.errors = [];
            _this.isFetchedState = false;
            _this.isRemovedState = false;
            _this.delegateEvents();
            return _ret = _this, (0, _possibleConstructorReturn3.default)(_this, _ret);
        }

        (0, _createClass3.default)(Model, [{
            key: "destroy",
            value: function destroy() {
                delete this._attr;
                delete this.id;
                delete this.cid;
                delete this.errors;
                (0, _get3.default)(Model.prototype.__proto__ || Object.getPrototypeOf(Model.prototype), "destroy", this).call(this);
                return this;
            }
        }, {
            key: "getSingle",
            value: function getSingle(key) {
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
            }
        }, {
            key: "setSingle",
            value: function setSingle(key, value, options) {
                var isChanged = false;
                options = options || {};
                if (this._attr[key] !== value) {
                    if (helpers_1.Helpers.isString(value)) {
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
            }
        }, {
            key: "get",
            value: function get(key) {
                var result = null;
                if (helpers_1.Helpers.isString(key)) {
                    result = this.getSingle(key);
                }
                if (helpers_1.Helpers.isArray(key)) {
                    result = {};
                    key.forEach(function (item) {
                        result[item] = this.getSingle(item);
                    }.bind(this));
                }
                return result;
            }
        }, {
            key: "set",
            value: function set(key, value, options) {
                var _this2 = this;

                var changedAttrs = [];
                if (helpers_1.Helpers.isString(key)) {
                    if (this.setSingle(key, value, helpers_1.Helpers.extend({}, options, { isNotChangeTrigger: true }))) {
                        this.trigger('change.' + key);
                    }
                }
                if (helpers_1.Helpers.isObject(key)) {
                    options = value;
                    Object.keys(key).forEach(function (item) {
                        if (_this2.setSingle(item, key[item], helpers_1.Helpers.extend({}, options, { isNotChangeTrigger: true }))) {
                            changedAttrs.push(item);
                        }
                    });
                    if (!options || !options.silent) {
                        changedAttrs.forEach(function (item) {
                            _this2.trigger('change.' + item);
                        });
                    }
                }
                if (!options || !options.silent) {
                    this.trigger('change');
                }
                return this;
            }
        }, {
            key: "validate",
            value: function validate(options) {
                var _this3 = this;

                this.errors = [];
                this.validation.forEach(function (item) {
                    var value;
                    if (String(item.value).indexOf('@') === 0) {
                        value = _this3.get(item.value.slice(1));
                    } else {
                        value = item.value;
                    }
                    if (!helpers_1.Helpers.isFunction(item.condition) || item.condition.call(_this3, options)) {
                        switch (item.type) {
                            case 'eq':
                                item.attr.forEach(function (attr1) {
                                    item.attr.forEach(function (attr2) {
                                        if (item.byLength) {
                                            if (String(_this3.get(attr1)).length === String(_this3.get(attr2)).length) {
                                                _this3.errors.push(item.errorCode);
                                            }
                                        } else {
                                            if (_this3.get(attr1) !== _this3.get(attr2)) {
                                                _this3.errors.push(item.errorCode);
                                            }
                                        }
                                    });
                                });
                                break;
                            case 'lt':
                                item.attr.forEach(function (attr) {
                                    var length,
                                        attrValue = _this3.get(attr);
                                    if (item.byLength) {
                                        if (helpers_1.Helpers.isArray(attrValue)) {
                                            length = attrValue.length;
                                        } else {
                                            length = String(attrValue).length;
                                        }
                                        if (item.strict && length > value || !item.strict && length >= value) {
                                            _this3.errors.push(item.errorCode);
                                        }
                                    } else {
                                        if (item.strict && attrValue > value || !item.strict && attrValue >= value) {
                                            _this3.errors.push(item.errorCode);
                                        }
                                    }
                                });
                                break;
                            case 'gt':
                                item.attr.forEach(function (attr) {
                                    var length = void 0,
                                        attrValue = _this3.get(attr);
                                    if (item.byLength) {
                                        if (helpers_1.Helpers.isArray(attrValue)) {
                                            length = attrValue.length;
                                        } else {
                                            length = String(attrValue).length;
                                        }
                                        if (item.strict && length < value || !item.strict && length <= value) {
                                            _this3.errors.push(item.errorCode);
                                        }
                                    } else {
                                        if (item.strict && attrValue < value || !item.strict && attrValue <= value) {
                                            _this3.errors.push(item.errorCode);
                                        }
                                    }
                                });
                                break;
                            case 'required':
                                item.attr.forEach(function (attr) {
                                    var attrValue = _this3.get(attr),
                                        isError = helpers_1.Helpers.isArray(attrValue) && attrValue.length === 0 || !attrValue;
                                    if (isError) {
                                        _this3.errors.push(item.errorCode);
                                    }
                                });
                                break;
                            case 'regexp':
                                item.attr.forEach(function (attr) {
                                    if (!value.test(_this3.get(attr))) {
                                        _this3.errors.push(item.errorCode);
                                    }
                                });
                                break;
                        }
                    }
                });
                return this.errors.length === 0;
            }
        }, {
            key: "toJSON",
            value: function toJSON() {
                return helpers_1.Helpers.extend({}, this._attr);
            }
        }, {
            key: "fetch",
            value: function fetch() {
                var _this4 = this;

                return new Promise(function (resolve, reject) {
                    var settings = _this4.getFetchSettings();
                    _this4.fetchXHR = http_1.Http.get(settings.url, {
                        params: _this4.getFetchParams()
                    }).then(function (response) {
                        if (!_this4.isDestroyed) {
                            if (helpers_1.Helpers.isString(response.data)) {
                                response = JSON.parse(response.data);
                            }
                            _this4.set(_this4.adapter(response.data));
                            _this4.isFetchedState = true;
                            _this4.trigger('fetched', response.data);
                            resolve(response, response.data);
                        }
                    });
                });
            }
        }, {
            key: "save",
            value: function save() {
                var _this5 = this;

                this.trigger('beforeSave');
                return new Promise(function (resolve, reject) {
                    var validateOptions = {
                        mode: 'save'
                    };
                    if (_this5.validate(validateOptions)) {
                        var settings = _this5.getSaveSettings();
                        http_1.Http.post(settings.url, {
                            params: _this5.getSaveParams()
                        }).then(function (response) {
                            if (helpers_1.Helpers.isString(response.data)) {
                                response = JSON.parse(response.data);
                            }
                            _this5.trigger('saved');
                            resolve(response.data);
                        });
                    } else {
                        reject();
                    }
                });
            }
        }, {
            key: "create",
            value: function create() {
                var _this6 = this;

                this.trigger('beforeCreate');
                return new Promise(function (resolve, reject) {
                    var validateOptions = {
                        mode: 'create'
                    };
                    if (_this6.validate(validateOptions)) {
                        var settings = _this6.getCreateSettings();
                        http_1.Http.put(settings.url, {
                            params: _this6.getCreateParams()
                        }).then(function (response) {
                            if (helpers_1.Helpers.isString(response.data)) {
                                response = JSON.parse(response.data);
                            }
                            _this6.trigger('created');
                            resolve(response.data);
                        });
                    } else {
                        reject();
                    }
                });
            }
        }, {
            key: "remove",
            value: function remove() {
                var _this7 = this;

                this.trigger('beforeRemove');
                this.isRemovedState = true;
                return new Promise(function (resolve, reject) {
                    if (_this7.isRemoveReady()) {
                        var settings = _this7.getRemoveSettings();
                        http_1.Http.delete(settings.url, {
                            params: _this7.getRemoveParams()
                        }).then(function (response) {
                            if (helpers_1.Helpers.isString(response.data)) {
                                response = JSON.parse(response.data);
                            }
                            _this7.trigger('removed');
                            resolve(response.data);
                        });
                    } else {
                        _this7.trigger('removed');
                        reject();
                    }
                });
            }
        }, {
            key: "abort",
            value: function abort() {
                if (this.fetchXHR) {
                    this.fetchXHR.abort();
                    this.trigger('aborted');
                }
                return this;
            }
        }, {
            key: "fetched",
            value: function fetched() {
                var _this8 = this;

                return new Promise(function (resolve) {
                    if (_this8.isFetched()) {
                        resolve();
                    } else {
                        _this8.on('fetched', function () {
                            resolve();
                        });
                    }
                });
            }
        }, {
            key: "setResponse",
            value: function setResponse(response) {
                this.set(this.adapter(response));
                return this;
            }
        }, {
            key: "isFetched",
            value: function isFetched() {
                return this.isFetchedState;
            }
        }, {
            key: "isRemoved",
            value: function isRemoved() {
                return this.isRemovedState;
            }
        }, {
            key: "isRemoveReady",
            value: function isRemoveReady() {
                return !!this.get(this.uniqueKey);
            }
        }, {
            key: "isPending",
            value: function isPending() {
                return this.fetchXHR && this.fetchXHR.state() === 'pending';
            }
        }, {
            key: "delegateEvents",
            value: function delegateEvents() {
                var _this9 = this;

                if (this.events) {
                    Object.keys(this.events).forEach(function (eventItem) {
                        _this9.on(eventItem, _this9[_this9.events[eventItem]].bind(_this9));
                    });
                }
                return this;
            }
        }, {
            key: "adapter",
            value: function adapter(srcAttr) {
                return srcAttr;
            }
        }, {
            key: "getUrl",
            value: function getUrl() {
                return this.url;
            }
        }, {
            key: "getFetchParams",
            value: function getFetchParams() {
                var params = {};
                params[this.uniqueKey] = this.get(this.uniqueKey);
                return params;
            }
        }, {
            key: "getSaveParams",
            value: function getSaveParams() {
                return helpers_1.Helpers.extend({}, this.toJSON());
            }
        }, {
            key: "getCreateParams",
            value: function getCreateParams() {
                return helpers_1.Helpers.extend({}, this.toJSON());
            }
        }, {
            key: "getRemoveParams",
            value: function getRemoveParams() {
                return helpers_1.Helpers.extend({}, {
                    id: this.get('id')
                });
            }
        }, {
            key: "getFetchSettings",
            value: function getFetchSettings() {
                return {
                    url: this.getUrl()
                };
            }
        }, {
            key: "getSaveSettings",
            value: function getSaveSettings() {
                return {
                    url: this.getUrl(),
                    type: 'post'
                };
            }
        }, {
            key: "getCreateSettings",
            value: function getCreateSettings() {
                return {
                    url: this.getUrl(),
                    type: 'post',
                    abortCaptcha: function () {
                        this.trigger('abortCaptcha');
                    }.bind(this)
                };
            }
        }, {
            key: "getRemoveSettings",
            value: function getRemoveSettings() {
                return {
                    url: this.getUrl(),
                    type: 'post'
                };
            }
        }]);
        return Model;
    }(event_1.EventEmitter);

    Model.counter = 0;
    exports.Model = Model;
});
//# sourceMappingURL=model.js.map;


var _regenerator = require("babel-runtime/regenerator");

var _regenerator2 = _interopRequireDefault(_regenerator);

var _classCallCheck2 = require("babel-runtime/helpers/classCallCheck");

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require("babel-runtime/helpers/createClass");

var _createClass3 = _interopRequireDefault(_createClass2);

var _possibleConstructorReturn2 = require("babel-runtime/helpers/possibleConstructorReturn");

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _get2 = require("babel-runtime/helpers/get");

var _get3 = _interopRequireDefault(_get2);

var _inherits2 = require("babel-runtime/helpers/inherits");

var _inherits3 = _interopRequireDefault(_inherits2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var __awaiter = undefined && undefined.__awaiter || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) {
            try {
                step(generator.next(value));
            } catch (e) {
                reject(e);
            }
        }
        function rejected(value) {
            try {
                step(generator["throw"](value));
            } catch (e) {
                reject(e);
            }
        }
        function step(result) {
            result.done ? resolve(result.value) : new P(function (resolve) {
                resolve(result.value);
            }).then(fulfilled, rejected);
        }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
define('view',["require", "exports", "./event", "./element", "./utils/helpers"], function (require, exports, event_1, element_1, helpers_1) {
    "use strict";

    Object.defineProperty(exports, "__esModule", { value: true });

    var View = function (_event_1$EventEmitter) {
        (0, _inherits3.default)(View, _event_1$EventEmitter);

        function View(options) {
            var _ret;

            (0, _classCallCheck3.default)(this, View);

            var _this = (0, _possibleConstructorReturn3.default)(this, (View.__proto__ || Object.getPrototypeOf(View)).call(this, options));

            _this._isReady = false;
            _this._isRendered = false;
            _this.events = {};
            _this.elements = {};
            _this.css = [];
            _this.optionsSelector = 'script[type="text/plain"]';
            _this.model = _this.options.model;
            _this.$el = null;
            _this._domEventHandlers = {};
            _this.promiseRender = new Promise(function (resolve, reject) {
                _this.on('render', resolve);
            });
            _this.promiseCss = new Promise(function (resolve, reject) {
                _this.on('cssLoad', resolve);
            });
            Promise.all([_this.promiseRender, _this.promiseCss]).then(_this.onViewReady.bind(_this));
            _this.loadCss();
            return _ret = _this, (0, _possibleConstructorReturn3.default)(_this, _ret);
        }

        (0, _createClass3.default)(View, [{
            key: "init",
            value: function init() {
                return this;
            }
        }, {
            key: "destroy",
            value: function destroy() {
                if (!this.isDestroyed) {
                    this.unDelegateEvents();
                    if (helpers_1.Helpers.isjQueryObject(this.$el)) {
                        this.$el.off();
                    }
                    delete this.$el;
                    delete this.model;
                    delete this._domEventHandlers;
                }
                (0, _get3.default)(View.prototype.__proto__ || Object.getPrototypeOf(View.prototype), "destroy", this).call(this);
                return this;
            }
        }, {
            key: "getElement",
            value: function getElement() {
                return this.$el;
            }
        }, {
            key: "ready",
            value: function ready(callback) {
                var _this2 = this;

                return new Promise(function (resolve, reject) {
                    if (_this2._isReady) {
                        resolve();
                        if (helpers_1.Helpers.isFunction(callback)) {
                            callback();
                        }
                    } else {
                        if (helpers_1.Helpers.isFunction(callback)) {
                            _this2.on('ready', callback);
                        }
                        _this2.on('ready', resolve);
                    }
                });
            }
        }, {
            key: "getTemplateUrl",
            value: function getTemplateUrl() {
                return this.template;
            }
        }, {
            key: "setTemplateUrl",
            value: function setTemplateUrl(url) {
                this.template = url;
            }
        }, {
            key: "render",
            value: function render(vars) {
                return __awaiter(this, void 0, void 0, /*#__PURE__*/_regenerator2.default.mark(function _callee() {
                    var _this3 = this;

                    return _regenerator2.default.wrap(function _callee$(_context) {
                        while (1) {
                            switch (_context.prev = _context.next) {
                                case 0:
                                    vars = vars || {};
                                    return _context.abrupt("return", new Promise(function (resolve, reject) {
                                        var modelData = void 0,
                                            data = void 0;
                                        if (_this3.model) {
                                            modelData = _this3.model.toJSON();
                                        }
                                        data = helpers_1.Helpers.extend({}, modelData, vars, {
                                            locales: _this3.options && _this3.options.locales || vars.locales || {},
                                            options: _this3.options
                                        });
                                        window.requirejs([_this3.getTemplateUrl()], function (template) {
                                            var html = void 0,
                                                $html = void 0,
                                                element = document.createElement('div');
                                            if (!_this3.isDestroyed) {
                                                html = template(data).trim();
                                                element.innerHTML = html;
                                                $html = new element_1.DomElement(element.firstElementChild);
                                                _this3.setElement($html);
                                                _this3._isRendered = true;
                                                _this3.delegateEvents();
                                                _this3.trigger('render');
                                                resolve($html);
                                            }
                                        });
                                    }));

                                case 2:
                                case "end":
                                    return _context.stop();
                            }
                        }
                    }, _callee, this);
                }));
            }
        }, {
            key: "isRendered",
            value: function isRendered() {
                return this._isRendered;
            }
        }, {
            key: "rendered",
            value: function rendered(callback, isSingle) {
                var _this4 = this;

                return new Promise(function (resolve, reject) {
                    if (_this4.isRendered()) {
                        resolve();
                        if (helpers_1.Helpers.isFunction(callback)) {
                            callback();
                        }
                    } else {
                        if (helpers_1.Helpers.isFunction(callback)) {
                            _this4.on('render', callback, isSingle);
                        }
                        _this4.on('render', resolve);
                    }
                });
            }
        }, {
            key: "setElement",
            value: function setElement($el) {
                this.$el = $el;
                this.updateElements();
                return this;
            }
        }, {
            key: "delegateEvents",
            value: function delegateEvents() {
                var _this5 = this;

                if (!this.isDestroyed) {
                    this.unDelegateEvents();
                    Object.keys(this.events).forEach(function (eventItem) {
                        var eventData = eventItem.match(/^(\S+)(?: ([\w\W]*))?/),
                            eventHandlerData = _this5.events[eventItem],
                            isDelegate = true,
                            isThrottled = false,
                            isPreventDefault = false,
                            isStopPropagation = false,
                            throttling = 0,
                            handler,
                            eventType = eventData[1],
                            eventSelector = eventData[2],
                            $delegator;
                        if (helpers_1.Helpers.isString(eventHandlerData)) {
                            handler = _this5[eventHandlerData];
                        } else if (helpers_1.Helpers.isObject(eventHandlerData)) {
                            handler = _this5[eventHandlerData.method];
                            isDelegate = eventHandlerData.delegate !== false;
                            throttling = eventHandlerData.throttling;
                            isPreventDefault = eventHandlerData.preventDefault || false;
                            isStopPropagation = eventHandlerData.stopPropagation || false;
                        }
                        if (helpers_1.Helpers.isFunction(handler)) {
                            _this5._domEventHandlers[eventItem] = function (event, data) {
                                var $target = new element_1.DomElement(event.target);
                                if (isPreventDefault) {
                                    event.preventDefault();
                                }
                                if (isStopPropagation) {
                                    event.stopPropagation();
                                }
                                if (eventSelector) {
                                    if (!$target.is(eventSelector)) {
                                        $target = $target.closest(eventSelector)[0];
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
                            }.bind(_this5);
                            if (eventSelector) {
                                _this5.$el.find(eventSelector).forEach(function ($el) {
                                    $el.on(eventType, _this5._domEventHandlers[eventItem]);
                                });
                            } else {
                                _this5.$el.on(eventType, _this5._domEventHandlers[eventItem]);
                            }
                        }
                    });
                }
                return this;
            }
        }, {
            key: "unDelegateEvents",
            value: function unDelegateEvents() {
                var _this6 = this;

                if (!this.isDestroyed) {
                    Object.keys(this.events).forEach(function (eventItem) {
                        var eventData = eventItem.match(/^(\S+)(?: ([\w\W]*))?/),
                            eventType = eventData[1];
                        if (_this6._domEventHandlers && helpers_1.Helpers.isFunction(_this6._domEventHandlers[eventItem]) && helpers_1.Helpers.isjQueryObject(_this6.$el)) {
                            _this6.$el.off(eventType, _this6._domEventHandlers[eventItem]);
                        }
                    });
                }
                return this;
            }
        }, {
            key: "updateElements",
            value: function updateElements() {
                var _this7 = this;

                if (this.$el) {
                    Object.keys(this.elements).forEach(function (item) {
                        var selector = _this7.elements[item],
                            $el,
                            $find;
                        $find = _this7.$el.find(selector);
                        if ($find.length === 1) {
                            $el = $find[0];
                        } else {
                            $el = $find;
                        }
                        _this7['$' + item] = $el;
                    });
                }
                return this;
            }
        }, {
            key: "parseOptions",
            value: function parseOptions() {
                var options;
                try {
                    options = JSON.parse(this.$el.find(this.optionsSelector).html().replace(/\r|\n|\t|\s{2,}/g, ''));
                } catch (err) {
                    options = {};
                }
                this.options = helpers_1.Helpers.extend({}, this.defaultOptions, this.options, options);
            }
        }, {
            key: "loadCss",
            value: function loadCss() {
                var promises = [];
                this.css.forEach(function (item) {
                    promises.push(new Promise(function (resolve, reject) {
                        window.requirejs(['util/css-manager'], function (CssManager) {
                            CssManager.require(item, resolve);
                        });
                    }));
                });
                Promise.all(promises).then(this.trigger.bind(this, 'cssLoad'));
            }
        }, {
            key: "onViewReady",
            value: function onViewReady() {
                this.trigger('ready');
                this._isReady = true;
            }
        }], [{
            key: "createRunTime",
            value: function createRunTime(options, $el) {
                var module = void 0;
                if (helpers_1.Helpers.isNode(options)) {
                    $el = options;
                    options = {};
                }
                if (options instanceof element_1.DomElement) {
                    $el = options.getElement();
                    options = {};
                }
                if ($el instanceof element_1.DomElement) {
                    $el = $el.getElement();
                }
                module = new this(options);
                module.setElement(new element_1.DomElement($el));
                module.parseOptions();
                module.delegateEvents();
                module.init();
                return module;
            }
        }]);
        return View;
    }(event_1.EventEmitter);

    exports.View = View;
});
//# sourceMappingURL=view.js.map;


var _classCallCheck2 = require("babel-runtime/helpers/classCallCheck");

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require("babel-runtime/helpers/createClass");

var _createClass3 = _interopRequireDefault(_createClass2);

var _possibleConstructorReturn2 = require("babel-runtime/helpers/possibleConstructorReturn");

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _inherits2 = require("babel-runtime/helpers/inherits");

var _inherits3 = _interopRequireDefault(_inherits2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

define('router',["require", "exports", "./event", "./element", "./utils/helpers"], function (require, exports, event_1, element_1, helpers_1) {
    "use strict";

    Object.defineProperty(exports, "__esModule", { value: true });

    var Router = function (_event_1$EventEmitter) {
        (0, _inherits3.default)(Router, _event_1$EventEmitter);

        function Router(options) {
            (0, _classCallCheck3.default)(this, Router);

            var _this = (0, _possibleConstructorReturn3.default)(this, (Router.__proto__ || Object.getPrototypeOf(Router)).call(this, options));

            _this.options = helpers_1.Helpers.extend({
                linkSelector: '[routeLink]',
                activeSelector: 'js-router-link_active',
                routes: {}
            }, _this.options);
            _this.routes = {};
            Object.keys(_this.options.routes).forEach(function (route) {
                return _this.route(route, _this.options.routes[route]);
            });
            window.addEventListener('popstate', function () {
                return _this.checkRoutes(window.history.state, true);
            });
            document.body.addEventListener('click', function (event) {
                if (new element_1.DomElement(event.target).closest(_this.options.linkSelector).length) {
                    _this.onLinkClick(event);
                }
            });
            return _this;
        }

        (0, _createClass3.default)(Router, [{
            key: "init",
            value: function init(url) {
                this.checkRoutes({
                    url: url
                }, false);
            }
        }, {
            key: "route",
            value: function route(routeUrl, callback) {
                var route, namedParams;
                if (helpers_1.Helpers.isFunction(callback)) {
                    route = {
                        callback: callback
                    };
                } else if (helpers_1.Helpers.isString(callback)) {
                    route = {
                        module: callback
                    };
                } else if (helpers_1.Helpers.isPlainObject(callback)) {
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
                    routeUrl = routeUrl.replace(/:\w+/g, '([^\/]+)').replace(/\*\w+/g, '(.*?)');
                    if (['default', 'error404', 'error500'].indexOf(routeUrl) === -1) {
                        routeUrl = '^' + routeUrl + '$';
                    }
                    this.routes[routeUrl] = route;
                }
            }
        }, {
            key: "checkRoutes",
            value: function checkRoutes(state, load, response) {
                var _this2 = this;

                var url = state && (state.url || state.hash) || window.location.pathname,
                    path = url.split('?')[0].replace(/\/{2,}/g, '/'),
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
                        route = _this2.routes[routeUrl],
                        paramValues,
                        params = {};
                    if (regex.test(path)) {
                        paramValues = regex.exec(path).slice(1);
                        route.params.forEach(function (paramName, index) {
                            return params[paramName] = paramValues[index];
                        });
                        if (load && (route.reload || _this2.currentRoute && _this2.currentRoute.reload)) {
                            location.reload();
                        } else {
                            _this2.proccessingRoute(route, params, query, load, response);
                        }
                        _this2.currentRoute = route;
                        isFound = true;
                    }
                });
                if (!isFound && this.routes.default) {
                    this.proccessingRoute(this.routes.default, {}, query, load, response);
                }
            }
        }, {
            key: "error404",
            value: function error404(load, response) {
                this.proccessingRoute(this.routes.error404, {}, {}, load, response);
            }
        }, {
            key: "proccessingRoute",
            value: function proccessingRoute(route, params, query, load, response) {
                var _this3 = this;

                if (helpers_1.Helpers.isFunction(route.callback)) {
                    route.callback(load, params);
                }
                if (helpers_1.Helpers.isString(route.module)) {
                    this.require(route.module, function (PageClass) {
                        var oldPage = _this3.currentPage;
                        if (load) {
                            if (oldPage && oldPage.isPending()) {
                                oldPage.abort();
                            }
                            _this3.currentPage = new PageClass({
                                isRunTimeCreated: true,
                                request: {
                                    url: location.pathname,
                                    params: params,
                                    query: query
                                }
                            });
                            _this3.trigger('route', {
                                page: _this3.currentPage,
                                route: route,
                                isLoad: load
                            });
                            if (_this3.currentPage.isNeedLoad()) {
                                if (!response) {
                                    _this3.currentPage.load();
                                } else {
                                    _this3.currentPage.setResponse(response);
                                    _this3.currentPage.onLoadSuccess();
                                }
                            } else {
                                _this3.currentPage.onLoadSuccess();
                            }
                            _this3.currentPage.on('render', function () {
                                if (oldPage) {
                                    oldPage.destroy();
                                }
                                setTimeout(function () {
                                    this.currentPage.initPage();
                                }.bind(this));
                                window.scrollTo(0, 0);
                            }.bind(_this3));
                        } else {
                            _this3.currentPage = PageClass.createRunTime({
                                isRunTimeCreated: false,
                                request: {
                                    params: params,
                                    query: query
                                }
                            }, document.querySelector('[data-routing-page="' + route.module + '"]'));
                            _this3.trigger('route', {
                                page: _this3.currentPage,
                                route: route,
                                isLoad: load
                            });
                            _this3.currentPage.initPage();
                        }
                    });
                }
            }
        }, {
            key: "go",
            value: function go(url) {
                window.history.pushState({
                    url: url
                }, null, url);
                this.checkRoutes({
                    url: url
                }, true);
            }
        }, {
            key: "update",
            value: function update() {
                var url = window.location.pathname + window.location.search;
                this.go(url);
            }
        }, {
            key: "onLinkClick",
            value: function onLinkClick(event) {
                var $target = new element_1.DomElement(event.target),
                    $links = $target.closest(this.options.linkSelector),
                    $link = void 0;
                if (!$links.length) {
                    $link = $target;
                } else {
                    $link = $links[0];
                }
                if (event.ctrlKey || event.shiftKey || event.metaKey) {
                    return true;
                }
                event.preventDefault();
                event.stopPropagation();
                event.cancelBubble = true;
                if (!$link.hasClass(this.options.activeSelector)) {
                    var href = $link.attr('href');
                    if (href) {
                        this.go(href.replace(/^http[s]?:\/\/[\w\d\._\-]+/, ''));
                    }
                }
                return false;
            }
        }], [{
            key: "init",
            value: function init(url) {
                if (!this.instance) {
                    this.instance = new this();
                }
                this.instance.checkRoutes({
                    url: url
                }, false);
            }
        }, {
            key: "on",
            value: function on(event, handler) {
                if (!this.instance) {
                    this.instance = new this();
                }
                return this.instance.on.apply(this.instance, arguments);
            }
        }, {
            key: "off",
            value: function off(event, handler) {
                if (!this.instance) {
                    this.instance = new this();
                }
                return this.instance.off.apply(this.instance, arguments);
            }
        }, {
            key: "setOptions",
            value: function setOptions(options) {
                if (!this.instance) {
                    this.instance = new this(options);
                }
                this.instance.options = helpers_1.Helpers.extend({}, this.instance.options, options);
            }
        }, {
            key: "route",
            value: function route(routes, options) {
                var _this4 = this;

                if (!this.instance) {
                    this.instance = new this(options);
                }
                Object.keys(routes).forEach(function (route) {
                    return _this4.instance.route(route, routes[route]);
                });
            }
        }, {
            key: "go",
            value: function go(url) {
                if (!this.instance) {
                    this.instance = new this();
                }
                this.instance.go(url);
            }
        }, {
            key: "checkRoutes",
            value: function checkRoutes(state, load, response) {
                if (!this.instance) {
                    this.instance = new this();
                }
                this.instance.checkRoutes(state, load, response);
            }
        }, {
            key: "error404",
            value: function error404(load, response) {
                if (!this.instance) {
                    this.instance = new this();
                }
                this.instance.error404(load, response);
            }
        }, {
            key: "update",
            value: function update() {
                if (!this.instance) {
                    this.instance = new this();
                }
                this.instance.update();
            }
        }, {
            key: "getCurrentPage",
            value: function getCurrentPage() {
                var page = null;
                if (this.instance) {
                    page = this.instance.currentPage;
                }
                return page;
            }
        }]);
        return Router;
    }(event_1.EventEmitter);

    Router.instance = null;
    exports.Router = Router;
});
//# sourceMappingURL=router.js.map;


var _classCallCheck2 = require("babel-runtime/helpers/classCallCheck");

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require("babel-runtime/helpers/createClass");

var _createClass3 = _interopRequireDefault(_createClass2);

var _possibleConstructorReturn2 = require("babel-runtime/helpers/possibleConstructorReturn");

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _inherits2 = require("babel-runtime/helpers/inherits");

var _inherits3 = _interopRequireDefault(_inherits2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

define('page',["require", "exports", "./view", "./utils/helpers", "./utils/http", "./router"], function (require, exports, view_1, helpers_1, http_1, router_1) {
    "use strict";

    Object.defineProperty(exports, "__esModule", { value: true });

    var Page = function (_view_1$View) {
        (0, _inherits3.default)(Page, _view_1$View);

        function Page(options) {
            (0, _classCallCheck3.default)(this, Page);

            var _this = (0, _possibleConstructorReturn3.default)(this, (Page.__proto__ || Object.getPrototypeOf(Page)).call(this, options));

            _this.isAbortedState = false;
            _this.pageOptions = {};
            _this.pageResponse = {};
            _this.options = helpers_1.Helpers.extend({
                isRunTimeCreated: false,
                isNeedLoad: true,
                loadDataType: 'json',
                pageOptionsSelector: '.b-page-config'
            }, options);
            return _this;
        }

        (0, _createClass3.default)(Page, [{
            key: "initPage",
            value: function initPage() {
                var $config = this.$el.find(this.options.pageOptionsSelector);
                if ($config.length) {
                    this.pageOptions = JSON.parse($config[0].html().replace(/\r|\n|\t|\s{2,}/g, ''));
                }
                this.trigger('pageLoad', {
                    page: this.getPageName()
                });
                return this;
            }
        }, {
            key: "load",
            value: function load() {
                var _this2 = this;

                var settings = this.getLoadSettings();
                this.xhr = http_1.Http.get(settings.url, {
                    params: this.getLoadParams()
                }).then(function (response) {
                    if (response.data.isRedirect) {
                        router_1.Router.go(response.data.location);
                    } else if (response.data.request && response.data.request.path !== window.location.pathname) {
                        router_1.Router.checkRoutes({
                            url: response.data.request.path
                        }, true, response.data);
                    } else {
                        _this2.onLoadSuccess(response.data);
                    }
                }).catch(function () {
                    return _this2.onLoadError();
                });
            }
        }, {
            key: "abort",
            value: function abort() {
                this.isAbortedState = true;
                this.xhr.abort();
                return this;
            }
        }, {
            key: "isPending",
            value: function isPending() {
                return false;
            }
        }, {
            key: "isAborted",
            value: function isAborted() {
                return this.isAbortedState;
            }
        }, {
            key: "isRunTimeCreated",
            value: function isRunTimeCreated() {
                return this.options.isRunTimeCreated;
            }
        }, {
            key: "isNeedLoad",
            value: function isNeedLoad() {
                return this.options.isNeedLoad;
            }
        }, {
            key: "setApp",
            value: function setApp(app) {
                this.app = app;
                return this;
            }
        }, {
            key: "setPageName",
            value: function setPageName(pageName) {
                this.pageName = pageName;
                return this;
            }
        }, {
            key: "getPageName",
            value: function getPageName() {
                return this.pageName || false;
            }
        }, {
            key: "getTitle",
            value: function getTitle() {
                return '';
            }
        }, {
            key: "getResponse",
            value: function getResponse() {
                return this.pageResponse;
            }
        }, {
            key: "setResponse",
            value: function setResponse(response) {
                this.pageResponse = helpers_1.Helpers.extend({}, true, this.pageResponse, response);
                return this;
            }
        }, {
            key: "onLoadSuccess",
            value: function onLoadSuccess(response) {
                this.setResponse(this.adapter(response));
                this.setPageTitle();
                this.render(this.getResponse());
            }
        }, {
            key: "getUrl",
            value: function getUrl() {
                return this.url || this.options.request.url;
            }
        }, {
            key: "adapter",
            value: function adapter(response) {
                return response;
            }
        }, {
            key: "getLoadParams",
            value: function getLoadParams() {
                return {};
            }
        }, {
            key: "getLoadSettings",
            value: function getLoadSettings() {
                return {
                    url: this.getUrl(),
                    dataType: this.options.loadDataType
                };
            }
        }, {
            key: "setPageTitle",
            value: function setPageTitle() {
                document.title = this.getTitle();
            }
        }, {
            key: "onLoadError",
            value: function onLoadError() {
                this.trigger('error');
            }
        }]);
        return Page;
    }(view_1.View);

    exports.Page = Page;
});
//# sourceMappingURL=page.js.map;


define('nervejs',["require", "exports", "./utils/helpers", "./utils/http", "./collection", "./element", "./event", "./model", "./page", "./router", "./view"], function (require, exports, helpers_1, http_1, collection_1, element_1, event_1, model_1, page_1, router_1, view_1) {
    "use strict";

    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Helpers = helpers_1.Helpers;
    exports.Http = http_1.Http;
    exports.Collection = collection_1.Collection;
    exports.DomElement = element_1.DomElement;
    exports.EventEmitter = event_1.EventEmitter;
    exports.Model = model_1.Model;
    exports.Page = page_1.Page;
    exports.Router = router_1.Router;
    exports.View = view_1.View;
});
//# sourceMappingURL=nervejs.js.map;
