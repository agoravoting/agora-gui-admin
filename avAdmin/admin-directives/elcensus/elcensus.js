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
    'avAdminElcensus',
    function(
      $i18next,
      $window,
      $state,
      ElectionsApi,
      Authmethod,
      Plugins,
      SendMsg,
      $modal,
      MustExtraFieldsService,
      $filter,
      $stateParams,
      $timeout,
      ConfigService,
      CsvLoad,
      NextButtonService)
    {
    // we use it as something similar to a controller here
    function link(scope, element, attrs) {
      scope.census = ['open', 'close'];
      scope.election = ElectionsApi.currentElection;
      scope.newcensus = {};
      scope.electionLoaded = false;
      scope.reloadingCensus = false;
      scope.loading = false;
      scope.nomore = false;
      scope.error = null;
      scope.page = 1;

      scope.perms = {val: ""};
      ElectionsApi
        .getEditPerm(scope.election.id)
        .then(
          function (perm) {
            scope.perms.val = perm;
          }
        );
        
      scope.msg = null;
      scope.filterStr = "";
      scope.$filter = $filter;
      scope.filterTimeout = null;
      scope.filterOptions = {};
      scope.resizeSensor = null;
      scope.helpurl = ConfigService.helpUrl;
      scope.showSuccessAction = ConfigService.showSuccessAction;
      scope.comment = {
        activateComment: "",
        deactivateComment: ""
      };

      function childrenElectionNames(metadata) {
        if (!metadata.children_event_id_list) {
          return [];
        } else {
          return _.map(
            metadata.children_event_id_list,
            function (electionId) {
              return scope.election.childrenElectionNames[electionId] || electionId;
            }
          );
        }
      }

      scope.goNext = NextButtonService.goNext;

      function newElection() {
        return !$stateParams.id;
      }


      function selectQueried(selectStatus) {
        _.each(scope.election.census.voters,
          function (i) {
            i.selected = selectStatus;
          });
      }
      
      function sendAuthCodesSelected() {
        var selectedList = scope.selected(scope.shown());
        var user_ids = _.pluck(selectedList, "id");

        SendMsg.setElection(scope.election);
        SendMsg.scope = scope;
        SendMsg.user_ids = user_ids;
        SendMsg.sendAuthCodesModal();

        return false;
      }

      scope.commands = [
        {
          i18nString: 'addPersonAction',
          iconClass: 'fa fa-plus',
          actionFunc: function() { return scope.addPersonModal(); },
          enableFunc: function() {
            return (
              scope.perms.val.indexOf("census-add") !== -1 ||
              scope.perms.val.indexOf("edit") !== -1
            );
          }
        },
        {
          i18nString: 'addCsvAction',
          iconClass: 'fa fa-plus',
          actionFunc: function() { return scope.addCsvModal(); },
          enableFunc: function() {
            return (
              scope.perms.val.indexOf("census-add") !== -1 ||
              scope.perms.val.indexOf("edit") !== -1
            );
          }
        },
        {
          i18nString: 'exportCensusAction',
          iconClass: 'fa fa-download',
          actionFunc: function() { return scope.exportCensusModal(); },
          enableFunc: function() {
            return (
              scope.election && scope.election.census &&
              scope.election.census.voters &&
              scope.election.census.voters.length &&
              (
                scope.perms.val.indexOf("view-census") !== -1 ||
                scope.perms.val.indexOf("edit") !== -1
              )
            );
          }
        },
        {
          i18nString: 'selectAllShownAction',
          iconClass: 'fa fa-check-square-o',
          actionFunc: function() { return scope.selectQueried(true); },
          enableFunc: function() { return scope.shown().length > 0; }
        },
        {
          i18nString: 'deselectAllShownAction',
          iconClass: 'fa fa-square-o',
          actionFunc: function() { return selectQueried(false); },
          enableFunc: function() { return scope.numSelected(scope.shown()) > 0; }
        },
        {
          i18nString: 'activateAction',
          iconClass: 'fa fa-user',
          actionFunc: function() {
            $modal.open({
              templateUrl: "avAdmin/admin-directives/elcensus/confirm-activate-people-modal.html",
              controller: "ConfirmActivatePeopleModal",
              size: 'lg',
              resolve: {
                comment: function () { return scope.comment; },
                election: function () { return scope.election; },
                numSelectedShown: function() {
                  return scope.numSelected(scope.shown());
                }
              }
            }).result.then(scope.activateSelected);
          },
          enableFunc: function() {
            return (
              scope.election &&
              scope.election.id &&
              scope.numSelected(scope.shown()) > 0 &&
              (
                scope.perms.val.indexOf("census-activation") !== -1 ||
                scope.perms.val.indexOf("edit") !== -1
              )
            );
          }
        },
        {
          i18nString: 'deactivateAction',
          iconClass: 'fa fa-user-times',
          actionFunc: function() {
            $modal.open({
              templateUrl: "avAdmin/admin-directives/elcensus/confirm-deactivate-people-modal.html",
              controller: "ConfirmDeactivatePeopleModal",
              size: 'lg',
              resolve: {
                comment: function () { return scope.comment; },
                election: function () { return scope.election; },
                numSelectedShown: function() {
                  return scope.numSelected(scope.shown());
                }
              }
            }).result.then(scope.deactivateSelected);
          },
          enableFunc: function() {
            return (
              scope.election &&
              scope.election.id &&
              scope.numSelected(scope.shown()) > 0 &&
              (
                scope.perms.val.indexOf("census-activation") !== -1 ||
                scope.perms.val.indexOf("edit") !== -1
              )
            );
          }
        },
        {
          i18nString: 'removeCensusAction',
          iconClass: 'fa fa-trash-o',
          actionFunc: function() {
            $modal.open({
              templateUrl: "avAdmin/admin-directives/elcensus/confirm-remove-people-modal.html",
              controller: "ConfirmRemovePeopleModal",
              size: 'lg',
              resolve: {
                election: function () { return scope.election; },
                numSelectedShown: function() {
                  return scope.numSelected(scope.shown());
                }
              }
            }).result.then(scope.removeSelected);
          },
          enableFunc: function() {
            return (
              scope.numSelected(scope.shown()) > 0 &&
              (
                scope.perms.val.indexOf("census-delete") !== -1 ||
                scope.perms.val.indexOf("edit") !== -1
              )
            );
          }
        },
        {
          i18nString: 'sendAuthCodesAction',
          iconClass: 'fa fa-paper-plane-o',
          actionFunc: function() { return sendAuthCodesSelected(); },
          enableFunc: function() {
            return (
              scope.numSelected(scope.shown()) > 0  &&
              (
                scope.perms.val.indexOf("send-auth") !== -1 ||
                scope.perms.val.indexOf("edit") !== -1
              )
            );
          }
        }
      ];

      function selectVoter(voter) {
        _.each(scope.election.census.voters, function (v) { v.selected = false; });
        voter.selected = true;
      }

      scope.row_commands = [
        {
	        text: $i18next("avAdmin.census.activateOneAction"),
          iconClass: 'fa fa-user',
          actionFunc: function(voter) {
	          selectVoter(voter);
            $modal.open({
              templateUrl: "avAdmin/admin-directives/elcensus/confirm-activate-people-modal.html",
              controller: "ConfirmActivatePeopleModal",
              size: 'lg',
              resolve: {
                comment: function () { return scope.comment; },
                election: function () { return scope.election; },
                numSelectedShown: function() {
                  return scope.numSelected(scope.shown());
                }
              }
            }).result.then(scope.activateSelected);
          },
          enableFunc: function() {
            return (
              scope.election &&
              scope.election.id && (
                scope.perms.val.indexOf("census-activation") !== -1 ||
                scope.perms.val.indexOf("edit") !== -1
              )
            );
          }
        },
        {
	        text: $i18next("avAdmin.census.deactivateOneAction"),
          iconClass: 'fa fa-user-times',
          actionFunc: function(voter) {
            selectVoter(voter);
            $modal.open({
              templateUrl: "avAdmin/admin-directives/elcensus/confirm-deactivate-people-modal.html",
              controller: "ConfirmDeactivatePeopleModal",
              size: 'lg',
              resolve: {
                comment: function () { return scope.comment; },
                election: function () { return scope.election; },
                numSelectedShown: function() {
                  return scope.numSelected(scope.shown());
                }
              }
            }).result.then(scope.deactivateSelected);
          },
          enableFunc: function() {
            return (
              scope.election &&
              scope.election.id && (
                scope.perms.val.indexOf("census-activation") !== -1 ||
                scope.perms.val.indexOf("edit") !== -1
              )
            );
          }
        },
        {
	        text: $i18next("avAdmin.census.removeCensusOneAction"),
          iconClass: 'fa fa-trash-o',
          actionFunc: function(voter) {
            selectVoter(voter);
            $modal.open({
              templateUrl: "avAdmin/admin-directives/elcensus/confirm-remove-people-modal.html",
              controller: "ConfirmRemovePeopleModal",
              size: 'lg',
              resolve: {
                election: function () { return scope.election; },
                numSelectedShown: function() {
                  return scope.numSelected(scope.shown());
                }
              }
            }).result.then(scope.removeSelected);
          },
          enableFunc: function() {
            return (
              scope.perms.val.indexOf("census-delete") !== -1 ||
              scope.perms.val.indexOf("edit") !== -1
            );
          }
        },
        {
	        text: $i18next("avAdmin.census.sendAuthCodesOneAction"),
          iconClass: 'fa fa-paper-plane-o',
          actionFunc: function(voter) {
            selectVoter(voter);
            return sendAuthCodesSelected();
          },
          enableFunc: function() {
            return (
              scope.perms.val.indexOf("send-auth") !== -1 ||
              scope.perms.val.indexOf("edit") !== -1
            );
          }
        }
      ];

      function censusCall(id, csExport, opt) {
          // this hook can avoid the addCensus call
          if (Plugins.hook('add-to-census-pre', csExport)) {
              Authmethod
                .addCensus(id, csExport, opt)
                .then(
                  function onSuccess(response) {
                    scope.loading = false;
                    scope.msg = "avAdmin.census.censusadd";
                    scope.reloadCensus();
                    Plugins.hook('add-to-census-success', {data: csExport, response: response.data});
                  },
                  function onError(response) {
                    scope.loading = false;
                    scope.error = response.data.error;
                    Plugins.hook('add-to-census-error', {data: csExport, response: response.data});
                    Plugins.hook('census-csv-load-error', response.data);
                  }
                );
          }
      }

      function addToCensus() {
          var election = scope.election;
          var census = [];
          if (!election.id) {
            census = election.census.voters;
            census.push({
              selected: false, 
              vote: false, 
              username: "", 
              metadata: scope.newcensus,
              childrenElectionNames: childrenElectionNames(scope.newcensus)
            });
          } else {
            census.push({
              selected: false, 
              vote: false, 
              username: "", 
              metadata: scope.newcensus,
              childrenElectionNames: childrenElectionNames(scope.newcensus)
            });

            var csExport = _.map(
              census, 
              function (censusElement) 
              {
                // if it's a parent election, process children elections
                if (election.children_election_info) 
                {
                  censusElement.metadata.children_event_id_list = _.filter(
                    election.children_election_info.natural_order,
                    function (electionId) 
                    {
                      var ret = (censusElement.metadata[electionId].trim().toLowerCase() === "true");
                      delete censusElement.metadata[electionId];
                      return ret;
                    }
                  );
                }
                return censusElement.metadata;
              }
            );
            scope.loading = true;
            censusCall(election.id, csExport, 'disabled');
          }
          scope.newcensus = {};
      }

      function delVoter(index) {
          var el = scope.election;
          var cs = el.census.voters;
          el.census.voters = cs.slice(0, index).concat(cs.slice(index+1,cs.length));
      }

      function exportCensus(el) {
        var cs = el.census.voters;
        var csExport = _.map(cs, function (i) {
          var ret = angular.copy(i.metadata);
          if (!el.children_election_info) {
            if (i.voted_children_elections.length === 0) {
              ret.vote = "false";
            } else {
              ret.vote = "true";
            }
          } else {
            _.each(
              scope.election.children_election_info.natural_order, 
              function (electionId) 
              {
                if (i.voted_children_elections.indexOf(electionId) !== -1) 
                {
                  ret["voted in " + scope.election.childrenElectionNames[electionId]] = "true";
                } else {
                  ret["voted in " + scope.election.childrenElectionNames[electionId]] = "false";
                }
                delete i.metadata.children_event_id_list;
              }
            );
          }
          ret.voterid = i.username;
          return ret;
        });
        var text = $window.Papa.unparse(angular.toJson(csExport));
        var blob = new $window.Blob([text], {type: "text/csv"});
        $window.saveAs(blob, el.id + "-census"+".csv");
        return false;
      }

      function exportCensusModal() {
        $modal.open({
          templateUrl: "avAdmin/admin-directives/elcensus/export-all-census-modal.html",
          controller: "ExportAllCensusModal",
          size: 'lg',
          resolve: {
            election: function () { return scope.election; },
            filterStr: function () { return scope.filterStr; },
            filterOptions: function () { return scope.filterOptions; }
          }
        }).result.then(exportCensus);
      }

      function removeSelected() {
        var selectedList = scope.selected(scope.shown());
        if (!scope.election.id) {
          _.each(selectedList, function (selected) {
            var i = scope.election.census.voters.indexOf(selected);
            delVoter(i);
          });
        } else {
          var user_ids = _.pluck(selectedList, "id");
          Authmethod
            .removeUsersIds(scope.election.id, scope.election, user_ids)
            .then(
              function(response) {
                scope.loading = false;
                scope.msg = "avAdmin.census.removedCensusSuccessfully";
                scope.reloadCensus();
              },
              function onError(response) {
                scope.loading = false; 
                scope.error = response.data.error;
              }
            );
        }
        return false;
      }

      function activateSelected() {
        var selectedList = scope.selected(scope.shown());
        var user_ids = _.pluck(selectedList, "id");
        var comment = scope.comment.activateComment;
        Authmethod
          .activateUsersIds(scope.election.id, scope.election, user_ids, comment)
          .then(
            function(response) {
              scope.loading = false;
              scope.comment.activateComment = "";
              scope.msg = "avAdmin.census.activatedCensusSuccessfully";
              scope.reloadCensus();
            },
            function onError(response) {
              scope.loading = false; 
              scope.error = response.data.error;
            }
          );
        return false;
      }

      function deactivateSelected() {
        var selectedList = scope.selected(scope.shown());
        var user_ids = _.pluck(selectedList, "id");
        var comment = scope.comment.deactivateComment;
        Authmethod
          .deactivateUsersIds(scope.election.id, scope.election, user_ids, comment)
          .then(function(response) {
              scope.loading = false;
              scope.comment.deactivateComment = "";
              scope.msg = "avAdmin.census.activatedCensusSuccessfully";
              scope.reloadCensus();
            },
            function onError(response) {
              scope.loading = false; 
              scope.error = response.data.error;
            }
          );
        return false;
      }

      function addCsvModal() {
        $modal.open({
          templateUrl: "avAdmin/admin-directives/elcensus/add-csv-modal.html",
          controller: "AddCsvModal",
          size: 'lg',
          resolve: {
            election: function () { return scope.election; }
          }
        }).result.then(function(textarea) {
          if (!!scope.election.id) {
            $modal.open({
             templateUrl: "avAdmin/admin-directives/elcensus/csv-loading-modal.html",
             controller: "CsvLoadingModal",
             size: 'lg',
             resolve: {
               election: function () { return scope.election; },
               textarea: function () { return textarea; },
               errorFunc: function () {
                 function errorFunction(data) {
                   if (_.isBoolean(data)) {
                     scope.error = data;
                   }
                   return scope.error;
                 }
                 return errorFunction;
               }
             }
            })
            .result.then(
              scope.reloadCensus,
              function (error) {
                Plugins.hook('census-csv-load-error', error);
                scope.reloadCensus();
              });
          } else {
            var data = {
              election: scope.election,
              textarea: textarea
            };
            CsvLoad.processCsv(data);
          }
        });
      }

      function addPersonModal() {
        $modal.open({
          templateUrl: "avAdmin/admin-directives/elcensus/add-person-modal.html",
          controller: "AddPersonModal",
          size: 'lg',
          resolve: {
            election: function () { return scope.election; },
            newcensus: function() { return scope.newcensus; }
          }
        }).result.then(function() {
          scope.addToCensus();
        });
      }

      /**
       * Load more census in infinite scrolling mode
       */
      function loadMoreCensus(reload) {
        if (!scope.electionLoaded || scope.loading || scope.nomore || newElection()) {
          if (scope.reloadingCensus) {
            scope.reloadingCensus = false;
          }
          return;
        }
        scope.loading = true;

        ElectionsApi.waitForCurrent(function () {
          ElectionsApi.getCensus(
              scope.election,
              scope.page,
              null,
              scope.filterStr,
              scope.filterOptions)
            .then(function(el) {
              scope.page += 1;
              if (scope.reloadingCensus) {
                scope.reloadingCensus = false;
              }

              if (el.data.end_index === el.data.total_count) {
                scope.nomore = true;
              }
              scope.loading = false;
            })
            .catch(function(data) {
              scope.error = data;
              scope.loading = false;
              if (scope.reloadingCensus) {
                scope.reloadingCensus = false;
              }
            });
        });
      }

      function reloadCensus() {
        scope.nomore = false;
        scope.page = 1;
        if (!scope.electionLoaded || !scope.election || !scope.election.census || !scope.election.census.voters) {
          return;
        }
        scope.reloadingCensus = true;
        scope.election.census.voters.splice(0, scope.election.census.voters.length);

        loadMoreCensus();
      }

      function filteredVoters() {
        if (!scope.election || !scope.election.census || !scope.election.census.voters) {
          return [];
        } else if (!scope.filterStr || scope.electionLoaded && !!scope.election.id) {
          return scope.election.census.voters;
        } else {
          return $filter('filter')(scope.election.census.voters, scope.filterStr);
        }
      }

      function reloadCensusDebounce() {
        $timeout.cancel(scope.filterTimeout);
        scope.filterTimeout = $timeout(function() {
          scope.reloadCensus();
        }, 500);
      }

      // debounced filter options
      scope.$watch("filterOptions", function(newOpts, oldOpts) {
        if (!scope.electionLoaded || !scope.election.id || _.isEqual(newOpts, oldOpts)) {
          return;
        }
        reloadCensusDebounce();
      }, true);

      // debounced filter
      scope.$watch("filterStr", function(newStr, oldStr) {
        if (!scope.electionLoaded || !scope.election.id || newStr === oldStr) {
          return;
        }
        reloadCensusDebounce();
      });

      // overflow-x needs to resize the height
      var ael = angular.element(".censustable");
      /* jshint ignore:start */
      scope.resizeSensor = new ResizeSensor(ael, function() {
        if (ael.width() > $(element).width()) {
          $(element).width(ael.width());
          $(element).parent().css('overflow-x', 'auto');
        }
      });
      /* jshint ignore:end */
      scope.$on("$destroy", function() { delete scope.resizeSensor; });

      angular.extend(scope, {
        addToCensus: addToCensus,
        addPersonModal: addPersonModal,
        addCsvModal: addCsvModal,
        delVoter: delVoter,
        filteredVoters: filteredVoters,
        exportCensus: exportCensus,
        exportCensusModal: exportCensusModal,
        loadMoreCensus: loadMoreCensus,
        reloadCensus: reloadCensus,
        removeSelected: removeSelected,
        activateSelected: activateSelected,
        deactivateSelected: deactivateSelected,
        selectQueried: selectQueried,
        sendAuthCodesSelected: sendAuthCodesSelected,
        newElection: newElection,
        childrenElectionNames: childrenElectionNames,
        numSelected: function (l) {
          return scope.selected(l).length;
        },
        selected: function (l) {
          if (l === undefined) {
            if (scope.election && scope.election.census && scope.election.census.voters) {
              l = scope.election.census.voters;
            } else {
              l = [];
            }
          }
          return _.filter(l, function (v) {
            return v.selected === true;
          });
        },
        shown: function(d) {
          if (scope.election && scope.election.census && scope.election.census.voters) {
            return scope.election.census.voters;
          }

          return [];
        }
      });

      function main() {
        scope.electionLoaded = true;
        scope.election = ElectionsApi.currentElection;
        MustExtraFieldsService(scope.election);
        if (scope.page === 1 && !newElection()) {
          reloadCensus();
        }
      }

      ElectionsApi.waitForCurrent(main);
    }

    return {
      restrict: 'AE',
      scope: {
      },
      link: link,
      templateUrl: 'avAdmin/admin-directives/elcensus/elcensus.html'
    };
  });
