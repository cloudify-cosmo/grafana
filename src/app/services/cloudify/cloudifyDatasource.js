define([
  'angular',
  'lodash',
  'kbn',
  'store',
  './cloudifySeries',
  './cloudifyQueryBuilder'
],
function (angular, _, kbn, store, CloudifySeries, CloudifyQueryBuilder) {
  'use strict';

  var module = angular.module('grafana.services');

  module.factory('CloudifyDatasource', function($q, $http, templateSrv, $routeParams) {

    var dashboardId = 'grafana-default';
    if($routeParams.hasOwnProperty('dashboardId')) {
      dashboardId = 'grafana-' + $routeParams.dashboardId;
    }

    function CloudifyDatasource(datasource) {
      this.type = 'Cloudify';
      this.editorSrc = 'app/partials/cloudify/editor.html';
      this.urls = datasource.urls;
      this.name = datasource.name;
      this.basicAuth = datasource.basicAuth;
      this.dashboardUrl = 'dashboard/cloudify/' + $routeParams.dashboardId;

      this.saveTemp = _.isUndefined(datasource.save_temp) ? true : datasource.save_temp;
      this.saveTempTTL = _.isUndefined(datasource.save_temp_ttl) ? '30d' : datasource.save_temp_ttl;

      this.grafanaDB = datasource.grafanaDB;
      this.supportAnnotations = true;
      this.supportMetrics = true;
      this.annotationEditorSrc = 'app/partials/cloudify/annotation_editor.html';
    }

    CloudifyDatasource.prototype.query = function(options) {
      var timeFilter = getTimeFilter(options);

      var promises = _.map(options.targets, function(target) {
        if (target.hide || !((target.series && target.column) || target.query)) {
          return [];
        }

        // build query
        var queryBuilder = new CloudifyQueryBuilder(target);
        var query = queryBuilder.build();

        // replace grafana variables
        query = query.replace('$timeFilter', timeFilter);
        query = query.replace('$interval', (target.interval || options.interval));

        // replace templated variables
        query = templateSrv.replace(query);

        var alias = target.alias ? templateSrv.replace(target.alias) : '';

        var handleResponse = _.partial(handleInfluxQueryResponse, alias, queryBuilder.groupByField);
        return this._seriesQuery(query).then(handleResponse);

      }, this);

      return $q.all(promises).then(function(results) {
        return { data: _.flatten(results) };
      });
    };

    CloudifyDatasource.prototype.annotationQuery = function(annotation, filterSrv, rangeUnparsed) {
      var timeFilter = getTimeFilter({ range: rangeUnparsed });
      var query = annotation.query.replace('$timeFilter', timeFilter);
      query = templateSrv.replace(query);

      return this._seriesQuery(query).then(function(results) {
        return new CloudifySeries({ seriesList: results, annotation: annotation }).getAnnotations();
      });
    };

    CloudifyDatasource.prototype.listColumns = function(seriesName) {
      var interpolated = templateSrv.replace(seriesName);
      if (interpolated[0] !== '/') {
        interpolated = '/' + interpolated + '/';
      }

      return this._seriesQuery('select * from ' + interpolated + ' limit 1').then(function(data) {
        if (!data) {
          return [];
        }
        return data[0].columns;
      });
    };

    CloudifyDatasource.prototype.listSeries = function() {
      return this._restQuery('/series/list').then(function(data) {
        if (!data || data.length === 0) {
          return [];
        }
        // influxdb >= 1.8
        if (data[0].points.length > 0) {
          return _.map(data[0].points, function(point) {
            return point[1];
          });
        }
        else { // influxdb <= 1.7
          return _.map(data, function(series) {
            return series.name; // influxdb < 1.7
          });
        }
      });
    };

    CloudifyDatasource.prototype.metricFindQuery = function (query) {
      var interpolated;
      try {
        interpolated = templateSrv.replace(query);
      }
      catch (err) {
        return $q.reject(err);
      }

      return this._seriesQuery(interpolated)
        .then(function (results) {
          return _.map(results[0].points, function (metric) {
            return {
              text: metric[1],
              expandable: false
            };
          });
        });
    };

    function retry(deferred, callback, delay) {
      return callback().then(undefined, function(reason) {
        if (reason.status !== 0 || reason.status >= 300) {
          reason.message = 'InfluxDB Error: <br/>' + reason.data;
          deferred.reject(reason);
        }
        else {
          setTimeout(function() {
            return retry(deferred, callback, Math.min(delay * 2, 30000));
          }, delay);
        }
      });
    }

    CloudifyDatasource.prototype._seriesQuery = function(query) {
      return this._influxRequest('GET', '/series', {
        q: query,
        time_precision: 's',
      });
    };

    CloudifyDatasource.prototype._restQuery = function(path) {
      return this._influxRequest('GET', path, {
        time_precision: 's',
      });
    };

    CloudifyDatasource.prototype._influxRequest = function(method, url, data) {
      var _this = this;
      var deferred = $q.defer();

      retry(deferred, function() {
        var currentUrl = _this.urls.shift();
        _this.urls.push(currentUrl);

        var params = {};

        if (method === 'GET') {
          _.extend(params, $routeParams, data);
          data = null;
        }

        var options = {
          method: method,
          url:    currentUrl + url,
          params: params,
          data:   data,
          inspect: { type: 'influxdb' },
        };

        options.headers = options.headers || {};
        if (_this.basicAuth) {
          options.headers.Authorization = 'Basic ' + _this.basicAuth;
        }

        return $http(options).success(function (data) {
          deferred.resolve(data);
        });
      }, 10);

      return deferred.promise;
    };

    CloudifyDatasource.prototype.saveDashboard = function(dashboard) {
      var deferred = $q.defer();
      var title = dashboard.title;
      var temp = dashboard.temp;
      if (temp) { delete dashboard.temp; }
      var dashboards = angular.fromJson(store.get(dashboardId)) || [];

      function getUniqueId() {
        var sGuid="";
        for (var i=0; i<32; i++) {
          sGuid+=Math.floor(Math.random()*0xF).toString(0xF);
        }
        return sGuid;
      }

      try {
        dashboard.id = getUniqueId();
        dashboards.push(dashboard);
        store.set(dashboardId, angular.toJson(dashboards));
        deferred.resolve({ title: title, url: '/' + this.dashboardUrl + '/' + dashboard.id });
        return deferred.promise;
      } catch(err) {
        throw 'Failed to save dashboard to LocalStorage: ' + err;
      }
    };

    CloudifyDatasource.prototype.getDashboard = function(id, isTemp) {
      var queryString = 'select dashboard from "grafana.dashboard_' + btoa(id) + '"';

      if (isTemp) {
        queryString = 'select dashboard from "grafana.temp_dashboard_' + btoa(id) + '"';
      }

      return this._seriesQuery(queryString).then(function(results) {
        if (!results || !results.length) {
          throw "Dashboard not found";
        }

        var dashCol = _.indexOf(results[0].columns, 'dashboard');
        var dashJson = results[0].points[0][dashCol];

        return angular.fromJson(dashJson);
      }, function(err) {
        return "Could not load dashboard, " + err.data;
      });
    };

    CloudifyDatasource.prototype.deleteDashboard = function(id) {
      var deferred = $q.defer();
      var dashboards = angular.fromJson(store.get(dashboardId)) || [];
      var title = id;

      for(var i in dashboards) {
        var dashboard = dashboards[i];
        if(dashboard.id === id) {
          title = dashboard.title;
          dashboards.splice(i, 1);
        }
      }

      try {
        store.set(dashboardId, angular.toJson(dashboards));
        deferred.resolve(title);
        return deferred.promise;
      } catch(err) {
        throw 'Could not delete dashboard, ' + err;
      }
    };

    CloudifyDatasource.prototype.searchDashboards = function(queryString) {
      function searchDashboardsByField(dashboards, field, string) {
        var returnDashboards = [];
        for(var i in dashboards) {
          var dashboard = dashboards[i];
          if(dashboard.hasOwnProperty(field)) {
            if(dashboard[field].toLowerCase().search(string.toLowerCase().trim()) !== -1) {
              returnDashboards.push(dashboard);
            }
          }
        }
        return returnDashboards;
      }

      function searchDashboardsByTags(dashboards, tags) {
        var results = [];
        function isTagsExist(tagsArr, tagsList) {
          var tagCount = 0;
          for(var i in tagsList) {
            var tag = tagsList[i];
            if(tagsArr.indexOf(tag) !== -1) {
              tagCount++;
            }
          }
          return tagCount === tagsList.length;
        }

        for(var i in dashboards) {
          var dashboard = dashboards[i];
          if(dashboard.hasOwnProperty('tags')) {
            if(isTagsExist(dashboard.tags, tags)) {
              results.push(dashboard);
            }
          }
        }
        return results;
      }

      function searchTags(dashboards, field, string) {
        var countTags = {};
        var result = [];
        for(var i in dashboards) {
          var dashboard = dashboards[i];
          if(dashboard.hasOwnProperty(field)) {
            for(var t in dashboard[field]) {
              var tag = dashboard[field][t];
              if(tag.toLowerCase().search(string.toLowerCase().trim()) !== -1) {
                if(!tag.hasOwnProperty(tag)) {
                  countTags[tag] = 1;
                } else {
                  countTags[tag]++;
                }
              }
            }
            for(var tagName in countTags) {
              result.push({
                term: tagName,
                count: countTags[tagName]
              });
            }
          }
        }
        return result;
      }

      function searchByTitleAndTags(dashboards, tags, titleString) {
        var tagDashboards = searchDashboardsByTags(dashboards, tags);
        return searchDashboardsByField(tagDashboards, 'title', titleString);
      }

      var hits = { dashboards: [], tags: [], tagsOnly: false };
      var deferred = $q.defer();
      hits.dashboards = angular.fromJson(store.get(dashboardId)) || [];

      if(queryString.indexOf('title:') === 0) {
        hits.dashboards = searchDashboardsByField(hits.dashboards, 'title', queryString.substring(6, queryString.length));
      }
      else if(queryString.indexOf('tags!:') === 0) {
        hits.tags = searchTags(hits.dashboards, 'tags', queryString.substring(6, queryString.length));
        hits.tagsOnly = true;
      }
      else if(queryString.indexOf('tags:') === 0) {
        var tagQuery = false;
        var titleQuery = false;
        var splitQuery = queryString.split('AND');
        for(var sq in splitQuery) {
          var query = splitQuery[sq].trim();
          if(query.indexOf('tags:') === 0) {
            tagQuery = query.substring(5, query.length).trim().split(',');
          }
          else if(query.indexOf('title:') === 0) {
            titleQuery = query.substring(6, query.length).trim();
          }
        }
        hits.dashboards = searchByTitleAndTags(hits.dashboards, tagQuery, titleQuery);
      }

      deferred.resolve(hits);
      return deferred.promise;
    };

    function handleInfluxQueryResponse(alias, groupByField, seriesList) {
      var cloudifySeries = new CloudifySeries({
        seriesList: seriesList,
        alias: alias,
        groupByField: groupByField
      });

      return cloudifySeries.getTimeSeries();
    }

    function getTimeFilter(options) {
      var from = getInfluxTime(options.range.from);
      var until = getInfluxTime(options.range.to);

      if (until === 'now()') {
        return 'time > now() - ' + from;
      }

      return 'time > ' + from + ' and time < ' + until;
    }

    function getInfluxTime(date) {
      if (_.isString(date)) {
        if (date === 'now') {
          return 'now()';
        }
        else if (date.indexOf('now') >= 0) {
          return date.substring(4);
        }

        date = kbn.parseDate(date);
      }

      return to_utc_epoch_seconds(date);
    }

    function to_utc_epoch_seconds(date) {
      return (date.getTime() / 1000).toFixed(0) + 's';
    }

    return CloudifyDatasource;

  });

});