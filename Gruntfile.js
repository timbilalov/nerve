module.exports = function (grunt) {
    'use strict';

    grunt.loadNpmTasks('grunt-contrib-requirejs');
    grunt.loadNpmTasks('grunt-jslint');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-concat');

    grunt.initConfig({
        requirejs: {
            options: {
                mainConfigFile: 'grunt/config/build.js',
                baseUrl: 'src/',
                name: 'main',
                wrap: {
                    startFile: 'components/requirejs/require.js',
                    endFile: 'src/init.js'
                },
                optimize: 'none'
            },

            prod: {
                options: {
                    out: 'dist/nerve.js',
                    paths: {
                        'nerve/utils': 'utils/',
                        'config': 'config/prod'
                    }
                }
            },

            dev: {
                options: {
                    out: 'dist/nerve.dev.js',
                    paths: {
                        'nerve/utils': 'utils/',
                        'config': 'config/dev'
                    }
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
        },

        concat: {
            js: {
                src: [
                    'dist/nerve.dev.js',
                    'src/dev/**/*.js'
                ],
                dest: 'dist/nerve.dev.js'
            }
        }
    });

    grunt.registerTask('default', [
        'jslint',
        'requirejs',
        'uglify'
    ]);

    grunt.registerTask('dev', [
        'jslint',
        'requirejs:dev',
        'concat',
        'uglify'
    ]);
};