/**
 * This file is part of agora-gui-admin.
 * Copyright (C) 2015-2016  Agora Voting SL <agora@agoravoting.com>

 * agora-gui-admin is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License.

 * agora-gui-admin  is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.

 * You should have received a copy of the GNU Affero General Public License
 * along with agora-gui-admin.  If not, see <http://www.gnu.org/licenses/>.
**/

angular.module('avAdmin')
  .directive(
    'avAdminDashboard', 
    function(
       $state, 
       Authmethod, 
       Plugins, 
       ElectionsApi, 
       $stateParams, 
       $modal, 
       PercentVotesService, 
       ConfigService,
       SendMsg)
    {
    // we use it as something similar to a controller here
    function link(scope, element, attrs) {
      var id = $stateParams.id;

      if (!id) {
        $state.go("admin.basic");
      }
      scope.publicURL = ConfigService.publicURL;

      var statuses = [
        'registered',
        'created',
        'started',
        'stopped',
        'tally_ok',
        'results_ok',
        'results_pub'
      ];

      var nextactions = [
        'avAdmin.dashboard.create',
        'avAdmin.dashboard.start',
        'avAdmin.dashboard.stop',
        'avAdmin.dashboard.tally',
        'avAdmin.dashboard.calculate',
        'avAdmin.dashboard.publish'
      ];

      scope.calculateResultsJson = [
        [
          "agora_results.pipes.results.do_tallies",
          {"ignore_invalid_votes": true}
        ],
        [
          "agora_results.pipes.sort.sort_non_iterative",
          {
            "question_indexes": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]
          }
        ]
      ];


      var commands = [
        {path: 'register', method: 'GET'},
        {
          path: 'create',
          method: 'POST',
          confirmController: "ConfirmCreateModal",
          confirmTemplateUrl: "avAdmin/admin-directives/dashboard/confirm-create-modal.html"
        },
        {
          path: 'start',
          method: 'POST',
          confirmController: "ConfirmStartModal",
          confirmTemplateUrl: "avAdmin/admin-directives/dashboard/confirm-start-modal.html"
        },
        {
          path: 'stop',
          method: 'POST',
          confirmController: "ConfirmStopModal",
          confirmTemplateUrl: "avAdmin/admin-directives/dashboard/confirm-stop-modal.html"
        },
        {
          path: 'tally',
          method: 'POST',
          confirmController: "ConfirmTallyModal",
          confirmTemplateUrl: "avAdmin/admin-directives/dashboard/confirm-tally-modal.html",
          doAction: function (mode)
          {
            // tally command
            var command = commands[4];

            if (mode === 'all') {
              ElectionsApi.command(
                scope.election,
                command.path,
                command.method,
                command.data
              ).catch(
                function(error)
                {
                  scope.loading = false;
                  scope.error = error;
                }
              );
            // tally only active users
            } else {
              $modal.open({
                templateUrl: "avAdmin/admin-directives/dashboard/confirm-tally-active-modal.html",
                controller: 'ConfirmTallyActiveModal',
                size: 'lg',
                resolve: {
                  election: function () { return scope.election; },
                }
              }).result.then(function (voterids) {
                 ElectionsApi.command(
                  scope.election,
                  'tally-voter-ids',
                  'POST',
                  voterids
                ).catch(
                  function(error)
                  {
                    scope.loading = false;
                    scope.error = error;
                  }
                );
              });
            }
          }
        },
        {
          path: 'calculate-results',
          method: 'POST',
          confirmController: "ConfirmCalculateResultsModal",
          payload: angular.toJson(scope.calculateResultsJson, true),
          confirmTemplateUrl: "avAdmin/admin-directives/dashboard/confirm-calculate-results-modal.html",
          doAction: function (data)
          {
            // calculate results command
            var command = commands[5];
            command.payload = data;
            scope.calculateResultsJson = angular.fromJson(data);
            var ignorecache = true;
            ElectionsApi.getElection(id, ignorecache)
              .then(function(el) {
                 if ('tally_ok' === el.status || 'results_ok' === el.status) {
                   calculateResults(el);
                 }
              });
          }
        },
        {
          path: 'publish-results',
          method: 'POST',
          confirmController: "ConfirmPublishResultsModal",
          confirmTemplateUrl: "avAdmin/admin-directives/dashboard/confirm-publish-results-modal.html"
        }
      ];

      scope.actions = [
        {
          i18nString: 'changeSocial',
          iconClass: 'fa fa-comment-o',
          actionFunc: function() { return scope.changeSocial(); },
          enableFunc: function() { return ConfigService.share_social.allow_edit; }
        },
        {
          i18nString: 'sendAuthCodes',
          iconClass: 'fa fa-paper-plane-o',
          actionFunc: function() { return scope.sendAuthCodes(); },
          enableFunc: function() { return 'started' === scope.election.status; }
        }
      ];

      scope.statuses = statuses;
      scope.election = {};
      scope.index = 0;
      scope.nextaction = 0;
      scope.loading = true;
      scope.waiting = false;
      scope.error = null;
      scope.msg = null;
      scope.prevStatus = null;
      scope.percentVotes = PercentVotesService;

      ElectionsApi.getElection(id)
        .then(function(el) {
          scope.loading = false;
          scope.election = el;
          scope.intally = el.status === 'doing_tally';
          if (scope.intally) {
            scope.index = statuses.indexOf('stopped') + 1;
            scope.nextaction = false;
          } else {
            scope.index = statuses.indexOf(el.status) + 1;
            scope.nextaction = nextactions[scope.index - 1];
          }

          if (el.status === 'results_ok') {
            ElectionsApi.results(el);
          }

          ElectionsApi.autoreloadStats(el);
        });

      function reload() {
        scope.loading = true;
        scope.prevStatus = scope.election.status;
        scope.waiting = true;
        setTimeout(waitElectionChange, 1000);
      }

      function waitElectionChange() {
        var ignorecache = true;
        ElectionsApi.getElection(id, ignorecache)
          .then(function(el) {
            if (el.status === scope.prevStatus && scope.waiting) {
              setTimeout(waitElectionChange, 1000);
            } else {
              scope.waiting = false;
              scope.loading = false;
              scope.prevStatus = null;
              scope.election = el;

              scope.intally = el.status === 'doing_tally';
              if (scope.intally) {
                scope.index = statuses.indexOf('stopped') + 1;
                scope.nextaction = false;
                scope.prevStatus = scope.election.status;
                scope.waiting = true;
                waitElectionChange();
              } else {
                scope.index = statuses.indexOf(el.status) + 1;
                scope.nextaction = nextactions[scope.index - 1];

                if (el.status === 'results_ok') {
                  ElectionsApi.results(el);
                }
              }
            }
          });
      }

      function doActionConfirm(index) {
        if (scope.intally) {
          return;
        }
        var command = commands[index];
        if (!angular.isDefined(command.confirmController)) {
          doAction(index);
          return;
        }
        var payload = {};
        if(angular.isDefined(command.payload)) {
          payload = command.payload;
        }

        $modal.open({
          templateUrl: command.confirmTemplateUrl,
          controller: command.confirmController,
          size: 'lg',
          resolve: {
            payload: function () { return payload; }
          }
        }).result.then(function (data) {
          doAction(index, data);
        });
      }

      function doAction(index, data) {
        if (scope.intally) {
          return;
        }
        scope.loading = true;
        scope.prevStatus = scope.election.status;
        scope.waiting = true;
        setTimeout(waitElectionChange, 1000);

        var c = commands[index];

        if (angular.isDefined(c.doAction)) {
          c.doAction(data);
          return;
        }

        ElectionsApi.command(scope.election, c.path, c.method, c.data)
          .catch(function(error) { scope.loading = false; scope.error = error; });

        if (c.path === 'start') {
          Authmethod.changeAuthEvent(scope.election.id, 'started')
            .error(function(error) { scope.loading = false; scope.error = error; });
        }

        if (c.path === 'stop') {
          Authmethod.changeAuthEvent(scope.election.id, 'stopped')
            .error(function(error) { scope.loading = false; scope.error = error; });
        }
      }

      function calculateResults(el) {
          if ('tally_ok' !== el.status && 'results_ok' !== el.status) {
            return;
          }

          scope.loading = true;
          scope.prevStatus = 'tally_ok';
          scope.waiting = true;
          setTimeout(waitElectionChange, 1000);

          var path = 'calculate-results';
          var method = 'POST';
          ElectionsApi.command(el, path, method, scope.calculateResultsJson)
            .catch(function(error) { scope.loading = false; scope.error = error; });
      }

      function sendAuthCodes() {
        SendMsg.setElection(scope.election);
        SendMsg.scope = scope;
        SendMsg.user_ids = null;
        SendMsg.sendAuthCodesModal();

        return false;
      }

      function duplicateElection() {
        var el = ElectionsApi.templateEl();
        _.extend(el, angular.copy(scope.election));
        if (el.census.extra_fields && el.census.extra_fields.length > 0) {
           for (var i = 0; i < el.census.extra_fields.length; i++) {
             var field = el.census.extra_fields[i];
             if(field.slug) {
               delete field['slug'];
             }
           }
        }
        el.id = null;
        el.raw = null;
        scope.current = el;
        ElectionsApi.setCurrent(el);
        ElectionsApi.newElection = true;
        $state.go("admin.basic");
      }

      function createRealElection() {
        var el = ElectionsApi.templateEl();
        _.extend(el, angular.copy(scope.election));
        if (el.census.extra_fields && el.census.extra_fields.length > 0) {
           for (var i = 0; i < el.census.extra_fields.length; i++) {
             var field = el.census.extra_fields[i];
             if(field.slug) {
               delete field['slug'];
             }
           }
        }
        scope.current = el;
        el.id = null;
        el.real = true;
        ElectionsApi.setCurrent(el);
        ElectionsApi.newElection = true;
        $state.go("admin.create", {"autocreate": true});
      }

      function changeSocial() {
        if(ConfigService.share_social.allow_edit) {
          $modal.open({
            templateUrl: "avAdmin/admin-directives/social-networks/change-social-modal.html",
            controller: "ChangeSocialModal",
            windowClass: "change-social-window",
            size: 'lg',
            resolve: {
              election: function () { return scope.election; },
            }
          }).result.then(function(whateverReturned) {
          });
        }
      }

      angular.extend(scope, {
        doAction: doAction,
        doActionConfirm: doActionConfirm,
        sendAuthCodes: sendAuthCodes,
        duplicateElection: duplicateElection,
        createRealElection: createRealElection,
        changeSocial: changeSocial
      });
    }

    return {
      restrict: 'AE',
      scope: {
      },
      link: link,
      templateUrl: 'avAdmin/admin-directives/dashboard/dashboard.html'
    };
  });
