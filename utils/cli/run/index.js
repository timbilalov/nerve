const io = require('socket.io')(),
    http = require('http'),
    watcher = require('../watcher/watcher');

module.exports = {

    command: function (options) {
        let port = options.reloadPort || 4343,
            app = http.createServer().listen(port, () => console.log(`server listening at port ${port}`));

        io.on('connection', (client) => {
            console.log('client connected');
        });

        io.listen(app);

        watcher.watch({
            path: options.watchCssPath,
            callback: function (path) {
                let pathCss = path
                    .replace(options.watchCssPath, '')
                    .replace(/\.css$/, '');

                io.emit('changeCss', {
                    path: pathCss
                });
            }
        });

        watcher.watch({
            path: options.watchJsPath,
            callback: function (path) {
                let pathJs = path
                    .replace(options.watchJsPath, '')
                    .replace(/(^\/)|(\.js$)/g, '');

                io.emit('changeJs', {
                    path: pathJs
                });
            }
        });
    },

    help: function () {

    }

};