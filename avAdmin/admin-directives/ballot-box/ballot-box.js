/**
 * This file is part of agora-gui-admin.
 * Copyright (C) 2018  Agora Voting SL <agora@agoravoting.com>

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
    'avAdminBallotBox',
    function(
      Authmethod,
      ConfigService,
      NextButtonService,
      $timeout)
    {
    // we use it as something similar to a controller here
    function link(scope, element, attrs) {
      scope.electionId = attrs.electionId;
      scope.reloading = false;
      scope.loading = false;
      scope.object_list = [];
      scope.nomore = false;
      scope.error = null;
      scope.page = 1;
      scope.msg = null;
      scope.resizeSensor = null;
      scope.helpurl = ConfigService.helpUrl;
      scope.filterStr = "";
      scope.filterTimeout = null;
      scope.filterOptions = {};

      scope.goNext = NextButtonService.goNext;

      /**
       * Load more objects in infinite scrolling mode
       */
      function loadMore(reload) {
        if (scope.loading || scope.nomore) {
          if (scope.reloading) {
            scope.reloading = false;
          }
          return;
        }
        scope.loading = true;

        Authmethod.getBallotBoxes(
            scope.electionId,
            scope.page,
            null,
            scope.filterOptions,
            scope.filterStr)
        .success(
            function(data)
            {
                scope.page += 1;
                if (scope.reloading)
                {
                    scope.reloading = false;
                }

                if (data.end_index === data.total_count) {
                    scope.nomore = true;
                }
                scope.loading = false;
            }
        )
        .error(
            function(data) {
                scope.error = data;
                scope.loading = false;

                if (scope.reloading) {
                    scope.reloading = false;
                }
            }
        );
      }

      function reload() {
        scope.nomore = false;
        scope.page = 1;
        scope.reloading = true;
        scope.object_list.splice(0, scope.object_list.length);

        loadMore();
      }

      // debounced reloading
      function reloadDebounce() {
        $timeout.cancel(scope.filterTimeout);
        scope.filterTimeout = $timeout(function() {
          scope.reload();
        }, 500);
      }

      // debounced filter options
      scope.$watch("filterOptions", function(newOpts, oldOpts) {
        if (_.isEqual(newOpts, oldOpts)) {
          return;
        }
        reloadDebounce();
      }, true);

      // debounced filter
      scope.$watch("filterStr", function(newStr, oldStr) {
        if (newStr === oldStr) {
          return;
        }
        reloadDebounce();
      });

      // overflow-x needs to resize the height
      var dataElement = angular.element(".data-table");
      /* jshint ignore:start */
      scope.resizeSensor = new ResizeSensor(dataElement, function() {
        if (dataElement.width() > $(element).width()) {
          $(element).width(dataElement.width());
          $(element).parent().css('overflow-x', 'auto');
        }
      });
      /* jshint ignore:end */
      scope.$on("$destroy", function() { delete scope.resizeSensor; });

      angular.extend(scope, {
        loadMore: loadMore,
        reload: reload
      });

      scope.reload();
    }

    return {
      restrict: 'AE',
      scope: {},
      link: link,
      templateUrl: 'avAdmin/admin-directives/ballot-box/ballot-box.html'
    };
  });