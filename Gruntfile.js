module.exports = function (grunt) {
    'use strict';

    grunt.loadNpmTasks('grunt-contrib-requirejs');
    grunt.loadNpmTasks('grunt-jslint');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-uglify');

    grunt.initConfig({
        requirejs: {
            compile: {
                options: {
                    mainConfigFile: 'grunt/config/build.js',
                    baseUrl: 'src/',
                    name: 'main',
                    wrap: {
                        startFile: 'components/requirejs/require.js',
                        endFile: 'src/init.js'
                    },
                    paths: {
                        'nerve/utils': 'utils/'
                    },
                    optimize: 'none',
                    out: 'dist/nerve.js'
                }
            }
        },
        jslint: {
            main: {
                src: [
                    'src/**/*.js'
                ],
                directives: {
                    predef: [
                        'define',
                        'webConsole',
                        'requirejs'
                    ],
                    browser: true,
                    unparam: true,
                    nomen: true,
                    plusplus: true
                }
            }
        },
        watch: {
            js: {
                files: ['src/**/*.js'],
                tasks: ['requirejs'],
                options: {
                    spawn: false
                }
            }
        },
        uglify: {
            js: {
                files: [
                    {
                        src: 'dist/nerve.js',
                        dest: 'dist/nerve.min.js'
                    }
                ]
            }
        }
    });

    grunt.registerTask('default', [
        'jslint',
        'requirejs',
        'uglify'
    ]);
};