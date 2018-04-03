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

/**
 * Module used to configure what action will be executed when the user
 * successfully logins/registers into the auth event. By default, the action
 * will be to enter the voting booth, but it can be reconfigured to load a
 * specific URL.
 */
angular.module('avAdmin')
  .directive(
    'avAdminSuccessAction',
    function(
      $window,
      $state,
      ElectionsApi,
      ConfigService,
      NextButtonService)
    {
      function link(scope, element, attrs)
      {
        scope.helpurl = ConfigService.helpUrl;
        // set election config from ElectionsApi
        function setScopeElection() {
          scope.election = ElectionsApi.currentElection;
          scope.action = scope.election.census.config['authentication-action'];
        }
        setScopeElection();

        scope.electionEditable = function() {
          return !scope.election.id;
        };

        scope.goNext = NextButtonService.goNext;

        // if the election is not loaded yet, then once it's loaded, update the
        // election scope variable
        ElectionsApi.waitForCurrent(setScopeElection);
      }

      return {
        restrict: 'AE',
        scope: {},
        link: link,
        templateUrl: 'avAdmin/admin-directives/success-action/success-action.html'
      };
    });
