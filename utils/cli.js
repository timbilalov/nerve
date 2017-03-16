'use strict';

var programm = require('commander'),
    path = require('path'),
    fs = require('fs'),
    create = require('./cli/create/index'),
    run = require('./cli/run/index');

class NerveCli {

    constructor(options) {
        let pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json')).toString()),
            argv = process.argv.slice();

        this.options = options || {};

        programm.version(pkg.version);

        programm
            .option('-f, --frontend')
            .option('-h, --help');

        programm
            .command('create [entity] [name]')
            .action((entity, name) => {
                if (entity) {
                    create.command(entity, name);
                } else {
                    create.help();
                }
            })
            .on('--help', () => {
                create.help();
            });

        programm
            .command('run')
            .option('--reload-port <n>', 'port of web-socket server for automatic reloading')
            .option('--css <s>', 'path to css dir')
            .option('--js <s>', 'path to js dir')
            .action((options) => {
                run.command({
                    reloadPort: options.reloadPort || this.options.reloadPort,
                    watchCssPath: options.css || this.options.cssDir,
                    watchJsPath: options.js || this.options.jsDir
                });
            })
            .on('--help', function () {
                run.help();
            });

        argv[1] = 'nervejs-front';
        programm.parse(argv);

        if (process.argv.slice(2).length === 1) {
            programm.outputHelp();
        }
    }

    createApp() {
        create.command('app');
    }

    help() {
        console.log('\n\nNERVEJS FRONTEND\n\n');
        programm.outputHelp();
    }

}

module.exports = NerveCli;