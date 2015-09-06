'use strict';


/**
 * our custom build to pack & upload to s3.
 *
 * grafana's team have these tasks in their gruntfile, but we decided to have our own as one day
 * the architecture of the projects will change.
 *
 *
 * todo: copy tar.gz to artifacts
 * todo: upload to s3
 * todo: write jenkins script
 * todo: write vagrant script
 *
 * @param grunt
 */

module.exports = function (grunt) {
    require('load-grunt-tasks')(grunt);


    var config = {
        shell: {
            build: {
                options: {
                    stderr: false,
                    execOptions: {
                        cwd: '..'
                    }
                },
                command: 'npm cache clean && npm install  && grunt build && cp package.json dist && cd dist && npm install --production && npm pack'
            }
        }
    };

    grunt.initConfig(config);
    grunt.registerTask('default',['shell:build']);




};