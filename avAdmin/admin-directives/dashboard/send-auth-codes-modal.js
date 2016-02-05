angular.module('avAdmin')
  .controller('SendAuthCodesModal',
    function($scope, $modalInstance, SendMsg, ConfigService, election, user_ids) {
      $scope.election = election;
      $scope.user_ids = user_ids;
      $scope.steps = SendMsg.steps;
      $scope.helpurl = ConfigService.helpUrl;
      $scope.ok = function () {
        $modalInstance.close($scope.user_ids);
      };

      $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
      };
    });
