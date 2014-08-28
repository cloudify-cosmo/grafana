define([
  'angular',
  'jquery',
  'config',
  'lodash',
  'store'
],
function (angular, $, config, _, store) {
  "use strict";

  var module = angular.module('grafana.routes');

  module.config(function($routeProvider) {
    $routeProvider
      .when('/dashboard/cloudify/:dashboardId', {
        templateUrl: 'app/partials/dashboard.html',
        controller : 'DashFromCloudifyProvider',
        reloadOnSearch: false
      })
      .when('/dashboard/cloudify/:dashboardId/:subdashId', {
        templateUrl: 'app/partials/dashboard.html',
        controller : 'DashFromCloudifyProvider',
        reloadOnSearch: false
      });
  });

  module.controller('DashFromCloudifyProvider', function ($scope, $http, $routeParams, alertSrv) {
    var dashboardId = 'grafana-default';
    var subdashId = false;
    if ($routeParams.hasOwnProperty('dashboardId')) {
      dashboardId = 'grafana-' + $routeParams.dashboardId;
    }

    if ($routeParams.hasOwnProperty('subdashId')) {
      subdashId = $routeParams.subdashId;
    }

    var dashboardLoad = function () {
      if(!config.datasources.hasOwnProperty('cloudify')) {
        alertSrv.set('Error',"Could not load <i>Cloudify dashboards</i>. Please make sure Cloudify data-source exists" ,'error');
        return false;
      }
      $http({
        url: config.datasources.cloudify.url + '/dashboards/' + $routeParams.dashboardId,
        method: 'GET'
      }).then(function (result) {
        $scope.emitAppEvent('setup-dashboard', result.data);
      });
    };

    var findDashboardById = function(dashboards, id) {
      for(var i in dashboards) {
        var dashboard = dashboards[i];
        if(dashboard.hasOwnProperty('id') && dashboard.id === id) {
          return i;
        }
      }
      return 0;
    };

    var result = angular.fromJson(store.get(dashboardId)) || false;

    if (!result) {
      dashboardLoad();
    }
    else {
      var loadDashboardNum = 0;
      if(subdashId) {
        loadDashboardNum = findDashboardById(result, subdashId);
      }
      $scope.$evalAsync(function () {
        $scope.emitAppEvent('setup-dashboard', result[loadDashboardNum]);
      });
    }
  });

});