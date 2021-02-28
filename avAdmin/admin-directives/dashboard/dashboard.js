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
       $q,
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
    function link(scope, element, attrs) 
    {
      scope.reloadTimeout = null;

      function updateDoingTallyFlag(el) 
      {

        var tallyStatusList = el.children_tally_status;
        tallyStatusList.push({id: el.id, tally_status: el.tally_status});
        var hasPendingTally = _.find(
          tallyStatusList,
          function (electionStatus) {
            return (
              electionStatus.tally_status === 'pending' || 
              electionStatus.tally_status === 'started'
            );
          }
        );
        // try to find if any of the relevant elections has "pending" status. If
        // true, then it's certainly "in-tally". If not, we revert to reviewing
        // if the status = "doing_tally", and else we set intally to false
        scope.intally = (hasPendingTally || el.status === 'doing_tally');
        if (!scope.intally && !scope.nextaction) {
          scope.nextaction = true;
        }
      }

      function waitElectionChange() 
      {
        ElectionsApi
          .getElection(scope.id, /*ignorecache = */ true)
          .then(function(el) 
          {
            updateDoingTallyFlag(el);
            if (el.status === scope.prevStatus && scope.waiting) 
            {
              clearTimeout(scope.reloadTimeout);
              scope.reloadTimeout = setTimeout(waitElectionChange, 5000);
            } else {
              scope.waiting = false;
              scope.loading = false;
              scope.prevStatus = null;
              
              Plugins.hook(
                'election-modified', 
                {
                  old: scope.election,
                  el: el
                }
              );
              scope.election = el;

              if (scope.intally) 
              {
                scope.index = scope.statuses.indexOf('stopped') + 1;
                scope.nextaction = false;
                scope.prevStatus = scope.election.status;
                scope.waiting = true;
                waitElectionChange();
              } 
              else 
              {
                scope.index = scope.statuses.indexOf(el.status) + 1;
                scope.nextaction = scope.nextactions[scope.index - 1];

                if (
                  el.status === 'results_ok' || 
                  el.status === 'stopped'
                ) {
                  ElectionsApi.results(el);

                  if (!!ConfigService.always_publish) 
                  {
                    scope.loading = true;
                    scope.prevStatus = scope.election.status;
                    scope.waiting = true;

                    clearTimeout(scope.reloadTimeout);
                    scope.reloadTimeout = setTimeout(waitElectionChange, 5000);
                  }
                }
              }
            }
          });
      }


      function reload() 
      {
        scope.loading = true;
        scope.prevStatus = scope.election.status;
        scope.waiting = true;
        clearTimeout(scope.reloadTimeout);
        scope.reloadTimeout = setTimeout(waitElectionChange, 5000);
      }

      function doAction(index, data) 
      {
        scope.loading = true;
        scope.prevStatus = scope.election.status;
        scope.waiting = true;
        clearTimeout(scope.reloadTimeout);
        scope.reloadTimeout = setTimeout(waitElectionChange, 5000);

        var c = scope.commands[index];

        if (angular.isDefined(c.doAction)) 
        {
          c.doAction(data);
          return;
        }

        if (c.path === 'start') 
        {
          Authmethod
            .changeAuthEvent(scope.election.id, 'started')
            .then(
              function onSuccess() {}, 
              function onError(response) 
              {
                scope.loading = false;
                scope.error = response.data;
              }
            );
        } else if (c.path === 'stop') 
        {
          Authmethod
            .changeAuthEvent(scope.election.id, 'stopped')
            .then(
              function onSuccess() {}, 
              function onError(response) 
              {
                scope.loading = false;
                scope.error = response.data;
              }
            );
        } else 
        {
          ElectionsApi
            .command(scope.election, c.path, c.method, c.data)
            .catch(
              function(error) 
              {
                scope.loading = false; scope.error = error;
              }
            );
        }
      }

      function doActionConfirm(index) 
      {
        var command = scope.commands[index];

        // This hook allows plugins to interrupt this function. This interruption
        // usually happens because the plugin does some processing and decides to
        // show another previous dialog at this step, for example.
        var pluginData = {
          election: scope.election,
          command: command,
          deferred: false
        };

        if (!Plugins.hook(
          'dashboard-before-do-action',
          pluginData)
        ) {
          return;
        }

        function doActionConfirmBulk() 
        {
          if (!angular.isDefined(command.confirmController))
          {
            doAction(index);
            return;
          }

          var payload = {};
          if(angular.isDefined(command.payload)) 
          {
            payload = command.payload;
          }

          $modal
            .open({
              templateUrl: command.confirmTemplateUrl,
              controller: command.confirmController,
              size: 'lg',
              windowClass: command.windowClass || '',
              resolve: {
                payload: function () { return payload; }
              }
            })
            .result
            .then(
              function (data) {
                doAction(index, data);
              }
            );
        }

        if (!pluginData.deferred) 
        {
          doActionConfirmBulk();
        } else
        {
          pluginData
            .deferred
            .promise
            .then(
              function (futureData)
              {
                doActionConfirmBulk();
              }
            )
            .catch(function (failureData) {});
        }
      }

      function sendAuthCodes() 
      {
        SendMsg.setElection(scope.election);
        SendMsg.scope = scope;
        SendMsg.user_ids = null;
        SendMsg.sendAuthCodesModal();

        return false;
      }

      function duplicateElection() 
      {
        var el = ElectionsApi.templateEl();
        _.extend(el, angular.copy(scope.election));

        if (el.census.extra_fields && el.census.extra_fields.length > 0) 
        {
           for (var i = 0; i < el.census.extra_fields.length; i++) 
           {
             var field = el.census.extra_fields[i];
             if(field.slug) 
             {
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

      function changeSocial() 
      {
        if (ConfigService.share_social.allow_edit) 
        {
          $modal
            .open({
              templateUrl: "avAdmin/admin-directives/social-networks/change-social-modal.html",
              controller: "ChangeSocialModal",
              windowClass: "change-social-window",
              size: 'lg',
              resolve: {
                election: function () { return scope.election; },
              }
            })
            .result
            .then(function(whateverReturned) {});
        }
      }

      function archiveElection(mode) 
      {
        $modal
          .open({
            templateUrl: "avAdmin/admin-directives/dashboard/confirm-modal.html",
            controller: "ConfirmModal",
            size: 'lg',
            resolve: {
              dialogName: function () { return mode; },
              data: function () { return ""; },
            }
          })
          .result
          .then(
            function confirmed() 
            {
              var method = {
                'archive': Authmethod.archive,
                'unarchive': Authmethod.unarchive,
              };

              method[mode](scope.election.id)
                .then(
                  function onSuccess() 
                  {
                    scope.msg = "avAdmin.dashboard.modals." + mode + ".success";
                  }, 
                  function onError(response) { scope.error = response.data; }
                );  
            }
          );
      }
      
      function unpublishResults() 
      {
        $modal
          .open({
            templateUrl: "avAdmin/admin-directives/dashboard/confirm-modal.html",
            controller: "ConfirmModal",
            size: 'lg',
            resolve: {
              dialogName: function () { return "unpublishResults"; },
              data: function () { return ""; },
            }
          })
          .result
          .then(
            function confirmed() 
            {
              Authmethod.unpublishResults(scope.election.id)
                .then(
                  function onSuccess() 
                  {
                    scope.msg = "avAdmin.dashboard.modals.unpublishResults.success";
                    clearTimeout(scope.reloadTimeout);
                    scope.reloadTimeout = setTimeout(waitElectionChange, 5000);
                  }, 
                  function onError(response) { scope.error = response.data; }
                )
                .catch(
                  function onError(error) { scope.error = error; }
                );
            }
          );
      }

      function allowTally() 
      {
        $modal
          .open({
            templateUrl: "avAdmin/admin-directives/dashboard/confirm-modal.html",
            controller: "ConfirmModal",
            size: 'lg',
            resolve: {
              dialogName: function () { return "allowTally"; },
              data: function () { return ""; },
            }
          })
          .result
          .then(
            function confirmed() 
            {
              Authmethod.allowTally(scope.election.id)
                .then(
                  function onSuccess() 
                  {
                    scope.msg = "avAdmin.dashboard.modals.allowTally.success";
                    clearTimeout(scope.reloadTimeout);
                    scope.reloadTimeout = setTimeout(waitElectionChange, 5000);
                  }, 
                  function onError(response) { scope.error = response.data; }
                )
                .catch(
                  function onError(error) { scope.error = error; }
                );
            }
          );
      }

      function editChildrenParent(mode) 
      {
        $modal
          .open({
            templateUrl: "avAdmin/admin-directives/dashboard/confirm-modal.html",
            controller: "ConfirmModal",
            size: 'lg',
            resolve: {
              dialogName: function () { return 'editChildrenParent'; },
              data: function() 
              {
                return JSON.stringify({
                  parent_id: scope.election.parent_id,
                  children_election_info: scope.election.children_election_info
                });
              }
            }
          })
          .result
          .then(
            function confirmed(dataString) 
            {
              var dataJson = {};
              try 
              {
                dataJson = JSON.parse(dataString);
              } catch (e) 
              {
                scope.error = "Error parsing json";
                return;
              }

              Authmethod
                .editChildrenParent(dataJson, scope.election.id)
                .then(
                  function onSuccess() 
                  {
                    scope.msg = "avAdmin.dashboard.modals.editChildrenParent.success"; 
                  }, 
                  function onError(response) { scope.error = response.data; }
                );
            }
          );
      }

      function setAutoreload(electionId)
      {
        ElectionsApi.autoreloadStats(
          electionId,
          function callback(el)
          {
            if (scope.resultsElection && scope.resultsElection.id === el.id) 
            {
              scope.resultsElection = el;
            }
            
            if (scope.election.id === el.id)
            {
              scope.election = el;
            }
          }
        );
      }

      /**
       * Shows the election results of the given election. Called by the
       * children elections directive when a children election is clicked.
       * 
       * @param {number} electionId election whose results should be shown.
       */
      function showResults(electionId)
      {
        ElectionsApi
          .getElection(electionId)
          .then(
            function (election)
            {
              scope.resultsElection = election;
              setAutoreload(electionId);
            }
          );
      }

      // performs all the initialization
      function init()
      {
        scope.id = $stateParams.id;
        if (!scope.id) {
          $state.go("admin.basic");
        }

        scope.perms = {val: ""};
        ElectionsApi
          .getEditPerm(scope.id)
          .then(
            function (perm) {
              scope.perms.val = perm;
            }
          );
        scope.publicURL = ConfigService.publicURL;
        scope.launchedTally = false;
        
        scope.statuses = [
          'registered',
          'created',
          'started',
          'stopped',
          'tally_ok',
          'results_ok',
          'results_pub'
        ];

        scope.nextactions = [
          'avAdmin.dashboard.create',
          'avAdmin.dashboard.start',
          'avAdmin.dashboard.stop',
          'avAdmin.dashboard.tally',
          'avAdmin.dashboard.calculate',
          'avAdmin.dashboard.publish'
        ];

        scope.calculateResultsJson = "";

        scope.commands = [
          {
            path: 'register', 
            method: 'GET',
            enableFunc: function () {
              return (
                scope.perms.val.indexOf("register") !== -1 ||
                scope.perms.val.indexOf("edit") !== -1
              );
            }
          },
          {
            path: 'create',
            method: 'POST',
            confirmController: "ConfirmCreateModal",
            confirmTemplateUrl: "avAdmin/admin-directives/dashboard/confirm-create-modal.html",
            enableFunc: function () {
              return (
                scope.perms.val.indexOf("create") !== -1 ||
                scope.perms.val.indexOf("edit") !== -1
              );
            }
          },
          {
            path: 'start',
            method: 'POST',
            confirmController: "ConfirmStartModal",
            confirmTemplateUrl: "avAdmin/admin-directives/dashboard/confirm-start-modal.html",
            enableFunc: function () {
              return (
                scope.perms.val.indexOf("start") !== -1 ||
                scope.perms.val.indexOf("edit") !== -1
              );
            }
          },
          {
            path: 'stop',
            method: 'POST',
            confirmController: "ConfirmStopModal",
            confirmTemplateUrl: "avAdmin/admin-directives/dashboard/confirm-stop-modal.html",
            enableFunc: function () {
              return (
                scope.perms.val.indexOf("stop") !== -1 ||
                scope.perms.val.indexOf("edit") !== -1
              );
            }
          },
          {
            path: 'tally',
            method: 'POST',
            confirmController: "ConfirmTallyModal",
            confirmTemplateUrl: "avAdmin/admin-directives/dashboard/confirm-tally-modal.html",
            payload: scope.election,
            windowClass: 'confirm-tally-modal',
            doAction: function (data)
            {
              // tally command
              var command = scope.commands[4];
              scope.launchedTally = true;
              scope.intally = true;
              scope.index = scope.statuses.indexOf('stopped') + 1;
              scope.nextaction = false;

              if (data.mode === 'all') {
                ElectionsApi.command(
                  scope.election,
                  command.path,
                  command.method,
                  command.data
                ).catch(
                  function(error)
                  {
                    if (scope.launchedTally) {
                      scope.launchedTally = false;
                    }
                    scope.loading = false;
                    scope.error = error;
                  }
                );

              // tally only active users
              } else {
                Authmethod
                  .launchTally(
                    scope.election.id,
                    data.tallyElectionIds,
                    'force-all'
                  )
                  .then(
                    function onSuccess() 
                    {
                      scope.msg = "avAdmin.dashboard.modals.launchTallySuccess";
                    },
                    function(error)
                    {
                      if (scope.launchedTally) {
                        scope.launchedTally = false;
                      }
                      scope.loading = false;
                      scope.error = error;
                    }
                  );
              }
            },
            enableFunc: function () {
              return (
                scope.election.tallyAllowed &&
                (
                  scope.perms.val.indexOf("tally") !== -1 ||
                  scope.perms.val.indexOf("edit") !== -1
                )
              );
            }
          },
          {
            path: 'calculate-results',
            method: 'POST',
            confirmController: "ConfirmCalculateResultsModal",
            payload: scope.calculateResultsJson,
            confirmTemplateUrl: "avAdmin/admin-directives/dashboard/confirm-calculate-results-modal.html",
            doAction: function (data)
            {
              // calculate results command
              var command = scope.commands[5];
              command.payload = data;
              scope.calculateResultsJson = data;

              scope.loading = true;
              scope.prevStatus = 'tally_ok';
              scope.waiting = true;
              /* jshint ignore:start */

              clearTimeout(scope.reloadTimeout);
              scope.reloadTimeout = setTimeout(waitElectionChange, 5000);
              /* jshint ignore:end */

              Authmethod
                .changeAuthEvent(
                  scope.election.id,
                  'calculate-results',
                  data
                )
                .then(
                  function onSuccess()
                  {
                    ElectionsApi.results(scope.election);
                    scope.msg = "avAdmin.dashboard.modals.calculateResultsSuccess";
                  }, 
                  function onError(response) 
                  {
                    scope.loading = false;
                    scope.error = response.data;
                  }
                );
            },
            enableFunc: function () {
              return (
                scope.perms.val.indexOf("calculate-results") !== -1 ||
                scope.perms.val.indexOf("edit") !== -1
              );
            }
          },
          {
            path: 'publish-results',
            method: 'POST',
            confirmController: "ConfirmPublishResultsModal",
            confirmTemplateUrl: "avAdmin/admin-directives/dashboard/confirm-publish-results-modal.html",
            doAction: function ()
            {
              scope.loading = true;
              scope.prevStatus = scope.election.status;
              scope.waiting = true;
              /* jshint ignore:start */

              clearTimeout(scope.reloadTimeout);
              scope.reloadTimeout = setTimeout(waitElectionChange, 5000);
              /* jshint ignore:end */

              Authmethod
                .changeAuthEvent(
                  scope.election.id,
                  'publish-results'
                )
                .then(
                  function onSuccess() {}, 
                  function onError(response) 
                  {
                    scope.loading = false;
                    scope.error = response.data;
                  }
                );
            },
            enableFunc: function () {
              return (
                scope.perms.val.indexOf("publish-results") !== -1 ||
                scope.perms.val.indexOf("edit") !== -1
              );
            }
          }
        ];

        scope.actions = [
          {
            i18nString: 'changeSocial',
            iconClass: 'fa fa-comment-o',
            actionFunc: function() { return scope.changeSocial(); },
            enableFunc: function() { 
              return (
                ConfigService.share_social.allow_edit &&
                (
                  scope.perms.val.indexOf("update-share") !== -1 ||
                  scope.perms.val.indexOf("edit") !== -1
                )
              );
            }
          },
          {
            i18nString: 'startElection',
            iconClass: 'fa fa-play',
            actionFunc: function() { 
              return doActionConfirm(2); // start
            },
            enableFunc: function() { 
              return (
                [
                  'created',
                  'stopped',
                  'started'
                ].indexOf(scope.election.status) !== -1 &&
                (
                  scope.perms.val.indexOf("start") !== -1 ||
                  scope.perms.val.indexOf("edit") !== -1
                )
              );
            }
          },
          {
            i18nString: 'stopElection',
            iconClass: 'fa fa-stop',
            actionFunc: function() { 
              return doActionConfirm(3); // stop
            },
            enableFunc: function() { 
              return (
                [
                  'started',
                  'stopped',
                  'doing_tally',
                  'tally_ok',
                  'results_ok',
                  'results_pub'
                ].indexOf(scope.election.status) !== -1  &&
                (
                  scope.perms.val.indexOf("stop") !== -1 ||
                  scope.perms.val.indexOf("edit") !== -1
                )
              );
            }
          },
          {
            i18nString: 'allowTally',
            iconClass: 'fa fa-bars',
            actionFunc: function() { 
              return scope.allowTally();  // allow-tally
            },
            enableFunc: function() { 
              return (
                !scope.election.tallyAllowed  &&
                (
                  scope.perms.val.indexOf("allow-tally") !== -1 ||
                  scope.perms.val.indexOf("edit") !== -1
                )
              );
            }
          },
          {
            i18nString: 'tally',
            iconClass: 'fa fa-bars',
            actionFunc: function() { 
              return doActionConfirm(4); // tally
            },
            enableFunc: function() { 
              return (
                scope.election.tallyAllowed  &&
                (
                  scope.perms.val.indexOf("tally") !== -1 ||
                  scope.perms.val.indexOf("edit") !== -1
                )
              );
            }
          },
          {
            i18nString: 'calculateResults',
            iconClass: 'fa fa-calculator',
            actionFunc: function() { 
              return doActionConfirm(5); // calculate results
            },
            enableFunc: function() {
              return (
                  [
                  'stopped', 
                  'tally_ok', 
                  'results_ok',
                  'results_pub'
                ].indexOf(scope.election.status) !== -1  &&
                (
                  scope.perms.val.indexOf("calculate-results") !== -1 ||
                  scope.perms.val.indexOf("edit") !== -1
                )
              );
            }
          },
          {
            i18nString: 'publishResults',
            iconClass: 'fa fa-bar-chart',
            actionFunc: function() { 
              return doActionConfirm(6); // publish results
            },
            enableFunc: function() { 
              return (
                [
                  'stopped',
                  'tally_ok',
                  'results_ok',
                  'results_pub'
                ].indexOf(scope.election.status) !== -1  &&
                (
                  scope.perms.val.indexOf("publish-results") !== -1 ||
                  scope.perms.val.indexOf("edit") !== -1
                )
              );
            }
          },
          {
            i18nString: 'unpublishResults',
            iconClass: 'fa fa-compress',
            actionFunc: function() { return scope.unpublishResults(); },
            enableFunc: function() {
              return (
                [
                  'results_pub'
                ].indexOf(scope.election.status) !== -1  &&
                (
                  scope.perms.val.indexOf("publish-results") !== -1 ||
                  scope.perms.val.indexOf("edit") !== -1
                )
              );
            }
          },
          {
            i18nString: 'sendAuthCodes',
            iconClass: 'fa fa-paper-plane-o',
            actionFunc: function() { return scope.sendAuthCodes(); },
            enableFunc: function() {
              return (
                scope.perms.val.indexOf("send-auth-all") !== -1 ||
                scope.perms.val.indexOf("edit") !== -1
              );
            }
          },
          {
            i18nString: 'archiveElection',
            iconClass: 'fa fa-archive',
            actionFunc: function() { return scope.archiveElection("archive"); },
            enableFunc: function() {
              return  (
                scope.perms.val.indexOf("archive") !== -1 ||
                scope.perms.val.indexOf("edit") !== -1
              );
            }
          },
          {
            i18nString: 'unarchiveElection',
            iconClass: 'fa fa-folder-open-o',
            actionFunc: function() { return scope.archiveElection("unarchive"); },
            enableFunc: function() {
              return  (
                scope.perms.val.indexOf("unarchive") !== -1 ||
                scope.perms.val.indexOf("edit") !== -1
              );
            }
          },
          {
            i18nString: 'editChildrenParent',
            iconClass: 'fa fa-code-fork',
            actionFunc: function() { return scope.editChildrenParent(); },
            enableFunc: function() { 
              return (
                ['registered', 'created'].indexOf(scope.election.status) !== -1 && 
                scope.perms.val.indexOf("edit") !== -1
              );
            }
          },
        ];

        scope.statuses = scope.statuses;
        scope.election = {};
        scope.index = 0;
        scope.nextaction = 0;
        scope.loading = true;
        scope.waiting = false;
        scope.error = null;
        scope.msg = null;
        scope.prevStatus = null;
        scope.percentVotes = PercentVotesService;

        // get the election at the begining
        ElectionsApi
          .getElection(scope.id)
          .then(function(election) 
          {
            scope.loading = false;
            scope.election = election;
            scope.resultsElection = election;

            // do some initialization
            if (!!election.resultsConfig && election.resultsConfig.length > 0) 
            {
              scope.commands[5].payload = election.resultsConfig;
              scope.calculateResultsJson = election.resultsConfig;
            } else {
              scope.calculateResultsJson = angular.toJson(
                ConfigService.calculateResultsDefault, 
                true
              );
              scope.commands[5].payload = scope.calculateResultsJson;
            } 
            scope.commands[4].payload = angular.copy(scope.election);

            updateDoingTallyFlag(election);
            if (scope.intally) 
            {
              scope.index = scope.statuses.indexOf('stopped') + 1;
              scope.nextaction = false;
              scope.waiting = true;
              waitElectionChange();
            } else 
            {
              scope.index = scope.statuses.indexOf(election.status) + 1;
              scope.nextaction = scope.nextactions[scope.index - 1];
            }

            if (election.status === 'results_ok' || election.status === 'stopped')
            {
              ElectionsApi.results(election);
            }

            setAutoreload(election.id);
          });
      }

      angular.extend(scope, {
        doAction: doAction,
        doActionConfirm: doActionConfirm,
        sendAuthCodes: sendAuthCodes,
        duplicateElection: duplicateElection,
        changeSocial: changeSocial,
        archiveElection: archiveElection,
        unpublishResults: unpublishResults,
        allowTally: allowTally,
        editChildrenParent: editChildrenParent,
        showResults: showResults
      });

      // initialize
      init();
    }

    return {
      restrict: 'AE',
      scope: {},
      link: link,
      templateUrl: 'avAdmin/admin-directives/dashboard/dashboard.html'
    };
  });
