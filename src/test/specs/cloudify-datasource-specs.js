define([
    './helpers',
    'services/cloudify/cloudifyDatasource'
], function (helpers) {
    'use strict';

    describe('CloudifyDatasource', function () {
        var ctx = new helpers.ServiceTestContext();

        beforeEach(module('grafana.services'));
        beforeEach(ctx.createService('CloudifyDatasource'));

        describe('When trying to get list of series from cloudify backend', function () {
            var results;
            var urlExpected = '/series/list';
            var response = [{
                columns: ["time", "sequence_nr", "value"],
                name: 'test',
                points: [[10, 1, 1]]
            }];

            beforeEach(function () {
                var ds = new ctx.service({ urls: [''], grafanaDB: true });

                ctx.$httpBackend.expect('GET', urlExpected + '?time_precision=s').respond(response);
                ds._restQuery(urlExpected).then(function(data) { results = data; });
                ctx.$httpBackend.flush();
            });

            it('should generate the correct query', function() {
                ctx.$httpBackend.verifyNoOutstandingExpectation();
            });

            it('should return series list', function () {
                expect(results.length).to.be(1);
            });

        });

        describe('When querying influxdb with one raw query', function() {
            var results;
            var urlExpected = "/series?q=select+value+from+series"+
                "+where+time+%3E+now()+-+1h+and+time+%3E+1&time_precision=s";

            var query = {
                range: { from: 'now-1h', to: 'now' },
                targets: [{ query: "select value from series where time > 1", rawQuery: true }]
            };

            var response = [];

            beforeEach(function() {
                var ds = new ctx.service({ urls: [''] });

                ctx.$httpBackend.expect('GET', urlExpected).respond(response);
                ds.query(ctx.filterSrv, query).then(function(data) { results = data; });
                ctx.$httpBackend.flush();
            });

            it('should generate the correct query', function() {
                ctx.$httpBackend.verifyNoOutstandingExpectation();
            });

        });

    });

});