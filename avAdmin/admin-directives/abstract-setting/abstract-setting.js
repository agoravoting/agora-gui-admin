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
    'avAbstractSetting', 
    function(
       $q,
       $state,
       $http,
       $sce,
       Authmethod, 
       Plugins, 
       ElectionsApi, 
       $stateParams, 
       $modal, 
       ConfigService,
       SendMsg)
    {
      function link(scope, element, attrs, nullController, transclude) {
        scope.election = ElectionsApi.currentElection;
        scope.title = '';
        scope.description = '';
        scope.showHelp = false;
        scope.html = '';
        scope.helpPath = '';
        scope.forLabel = '';
        scope.expanded = false;
        scope.shortValue = '';
        scope.isDisabled = false;

        scope.toggleExpand = function() {
           scope.expanded = !scope.expanded;
        };

        if (_.isString(attrs.title)) {
          scope.title = attrs.title;
        }
        if (_.isString(attrs.description)) {
          scope.description = attrs.description;
        }
        if (_.isString(attrs.helpPath) && !!ConfigService.settingsHelpBaseUrl) {
          scope.helpPath = ConfigService.settingsHelpBaseUrl + attrs.helpPath;
        } else if(!!ConfigService.settingsHelpDefaultUrl) {
          scope.helpPath = ConfigService.settingsHelpDefaultUrl;
        }
        if (_.isString(attrs.for)) {
          scope.forLabel = attrs.for;
        }
        if (_.isString(attrs.shortValue)) {
          scope.shortValue = attrs.shortValue;
        }
        scope.isDisabled = ('true' === attrs.isDisabled);

        scope.toggleHelp = function() {
          scope.showHelp = !scope.showHelp;
          if (!!scope.showHelp && !scope.html && !!scope.helpPath) {
            $http.get(scope.helpPath)
              .then(
                function (data) {
                  if (200 === data.status && !scope.html) {
                    scope.html = $sce.trustAsHtml(data.data);
                  }
                },
                function (err) {
                  console.log("error loading setting help url\nurl: " + scope.helpPath + "\nerror: " + err);
                  scope.html = $sce.trustAsHtml(ConfigService.settingsHelpUrlError);
                });
          }
        };

        var widget = element.find('.abstract-widget');
        if (_.isObject(widget)) {
          transclude(scope, function(clone) {
            widget.append(clone);
          });
        }
      }

      return {
        restrict: 'AE',
        transclude: true,
        scope: true,
        link: link,
        templateUrl: 'avAdmin/admin-directives/abstract-setting/abstract-setting.html'
      };
    });