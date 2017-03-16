const chokidar = require('chokidar');

module.exports = {

    watch: function (options) {
        let watcher = chokidar.watch(options.path, {
            ignored: /^\./,
            persistent: true
        });

        watcher
            .on('add', function (path) {
                if (options.callback) {
                    options.callback(path);
                }
            })
            .on('change', function (path) {
                console.log('File', path, 'has been changed');
                if (options.callback) {
                    options.callback(path);
                }
            })
            .on('unlink', function (path) {
                console.log('File', path, 'has been removed');
                if (options.callback) {
                    options.callback(path);
                }
            })
            .on('error', function (error) {
                console.error('Error happened', error);
                if (options.callback) {
                    options.callback(path);
                }
            });
    }

};