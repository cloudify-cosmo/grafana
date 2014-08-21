// Lint and build CSS
module.exports = function(grunt) {
  grunt.registerTask('css', ['less:src', 'concat:cssDark', 'concat:cssLight', 'concat:cssCloudify']);
  grunt.registerTask('default', ['jscs', 'jshint', 'css']);
  grunt.registerTask('test', ['default', 'karma:test']);
};
