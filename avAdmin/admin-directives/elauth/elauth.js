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
  .directive('avAdminElauth',
             ['ConfigService', 'ElectionsApi', 'NextButtonService', 'Plugins', 'MustExtraFieldsService',
             function(ConfigService, ElectionsApi, NextButtonService, Plugins, MustExtraFieldsService) {
    // we use it as something similar to a controller here
    function link(scope, element, attrs) {
        scope.election = ElectionsApi.currentElection;
        scope.auth = ConfigService.auth_methods;
        scope.electionEditable = function() {
          return !scope.election.id || scope.election.status === "registered";
        };
        scope.goNext = NextButtonService.goNext;
        scope.$watch('election.census.auth_method', function (newVal, oldVal) {
          // check if any voter in the census has the authType field defined
          function censusFilledAuthType(authType) {
            var ret = false;
            if (_.isArray(scope.election.census.voters) &&
                0 < scope.election.census.voters.length) {
              var index = 0;
              for (; index < scope.election.census.voters.length; index++) {
                var censusEl = scope.election.census.voters[index];
                if (_.isObject(censusEl.metadata) && 
                    _.isString(censusEl.metadata[authType]) &&
                    censusEl.metadata[authType].length > 0) {
                  ret = true;
                  break;
                }
              }
            }
            return ret;
          }

          function removeRequiredExtra(name) {
            if(!censusFilledAuthType(name)) {
              // remove the name extra field
              scope.election.census.extra_fields = 
                _.filter(
                  scope.election.census.extra_fields,
                  function (ef) {
                    return name !== ef.name;
                  });
              // no census data is lost if we remove the name field from 
              // voters, so we do that
              _.each(
                scope.election.census.voters, 
                function (voter) {
                  if (_.isObject(voter.metadata)) {
                    delete voter.metadata[name];
                  }
                });
            } else {
              _.each(scope.election.census.extra_fields, function (ef) { ef.must = false; });
            }
          }

          scope.$evalAsync(function () {
            if (newVal !== oldVal) {
              MustExtraFieldsService(scope.election);

              if ('email' !== newVal) {
                removeRequiredExtra("email");
              } 
              if ('sms' !== newVal) {
                removeRequiredExtra("tlf");
              }
              if ('email' !== newVal && 'sms' !== newVal) {
                removeRequiredExtra("code");
              }
              if ('user-and-password' !== newVal) {
                removeRequiredExtra("username");
                removeRequiredExtra("password");
              }
            }
          });
        }, true);
    }

    return {
      restrict: 'AE',
      scope: {
      },
      link: link,
      templateUrl: 'avAdmin/admin-directives/elauth/elauth.html'
    };
  }]);
