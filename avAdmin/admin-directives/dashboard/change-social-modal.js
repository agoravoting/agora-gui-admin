/**
 * This file is part of agora-gui-admin.
 * Copyright (C) 2016  Agora Voting SL <agora@agoravoting.com>

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
  .controller('ChangeSocialModal',
    function($scope, $modalInstance, $modal) {

      function showOkModal() {
        $modal.open({
          templateUrl: "avAdmin/admin-directives/dashboard/info-changed-social-ok.html",
          controller: "InfoChangedSocialOk",
          windowClass: "info-changed-social-window",
          size: 'sm'
        });
      }

      $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
      };

      $scope.nextOrClose = function () {
        $modalInstance.close();
        showOkModal();
      };
    });