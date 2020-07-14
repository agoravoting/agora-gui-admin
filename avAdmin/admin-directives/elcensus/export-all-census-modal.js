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
  .controller('ExportAllCensusModal',
    function(
      $scope,
      $modalInstance,
      ElectionsApi,
      election,
      ConfigService,
      filterStr,
      filterOptions
    ) {
      $scope.election = angular.copy(election);
      $scope.filterStr = angular.copy(filterStr);
      $scope.filterOptions = angular.copy(filterOptions);
      $scope.totalCensusCount = $scope.election.data.total_count;
      $scope.election.census.voters = [];
      $scope.currentCount = 0; // start from zero as we use a different page size
      $scope.nomore = false;
      $scope.page = 1;
      $scope.downloading = false;
      $scope.error = false;
      $scope.helpurl = ConfigService.helpUrl;

      $scope.loadMoreCensus = function () {
        if ($scope.nomore) {
          $modalInstance.close($scope.election);
          return;
        }

        if ($scope.downloading) {
          return;
        }
        $scope.downloading = true;

        ElectionsApi.getCensus(
          $scope.election, 
          $scope.page, 
          "max", 
          $scope.filterStr, 
          $scope.filterOptions
        )
          .then(function(el) 
          {
            $scope.page += 1;

            $scope.totalCensusCount = el.data.total_count;
            $scope.currentCount = el.data.end_index;
            if (el.data.end_index === el.data.total_count) {
              $scope.downloading = false;
              $scope.nomore = true;
              $modalInstance.close($scope.election);
              return;
            }

            $scope.downloading = false;
            $scope.loadMoreCensus();
          })
          .catch(function(data) {
            $scope.error = data;
            $scope.downloading = false;
          });
      };

      $scope.ok = function () {
        $scope.error = false;
        $scope.loadMoreCensus();
      };

      $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
      };
    });
