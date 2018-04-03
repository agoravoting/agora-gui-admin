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
  .controller('AddPersonModal',
    function($scope, $modalInstance, election, newcensus, ConfigService) {
      $scope.election = election;
      $scope.newcensus = newcensus;
      $scope.helpurl = ConfigService.helpUrl;
      $scope.ok = function () {
        for (var i = 0; i < election.census.extra_fields.length; i++) {
          var field = election.census.extra_fields[i];
          if(!newcensus.hasOwnProperty(field.name)) {
            if(('tlf' === field.name) ||
               ('email' === field.name && field.type === 'email')) {
              newcensus[field.name] = "";
            }
          }
        }
        $modalInstance.close();
      };

      $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
      };
      $scope.getExtraFields = function () {
        return _.filter(election.census.extra_fields, function (ef) {
          return ef.func !== "code";
        });
      };
    });
