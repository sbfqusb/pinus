"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const async = require("async");
const log = require("./log");
const utils = require("./utils");
const path = require("path");
const fs = require("fs");
const Constants = require("./constants");
const starter = require("../master/starter");
const pinus_logger_1 = require("pinus-logger");
const pinus_1 = require("../pinus");
var logger = pinus_logger_1.getLogger('pinus', __filename);
/**
 * Initialize application configuration.
 */
function defaultConfiguration(app) {
    var args = parseArgs(process.argv);
    setupEnv(app, args);
    loadMaster(app);
    loadServers(app);
    processArgs(app, args);
    configLogger(app);
    loadLifecycle(app);
}
exports.defaultConfiguration = defaultConfiguration;
;
/**
 * Start servers by type.
 */
function startByType(app, cb) {
    if (!!app.startId) {
        if (app.startId === Constants.RESERVED.MASTER) {
            utils.invokeCallback(cb);
        }
        else {
            starter.runServers(app);
        }
    }
    else {
        if (!!app.type && app.type !== Constants.RESERVED.ALL && app.type !== Constants.RESERVED.MASTER) {
            starter.runServers(app);
        }
        else {
            utils.invokeCallback(cb);
        }
    }
}
exports.startByType = startByType;
;
/**
 * Load default components for application.
 */
function loadDefaultComponents(app) {
    // load system default components
    if (app.serverType === Constants.RESERVED.MASTER) {
        app.load(pinus_1.pinus.components.master, app.get('masterConfig'));
    }
    else {
        app.load(pinus_1.pinus.components.proxy, app.get('proxyConfig'));
        if (app.getCurServer().port) {
            app.load(pinus_1.pinus.components.remote, app.get('remoteConfig'));
        }
        if (app.isFrontend()) {
            app.load(pinus_1.pinus.components.connection, app.get('connectionConfig'));
            app.load(pinus_1.pinus.components.connector, app.get('connectorConfig'));
            app.load(pinus_1.pinus.components.session, app.get('sessionConfig'));
            // compatible for schedulerConfig
            if (app.get('schedulerConfig')) {
                app.load(pinus_1.pinus.components.pushScheduler, app.get('schedulerConfig'));
            }
            else {
                app.load(pinus_1.pinus.components.pushScheduler, app.get('pushSchedulerConfig'));
            }
        }
        app.load(pinus_1.pinus.components.backendSession, app.get('backendSessionConfig'));
        app.load(pinus_1.pinus.components.channel, app.get('channelConfig'));
        app.load(pinus_1.pinus.components.server, app.get('serverConfig'));
    }
    app.load(pinus_1.pinus.components.monitor, app.get('monitorConfig'));
}
exports.loadDefaultComponents = loadDefaultComponents;
;
/**
 * Stop components.
 *
 * @param  {Array}  comps component list
 * @param  {Number}   index current component index
 * @param  {Boolean}  force whether stop component immediately
 * @param  {Function} cb
 */
function stopComps(comps, index, force, cb) {
    if (index >= comps.length) {
        utils.invokeCallback(cb);
        return;
    }
    var comp = comps[index];
    if (typeof comp.stop === 'function') {
        comp.stop(force, function () {
            // ignore any error
            stopComps(comps, index + 1, force, cb);
        });
    }
    else {
        stopComps(comps, index + 1, force, cb);
    }
}
exports.stopComps = stopComps;
;
/**
 * Apply command to loaded components.
 * This method would invoke the component {method} in series.
 * Any component {method} return err, it would return err directly.
 *
 * @param {Array} comps loaded component list
 * @param {String} method component lifecycle method name, such as: start, stop
 * @param {Function} cb
 */
function optComponents(comps, method, cb) {
    var i = 0;
    async.forEachSeries(comps, function (comp, done) {
        i++;
        if (typeof comp[method] === 'function') {
            comp[method](done);
        }
        else {
            done();
        }
    }, function (err) {
        if (err) {
            if (typeof err === 'string') {
                logger.error('fail to operate component, method: %s, err: %j', method, err);
            }
            else {
                logger.error('fail to operate component, method: %s, err: %j', method, err.stack);
            }
        }
        utils.invokeCallback(cb, err);
    });
}
exports.optComponents = optComponents;
;
/**
 * Load server info from config/servers.json.
 */
var loadServers = function (app) {
    app.loadConfigBaseApp(Constants.RESERVED.SERVERS, Constants.FILEPATH.SERVER);
    var servers = app.get(Constants.RESERVED.SERVERS);
    var serverMap = {}, slist, i, l, server;
    for (var serverType in servers) {
        slist = servers[serverType];
        for (i = 0, l = slist.length; i < l; i++) {
            server = slist[i];
            server.serverType = serverType;
            if (server[Constants.RESERVED.CLUSTER_COUNT]) {
                utils.loadCluster(app, server, serverMap);
                continue;
            }
            serverMap[server.id] = server;
            if (server.wsPort) {
                logger.warn('wsPort is deprecated, use clientPort in frontend server instead, server: %j', server);
            }
        }
    }
    app.set(Constants.KEYWORDS.SERVER_MAP, serverMap);
};
/**
 * Load master info from config/master.json.
 */
var loadMaster = function (app) {
    app.loadConfigBaseApp(Constants.RESERVED.MASTER, Constants.FILEPATH.MASTER);
    app.master = app.get(Constants.RESERVED.MASTER);
};
/**
 * Process server start command
 */
var processArgs = function (app, args) {
    var serverType = args.serverType || Constants.RESERVED.MASTER;
    var serverId = args.id || app.getMaster().id;
    var mode = args.mode || Constants.RESERVED.CLUSTER;
    var masterha = args.masterha || 'false';
    var type = args.type || Constants.RESERVED.ALL;
    var startId = args.startId;
    app.set(Constants.RESERVED.MAIN, args.main, true);
    app.set(Constants.RESERVED.SERVER_TYPE, serverType, true);
    app.set(Constants.RESERVED.SERVER_ID, serverId, true);
    app.set(Constants.RESERVED.MODE, mode, true);
    app.set(Constants.RESERVED.TYPE, type, true);
    if (!!startId) {
        app.set(Constants.RESERVED.STARTID, startId);
    }
    if (masterha === 'true') {
        app.master = args;
        app.set(Constants.RESERVED.CURRENT_SERVER, args, true);
    }
    else if (serverType !== Constants.RESERVED.MASTER) {
        app.set(Constants.RESERVED.CURRENT_SERVER, args, true);
    }
    else {
        app.set(Constants.RESERVED.CURRENT_SERVER, app.getMaster(), true);
    }
};
/**
 * Setup enviroment.
 */
var setupEnv = function (app, args) {
    app.set(Constants.RESERVED.ENV, args.env || process.env.NODE_ENV || Constants.RESERVED.ENV_DEV, true);
};
/**
 * Configure custom logger.
 */
var configLogger = function (app) {
    if (process.env.POMELO_LOGGER !== 'off') {
        var env = app.get(Constants.RESERVED.ENV);
        var originPath = path.join(app.getBase(), Constants.FILEPATH.LOG);
        var presentPath = path.join(app.getBase(), Constants.FILEPATH.CONFIG_DIR, env, path.basename(Constants.FILEPATH.LOG));
        if (fs.existsSync(originPath)) {
            log.configure(app, originPath);
        }
        else if (fs.existsSync(presentPath)) {
            log.configure(app, presentPath);
        }
        else {
            logger.error('logger file path configuration is error.');
        }
    }
};
/**
 * Parse command line arguments.
 *
 * @param args command line arguments
 *
 * @return Object argsMap map of arguments
 */
var parseArgs = function (args) {
    var argsMap = {};
    var mainPos = 1;
    while (args[mainPos].indexOf('--') > 0) {
        mainPos++;
    }
    argsMap.main = args[mainPos];
    for (var i = (mainPos + 1); i < args.length; i++) {
        var arg = args[i];
        var sep = arg.indexOf('=');
        var key = arg.slice(0, sep);
        var value = arg.slice(sep + 1);
        if (!isNaN(Number(value)) && (value.indexOf('.') < 0)) {
            value = Number(value);
        }
        argsMap[key] = value;
    }
    return argsMap;
};
/**
 * Load lifecycle file.
 *
 */
var loadLifecycle = function (app) {
    var filePath = path.join(app.getBase(), Constants.FILEPATH.SERVER_DIR, app.serverType, Constants.FILEPATH.LIFECYCLE);
    if (!fs.existsSync(filePath)) {
        return;
    }
    var lifecycle = require(filePath);
    for (var key in lifecycle) {
        if (typeof lifecycle[key] === 'function') {
            app.lifecycleCbs[key] = lifecycle[key];
        }
        else {
            logger.warn('lifecycle.js in %s is error format.', filePath);
        }
    }
};
//# sourceMappingURL=appUtil.js.map